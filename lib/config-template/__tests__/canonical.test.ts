import { describe, expect, it } from 'vitest';
import {
  canonicalTemplateJson,
  formatConfigTemplateJson,
  parseConfigTemplate,
  templateSha256,
} from '@/lib/config-template';

const source = {
  formatVersion: 1,
  metadata: { exportedAt: '2026-09-13T00:00:00.000Z', sourceOrgName: 'Ford Foundation' },
  schema: { ledger: [{ version: '0061', checksum: 'abc' }] },
  modules: ['reports', 'portfolio'],
  kpis: [{
    name: 'People reached', slug: 'people_reached', description: null, unit: 'people',
    aggregation: 'sum', direction: 'higher_is_better', target_value: null, baseline_value: null,
    is_active: true, display_order: 1,
  }],
  customFields: [],
  views: [],
  widgets: [],
  reportTemplates: [],
  workflowConfig: [],
  automationRules: [],
  workflowTemplates: [],
};

describe('configuration template canonicalization', () => {
  it('ignores informational metadata and canonicalizes module order', () => {
    const first = parseConfigTemplate(JSON.stringify(source));
    const second = parseConfigTemplate(JSON.stringify({
      ...source,
      metadata: { exportedAt: '2026-09-14T00:00:00.000Z', sourceOrgName: 'Target Foundation' },
      modules: ['portfolio', 'reports'],
    }));

    expect(canonicalTemplateJson(first)).toBe(canonicalTemplateJson(second));
    expect(templateSha256(first)).toBe(templateSha256(second));
    expect(formatConfigTemplateJson(first)).toContain('"sourceOrgName": "Ford Foundation"');
    expect(formatConfigTemplateJson(first)).toContain('"kpis"');
  });

  it('rejects unknown top-level fields and unsupported format versions', () => {
    expect(() => parseConfigTemplate(JSON.stringify({ ...source, source_id: 'leak' })))
      .toThrow(/unrecognized key/i);
    expect(() => parseConfigTemplate(JSON.stringify({ ...source, formatVersion: 2 })))
      .toThrow(/formatVersion/);
  });
});
