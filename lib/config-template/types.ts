// Portable, organization-independent configuration artifact types.
//
// These are deliberately DTOs rather than generated database rows. A template
// must contain only semantic configuration that can cross an organization
// boundary; identity, ownership, audit, and timestamp columns never appear.

import { z } from 'zod';

export const CONFIG_TEMPLATE_FORMAT_VERSION = 1;

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(jsonValueSchema),
  z.record(jsonValueSchema),
]));

const jsonObjectSchema = z.record(jsonValueSchema);

export const schemaLedgerEntrySchema = z.object({
  version: z.string().regex(/^\d{4}$/),
  checksum: z.string().min(1),
}).strict();

export const kpiTemplateSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().nullable(),
  unit: z.string().nullable(),
  aggregation: z.string(),
  direction: z.string(),
  target_value: z.string().nullable(),
  baseline_value: z.string().nullable(),
  is_active: z.boolean(),
  display_order: z.number().int(),
}).strict();

export const customFieldTemplateSchema = z.object({
  entity_type: z.string(),
  field_key: z.string(),
  field_label: z.string(),
  field_type: z.string(),
  enum_options: jsonValueSchema.nullable(),
  required_at_stage: z.string().nullable(),
  is_ai_readable: z.boolean(),
  sort_order: z.number().int(),
}).strict();

export const viewTemplateSchema = z.object({
  config_scope: z.string(),
  scope_key: z.string(),
  config_value: jsonObjectSchema,
}).strict();

export const widgetTemplateSchema = z.object({
  type: z.string(),
  title: z.string().nullable(),
  config: jsonObjectSchema,
  position: z.number().int(),
}).strict();

export const reportTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable(),
  scope: z.string(),
  config: jsonObjectSchema,
  is_default: z.boolean(),
}).strict();

export const workflowConfigTemplateSchema = z.object({
  module: z.string(),
  config_type: z.string(),
  stage_key: z.string(),
  config_key: z.string(),
  config_value: jsonValueSchema,
  sort_order: z.number().int(),
}).strict();

export const automationRuleTemplateSchema = z.object({
  name: z.string().min(1),
  is_active: z.boolean(),
  trigger_type: z.string(),
  trigger_config: jsonObjectSchema,
  conditions: z.array(jsonValueSchema),
  action_type: z.string(),
  action_config: jsonObjectSchema,
}).strict();

export const workflowTemplateSchema = z.object({
  name: z.string().min(1),
  workflow_type: z.string(),
  description: z.string().nullable(),
  is_active: z.boolean(),
  steps: z.array(jsonValueSchema),
}).strict();

export const configTemplateSchema = z.object({
  formatVersion: z.literal(CONFIG_TEMPLATE_FORMAT_VERSION),
  metadata: z.object({
    exportedAt: z.string().datetime({ offset: true }),
    sourceOrgName: z.string().min(1),
  }).strict(),
  schema: z.object({ ledger: z.array(schemaLedgerEntrySchema) }).strict(),
  modules: z.array(z.string().min(1)),
  kpis: z.array(kpiTemplateSchema),
  customFields: z.array(customFieldTemplateSchema),
  views: z.array(viewTemplateSchema),
  widgets: z.array(widgetTemplateSchema),
  reportTemplates: z.array(reportTemplateSchema),
  workflowConfig: z.array(workflowConfigTemplateSchema),
  automationRules: z.array(automationRuleTemplateSchema),
  workflowTemplates: z.array(workflowTemplateSchema),
}).strict();

export type ConfigTemplate = z.infer<typeof configTemplateSchema>;
export type ConfigSemanticPayload = Omit<ConfigTemplate, 'metadata'>;

export const CONFIG_TEMPLATE_SECTIONS = [
  'kpis',
  'customFields',
  'views',
  'widgets',
  'reportTemplates',
  'workflowConfig',
  'automationRules',
  'workflowTemplates',
] as const;

export type ConfigTemplateSection = typeof CONFIG_TEMPLATE_SECTIONS[number];

export function naturalKey(section: ConfigTemplateSection, value: ConfigTemplate[ConfigTemplateSection][number]): string {
  switch (section) {
    case 'kpis':
      return (value as ConfigTemplate['kpis'][number]).slug;
    case 'customFields': {
      const row = value as ConfigTemplate['customFields'][number];
      return `${row.entity_type}.${row.field_key}`;
    }
    case 'views': {
      const row = value as ConfigTemplate['views'][number];
      return `${row.config_scope}.${row.scope_key}`;
    }
    case 'widgets':
      return String((value as ConfigTemplate['widgets'][number]).position);
    case 'reportTemplates':
      return (value as ConfigTemplate['reportTemplates'][number]).name;
    case 'workflowConfig': {
      const row = value as ConfigTemplate['workflowConfig'][number];
      return `${row.module}.${row.config_type}.${row.stage_key}.${row.config_key}`;
    }
    case 'automationRules':
      return (value as ConfigTemplate['automationRules'][number]).name;
    case 'workflowTemplates':
      return (value as ConfigTemplate['workflowTemplates'][number]).name;
  }
}
