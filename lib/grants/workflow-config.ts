// lib/grants/workflow-config.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LifecycleStage } from './lifecycle-shared';
import { getGrantFieldValue, REQUIRED_FIELD_ALLOWLIST, type RequiredFieldName } from './workflow-config-constants';

export interface WorkflowConfigRow {
  id: string;
  config_type: 'stage_checklist' | 'stage_label' | 'required_field' | 'approval_requirement';
  stage_key: string;
  config_key: string;
  config_value: Record<string, unknown>;
  sort_order: number;
}

export interface WorkflowGateResult {
  blocked: boolean;
  reasons: string[];
}

export async function loadWorkflowConfig(
  db: SupabaseClient,
  orgId: string,
  stageKey?: string
): Promise<WorkflowConfigRow[]> {
  let query = db
    .from('org_workflow_config')
    .select('id, config_type, stage_key, config_key, config_value, sort_order')
    .eq('org_id', orgId)
    .eq('module', 'grant_management');

  if (stageKey) {
    query = query.eq('stage_key', stageKey);
  }

  const { data, error } = await query.order('sort_order', { ascending: true });
  if (error) throw new Error(`Failed to load workflow config: ${error.message}`);
  return (data ?? []) as WorkflowConfigRow[];
}

export async function checkWorkflowGate(
  db: SupabaseClient,
  orgId: string,
  grantId: string,
  fromStage: LifecycleStage,
  grantRow: Record<string, unknown>
): Promise<WorkflowGateResult> {
  const reasons: string[] = [];

  const config = await loadWorkflowConfig(db, orgId, fromStage);

  const checklistItems = config.filter(
    r => r.config_type === 'stage_checklist' && r.config_value.required === true
  );

  if (checklistItems.length > 0) {
    const { data: completions } = await db
      .from('grant_checklist_completions')
      .select('checklist_item_key')
      .eq('org_id', orgId)
      .eq('grant_id', grantId)
      .eq('stage_key', fromStage);

    const completedKeys = new Set((completions ?? []).map((c: any) => c.checklist_item_key));

    for (const item of checklistItems) {
      if (!completedKeys.has(item.config_key)) {
        const label = item.config_value.label ?? item.config_key;
        reasons.push(`Checklist item not complete: ${label}`);
      }
    }
  }

  const requiredFields = config.filter(r => r.config_type === 'required_field');

  for (const rule of requiredFields) {
    const fieldName = rule.config_value.field_name as RequiredFieldName;
    // Runtime guard — DB rows bypass TypeScript, this makes the allowlist meaningful at runtime
    if (!REQUIRED_FIELD_ALLOWLIST.includes(fieldName as any)) {
      continue;
    }
    const value = getGrantFieldValue(grantRow, fieldName);
    if (value === null || value === undefined) {
      const msg = (rule.config_value.error_message as string | undefined)
        ?? `Required field not set: ${fieldName}`;
      reasons.push(msg);
    }
  }

  return { blocked: reasons.length > 0, reasons };
}
