// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const {
  mockRequireOrgAccess,
  mockCreateRepository,
  mockRecordRequest,
  mockLoadContext,
  mockRunTool,
  mockSaveSession,
  mockCreateStream,
  mockBuildSystemPrompt,
  mockGetCodebaseIndex,
} = vi.hoisted(() => ({
  mockRequireOrgAccess: vi.fn(),
  mockCreateRepository: vi.fn(),
  mockRecordRequest: vi.fn(),
  mockLoadContext: vi.fn(),
  mockRunTool: vi.fn(),
  mockSaveSession: vi.fn(),
  mockCreateStream: vi.fn(),
  mockBuildSystemPrompt: vi.fn(),
  mockGetCodebaseIndex: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireOrgAccess: mockRequireOrgAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

vi.mock('@/lib/api/repositories/builder-chat', () => ({
  createOrgBuilderChatRepository: mockCreateRepository,
}));

vi.mock('@/lib/ai/factory', () => ({
  createAIProvider: () => ({ createStream: mockCreateStream }),
}));

vi.mock('@/lib/builder/context-bundle', () => ({
  buildSystemPrompt: mockBuildSystemPrompt,
}));

vi.mock('@/lib/builder/codebase-index', () => ({
  getCodebaseIndex: mockGetCodebaseIndex,
}));

vi.mock('@/lib/builder/tools', () => ({
  BUILDER_TOOLS: [],
}));

import { POST } from '@/app/api/org/[orgId]/builder/chat/route';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function call(body: Record<string, unknown>) {
  return POST(new NextRequest('http://localhost/api/org/org-1/builder/chat', {
    method: 'POST',
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ orgId: ORG_ID }) });
}

async function* textStream(text: string) {
  yield { type: 'content_block_start', blockType: 'text' };
  yield { type: 'text_delta', text };
  yield { type: 'content_block_stop' };
  yield { type: 'message_stop', stopReason: 'end_turn' };
}

async function* toolStream() {
  yield {
    type: 'content_block_start',
    blockType: 'tool_use',
    id: 'tool-use-1',
    name: 'update_org_branding',
  };
  yield { type: 'tool_input_delta', partialJson: '{"name":"New name"}' };
  yield { type: 'content_block_stop' };
  yield { type: 'message_stop', stopReason: 'tool_use' };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireOrgAccess.mockResolvedValue({
    ok: true,
    context: { user: { id: USER_ID }, db: { kind: 'session-db' }, role: 'admin' },
  });
  mockCreateRepository.mockReturnValue({
    recordRequest: mockRecordRequest,
    loadContext: mockLoadContext,
    runTool: mockRunTool,
    saveSession: mockSaveSession,
  });
  mockLoadContext.mockResolvedValue({
    snapshot: { orgId: ORG_ID, name: 'Example Foundation' },
    existingMessages: [],
  });
  mockRunTool.mockResolvedValue({
    type: 'config_success',
    tool: 'update_org_branding',
    message: 'Updated',
  });
  mockBuildSystemPrompt.mockReturnValue('Builder system prompt');
  mockCreateStream.mockImplementation(() => textStream('Done'));
});

describe('Builder chat route', () => {
  it('returns the shared access denial before constructing the repository', async () => {
    mockRequireOrgAccess.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await call({ message: 'Hello' });

    expect(response.status).toBe(401);
    expect(mockCreateRepository).not.toHaveBeenCalled();
  });

  it('rejects an empty message before recording telemetry', async () => {
    const response = await call({ message: '   ' });

    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mockRecordRequest).not.toHaveBeenCalled();
  });

  it('fails closed when request telemetry cannot be recorded', async () => {
    mockRecordRequest.mockRejectedValueOnce(new Error('event insert failed'));

    const response = await call({ message: 'Hello' });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'event insert failed' });
    expect(mockLoadContext).not.toHaveBeenCalled();
  });

  it('returns 404 when the scoped organization snapshot is unavailable', async () => {
    mockLoadContext.mockResolvedValueOnce({ snapshot: null, existingMessages: [] });

    const response = await call({ message: 'Hello' });

    expect(response.status).toBe(404);
    expect(mockCreateStream).not.toHaveBeenCalled();
  });

  it('streams assistant text and persists the completed conversation', async () => {
    const response = await call({ message: 'Hello' });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body).toContain('"type":"text","text":"Done"');
    expect(body).toContain('"type":"done"');
    expect(mockSaveSession).toHaveBeenCalledWith([
      expect.objectContaining({ role: 'user', content: 'Hello' }),
      expect.objectContaining({ role: 'assistant', content: 'Done' }),
    ]);
  });

  it('runs model tools through the scoped repository before continuing the stream', async () => {
    mockCreateStream
      .mockImplementationOnce(() => toolStream())
      .mockImplementationOnce(() => textStream('Renamed'));

    const response = await call({ message: 'Rename us' });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(mockRunTool).toHaveBeenCalledWith(
      'update_org_branding',
      { name: 'New name' },
      'Rename us'
    );
    expect(body).toContain('"type":"tool_result"');
    expect(body).toContain('"type":"done"');
  });
});
