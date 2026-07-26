// app/api/__tests__/workflow-config.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

let _authUser: { id: string } | null = { id: USER_ID };
let _orgRole: string | null = 'admin';
let _configRows: any[] = [];
let _configError: any = null;

const mockServerRpc = vi.fn();
const mockAdminFrom = vi.fn();
const mockAdminRpc = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: _authUser } })) },
    rpc: mockServerRpc,
  })),
  createAdminClient: vi.fn(() => ({ from: mockAdminFrom, rpc: mockAdminRpc })),
}));

function setupMocks() {
  mockServerRpc.mockClear();
  mockAdminFrom.mockClear();
  mockAdminRpc.mockClear();

  mockServerRpc.mockImplementation(async (fn: string) => {
    if (fn === 'user_org_role') return { data: _orgRole, error: null };
    return { data: null, error: null };
  });

  mockAdminRpc.mockImplementation(async (fn: string) => {
    if (fn === 'org_has_module') return { data: true, error: null };
    return { data: null, error: null };
  });

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'org_workflow_config') {
      const b: any = {
        select: vi.fn(() => b),
        eq: vi.fn(() => b),
        // order() returns the builder so multiple .order() calls can chain;
        // awaiting the builder itself resolves via .then()
        order: vi.fn(() => b),
        then: (resolve: any, reject: any) =>
          Promise.resolve({ data: _configRows, error: _configError }).then(resolve, reject),
      };
      return b;
    }
    return { select: vi.fn(), eq: vi.fn() };
  });
}

beforeEach(() => {
  _authUser = { id: USER_ID };
  _orgRole = 'admin';
  _configRows = [];
  _configError = null;
  setupMocks();
});

import { GET as getAll } from '@/app/api/org/[orgId]/workflow-config/route';
import { GET as getLabels } from '@/app/api/org/[orgId]/workflow-config/labels/route';

function makeParams(orgId: string) {
  return { params: Promise.resolve({ orgId }) } as any;
}

// ─── GET /workflow-config ──────────────────────────────────────────────────────

describe('GET /api/org/[orgId]/workflow-config', () => {
  it('returns 401 when not authenticated', async () => {
    _authUser = null;
    const req = new NextRequest(`http://localhost/api/org/${ORG_ID}/workflow-config`);
    const res = await getAll(req, makeParams(ORG_ID));
    expect(res.status).toBe(401);
  });

  it('returns 403 when user is not an admin', async () => {
    _orgRole = 'member';
    const req = new NextRequest(`http://localhost/api/org/${ORG_ID}/workflow-config`);
    const res = await getAll(req, makeParams(ORG_ID));
    expect(res.status).toBe(403);
  });

  it('returns 200 with data array for admin', async () => {
    _configRows = [
      { id: 'r1', config_type: 'stage_checklist', stage_key: 'due_diligence', config_key: 'site_visit', config_value: { label: 'Site visit', required: true }, sort_order: 0 },
    ];
    const req = new NextRequest(`http://localhost/api/org/${ORG_ID}/workflow-config`);
    const res = await getAll(req, makeParams(ORG_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it('returns empty array when no config exists', async () => {
    _configRows = [];
    const req = new NextRequest(`http://localhost/api/org/${ORG_ID}/workflow-config`);
    const res = await getAll(req, makeParams(ORG_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

// ─── GET /workflow-config/labels ──────────────────────────────────────────────

describe('GET /api/org/[orgId]/workflow-config/labels', () => {
  it('returns 401 when not authenticated', async () => {
    _authUser = null;
    const req = new NextRequest(`http://localhost/api/org/${ORG_ID}/workflow-config/labels`);
    const res = await getLabels(req, makeParams(ORG_ID));
    expect(res.status).toBe(401);
  });

  it('returns 200 with labels map for member', async () => {
    _orgRole = 'member';
    _configRows = [
      { config_type: 'stage_label', stage_key: 'due_diligence', config_key: 'label', config_value: { value: 'Site Review' }, sort_order: 0 },
    ];
    const req = new NextRequest(`http://localhost/api/org/${ORG_ID}/workflow-config/labels`);
    const res = await getLabels(req, makeParams(ORG_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.labels).toEqual({ due_diligence: 'Site Review' });
  });

  it('returns empty labels object when no stage_label rows exist', async () => {
    _configRows = [
      { config_type: 'stage_checklist', stage_key: 'due_diligence', config_key: 'site_visit', config_value: { label: 'X', required: true }, sort_order: 0 },
    ];
    const req = new NextRequest(`http://localhost/api/org/${ORG_ID}/workflow-config/labels`);
    const res = await getLabels(req, makeParams(ORG_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.labels).toEqual({});
  });

  it('response includes Cache-Control header', async () => {
    _configRows = [];
    const req = new NextRequest(`http://localhost/api/org/${ORG_ID}/workflow-config/labels`);
    const res = await getLabels(req, makeParams(ORG_ID));
    expect(res.headers.get('Cache-Control')).toMatch(/s-maxage/);
  });
});
// Integration test.
