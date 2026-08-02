// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const {
  mockRequireOrgAccess,
  mockGetOrgEnabledModules,
  mockGetModulePresets,
  mockEnableModule,
  mockDisableModule,
  mockApplyModulePreset,
} = vi.hoisted(() => ({
  mockRequireOrgAccess: vi.fn(),
  mockGetOrgEnabledModules: vi.fn(),
  mockGetModulePresets: vi.fn(),
  mockEnableModule: vi.fn(),
  mockDisableModule: vi.fn(),
  mockApplyModulePreset: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireOrgAccess: mockRequireOrgAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

vi.mock('@/lib/modules', () => ({
  getOrgEnabledModules: mockGetOrgEnabledModules,
  getModulePresets: mockGetModulePresets,
  enableModule: mockEnableModule,
  disableModule: mockDisableModule,
  applyModulePreset: mockApplyModulePreset,
}));

import { GET, POST } from '@/app/api/org/[orgId]/modules/route';

const db = { from: vi.fn() };
const context = {
  orgId: 'org-1',
  role: 'admin',
  principal: { kind: 'user', userId: 'actor-1' },
  user: { id: 'actor-1' },
  db,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireOrgAccess.mockResolvedValue({ ok: true, context });
  mockGetOrgEnabledModules.mockResolvedValue(['core']);
  mockGetModulePresets.mockResolvedValue({ presets: [{ id: 'minimal' }] });
  mockEnableModule.mockResolvedValue({ success: true, enabledModules: ['impact_tracking'] });
  mockDisableModule.mockResolvedValue({ success: true });
  mockApplyModulePreset.mockResolvedValue({ success: true, enabledModules: ['impact_tracking'] });
});

describe('organization modules route', () => {
  it('denies before reading module state', async () => {
    mockRequireOrgAccess.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });

    const response = await GET(
      new NextRequest('http://localhost/api/org/org-1/modules'),
      { params: Promise.resolve({ orgId: 'org-1' }) }
    );

    expect(response.status).toBe(403);
    expect(mockGetOrgEnabledModules).not.toHaveBeenCalled();
  });

  it('reads modules and presets through the guarded session client', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/org/org-1/modules'),
      { params: Promise.resolve({ orgId: 'org-1' }) }
    );

    expect(mockRequireOrgAccess).toHaveBeenCalledWith('org-1', 'viewer');
    expect(mockGetOrgEnabledModules).toHaveBeenCalledWith(db, 'org-1');
    expect(mockGetModulePresets).toHaveBeenCalledWith(db);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      enabledModules: ['core'],
      presets: [{ id: 'minimal' }],
    });
  });

  it('requires org admin access and applies module changes with the guarded actor', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/org/org-1/modules', {
        method: 'POST',
        body: JSON.stringify({ action: 'enable', moduleId: 'impact_tracking' }),
      }),
      { params: Promise.resolve({ orgId: 'org-1' }) }
    );

    expect(mockRequireOrgAccess).toHaveBeenCalledWith('org-1', 'admin');
    expect(mockEnableModule).toHaveBeenCalledWith(
      db,
      'org-1',
      'impact_tracking',
      'actor-1'
    );
    expect(response.status).toBe(200);
  });
});
