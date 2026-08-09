// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOrganizationDashboardRepository } from '@/lib/api/repositories/organization-dashboard';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockCreateElevatedClient, mockFrom, mockGetOrgEnabledModules } = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
  mockGetOrgEnabledModules: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

vi.mock('@/lib/modules', () => ({
  getOrgEnabledModules: mockGetOrgEnabledModules,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue({ from: mockFrom });
  mockGetOrgEnabledModules.mockResolvedValue(['core', 'grant_management']);
});

describe('createOrganizationDashboardRepository', () => {
  it('loads the organization and modules through one proven organization scope', async () => {
    const orgQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'org-1', name: 'Org One' }, error: null } }
    );
    mockFrom.mockReturnValue(orgQuery);

    const result = await createOrganizationDashboardRepository({ orgId: 'org-1' }).load();

    expect(orgQuery.calls).toContainEqual({ method: 'eq', args: ['id', 'org-1'] });
    expect(mockGetOrgEnabledModules).toHaveBeenCalledWith(
      expect.objectContaining({ from: mockFrom }),
      'org-1'
    );
    expect(result).toEqual({
      org: { id: 'org-1', name: 'Org One' },
      enabledModules: ['core', 'grant_management'],
    });
  });

  it('does not expose elevated database access', () => {
    const repository = createOrganizationDashboardRepository({ orgId: 'org-1' });
    expect(repository).not.toHaveProperty('db');
    expect(repository).not.toHaveProperty('from');
  });
});
