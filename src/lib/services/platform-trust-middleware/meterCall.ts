import { SupabaseClient } from '@supabase/supabase-js'
import { calculateCost } from './pricing'

export interface MeterCallInput {
  project_id: string
  session_id?: string
  agent_id: string
  model: string
  input_tokens: number
  output_tokens: number
}

export interface MeterCallResult {
  id: string
  cost_usd: number
}

export async function meterCall(
  supabase: SupabaseClient,
  input: MeterCallInput
): Promise<MeterCallResult> {
  const cost_usd = calculateCost(input.model, input.input_tokens, input.output_tokens)

  const record = {
    project_id: input.project_id,
    session_id: input.session_id || null,
    agent_id: input.agent_id,
    model: input.model,
    input_tokens: input.input_tokens,
    output_tokens: input.output_tokens,
    cost_usd,
  }

  const { data, error } = await supabase
    .from('metering_events')
    .insert(record as never)
    .select('id, cost_usd')
    .single()

  if (error) {
    console.error('Failed to write metering event:', error)
    throw new Error(`Metering write failed: ${error.message}`)
  }

  return { id: data.id, cost_usd: data.cost_usd }
}
