import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const {
  mockRequireUserAccess,
  mockCreateOnboardingProvisioner,
  mockProvision,
} = vi.hoisted(() => ({
  mockRequireUserAccess: vi.fn(),
  mockCreateOnboardingProvisioner: vi.fn(),
  mockProvision: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireUserAccess: mockRequireUserAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

vi.mock('@/lib/api/repositories/onboarding-provisioning', async (importOriginal) => {
  const original = await importOriginal<
    typeof import('@/lib/api/repositories/onboarding-provisioning')
  >();
  return {
    ...original,
    createOnboardingProvisioner: mockCreateOnboardingProvisioner,
  };
});

import { POST } from '@/app/api/onboarding/provision/route';
import { OnboardingProvisioningError } from '@/lib/api/repositories/onboarding-provisioning';

describe('POST /api/onboarding/provision — validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUserAccess.mockResolvedValue({
      ok: true,
      context: {
        principal: { kind: 'user', userId: 'user-123' },
        user: { id: 'user-123' },
        db: {},
      },
    });
    mockCreateOnboardingProvisioner.mockReturnValue({ provision: mockProvision });
    mockProvision.mockResolvedValue({
      orgId: 'org-123',
      portfolioId: 'portfolio-123',
      enabledModules: [],
      moduleErrors: [],
      setupErrors: [],
    });
  });

  it('requires authentication before creating a provisioner', async () => {
    mockRequireUserAccess.mockResolvedValueOnce({
      ok: false,
      reason: 'unauthenticated',
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const res = await POST(new Request('http://localhost/api/onboarding/provision', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Org', org_type: 'private_foundation' }),
    }) as never);

    expect(res.status).toBe(401);
    expect(mockCreateOnboardingProvisioner).not.toHaveBeenCalled();
  });

  it('returns 400 if name is missing', async () => {
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
    expect(mockCreateOnboardingProvisioner).toHaveBeenCalledWith('user-123');
  });

  it('returns 207 while preserving module and setup errors', async () => {
    mockProvision.mockResolvedValueOnce({
      orgId: 'org-123',
      portfolioId: 'portfolio-123',
      enabledModules: ['impact_tracking'],
      moduleErrors: ['analytics: unavailable'],
      setupErrors: ['Automations: invalid rule'],
    });

    const res = await POST(new Request('http://localhost/api/onboarding/provision', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test Org',
        org_type: 'private_foundation',
        module_ids: ['impact_tracking', 'analytics'],
      }),
    }) as never);

    expect(res.status).toBe(207);
    expect(mockProvision).toHaveBeenCalledWith(expect.objectContaining({
      selectedModuleIds: ['impact_tracking', 'analytics'],
      requestedModules: { portfolio: true },
    }));
    await expect(res.json()).resolves.toMatchObject({
      module_errors: ['analytics: unavailable'],
      setup_errors: ['Automations: invalid rule'],
    });
  });

  it('maps typed provisioning conflicts without leaking elevated access', async () => {
    mockProvision.mockRejectedValueOnce(
      new OnboardingProvisioningError('User already belongs to an organization', 409)
    );

    const res = await POST(new Request('http://localhost/api/onboarding/provision', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Org', org_type: 'private_foundation' }),
    }) as never);

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: 'User already belongs to an organization',
    });
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
