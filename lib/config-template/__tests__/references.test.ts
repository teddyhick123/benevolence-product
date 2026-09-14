import { describe, expect, it } from 'vitest';
import { assertNoSourceUuidReferences, parseConfigTemplate } from '@/lib/config-template';

const base = {
  formatVersion: 1,
  metadata: { exportedAt: '2026-09-13T00:00:00.000Z', sourceOrgName: 'Ford Foundation' },
  schema: { ledger: [{ version: '0061', checksum: 'abc' }] },
  modules: ['portfolio'],
  kpis: [], customFields: [], views: [], widgets: [], reportTemplates: [], workflowConfig: [],
  automationRules: [], workflowTemplates: [],
};

describe('configuration template reference boundary', () => {
  it('accepts a widget metric key', () => {
    const template = parseConfigTemplate(JSON.stringify({
      ...base,
      widgets: [{ type: 'kpi', title: 'Reach', position: 1, config: { metric_code: 'people_reached' } }],
    }));
    expect(() => assertNoSourceUuidReferences(template)).not.toThrow();
  });

  it('refuses a source UUID hidden in JSON configuration', () => {
    const template = parseConfigTemplate(JSON.stringify({
      ...base,
      widgets: [{
        type: 'kpi', title: 'Reach', position: 1,
        config: { holding_id: '11111111-1111-4111-8111-111111111111' },
      }],
    }));
    expect(() => assertNoSourceUuidReferences(template))
      .toThrow(/template\.widgets\[0\]\.config\.holding_id/);
  });
});
