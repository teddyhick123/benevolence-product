// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRunAutomationRulesForEvent, mockCreateAdminClient } = vi.hoisted(() => ({
  mockRunAutomationRulesForEvent: vi.fn(),
  mockCreateAdminClient: vi.fn(),
}));

vi.mock('../dynamic-rules', () => ({
  runAutomationRulesForEvent: mockRunAutomationRulesForEvent,
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateAdminClient,
}));

import { drainTaskAutomationOutbox, taskAutomationOutboxProducer } from '../outbox';

const event = {
  id: 'outbox-1',
  org_id: 'org-1',
  task_id: 'task-1',
  actor_id: 'user-1',
  event_type: 'task_completed' as const,
  payload: { task_type: 'review', task_snapshot: { id: 'task-1', status: 'completed' } },
};

describe('task automation outbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunAutomationRulesForEvent.mockResolvedValue({
      producer: 'dynamic_automation_rules',
      orgId: 'org-1',
      scanned: 1,
      created: 1,
      updated: 0,
      completed: 0,
      skipped: 0,
      errors: [],
    });
  });

  it('claims, executes, and completes one durable event', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [event], error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const db = { rpc } as any;

    const result = await drainTaskAutomationOutbox(db, {
      orgId: 'org-1', eventId: 'outbox-1', limit: 1,
    });

    expect(rpc).toHaveBeenNthCalledWith(1, 'claim_task_automation_outbox', {
      p_limit: 1,
      p_org_id: 'org-1',
      p_event_id: 'outbox-1',
    });
    expect(mockRunAutomationRulesForEvent).toHaveBeenCalledWith(db, expect.objectContaining({
      orgId: 'org-1',
      triggerType: 'task_completed',
      entityId: 'task-1',
      payload: expect.objectContaining({ outbox_event_id: 'outbox-1' }),
    }));
    expect(rpc).toHaveBeenNthCalledWith(2, 'finish_task_automation_outbox', {
      p_event_id: 'outbox-1',
      p_succeeded: true,
      p_error: null,
    });
    expect(result).toMatchObject({ scanned: 1, created: 1, errors: [] });
  });

  it('records a retryable failure instead of losing the event', async () => {
    mockRunAutomationRulesForEvent.mockResolvedValue({
      producer: 'dynamic_automation_rules',
      orgId: 'org-1',
      scanned: 1,
      created: 0,
      updated: 0,
      completed: 0,
      skipped: 0,
      errors: [{ sourceType: 'rule', sourceId: 'rule-1', message: 'temporary failure' }],
    });
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [event], error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    const result = await drainTaskAutomationOutbox({ rpc } as any);

    expect(rpc).toHaveBeenNthCalledWith(2, 'finish_task_automation_outbox', {
      p_event_id: 'outbox-1',
      p_succeeded: false,
      p_error: 'temporary failure',
    });
    expect(result.errors).toEqual([expect.objectContaining({
      sourceType: 'task_automation_outbox',
      sourceId: 'outbox-1',
      message: 'temporary failure',
    })]);
  });

  it('does not claim or execute durable events during a dry run', async () => {
    const db = { rpc: vi.fn() };
    mockCreateAdminClient.mockReturnValue(db);

    const result = await taskAutomationOutboxProducer({ orgId: 'org-1', dryRun: true });

    expect(db.rpc).not.toHaveBeenCalled();
    expect(mockRunAutomationRulesForEvent).not.toHaveBeenCalled();
    expect(result[0]).toMatchObject({ scanned: 0, errors: [] });
  });
});
