// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockRequireOrgAccess, mockRpc, mockFrom } = vi.hoisted(() => ({
  mockRequireOrgAccess: vi.fn(),
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireOrgAccess: mockRequireOrgAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

import { GET as getConfig, POST as setConfig } from '@/app/api/org/[orgId]/workflow-config/route';
import { GET as getLabels } from '@/app/api/org/[orgId]/workflow-config/labels/route';
import { GET as getTemplates } from '@/app/api/org/[orgId]/workflow-templates/route';

const orgId = '11111111-1111-1111-1111-111111111111';
const context = {
  orgId,
  role: 'admin',
  user: { id: 'admin-1' },
  principal: { kind: 'user', userId: 'admin-1' },
  db: { rpc: mockRpc, from: mockFrom },
};
const params = { params: Promise.resolve({ orgId }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireOrgAccess.mockResolvedValue({ ok: true, context });
  mockRpc.mockResolvedValue({ data: true, error: null });
});

describe('workflow configuration routes', () => {
  it('returns the shared denial before configuration reads', async () => {
    mockRequireOrgAccess.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });

    const response = await getConfig(
      new NextRequest(`http://localhost/api/org/${orgId}/workflow-config`),
      params
    );

    expect(response.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('requires admin access and scopes configuration reads to the org and module', async () => {
    const query = stubQuery({ data: [{ id: 'config-1' }], error: null });
    mockFrom.mockReturnValue(query);

    const response = await getConfig(
      new NextRequest(`http://localhost/api/org/${orgId}/workflow-config`),
      params
    );

    expect(mockRequireOrgAccess).toHaveBeenCalledWith(orgId, 'admin');
    expect(mockRpc).toHaveBeenCalledWith('org_has_module', {
      p_org_id: orgId,
      p_module: 'grant_management',
    });
    expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', orgId] });
    expect(query.calls).toContainEqual({
      method: 'eq',
      args: ['module', 'grant_management'],
    });
    expect(await response.json()).toEqual({ data: [{ id: 'config-1' }] });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('writes a validated stage label inside the authorized org', async () => {
    const query = stubQuery(
      { data: null, error: null },
      { single: { data: { id: 'config-1', stage_key: 'active' }, error: null } }
    );
    mockFrom.mockReturnValue(query);

    const response = await setConfig(new NextRequest(
      `http://localhost/api/org/${orgId}/workflow-config`,
      {
        method: 'POST',
        body: JSON.stringify({
          action: 'set_stage_label',
          stage_key: 'active',
          label: 'In progress',
        }),
      }
    ), params);

    expect(query.upsert).toHaveBeenCalledWith({
      org_id: orgId,
      module: 'grant_management',
      config_type: 'stage_label',
      stage_key: 'active',
      config_key: 'label',
      config_value: { value: 'In progress' },
      sort_order: 0,
    }, { onConflict: 'org_id,module,config_type,stage_key,config_key' });
    expect(response.status).toBe(200);
  });

  it('returns member-visible labels from only the scoped grant configuration', async () => {
    const query = stubQuery({
      data: [{ stage_key: 'due_diligence', config_value: { value: 'Site Review' } }],
      error: null,
    });
    mockFrom.mockReturnValue(query);

    const response = await getLabels(
      new NextRequest(`http://localhost/api/org/${orgId}/workflow-config/labels`),
      params
    );

    expect(mockRequireOrgAccess).toHaveBeenCalledWith(orgId);
    expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', orgId] });
    expect(query.calls).toContainEqual({
      method: 'eq',
      args: ['module', 'grant_management'],
    });
    expect(await response.json()).toEqual({ labels: { due_diligence: 'Site Review' } });
    expect(response.headers.get('cache-control')).toContain('s-maxage=60');
  });

  it('returns the shared denial before reading stage labels', async () => {
    mockRequireOrgAccess.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await getLabels(
      new NextRequest(`http://localhost/api/org/${orgId}/workflow-config/labels`),
      params
    );

    expect(response.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns an empty labels object when no overrides exist', async () => {
    mockFrom.mockReturnValue(stubQuery({ data: [], error: null }));

    const response = await getLabels(
      new NextRequest(`http://localhost/api/org/${orgId}/workflow-config/labels`),
      params
    );

    expect(await response.json()).toEqual({ labels: {} });
  });

  it('lists only system templates and templates for the authorized org', async () => {
    const query = stubQuery({ data: [{ id: 'template-1' }], error: null });
    mockFrom.mockReturnValue(query);

    const response = await getTemplates(
      new NextRequest(
        `http://localhost/api/org/${orgId}/workflow-templates?workflow_type=due_diligence`
      ),
      params
    );

    expect(mockRequireOrgAccess).toHaveBeenCalledWith(orgId);
    expect(query.calls).toContainEqual({
      method: 'or',
      args: [`org_id.is.null,org_id.eq.${orgId}`],
    });
    expect(query.calls).toContainEqual({
      method: 'eq',
      args: ['workflow_type', 'due_diligence'],
    });
    expect(await response.json()).toEqual({ templates: [{ id: 'template-1' }] });
  });

  it('returns the shared denial before listing workflow templates', async () => {
    mockRequireOrgAccess.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });

    const response = await getTemplates(
      new NextRequest(`http://localhost/api/org/${orgId}/workflow-templates`),
      params
    );

    expect(response.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
