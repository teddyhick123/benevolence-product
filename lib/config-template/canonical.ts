import { createHash } from 'node:crypto';
import {
  CONFIG_TEMPLATE_SECTIONS,
  configTemplateSchema,
  naturalKey,
  type ConfigSemanticPayload,
  type ConfigTemplate,
} from '@/lib/config-template/types';

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortObject(child)]),
  );
}

/**
 * Canonicalizes a validated artifact without reordering nested arrays: those
 * can be configuration (workflow steps and enum choices), rather than a set.
 */
export function canonicalSemanticPayload(template: ConfigTemplate): ConfigSemanticPayload {
  const semantic: ConfigSemanticPayload = {
    formatVersion: template.formatVersion,
    schema: { ledger: [...template.schema.ledger].sort((a, b) => a.version.localeCompare(b.version)) },
    modules: [...template.modules].sort(),
    kpis: [...template.kpis],
    customFields: [...template.customFields],
    views: [...template.views],
    widgets: [...template.widgets],
    reportTemplates: [...template.reportTemplates],
    workflowConfig: [...template.workflowConfig],
    automationRules: [...template.automationRules],
    workflowTemplates: [...template.workflowTemplates],
  };

  for (const section of CONFIG_TEMPLATE_SECTIONS) {
    semantic[section].sort((left, right) => naturalKey(section, left).localeCompare(naturalKey(section, right)));
  }

  return sortObject(semantic) as ConfigSemanticPayload;
}

export function canonicalTemplateJson(template: ConfigTemplate): string {
  return `${JSON.stringify(canonicalSemanticPayload(template), null, 2)}\n`;
}

/**
 * The Git-reviewable artifact includes informational export metadata, while
 * semantic hashing deliberately does not. It still uses the semantic sort
 * rules so two reads of unchanged configuration produce the same file apart
 * from their declared metadata.
 */
export function formatConfigTemplateJson(template: ConfigTemplate): string {
  const semantic = canonicalSemanticPayload(template);
  return `${JSON.stringify(sortObject({ ...semantic, metadata: template.metadata }), null, 2)}\n`;
}

/** Stable semantic equality for a single DTO record or JSON configuration. */
export function canonicalValueJson(value: unknown): string {
  return JSON.stringify(sortObject(value));
}

export function templateSha256(template: ConfigTemplate): string {
  return createHash('sha256').update(canonicalTemplateJson(template), 'utf8').digest('hex');
}

export function parseConfigTemplate(input: string): ConfigTemplate {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error('Configuration template is not valid JSON.');
  }

  const result = configTemplateSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Configuration template is invalid: ${result.error.issues
      .map(issue => `${issue.path.join('.') || 'template'}: ${issue.message}`)
      .join('; ')}`);
  }
  return result.data;
}
