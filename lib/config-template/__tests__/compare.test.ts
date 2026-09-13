import { describe, expect, it } from 'vitest';
import { compareConfig, parseConfigTemplate } from '@/lib/config-template';

function template(overrides: Record<string, unknown> = {}) {
  return parseConfigTemplate(JSON.stringify({
    formatVersion: 1,
    metadata: { exportedAt: '2026-09-13T00:00:00.000Z', sourceOrgName: 'Ford Foundation' },
    schema: { ledger: [{ version: '0061', checksum: 'abc' }] },
    modules: ['portfolio'],
    kpis: [], customFields: [], views: [], widgets: [], reportTemplates: [],
    workflowConfig: [], automationRules: [], workflowTemplates: [],
    ...overrides,
  }));
}

describe('compareConfig', () => {
  it('reports every create, update, same, and extra without planning deletion', () => {
    const desired = template({
      modules: ['portfolio', 'reports'],
      kpis: [{
        name: 'Reach', slug: 'reach', description: null, unit: 'people', aggregation: 'sum',
        direction: 'higher_is_better', target_value: null, baseline_value: null,
        is_active: true, display_order: 1,
      }],
    });
    const live = template({
      modules: ['portfolio', 'tax'],
      kpis: [{
        name: 'Reach', slug: 'reach', description: null, unit: 'count', aggregation: 'sum',
        direction: 'higher_is_better', target_value: null, baseline_value: null,
        is_active: true, display_order: 1,
      }, {
        name: 'Local only', slug: 'local', description: null, unit: null, aggregation: 'sum',
        direction: 'higher_is_better', target_value: null, baseline_value: null,
        is_active: true, display_order: 2,
      }],
    });

    const result = compareConfig(desired, live);
    expect(result.create).toEqual([{ section: 'modules', key: 'reports', status: 'create' }]);
    expect(result.update).toEqual([{ section: 'kpis', key: 'reach', status: 'update' }]);
    expect(result.same).toEqual([{ section: 'modules', key: 'portfolio', status: 'same' }]);
    expect(result.extra).toEqual([
      { section: 'kpis', key: 'local', status: 'extra' },
      { section: 'modules', key: 'tax', status: 'extra' },
    ]);
  });

  it('compares JSON object values by content rather than insertion order', () => {
    const desired = template({
      views: [{ config_scope: 'dashboard', scope_key: 'main', config_value: { a: 1, b: 2 } }],
    });
    const live = template({
      views: [{ config_scope: 'dashboard', scope_key: 'main', config_value: { b: 2, a: 1 } }],
    });
    expect(compareConfig(desired, live).same).toContainEqual({ section: 'views', key: 'dashboard.main', status: 'same' });
  });
});
