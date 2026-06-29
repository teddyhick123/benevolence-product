// lib/grants/__tests__/workflow-config.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkWorkflowGate } from '../workflow-config';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const GRANT_ID = '22222222-2222-2222-2222-222222222222';

// Mutable state for the DB mock
let _configRows: any[] = [];
let _completionRows: any[] = [];
let _configError: any = null;
let _completionError: any = null;

function makeDb() {
  return {
    from: (table: string) => {
      if (table === 'org_workflow_config') {
        const b: any = {
          select: vi.fn(() => b),
          eq: vi.fn(() => b),
          order: vi.fn(async () => ({ data: _configRows, error: _configError })),
        };
        return b;
      }
      if (table === 'grant_checklist_completions') {
        const b: any = {
          select: vi.fn(() => b),
          eq: vi.fn(() => b),
          // Awaiting the chain resolves with the completion rows
          then: (resolve: any) => Promise.resolve({ data: _completionRows, error: _completionError }).then(resolve),
        };
        return b;
      }
      return { select: vi.fn(), eq: vi.fn() };
    },
  } as any;
}

beforeEach(() => {
  _configRows = [];
  _completionRows = [];
  _configError = null;
  _completionError = null;
});

describe('checkWorkflowGate', () => {
  it('returns not-blocked when no workflow config exists for the stage', async () => {
    _configRows = [];
    const result = await checkWorkflowGate(makeDb(), ORG_ID, GRANT_ID, 'due_diligence', {});
    expect(result.blocked).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });

  it('returns blocked when a required checklist item has no completion row', async () => {
    _configRows = [{
      id: 'cfg-1',
      config_type: 'stage_checklist',
      stage_key: 'due_diligence',
      config_key: 'site_visit',
      config_value: { label: 'Site visit completed', required: true },
      sort_order: 0,
    }];
    _completionRows = []; // nothing checked

    const result = await checkWorkflowGate(makeDb(), ORG_ID, GRANT_ID, 'due_diligence', {});
    expect(result.blocked).toBe(true);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toMatch(/Site visit completed/);
  });

  it('returns not-blocked when all required checklist items are complete', async () => {
    _configRows = [{
      id: 'cfg-1',
      config_type: 'stage_checklist',
      stage_key: 'due_diligence',
      config_key: 'site_visit',
      config_value: { label: 'Site visit completed', required: true },
      sort_order: 0,
    }];
    _completionRows = [{ checklist_item_key: 'site_visit' }];

    const result = await checkWorkflowGate(makeDb(), ORG_ID, GRANT_ID, 'due_diligence', {});
    expect(result.blocked).toBe(false);
  });

  it('does not block on optional checklist items that are incomplete', async () => {
    _configRows = [{
      id: 'cfg-1',
      config_type: 'stage_checklist',
      stage_key: 'due_diligence',
      config_key: 'optional_review',
      config_value: { label: 'Optional review', required: false },
      sort_order: 0,
    }];
    _completionRows = [];

    const result = await checkWorkflowGate(makeDb(), ORG_ID, GRANT_ID, 'due_diligence', {});
    expect(result.blocked).toBe(false);
  });

  it('returns blocked when a required canonical field is null on the grant row', async () => {
    _configRows = [{
      id: 'cfg-2',
      config_type: 'required_field',
      stage_key: 'due_diligence',
      config_key: 'purpose',
      config_value: { field_name: 'purpose', error_message: 'Grant purpose must be set' },
      sort_order: 0,
    }];

    const result = await checkWorkflowGate(makeDb(), ORG_ID, GRANT_ID, 'due_diligence', { purpose: null });
    expect(result.blocked).toBe(true);
    expect(result.reasons[0]).toMatch(/Grant purpose must be set/);
  });

  it('returns not-blocked when a required field is set on the grant row', async () => {
    _configRows = [{
      id: 'cfg-2',
      config_type: 'required_field',
      stage_key: 'due_diligence',
      config_key: 'purpose',
      config_value: { field_name: 'purpose', error_message: 'Grant purpose must be set' },
      sort_order: 0,
    }];

    const result = await checkWorkflowGate(makeDb(), ORG_ID, GRANT_ID, 'due_diligence', { purpose: 'Fund literacy programs' });
    expect(result.blocked).toBe(false);
  });

  it('accumulates multiple blocking reasons', async () => {
    _configRows = [
      {
        id: 'cfg-1',
        config_type: 'stage_checklist',
        stage_key: 'due_diligence',
        config_key: 'site_visit',
        config_value: { label: 'Site visit completed', required: true },
        sort_order: 0,
      },
      {
        id: 'cfg-2',
        config_type: 'required_field',
        stage_key: 'due_diligence',
        config_key: 'purpose',
        config_value: { field_name: 'purpose', error_message: 'Purpose required' },
        sort_order: 1,
      },
    ];
    _completionRows = [];

    const result = await checkWorkflowGate(makeDb(), ORG_ID, GRANT_ID, 'due_diligence', { purpose: null });
    expect(result.blocked).toBe(true);
    expect(result.reasons).toHaveLength(2);
  });

  it('does not gate on approval_requirement rows', async () => {
    _configRows = [{
      id: 'cfg-3',
      config_type: 'approval_requirement',
      stage_key: 'due_diligence',
      config_key: 'default',
      config_value: { required: true, description: 'Board vote required' },
      sort_order: 0,
    }];

    const result = await checkWorkflowGate(makeDb(), ORG_ID, GRANT_ID, 'due_diligence', {});
    expect(result.blocked).toBe(false);
  });
});
