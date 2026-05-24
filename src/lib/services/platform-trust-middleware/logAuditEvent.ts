import { SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

export interface AuditEventInput {
  project_id: string
  session_id?: string
  agent_id: string
  tool_name: string
  operation_type: 'read' | 'write' | 'delete'
  input?: unknown
  output?: unknown
  status: 'completed' | 'failed' | 'pending_approval' | 'permission_denied' | 'rate_limited'
  duration_ms?: number
  requires_human_approval?: boolean
  approved_by?: string
}

export interface AuditEventResult {
  id: string
  created_at: string
}

function hashData(data: unknown): string | null {
  if (data === undefined || data === null) return null
  const json = typeof data === 'string' ? data : JSON.stringify(data)
  return `sha256:${createHash('sha256').update(json).digest('hex')}`
}

export async function logAuditEvent(
  supabase: SupabaseClient,
  input: AuditEventInput
): Promise<AuditEventResult> {
  const record = {
    project_id: input.project_id,
    session_id: input.session_id || null,
    agent_id: input.agent_id,
    tool_name: input.tool_name,
    operation_type: input.operation_type,
    input_hash: hashData(input.input),
    output_hash: hashData(input.output),
    status: input.status,
    duration_ms: input.duration_ms || null,
    requires_human_approval: input.requires_human_approval || false,
    approved_by: input.approved_by || null,
    approved_at: input.approved_by ? new Date().toISOString() : null,
  }

  const { data, error } = await supabase
    .from('audit_log')
    .insert(record as never)
    .select('id, created_at')
    .single()

  if (error) {
    console.error('Failed to write audit log:', error)
    throw new Error(`Audit log write failed: ${error.message}`)
  }

  return { id: data.id, created_at: data.created_at }
}
