// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drainCustomFieldAutomationOutbox } from '../custom-field-outbox';

const { mockRunAutomation } = vi.hoisted(() => ({ mockRunAutomation: vi.fn() }));
vi.mock('../dynamic-rules', () => ({ runAutomationRulesForEvent: mockRunAutomation }));

const event = {
  id: 'outbox-1', org_id: 'org-1', event_type: 'custom_field_set',
  entity_type: 'grant', entity_id: 'grant-1',
  payload: { entity_type: 'grant', field_key: 'strategic_alignment', value: 4, actor_id: 'actor-1' },
};

describe('custom-field automation outbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunAutomation.mockResolvedValue({ created: 1, updated: 0, completed: 0, skipped: 0, errors: [] });
  });

  it('claims a committed field event, executes it, and settles the exact event', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [event], error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    const result = await drainCustomFieldAutomationOutbox({ rpc } as any, {
      orgId: 'org-1', eventId: 'outbox-1', limit: 1,
    });

    expect(rpc).toHaveBeenNthCalledWith(1, 'claim_org_automation_outbox', {
      p_limit: 1, p_org_id: 'org-1', p_event_id: 'outbox-1',
    });
    expect(mockRunAutomation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      orgId: 'org-1', triggerType: 'custom_field_set', entityType: 'grant', entityId: 'grant-1',
      payload: expect.objectContaining({ outbox_event_id: 'outbox-1' }),
    }));
    expect(rpc).toHaveBeenNthCalledWith(2, 'finish_org_automation_outbox', {
      p_event_id: 'outbox-1', p_succeeded: true, p_error: null,
    });
    expect(result).toMatchObject({ scanned: 1, created: 1, errors: [] });
  });

  it('records retry state when automation execution fails', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [event], error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    mockRunAutomation.mockRejectedValue(new Error('temporary failure'));

    const result = await drainCustomFieldAutomationOutbox({ rpc } as any);

    expect(rpc).toHaveBeenNthCalledWith(2, 'finish_org_automation_outbox', {
      p_event_id: 'outbox-1', p_succeeded: false, p_error: 'temporary failure',
    });
    expect(result.errors).toEqual([expect.objectContaining({
      sourceType: 'org_automation_outbox', sourceId: 'outbox-1', message: 'temporary failure',
    })]);
  });
});
