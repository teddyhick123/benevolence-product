// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createAISettingsRepository } from '@/lib/api/repositories/ai-settings';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const scope = {
  orgId: '00000000-0000-4000-8000-000000000001',
  role: 'admin' as const,
  principal: {
    kind: 'user' as const,
    userId: '00000000-0000-4000-8000-000000000002',
  },
};

describe('organization AI settings repository', () => {
  it('rejects construction without a proven workspace-manager role', () => {
    expect(() => createAISettingsRepository(
      { ...scope, role: 'member' },
      { db: {} as never, credentials: {} as never },
    )).toThrow('administrator access');
  });

  it('replaces an ordered route through the atomic org-scoped RPC', async () => {
    const deploymentId = '00000000-0000-4000-8000-000000000010';
    const connectionId = '00000000-0000-4000-8000-000000000011';
    const deploymentQuery = stubQuery({
      data: [{
        id: deploymentId,
        connection_id: connectionId,
        catalog_template_id: 'openrouter-anthropic-claude-sonnet',
        verified_workloads: {},
        status: 'active',
      }],
      error: null,
    });
    const rpc = vi.fn().mockResolvedValue({
      data: '00000000-0000-4000-8000-000000000020',
      error: null,
    });
    const db = {
      from: vi.fn(() => deploymentQuery),
      rpc,
    };
    const hasCredential = vi.fn().mockResolvedValue(true);
    const repository = createAISettingsRepository(scope, {
      db: db as never,
      credentials: { hasCredential, listCredentialHints: vi.fn() },
      now: () => new Date('2026-08-09T00:00:00.000Z'),
    });
    const result = await repository.replaceRoute({
      workloadId: 'summaries',
      policy: { experimentalUseAccepted: true },
      targets: [
        { kind: 'deployment', deploymentId },
        { kind: 'platform_default' },
      ],
    });

    expect(deploymentQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', scope.orgId] });
    expect(hasCredential).toHaveBeenCalledWith(connectionId);
    expect(rpc).toHaveBeenCalledWith('replace_org_ai_route', {
      p_org_id: scope.orgId,
      p_actor_id: scope.principal.userId,
      p_workload_id: 'summaries',
      p_policy: expect.objectContaining({ experimentalUseAccepted: true }),
      p_is_enabled: true,
      p_targets: [
        { kind: 'deployment', deploymentId },
        { kind: 'platform_default' },
      ],
    });
    expect(result).toEqual({ id: '00000000-0000-4000-8000-000000000020' });
    expect(repository).not.toHaveProperty('db');
  });

  it('does not call the route RPC for cross-organization deployment ids', async () => {
    const deploymentQuery = stubQuery({ data: [], error: null });
    const rpc = vi.fn();
    const repository = createAISettingsRepository(scope, {
      db: { from: vi.fn(() => deploymentQuery), rpc } as never,
      credentials: { hasCredential: vi.fn(), listCredentialHints: vi.fn() },
    });
    await expect(repository.replaceRoute({
      workloadId: 'summaries',
      policy: { experimentalUseAccepted: true },
      targets: [{
        kind: 'deployment',
        deploymentId: '00000000-0000-4000-8000-000000000099',
      }],
    })).rejects.toThrow('outside this organization');
    expect(rpc).not.toHaveBeenCalled();
  });
});
