/**
 * Platform Trust — Next.js API Route Middleware
 *
 * Drop this file + platform-trust-config.ts into any Next.js project.
 * Wraps all API routes with rate limiting, permission checks, and audit logging.
 *
 * Usage in next.config.ts or middleware.ts is NOT required.
 * Instead, wrap individual route handlers:
 *
 *   import { withTrust } from '@/lib/platform-trust'
 *   export const POST = withTrust('write', 'bookings', handler)
 *   export const GET = withTrust('read', 'providers', handler)
 *
 * BYOK consumers running their own trust-events Supabase project pass
 * `supabaseUrl` / `serviceKey` / `projectId` directly:
 *
 *   export const POST = withTrust('write', 'bookings', handler, {
 *     supabaseUrl: process.env.MY_TRUST_SUPABASE_URL,
 *     serviceKey: process.env.MY_TRUST_SERVICE_KEY,
 *     projectId:  process.env.MY_TRUST_PROJECT_ID,
 *   })
 *
 * When no explicit options are passed, the middleware falls back to the
 * `PLATFORM_TRUST_*` env vars (the legacy shared-infra pattern).
 */
import { type SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getTrustClient, type PlatformTrustConfig } from './config'

const DEV_OVERRIDE_TOKEN = 'allow-unconfigured-writes'

function devOverrideActive(): boolean {
  return process.env.PLATFORM_TRUST_DEV_OVERRIDE === DEV_OVERRIDE_TOKEN
}

function unconfiguredDenialResponse(operation: string, scope: string, toolName: string): NextResponse {
  console.error(
    `[platform-trust] DENIED ${operation} on scope="${scope}" tool="${toolName}": ` +
    'platform-trust config unset. Pass { supabaseUrl, serviceKey, projectId } to withTrust(), ' +
    'or set PLATFORM_TRUST_SUPABASE_URL / PLATFORM_TRUST_SERVICE_KEY / PLATFORM_TRUST_PROJECT_ID env vars. ' +
    'To temporarily allow unconfigured writes in local dev, set ' +
    `PLATFORM_TRUST_DEV_OVERRIDE='${DEV_OVERRIDE_TOKEN}' (never in production).`
  )
  return NextResponse.json(
    {
      error: 'Platform Trust not configured: write/delete denied',
      missing_config: ['supabaseUrl', 'serviceKey', 'projectId'],
    },
    { status: 503 }
  )
}

function hashData(data: unknown): string | null {
  if (data === undefined || data === null) return null
  const json = typeof data === 'string' ? data : JSON.stringify(data)
  return `sha256:${createHash('sha256').update(json).digest('hex')}`
}

const WINDOW_SECONDS: Record<string, number> = { minute: 60, hour: 3600, day: 86400 }

// ── Core checks ─────────────────────────────────────────────
async function checkRateLimit(
  client: SupabaseClient,
  projectId: string,
  agentId: string,
): Promise<{ allowed: boolean; retry_after?: number }> {
  const { data: limits } = await client
    .from('rate_limits')
    .select('*')
    .eq('project_id', projectId)
    .in('agent_id', [agentId, '*'])
    .order('window_type')

  if (!limits?.length) return { allowed: true }
  const now = new Date()

  for (const limit of limits) {
    const windowEnd = new Date(new Date(limit.window_start).getTime() + WINDOW_SECONDS[limit.window_type] * 1000)

    if (now >= windowEnd) {
      await client.from('rate_limits').update({ current_count: 1, window_start: now.toISOString(), updated_at: now.toISOString() }).eq('id', limit.id)
      continue
    }

    if (limit.current_count >= limit.max_requests) {
      return { allowed: false, retry_after: Math.ceil((windowEnd.getTime() - now.getTime()) / 1000) }
    }

    await client.from('rate_limits').update({ current_count: limit.current_count + 1, updated_at: now.toISOString() }).eq('id', limit.id).eq('current_count', limit.current_count)
  }
  return { allowed: true }
}

async function checkPermission(
  client: SupabaseClient,
  projectId: string,
  agentId: string,
  scope: string,
  operation: string,
): Promise<{ allowed: boolean; requires_approval: boolean }> {
  const { data: policy } = await client
    .from('permission_policies')
    .select('*')
    .eq('project_id', projectId)
    .in('agent_id', [agentId, '*'])
    .eq('scope', scope)
    .eq('operation', operation)
    .limit(1)
    .single()

  if (!policy) return { allowed: false, requires_approval: false }
  return { allowed: true, requires_approval: policy.requires_approval }
}

async function logAudit(
  client: SupabaseClient,
  projectId: string,
  agentId: string,
  toolName: string,
  operationType: string,
  status: string,
  input?: unknown,
  output?: unknown,
  durationMs?: number
): Promise<string | null> {
  const { data } = await client
    .from('audit_log')
    .insert({
      project_id: projectId,
      agent_id: agentId,
      tool_name: toolName,
      operation_type: operationType,
      input_hash: hashData(input),
      output_hash: hashData(output),
      status,
      duration_ms: durationMs || null,
      requires_human_approval: status === 'pending_approval',
    } as never)
    .select('id')
    .single()
  return data?.id || null
}

// ── Route handler wrapper ───────────────────────────────────
type RouteHandler = (request: NextRequest, context?: unknown) => Promise<NextResponse | Response>

export interface WithTrustOptions extends PlatformTrustConfig {
  /** Header name to read the agent ID from. Default: 'x-agent-id'. */
  agentIdHeader?: string
}

/**
 * Wrap a Next.js API route handler with platform-trust checks.
 *
 * @param operation - 'read' | 'write' | 'delete'
 * @param scope - permission scope (e.g. 'bookings', 'sessions', 'agents')
 * @param handler - the original route handler
 * @param options - optional config. Pass `supabaseUrl` / `serviceKey` /
 *   `projectId` to point at YOUR Supabase project; otherwise the wrapper
 *   falls back to the `PLATFORM_TRUST_*` env vars.
 */
export function withTrust(
  operation: 'read' | 'write' | 'delete',
  scope: string,
  handler: RouteHandler,
  options?: WithTrustOptions
): RouteHandler {
  return async (request: NextRequest, context?: unknown) => {
    const { client, resolved } = getTrustClient(options)
    const agentId = request.headers.get(options?.agentIdHeader || 'x-agent-id') || 'anonymous'
    const toolName = new URL(request.url).pathname

    if (!client || !resolved) {
      const isMutation = operation === 'write' || operation === 'delete'
      if (isMutation && !devOverrideActive()) {
        return unconfiguredDenialResponse(operation, scope, toolName)
      }
      if (isMutation) {
        console.warn(
          `[platform-trust] DEV-OVERRIDE active: allowing unconfigured ${operation} on ` +
          `scope="${scope}" (${toolName}). This must NEVER fire in production.`
        )
      }
      return handler(request, context)
    }

    // 1. Rate limit
    const rateResult = await checkRateLimit(client, resolved.projectId, agentId)
    if (!rateResult.allowed) {
      await logAudit(client, resolved.projectId, agentId, toolName, operation, 'rate_limited')
      return NextResponse.json(
        { error: 'Rate limit exceeded', retry_after: rateResult.retry_after },
        { status: 429, headers: { 'Retry-After': String(rateResult.retry_after || 60) } }
      )
    }

    // 2. Permission check
    const permResult = await checkPermission(client, resolved.projectId, agentId, scope, operation)
    if (!permResult.allowed) {
      await logAudit(client, resolved.projectId, agentId, toolName, operation, 'permission_denied')
      return NextResponse.json(
        { error: `Permission denied: no policy for scope="${scope}" operation="${operation}"` },
        { status: 403 }
      )
    }

    // 3. Approval gate
    if (permResult.requires_approval) {
      const auditId = await logAudit(client, resolved.projectId, agentId, toolName, operation, 'pending_approval', null)
      return NextResponse.json(
        { error: 'Approval required', audit_id: auditId },
        { status: 202 }
      )
    }

    // 4. Execute and audit
    const start = Date.now()
    const response = await handler(request, context)
    const duration = Date.now() - start

    await logAudit(client, resolved.projectId, agentId, toolName, operation, 'completed', null, null, duration)

    return response
  }
}

/**
 * Scope mapping: maps URL path patterns to { operation, scope }.
 * Used by autoTrust middleware.
 */
export interface ScopeRule {
  pattern: string | RegExp
  operation: 'read' | 'write' | 'delete'
  scope: string
}

/**
 * Create a Next.js middleware function that applies trust checks
 * based on URL path matching.
 *
 * @param rules - URL → { operation, scope } mapping
 * @param options - optional config. Pass `supabaseUrl` / `serviceKey` /
 *   `projectId` to point at YOUR Supabase project; otherwise falls back
 *   to the `PLATFORM_TRUST_*` env vars.
 */
export function createTrustMiddleware(rules: ScopeRule[], options?: PlatformTrustConfig) {
  return async (request: NextRequest) => {
    const { client, resolved } = getTrustClient(options)
    const pathname = new URL(request.url).pathname
    const method = request.method

    // Find matching rule
    const rule = rules.find(r => {
      if (typeof r.pattern === 'string') return pathname.startsWith(r.pattern)
      return r.pattern.test(pathname)
    })

    if (!rule) return NextResponse.next()

    // Determine operation from method if rule doesn't specify
    const operation = rule.operation || (method === 'GET' ? 'read' : 'write')
    const agentId = request.headers.get('x-agent-id') || 'anonymous'

    if (!client || !resolved) {
      const isMutation = operation === 'write' || operation === 'delete'
      if (isMutation && !devOverrideActive()) {
        return unconfiguredDenialResponse(operation, rule.scope, pathname)
      }
      if (isMutation) {
        console.warn(
          `[platform-trust] DEV-OVERRIDE active: allowing unconfigured ${operation} on ` +
          `scope="${rule.scope}" (${pathname}). This must NEVER fire in production.`
        )
      }
      return NextResponse.next()
    }

    // Rate limit
    const rateResult = await checkRateLimit(client, resolved.projectId, agentId)
    if (!rateResult.allowed) {
      await logAudit(client, resolved.projectId, agentId, pathname, operation, 'rate_limited')
      return NextResponse.json(
        { error: 'Rate limit exceeded', retry_after: rateResult.retry_after },
        { status: 429 }
      )
    }

    // Permission
    const permResult = await checkPermission(client, resolved.projectId, agentId, rule.scope, operation)
    if (!permResult.allowed) {
      await logAudit(client, resolved.projectId, agentId, pathname, operation, 'permission_denied')
      return NextResponse.json(
        { error: `Permission denied for ${rule.scope}/${operation}` },
        { status: 403 }
      )
    }

    // Approval gate
    if (permResult.requires_approval) {
      const auditId = await logAudit(client, resolved.projectId, agentId, pathname, operation, 'pending_approval')
      return NextResponse.json(
        { error: 'Approval required', audit_id: auditId },
        { status: 202 }
      )
    }

    // Audit the pass-through
    logAudit(client, resolved.projectId, agentId, pathname, operation, 'completed').catch(() => {})

    return NextResponse.next()
  }
}
