// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { mockRequireAppAdmin, mockCreateRepository } = vi.hoisted(() => ({
  mockRequireAppAdmin: vi.fn(),
  mockCreateRepository: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireAppAdmin: mockRequireAppAdmin,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

vi.mock('@/lib/api/repositories/charities-admin', () => ({
  createCharityAdminRepository: mockCreateRepository,
}));

vi.mock('@/lib/services/charity-navigator', () => ({
  getCharityNavigatorRating: vi.fn(),
  transformCharityNavigatorRating: vi.fn(),
}));

vi.mock('@/lib/services/candid', () => ({
  getCandidSeal: vi.fn(),
  transformCandidSeal: vi.fn(),
}));

vi.mock('@/lib/services/propublica', () => ({
  searchOrganizations: vi.fn(),
  getOrganization: vi.fn(),
  convertToCharity: vi.fn(),
}));

import { POST as enrich } from '@/app/api/charities/enrich/route';
import { POST as importFromPropublica } from '@/app/api/charities/import/propublica/route';

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAppAdmin.mockResolvedValue({
    ok: false,
    reason: 'forbidden',
    response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
  });
});

describe('global charity mutation routes', () => {
  it.each([
    ['enrichment', enrich, 'http://localhost/api/charities/enrich'],
    ['ProPublica import', importFromPropublica, 'http://localhost/api/charities/import/propublica'],
  ])('blocks %s before constructing the global repository', async (_name, handler, url) => {
    const response = await handler(new NextRequest(url, {
      method: 'POST',
      body: JSON.stringify({ mode: 'ein', ein: '12-3456789' }),
    }));

    expect(response.status).toBe(403);
    expect(mockCreateRepository).not.toHaveBeenCalled();
  });
});
