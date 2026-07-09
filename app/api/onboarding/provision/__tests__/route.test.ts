import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRpc = vi.fn();
const mockEq = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-123' } },
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: mockEq.mockResolvedValue({ data: [], error: null }),
      })),
    })),
  })),
  createAdminClient: vi.fn(() => ({
    rpc: mockRpc,
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: 'portfolio-123' }, error: null }),
        })),
      })),
    })),
  })),
}));

describe('POST /api/onboarding/provision — validation', () => {
  beforeEach(() => {
    mockRpc.mockResolvedValue({ data: 'org-123', error: null });
  });

  it('returns 400 if name is missing', async () => {
    const { POST } = await import('../route');
    const req = new Request('http://localhost/api/onboarding/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_type: 'private_foundation' }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/name/i);
  });

  it('returns 400 if org_type is invalid', async () => {
    const { POST } = await import('../route');
    const req = new Request('http://localhost/api/onboarding/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Org', org_type: 'daf' }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/org_type/i);
  });

  it('returns 201 with org_id and portfolio_id on success', async () => {
    const { POST } = await import('../route');
    const req = new Request('http://localhost/api/onboarding/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Thornwood Foundation', org_type: 'private_foundation' }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.org_id).toBe('org-123');
    expect(json.portfolio_id).toBe('portfolio-123');
  });
});

describe('onboarding configuration row builders', () => {
  it('maps a configured onboarding profile into all Phase 1-5 configuration layers', async () => {
    const {
      workflowRowsFromOnboardingProfile,
      customFieldRowsFromOnboardingProfile,
      automationRowsFromOnboardingProfile,
      viewRowsFromOnboardingProfile,
    } = await import('@/lib/onboarding-provision-config');

    const profile = {
      workflows: {
        grant_cycle: {
          checklist_items: [
            {
              stage_key: 'due_diligence',
              item_key: 'site_visit',
              label: 'Site visit completed',
              required: true,
            },
          ],
          required_fields: [
            {
              stage_key: 'due_diligence',
              field_name: 'purpose',
              error_message: 'Purpose is required before recommendation',
            },
          ],
          stage_labels: {
            due_diligence: { label: 'Site Review' },
          },
          custom_fields: [
            {
              entity_type: 'grant',
              field_label: 'Strategic Alignment Score',
              field_type: 'integer',
              required_at_stage: 'recommended',
            },
          ],
        },
        automation_preferences: {
          rules: [
            {
              name: 'Active grant check-in',
              trigger_type: 'grant_stage_change',
              trigger_config: { stage: 'active' },
              action_type: 'create_task',
              action_config: {
                title_template: 'Schedule 90-day check-in: {{grant_name}}',
                due_days: 7,
              },
            },
          ],
        },
        view_preferences: {
          dashboard_layout: { sections: ['payout', 'grants'], hidden_sections: ['map'] },
          grant_default_view: 'attention',
          grant_table_columns: ['name', 'stage', 'custom_fields'],
          entity_vocabulary: {
            grant: { singular: 'Award', plural: 'Awards' },
          },
        },
      },
    };

    const workflowRows = workflowRowsFromOnboardingProfile(profile, 'org-1');
    expect(workflowRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        org_id: 'org-1',
        config_type: 'stage_checklist',
        stage_key: 'due_diligence',
        config_key: 'site_visit',
        config_value: { label: 'Site visit completed', required: true },
      }),
      expect.objectContaining({
        config_type: 'required_field',
        stage_key: 'due_diligence',
        config_key: 'purpose',
      }),
      expect.objectContaining({
        config_type: 'stage_label',
        stage_key: 'due_diligence',
        config_value: { value: 'Site Review' },
      }),
    ]));
    expect(workflowRows.filter(row =>
      row.config_type === 'stage_checklist' &&
      row.stage_key === 'due_diligence' &&
      row.config_key === 'site_visit'
    )).toHaveLength(1);

    expect(customFieldRowsFromOnboardingProfile(profile, 'org-1')).toEqual([
      expect.objectContaining({
        org_id: 'org-1',
        entity_type: 'grant',
        field_key: 'strategic_alignment_score',
        field_type: 'integer',
        required_at_stage: 'recommended',
      }),
    ]);

    expect(automationRowsFromOnboardingProfile(profile, 'org-1', 'user-1')).toEqual([
      expect.objectContaining({
        org_id: 'org-1',
        name: 'Active grant check-in',
        trigger_type: 'grant_stage_change',
        trigger_config: { stage: 'active' },
        action_type: 'create_task',
      }),
    ]);

    expect(viewRowsFromOnboardingProfile(profile, 'org-1')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        config_scope: 'dashboard',
        scope_key: 'main',
      }),
      expect.objectContaining({
        config_scope: 'module_default',
        scope_key: 'grant_module',
        config_value: { default_view: 'attention' },
      }),
      expect.objectContaining({
        config_scope: 'table_columns',
        scope_key: 'grants_table',
      }),
      expect.objectContaining({
        config_scope: 'entity_vocabulary',
        scope_key: 'entity.grant',
        config_value: { singular: 'Award', plural: 'Awards' },
      }),
    ]));
  });
});
