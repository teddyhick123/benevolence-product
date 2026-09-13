import type { ConfigTemplate, ConfigTemplateSection } from '@/lib/config-template/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ReferencePath = {
  section: ConfigTemplateSection;
  path: readonly string[];
  kind: 'metric_key';
};

/**
 * Every nested reference that may cross organization boundaries belongs here.
 * The initial widget contract uses metric_code, a stable semantic key rather
 * than an organization-specific KPI id.
 */
export const REFERENCE_PATHS: readonly ReferencePath[] = [
  { section: 'widgets', path: ['config', 'metric_code'], kind: 'metric_key' },
];

function isRegisteredPath(path: string): boolean {
  return REFERENCE_PATHS.some(reference =>
    path.endsWith(`.${reference.section}.${reference.path.join('.')}`));
}

function walk(value: unknown, path: string, onUuid: (_path: string) => void): void {
  if (typeof value === 'string') {
    if (UUID.test(value)) onUuid(path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => walk(child, `${path}[${index}]`, onUuid));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      walk(child, `${path}.${key}`, onUuid);
    }
  }
}

/** Refuse identities in semantic JSON until an explicit natural-key transform exists. */
export function assertNoSourceUuidReferences(template: ConfigTemplate): void {
  for (const section of REFERENCE_PATHS.map(entry => entry.section)) {
    // Touch the registry here so a future section must consciously choose
    // whether it has nested references before its DTO is exported.
    void section;
  }

  const semantic = {
    schema: template.schema,
    modules: template.modules,
    kpis: template.kpis,
    customFields: template.customFields,
    views: template.views,
    widgets: template.widgets,
    reportTemplates: template.reportTemplates,
    workflowConfig: template.workflowConfig,
    automationRules: template.automationRules,
    workflowTemplates: template.workflowTemplates,
  };
  walk(semantic, 'template', path => {
    const registryHint = isRegisteredPath(path)
      ? ' That path is registered, but its value must be a natural key rather than a UUID.'
      : '';
    throw new Error(
      `Configuration template contains an unregistered source UUID at ${path}. ` +
      `Represent that reference with a registered natural key before exporting.${registryHint}`,
    );
  });
}

/**
 * The initial registered reference is a dashboard metric key. Templates carry
 * its KPI definition or the target must already define it; otherwise a widget
 * would be written with a configuration it cannot resolve.
 */
export function assertTargetReferences(template: ConfigTemplate, live: ConfigTemplate): void {
  const availableKpis = new Set([...template.kpis, ...live.kpis].map(kpi => kpi.slug));
  for (const widget of template.widgets) {
    const metricCode = widget.config.metric_code;
    if (typeof metricCode === 'string' && metricCode.length > 0 && !availableKpis.has(metricCode)) {
      throw new Error(
        `Widget at position ${widget.position} references metric_code "${metricCode}", ` +
        'but neither the template nor the target defines that KPI.',
      );
    }
  }
}
