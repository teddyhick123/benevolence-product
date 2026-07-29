// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOrgBuilderChatRepository } from '@/lib/api/repositories/builder-chat';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const {
  mockCreateElevatedClient,
  mockElevatedFrom,
  mockFetchOrgSnapshot,
  mockExecuteTool,
} = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockElevatedFrom: vi.fn(),
  mockFetchOrgSnapshot: vi.fn(),
  mockExecuteTool: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

vi.mock('@/lib/builder/context-bundle', () => ({
  fetchOrgSnapshot: mockFetchOrgSnapshot,
}));

vi.mock('@/lib/builder/tools', () => ({
  executeTool: mockExecuteTool,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue({ from: mockElevatedFrom });
  mockFetchOrgSnapshot.mockResolvedValue({ orgId: 'org-1', name: 'Example' });
  mockExecuteTool.mockResolvedValue({
    type: 'config_success',
    tool: 'update_org_branding',
    message: 'Updated',
  });
});

function setup() {
  const sessionFrom = vi.fn();
  const sessionDb = { from: sessionFrom };
  const repository = createOrgBuilderChatRepository({
    orgId: 'org-1',
    actorId: 'admin-1',
    sessionDb: sessionDb as never,
  });
  return { repository, sessionDb, sessionFrom };
}

describe('createOrgBuilderChatRepository', () => {
  it('forces the authorized org and actor into request telemetry', async () => {
    const eventQuery = stubQuery({ data: null, error: null });
    mockElevatedFrom.mockReturnValue(eventQuery);
    const { repository } = setup();

    await repository.recordRequest('Add a volunteer module');

    expect(mockElevatedFrom).toHaveBeenCalledWith('builder_events');
    expect(eventQuery.insert).toHaveBeenCalledWith({
      org_id: 'org-1',
      user_id: 'admin-1',
      event_type: 'ai_request',
      request_text: 'Add a volunteer module',
    });
  });

  it('loads only the authorized user session and org snapshot', async () => {
    const sessionQuery = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: {
            id: 'session-1',
            messages: [{ role: 'user', content: 'Hello', timestamp: 'now' }],
          },
          error: null,
        },
      }
    );
    const { repository, sessionDb, sessionFrom } = setup();
    sessionFrom.mockReturnValue(sessionQuery);

    const result = await repository.loadContext();

    expect(mockFetchOrgSnapshot).toHaveBeenCalledWith(sessionDb, 'org-1');
    expect(sessionQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(sessionQuery.calls).toContainEqual({ method: 'eq', args: ['user_id', 'admin-1'] });
    expect(result.existingMessages).toHaveLength(1);
  });

  it('persists chat history through the user session with forced scope fields', async () => {
    const sessionQuery = stubQuery({ data: null, error: null });
    const { repository, sessionFrom } = setup();
    sessionFrom.mockReturnValue(sessionQuery);
    const messages = [{ role: 'user' as const, content: 'Hello', timestamp: 'now' }];

    await repository.saveSession(messages);

    expect(sessionQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: 'org-1',
        user_id: 'admin-1',
        messages,
      }),
      { onConflict: 'org_id,user_id' }
    );
  });

  it('binds privileged tool execution to the authorized org, actor, and session', async () => {
    const { repository, sessionDb } = setup();

    await repository.runTool('update_org_branding', { name: 'New name' }, 'Rename us');

    expect(mockExecuteTool).toHaveBeenCalledWith(
      'update_org_branding',
      { name: 'New name' },
      'org-1',
      'admin-1',
      'Rename us',
      sessionDb,
      expect.objectContaining({ from: mockElevatedFrom })
    );
  });

  it('does not expose either database client or generic table access', () => {
    const { repository } = setup();

    expect(repository).not.toHaveProperty('db');
    expect(repository).not.toHaveProperty('from');
  });
});
