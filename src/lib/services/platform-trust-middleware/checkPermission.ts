import { SupabaseClient } from '@supabase/supabase-js'

export interface PermissionInput {
  project_id: string
  agent_id: string
  scope: string
  operation: 'read' | 'write' | 'delete'
}

export interface PermissionResult {
  allowed: boolean
  requires_approval: boolean
  policy_id: string | null
  approval_roles: string[]
}

export async function checkPermission(
  supabase: SupabaseClient,
  input: PermissionInput
): Promise<PermissionResult> {
  const { project_id, agent_id, scope, operation } = input

  const { data: policy, error } = await supabase
    .from('permission_policies')
    .select('*')
    .eq('project_id', project_id)
    .eq('agent_id', agent_id)
    .eq('scope', scope)
    .eq('operation', operation)
    .single()

  if (error || !policy) {
    // No policy found = denied by default (deny-by-default principle)
    return {
      allowed: false,
      requires_approval: false,
      policy_id: null,
      approval_roles: [],
    }
  }

  return {
    allowed: true,
    requires_approval: policy.requires_approval,
    policy_id: policy.id,
    approval_roles: (policy.approval_roles as string[]) || [],
  }
}
