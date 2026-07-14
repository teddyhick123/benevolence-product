import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';

describe('scaffold_module tool', () => {
  const src = readFileSync('lib/builder/tools.ts', 'utf8');

  it('exports scaffold_module tool definition', () => {
    expect(src).toMatch(/name:\s*['"]scaffold_module['"]/);
  });

  it('scaffold_module requires a description parameter', () => {
    const idx = src.indexOf("name: 'scaffold_module'");
    const snippet = src.slice(idx, idx + 900);
    expect(snippet).toMatch(/required[\s\S]{0,200}description/);
  });

  it('ToolResult union includes scaffold_plan_ready type', () => {
    expect(src).toMatch(/scaffold_plan_ready/);
  });

  it('ScaffoldPlanContent interface is exported', () => {
    expect(src).toMatch(/export interface ScaffoldPlanContent/);
  });

  it('uses AI_MODELS.scaffoldPlan for the planning call', () => {
    expect(src).toMatch(/AI_MODELS\.scaffoldPlan/);
  });
});

// ─── Task 5: scaffold_module persists code_state:'plan_ready' + plan_content,
// no revision (revisions are created later, at claim time by builder_claim_code_run). ───

vi.mock('@/lib/ai/factory', () => ({
  createAIProvider: vi.fn(() => ({
    createMessage: vi.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          moduleName: 'Volunteer Tracking',
          moduleSlug: 'volunteer_tracking',
          moduleIcon: 'users',
          tables: [{ name: 'volunteer_records', columns: [{ name: 'id', type: 'uuid', nullable: false }] }],
          files: [{ path: 'lib/example/volunteer.ts', description: 'Example file' }],
          registryEntry: "volunteer_tracking: { id: 'volunteer_tracking' }",
          apiShape: 'Fields: hours_logged (number)',
        }),
      }],
      stopReason: null,
      model: 'test-model',
    }),
  })),
}));

describe('scaffold_module executor — durable schema writes (Task 5)', () => {
  const ORG_ID = '11111111-1111-1111-1111-111111111111';
  const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const PROPOSAL_ID = '44444444-4444-4444-4444-444444444444';
  const REQUEST_TEXT = 'Add a volunteer tracking module';

  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a proposal with code_state:"plan_ready" and plan_content, and no generated_code key at all', async () => {
    const { executeTool } = await import('@/lib/builder/tools');
    const { SupabaseMock } = await import('./helpers/supabase-mock');

    const mock = new SupabaseMock();
    mock.queueTable('builder_proposals', { data: { id: PROPOSAL_ID }, error: null }); // insert
    mock.queueTable('builder_events', { data: null, error: null }); // telemetry

    const result = await executeTool(
      'scaffold_module',
      { description: 'Add a volunteer tracking module' },
      ORG_ID, USER_ID, REQUEST_TEXT, mock.client(), mock.client()
    );

    expect(result.type).toBe('scaffold_plan_ready');

    const insertCall = mock.calls.find(c => c.table === 'builder_proposals' && c.method === 'insert');
    expect(insertCall).toBeDefined();
    const payload = insertCall!.args[0] as Record<string, unknown>;

    expect(payload.code_state).toBe('plan_ready');
    expect(payload.plan_content).toBeDefined();
    expect((payload.plan_content as { moduleSlug: string }).moduleSlug).toBe('volunteer_tracking');
    expect(payload).not.toHaveProperty('generated_code');
    expect(payload).not.toHaveProperty('phase');
    expect(payload).not.toHaveProperty('status');

    // No revision is created at submission time for the scaffold path — the
    // claim RPC (builder_claim_code_run) creates revision #1 later.
    const revisionCalls = mock.calls.filter(c => c.table === 'builder_proposal_revisions');
    expect(revisionCalls.length).toBe(0);
    const storageCalls = mock.calls.filter(c => c.method.startsWith('storage.'));
    expect(storageCalls.length).toBe(0);
  });
});
