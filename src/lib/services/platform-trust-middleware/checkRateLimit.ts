import { SupabaseClient } from '@supabase/supabase-js'

export interface RateLimitInput {
  project_id: string
  agent_id: string
  token_id?: string
}

export interface RateLimitResult {
  allowed: boolean
  window_type?: string
  current_count?: number
  max_requests?: number
  retry_after_seconds?: number
  denial_reason?: 'request_count' | 'token_budget' | 'spend_cap'
  current_spend_usd?: number
  max_spend_usd?: number
  current_tokens?: number
  max_tokens?: number
}

const WINDOW_SECONDS: Record<string, number> = {
  minute: 60,
  hour: 3600,
  day: 86400,
}

export async function checkRateLimit(
  supabase: SupabaseClient,
  input: RateLimitInput
): Promise<RateLimitResult> {
  const { project_id, agent_id, token_id } = input

  // Fetch applicable rate limits (agent-specific or wildcard)
  const { data: limits, error } = await supabase
    .from('rate_limits')
    .select('*')
    .eq('project_id', project_id)
    .in('agent_id', [agent_id, '*'])
    .order('window_type')

  if (error) {
    console.error('Rate limit check failed:', error)
    // Fail open on DB error — log but don't block
    return { allowed: true }
  }

  if (!limits || limits.length === 0) {
    return { allowed: true }
  }

  const now = new Date()

  for (const limit of limits) {
    const windowSeconds = WINDOW_SECONDS[limit.window_type]
    const windowStart = new Date(limit.window_start)
    const windowEnd = new Date(windowStart.getTime() + windowSeconds * 1000)

    if (now >= windowEnd) {
      // Window expired — reset counter atomically
      const { error: resetError } = await supabase
        .from('rate_limits')
        .update({
          current_count: 1,
          window_start: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', limit.id)

      if (resetError) {
        console.error('Rate limit reset failed:', resetError)
      }
      continue
    }

    // Window active — check request count limit
    if (limit.current_count >= limit.max_requests) {
      const retryAfter = Math.ceil((windowEnd.getTime() - now.getTime()) / 1000)
      return {
        allowed: false,
        denial_reason: 'request_count',
        window_type: limit.window_type,
        current_count: limit.current_count,
        max_requests: limit.max_requests,
        retry_after_seconds: retryAfter,
      }
    }

    // Check token budget and spend cap (if configured)
    if (limit.max_tokens || limit.max_spend_usd) {
      const { data: usage, error: usageError } = await supabase.rpc('get_window_usage', {
        p_project_id: project_id,
        p_window_start: windowStart.toISOString(),
      })

      if (!usageError && usage && usage.length > 0) {
        const { total_cost_usd, total_tokens } = usage[0]
        const retryAfter = Math.ceil((windowEnd.getTime() - now.getTime()) / 1000)

        // Token budget check
        if (limit.max_tokens && total_tokens >= limit.max_tokens) {
          return {
            allowed: false,
            denial_reason: 'token_budget',
            window_type: limit.window_type,
            current_tokens: Number(total_tokens),
            max_tokens: limit.max_tokens,
            retry_after_seconds: retryAfter,
          }
        }

        // Spend cap check
        if (limit.max_spend_usd && Number(total_cost_usd) >= Number(limit.max_spend_usd)) {
          return {
            allowed: false,
            denial_reason: 'spend_cap',
            window_type: limit.window_type,
            current_spend_usd: Number(total_cost_usd),
            max_spend_usd: Number(limit.max_spend_usd),
            retry_after_seconds: retryAfter,
          }
        }
      }
    }

    // Increment request counter atomically
    const { error: incError } = await supabase.rpc('increment_rate_limit', {
      limit_id: limit.id,
    })

    // Fallback if RPC not set up yet
    if (incError) {
      await supabase
        .from('rate_limits')
        .update({
          current_count: limit.current_count + 1,
          updated_at: now.toISOString(),
        })
        .eq('id', limit.id)
        .eq('current_count', limit.current_count) // optimistic lock
    }
  }

  return { allowed: true }
}
