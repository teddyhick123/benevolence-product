// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { mockRequireJobAccess, mockCreateRepository, mockDeliver } = vi.hoisted(() => ({
  mockRequireJobAccess: vi.fn(), mockCreateRepository: vi.fn(), mockDeliver: vi.fn(),
}));
vi.mock('@/lib/api/access', () => ({
  requireJobAccess: mockRequireJobAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));
vi.mock('@/lib/api/repositories/invitation-jobs', () => ({ createInvitationJobRepository: mockCreateRepository }));

import { GET, POST } from '@/app/api/jobs/invitations/send/route';

const context = { principal: { kind: 'job' as const, job: 'invitations' } };
beforeEach(() => {
  vi.clearAllMocks();
  mockRequireJobAccess.mockReturnValue({ ok: true, context });
  mockCreateRepository.mockReturnValue({ deliver: mockDeliver });
  mockDeliver.mockResolvedValue({ ok: true, scanned: 0, sent: 0, cancelled: 0, failed: 0, errors: [] });
});

describe('invitation email job route', () => {
  it('denies before constructing elevated job access', async () => {
    mockRequireJobAccess.mockReturnValue({ ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) });
    const response = await POST(new NextRequest('http://localhost/api/jobs/invitations/send', { method: 'POST', body: '{}' }));
    expect(response.status).toBe(401);
    expect(mockCreateRepository).not.toHaveBeenCalled();
  });

  it('passes delivery controls through the invitations-only job boundary', async () => {
    const request = new NextRequest('http://localhost/api/jobs/invitations/send', { method: 'POST', body: JSON.stringify({ dry_run: true, limit: 10 }) });
    const response = await POST(request);
    expect(mockRequireJobAccess).toHaveBeenCalledWith(request, 'invitations');
    expect(mockCreateRepository).toHaveBeenCalledWith(context);
    expect(mockDeliver).toHaveBeenCalledWith({ dryRun: true, limit: 10 });
    expect(response.status).toBe(200);
  });

  it('routes cron GET through the same job guard', async () => {
    const request = new NextRequest('http://localhost/api/jobs/invitations/send', { headers: { authorization: 'Bearer cron-secret' } });
    const response = await GET(request);
    expect(mockRequireJobAccess).toHaveBeenCalledWith(request, 'invitations');
    expect(response.status).toBe(200);
  });
});
