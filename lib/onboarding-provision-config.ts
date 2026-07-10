import { LIFECYCLE_STAGES } from '@/lib/grants/lifecycle-shared';
import { REQUIRED_FIELD_ALLOWLIST } from '@/lib/grants/workflow-config-constants';
import {
  CUSTOM_FIELD_ENTITY_TYPES,
  CUSTOM_FIELD_KEY_PATTERN,
  CUSTOM_FIELD_TYPES,
  normalizeFieldKey,
  type CustomFieldEntityType,
  type CustomFieldType,
} from '@/lib/custom-fields';
import {
  AUTOMATION_ACTION_TYPES,
  AUTOMATION_TRIGGER_TYPES,
  type AutomationActionType,
  type AutomationTriggerType,
} from '@/lib/tasks/automation/dynamic-rules';
import { ORG_AI_CONTEXT_TYPES, normalizeContextKey, type OrgAiContextType } from '@/lib/org-ai-context';
import {
  DASHBOARD_SECTION_IDS,
  ENTITY_VOCABULARY_TYPES,
  GRANT_MODULE_VIEWS,
  GRANTS_TABLE_COLUMNS,
  normalizeVocabulary,
  type EntityVocabularyType,
} from '@/lib/view-config';

function stringifyContext(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.context_value === 'string') return record.context_value.trim();
    if (typeof record.value === 'string') return record.value.trim();
    if (typeof record.description === 'string') return record.description.trim();
    if (typeof record.preference === 'string') return record.preference.trim();
  }
  return '';
}

function arrayOfKnownValues<T extends readonly string[]>(value: unknown, allowed: T): T[number][] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is T[number] => typeof item === 'string' && (allowed as readonly string[]).includes(item));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.entries(value as Record<string, unknown>).map(([key, raw]) => {
    const record = asRecord(raw);
    return record ? { key, ...record } : { key, value: raw };
  });
  return [];
}

function slugFromLabel(value: unknown, fallback: string): string {
  const label = typeof value === 'string' && value.trim() ? value : fallback;
  return normalizeFieldKey(label).slice(0, 64) || fallback;
}

function uniqueBy<T>(rows: T[], keyFor: (row: T) => string): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) byKey.set(keyFor(row), row);
  return Array.from(byKey.values());
}

function isLifecycleStage(value: unknown): value is typeof LIFECYCLE_STAGES[number] {
  return typeof value === 'string' && (LIFECYCLE_STAGES as readonly string[]).includes(value);
}

function isCustomFieldType(value: unknown): value is CustomFieldType {
  return typeof value === 'string' && (CUSTOM_FIELD_TYPES as readonly string[]).includes(value);
}

function isCustomFieldEntityType(value: unknown): value is CustomFieldEntityType {
  return typeof value === 'string' && (CUSTOM_FIELD_ENTITY_TYPES as readonly string[]).includes(value);
}

export function contextRowsFromOnboardingProfile(profile: any, orgId: string, userId: string) {
  const workflows = profile?.workflows && typeof profile.workflows === 'object' ? profile.workflows : {};
  const rows: Array<{
    org_id: string;
    context_type: OrgAiContextType;
    context_key: string;
    context_value: string;
    source: 'onboarding';
    is_active: boolean;
    created_by: string;
  }> = [];

  const addRow = (type: OrgAiContextType, keySeed: string, rawValue: unknown) => {
    const contextValue = stringifyContext(rawValue);
    if (!contextValue) return;
    rows.push({
      org_id: orgId,
      context_type: type,
      context_key: normalizeContextKey(keySeed || contextValue),
      context_value: contextValue,
      source: 'onboarding',
      is_active: true,
      created_by: userId,
    });
  };

  const orgContext = (workflows as any).org_context;
  if (Array.isArray(orgContext)) {
    for (const entry of orgContext) {
      const type = ORG_AI_CONTEXT_TYPES.includes(entry?.context_type) ? entry.context_type : 'operating_norm';
      addRow(type, entry?.context_key ?? entry?.label ?? entry?.context_value, entry);
    }
  } else if (orgContext && typeof orgContext === 'object') {
    for (const [key, value] of Object.entries(orgContext)) {
      const entry = value as Record<string, unknown>;
      const type = ORG_AI_CONTEXT_TYPES.includes(entry?.context_type as any)
        ? entry.context_type as OrgAiContextType
        : key.includes('vocabulary') || key.includes('naming')
          ? 'naming_convention'
          : 'operating_norm';
      addRow(type, key, value);
    }
  } else if (typeof orgContext === 'string') {
    addRow('operating_norm', 'onboarding_context', orgContext);
  }

  const automationPreferences = (workflows as any).automation_preferences;
  if (automationPreferences) {
    addRow('preference', 'automation_preferences', automationPreferences);
  }

  return uniqueBy(rows, row => [row.org_id, row.context_key].join(':'));
}

export function workflowRowsFromOnboardingProfile(profile: any, orgId: string) {
  const workflows = profile?.workflows && typeof profile.workflows === 'object' ? profile.workflows : {};
  const grantCycle = asRecord((workflows as any).grant_cycle) ?? {};
  const config = asRecord((workflows as any).workflow_config) ?? asRecord((grantCycle as any).workflow_config) ?? grantCycle;
  const rows: Array<{
    org_id: string;
    module: 'grant_management';
    config_type: 'stage_checklist' | 'required_field' | 'stage_label' | 'approval_requirement';
    stage_key: string;
    config_key: string;
    config_value: Record<string, unknown>;
    sort_order: number;
  }> = [];

  const checklistSources = [
    ...asArray((config as any).stage_checklists),
    ...asArray((config as any).checklist_items),
    ...asArray((grantCycle as any).stage_checklists),
    ...asArray((grantCycle as any).checklist_items),
  ];
  for (const [index, raw] of checklistSources.entries()) {
    const item = asRecord(raw);
    if (!item) continue;
    const stage = item.stage_key ?? item.stage ?? item.lifecycle_stage ?? item.key;
    if (!isLifecycleStage(stage)) continue;
    const label = String(item.label ?? item.name ?? item.value ?? '').trim();
    if (!label) continue;
    const configKey = String(item.item_key ?? item.config_key ?? item.key ?? slugFromLabel(label, `item_${index + 1}`));
    if (!/^[a-z0-9_]{1,64}$/.test(configKey)) continue;
    rows.push({
      org_id: orgId,
      module: 'grant_management',
      config_type: 'stage_checklist',
      stage_key: stage,
      config_key: configKey,
      config_value: { label: label.slice(0, 200), required: item.required !== false },
      sort_order: typeof item.sort_order === 'number' ? item.sort_order : index,
    });
  }

  for (const raw of asArray((config as any).required_fields ?? (grantCycle as any).required_fields)) {
    const item = asRecord(raw);
    if (!item) continue;
    const stage = item.stage_key ?? item.stage ?? item.lifecycle_stage;
    const fieldName = item.field_name ?? item.field ?? item.key;
    if (!isLifecycleStage(stage) || typeof fieldName !== 'string' || !(REQUIRED_FIELD_ALLOWLIST as readonly string[]).includes(fieldName)) continue;
    rows.push({
      org_id: orgId,
      module: 'grant_management',
      config_type: 'required_field',
      stage_key: stage,
      config_key: fieldName,
      config_value: {
        field_name: fieldName,
        ...(typeof item.error_message === 'string' ? { error_message: item.error_message.slice(0, 300) } : {}),
      },
      sort_order: 0,
    });
  }

  for (const raw of asArray((config as any).stage_labels ?? (grantCycle as any).stage_labels)) {
    const item = asRecord(raw);
    if (!item) continue;
    const stage = item.stage_key ?? item.stage ?? item.key;
    const label = String(item.label ?? item.value ?? '').trim();
    if (!isLifecycleStage(stage) || !label) continue;
    rows.push({
      org_id: orgId,
      module: 'grant_management',
      config_type: 'stage_label',
      stage_key: stage,
      config_key: 'label',
      config_value: { value: label.slice(0, 60) },
      sort_order: 0,
    });
  }

  for (const raw of asArray((config as any).approval_requirements ?? (grantCycle as any).approval_requirements)) {
    const item = asRecord(raw);
    if (!item) continue;
    const stage = item.stage_key ?? item.stage ?? item.key;
    if (!isLifecycleStage(stage) || item.required === false) continue;
    rows.push({
      org_id: orgId,
      module: 'grant_management',
      config_type: 'approval_requirement',
      stage_key: stage,
      config_key: 'default',
      config_value: {
        required: true,
        description: typeof item.description === 'string' ? item.description.slice(0, 300) : '',
      },
      sort_order: 0,
    });
  }

  return uniqueBy(rows, row => [
    row.org_id,
    row.module,
    row.config_type,
    row.stage_key,
    row.config_key,
  ].join(':'));
}

export function customFieldRowsFromOnboardingProfile(profile: any, orgId: string) {
  const workflows = profile?.workflows && typeof profile.workflows === 'object' ? profile.workflows : {};
  const grantCycle = asRecord((workflows as any).grant_cycle) ?? {};
  const sources = [
    ...asArray((workflows as any).custom_fields),
    ...asArray((grantCycle as any).custom_fields),
    ...asArray((grantCycle as any).key_custom_fields),
  ];

  const rows = sources.flatMap((raw, index) => {
    const item = asRecord(raw);
    if (!item) return [];
    const entityType = isCustomFieldEntityType(item.entity_type) ? item.entity_type : 'grant';
    const label = String(item.field_label ?? item.label ?? item.name ?? item.key ?? '').trim();
    if (!label) return [];
    const inputKey = typeof item.field_key === 'string' && CUSTOM_FIELD_KEY_PATTERN.test(item.field_key) ? item.field_key : null;
    const fieldKey = inputKey ?? slugFromLabel(label, `custom_field_${index + 1}`);
    if (!CUSTOM_FIELD_KEY_PATTERN.test(fieldKey)) return [];
    const fieldType = isCustomFieldType(item.field_type) ? item.field_type : isCustomFieldType(item.type) ? item.type : 'text';
    const requiredAtStage = entityType === 'grant' && isLifecycleStage(item.required_at_stage) ? item.required_at_stage : null;
    const enumOptions = fieldType === 'enum'
      ? asArray(item.enum_options ?? item.options)
        .map(option => asRecord(option))
        .filter((option): option is Record<string, unknown> => Boolean(option))
        .map((option) => ({
          value: String(option.value ?? option.key ?? '').trim(),
          label: String(option.label ?? option.value ?? option.key ?? '').trim(),
        }))
        .filter(option => CUSTOM_FIELD_KEY_PATTERN.test(option.value) && option.label)
      : null;
    if (fieldType === 'enum' && (!enumOptions || enumOptions.length === 0)) return [];

    return [{
      org_id: orgId,
      entity_type: entityType,
      field_key: fieldKey,
      field_label: label.slice(0, 120),
      field_type: fieldType,
      enum_options: enumOptions,
      required_at_stage: requiredAtStage,
      is_ai_readable: item.is_ai_readable !== false,
      sort_order: typeof item.sort_order === 'number' ? item.sort_order : index,
    }];
  });

  return uniqueBy(rows, row => [row.org_id, row.entity_type, row.field_key].join(':'));
}

export function automationRowsFromOnboardingProfile(profile: any, orgId: string, userId: string, onboardingSessionId?: string) {
  const workflows = profile?.workflows && typeof profile.workflows === 'object' ? profile.workflows : {};
  const prefs = (workflows as any).automation_preferences;
  const rules = asRecord(prefs)?.rules ?? prefs;

  const rows = asArray(rules).flatMap((raw, index) => {
    const rule = asRecord(raw);
    if (!rule) return [];
    const triggerType = rule.trigger_type;
    const actionType = rule.action_type;
    const triggerConfig = asRecord(rule.trigger_config);
    const actionConfig = asRecord(rule.action_config);
    if (
      typeof triggerType !== 'string' ||
      !(AUTOMATION_TRIGGER_TYPES as readonly string[]).includes(triggerType) ||
      typeof actionType !== 'string' ||
      !(AUTOMATION_ACTION_TYPES as readonly string[]).includes(actionType) ||
      !triggerConfig ||
      !actionConfig
    ) {
      return [];
    }
    if (triggerType === 'grant_stage_change' && !isLifecycleStage(triggerConfig.stage)) return [];
    if (triggerType === 'date_relative') {
      if (triggerConfig.entity_type !== 'grant' || typeof triggerConfig.anchor !== 'string' || typeof triggerConfig.offset_days !== 'number') return [];
    }
    if (triggerType === 'custom_field_set') {
      if (!isCustomFieldEntityType(triggerConfig.entity_type) || typeof triggerConfig.field_key !== 'string') return [];
    }
    if (triggerType === 'task_completed' && typeof triggerConfig.task_type !== 'string') return [];
    if (actionType === 'create_task' && typeof actionConfig.title_template !== 'string') return [];
    if (actionType === 'notify_member' && typeof actionConfig.message_template !== 'string') return [];
    if (actionType === 'set_custom_field' && (typeof actionConfig.field_key !== 'string' || actionConfig.value === undefined)) return [];

    return [{
      org_id: orgId,
      name: String(rule.name ?? `Onboarding automation ${index + 1}`).slice(0, 160),
      is_active: rule.is_active !== false,
      trigger_type: triggerType as AutomationTriggerType,
      trigger_config: triggerConfig,
      conditions: Array.isArray(rule.conditions) ? rule.conditions : [],
      action_type: actionType as AutomationActionType,
      action_config: actionConfig,
      created_by: userId,
      ...(onboardingSessionId ? { onboarding_session_id: onboardingSessionId } : {}),
    }];
  });

  return uniqueBy(rows, row => [
    row.org_id,
    row.name,
    row.trigger_type,
    JSON.stringify(row.trigger_config),
    row.action_type,
    JSON.stringify(row.action_config),
  ].join(':'));
}

export function viewRowsFromOnboardingProfile(profile: any, orgId: string) {
  const workflows = profile?.workflows && typeof profile.workflows === 'object' ? profile.workflows : {};
  const prefs = (workflows as any).view_preferences;
  if (!prefs || typeof prefs !== 'object') return [];

  const rows: Array<{
    org_id: string;
    config_scope: 'dashboard' | 'module_default' | 'table_columns' | 'entity_vocabulary';
    scope_key: string;
    config_value: Record<string, unknown>;
  }> = [];

  const dashboard = (prefs as any).dashboard_layout ?? (prefs as any).dashboard;
  if (dashboard && typeof dashboard === 'object') {
    const sections = arrayOfKnownValues((dashboard as any).sections, DASHBOARD_SECTION_IDS);
    const hiddenSections = arrayOfKnownValues((dashboard as any).hidden_sections, DASHBOARD_SECTION_IDS);
    if (sections.length > 0 || hiddenSections.length > 0) {
      rows.push({
        org_id: orgId,
        config_scope: 'dashboard',
        scope_key: 'main',
        config_value: { sections: sections.length > 0 ? sections : [...DASHBOARD_SECTION_IDS], hidden_sections: hiddenSections },
      });
    }
  }

  const defaultGrantView = (prefs as any).grant_default_view ?? (prefs as any).default_grant_view;
  if (typeof defaultGrantView === 'string' && (GRANT_MODULE_VIEWS as readonly string[]).includes(defaultGrantView)) {
    rows.push({
      org_id: orgId,
      config_scope: 'module_default',
      scope_key: 'grant_module',
      config_value: { default_view: defaultGrantView },
    });
  }

  const grantColumns = arrayOfKnownValues((prefs as any).grant_table_columns, GRANTS_TABLE_COLUMNS);
  if (grantColumns.length > 0) {
    rows.push({
      org_id: orgId,
      config_scope: 'table_columns',
      scope_key: 'grants_table',
      config_value: { columns: grantColumns },
    });
  }

  const vocabulary = (prefs as any).entity_vocabulary;
  if (vocabulary && typeof vocabulary === 'object') {
    for (const [entityType, labels] of Object.entries(vocabulary)) {
      if (!(ENTITY_VOCABULARY_TYPES as readonly string[]).includes(entityType)) continue;
      rows.push({
        org_id: orgId,
        config_scope: 'entity_vocabulary',
        scope_key: `entity.${entityType}`,
        config_value: { ...normalizeVocabulary(labels as any, entityType as EntityVocabularyType) },
      });
    }
  }

  return uniqueBy(rows, row => [row.org_id, row.config_scope, row.scope_key].join(':'));
}
