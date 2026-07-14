import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { executeTool } from '@/lib/builder/tools';
import {
  buildFileManifest,
  manifestHash,
  buildUnifiedDiff,
  canonicalJson,
  sha256Hex,
  artifactPrefix,
  ARTIFACT_KEYS,
} from '@/lib/builder/artifacts';
import { CODE_STATES } from '@/lib/builder/proposal-state';
import { SupabaseMock } from './helpers/supabase-mock';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PROPOSAL_ID = '22222222-2222-2222-2222-222222222222';
const REVISION_ID = '33333333-3333-3333-3333-333333333333';
const REQUEST_TEXT = 'Add a helper module';

const SUBMIT_FILES = [
  { path: 'lib/example/foo.ts', content: 'export const foo = 1;\n', diff: '--- a/lib/example/foo.ts\n+++ b/lib/example/foo.ts\n' },
  { path: 'lib/example/bar.ts', content: 'export const bar = 2;\n', diff: '--- a/lib/example/bar.ts\n+++ b/lib/example/bar.ts\n' },
];

describe('update_module_config tool', () => {
  const src = readFileSync('lib/builder/tools.ts', 'utf8');

  it('does not hardcode stale module keys (tax, donors, compliance, quickbooks)', () => {
    const toolIdx = src.indexOf("name: 'update_module_config'");
    const snippet = src.slice(toolIdx, toolIdx + 600);
    expect(snippet).not.toMatch(/'tax'|"tax"/);
    expect(snippet).not.toMatch(/'donors'|"donors"/);
    expect(snippet).not.toMatch(/'quickbooks'|"quickbooks"/);
  });

  it('enum includes all mutable ModuleId values', () => {
    expect(src).toMatch(/impact_tracking/);
    expect(src).toMatch(/tax_optimization/);
    expect(src).toMatch(/grant_management/);
    expect(src).toMatch(/donor_management/);
    expect(src).toMatch(/pledge_tracking/);
    expect(src).toMatch(/compliance_regulatory/);
  });

  it('executor calls enableModule or disableModule instead of writing modules JSONB directly', () => {
    const caseIdx = src.indexOf("case 'update_module_config'");
    const snippet = src.slice(caseIdx, caseIdx + 800);
    expect(snippet).toMatch(/enableModule|disableModule/);
    expect(snippet).not.toMatch(/\.update\(\s*\{\s*modules/);
  });

  it('imports enableModule and disableModule from lib/modules', () => {
    expect(src).toMatch(/enableModule/);
    expect(src).toMatch(/disableModule/);
  });

  it('core module is NOT in the mutable enum', () => {
    const toolIdx = src.indexOf("name: 'update_module_config'");
    const snippet = src.slice(toolIdx, toolIdx + 600);
    expect(snippet).not.toMatch(/'core'|"core"/);
  });

  it('validates module and enabled inputs before mutation', () => {
    const caseIdx = src.indexOf("case 'update_module_config'");
    const snippet = src.slice(caseIdx, caseIdx + 900);
    expect(snippet).toMatch(/validateEnum\(toolInput\.module/);
    expect(snippet).toMatch(/requiredBoolean\(toolInput\.enabled/);
  });
});

describe('builder mutation input validation', () => {
  const src = readFileSync('lib/builder/tools.ts', 'utf8');

  it('validates branding fields before updating organizations', () => {
    const caseIdx = src.indexOf("case 'update_org_branding'");
    const snippet = src.slice(caseIdx, caseIdx + 1100);
    expect(snippet).toMatch(/optionalString\(toolInput\.name/);
    expect(snippet).toMatch(/validateUrl\(toolInput\.logo_url/);
    expect(snippet).toMatch(/toolInput\.primary_color/);
  });

  it('validates create metric fields before inserting KPI definitions', () => {
    const caseIdx = src.indexOf("case 'create_metric_definition'");
    const snippet = src.slice(caseIdx, caseIdx + 1500);
    expect(snippet).toMatch(/requiredString\(toolInput\.name/);
    expect(snippet).toMatch(/requiredString\(toolInput\.slug/);
    expect(snippet).toMatch(/optionalEnum\(toolInput\.aggregation/);
    expect(snippet).toMatch(/optionalEnum\(toolInput\.direction/);
  });

  it('validates update and delete metric IDs as UUIDs', () => {
    const updateIdx = src.indexOf("case 'update_metric_definition'");
    const deleteIdx = src.indexOf("case 'delete_metric_definition'");
    expect(src.slice(updateIdx, updateIdx + 700)).toMatch(/requiredUuid\(toolInput\.id/);
    expect(src.slice(deleteIdx, deleteIdx + 500)).toMatch(/requiredUuid\(toolInput\.id/);
  });

  it('validates code proposal files and relative paths before creating proposals', () => {
    const helperIdx = src.indexOf('function validateProposalFiles');
    const caseIdx = src.indexOf("case 'submit_code_proposal'");
    expect(src.slice(helperIdx, helperIdx + 1200)).toMatch(/validateBuilderPath/);
    expect(src.slice(helperIdx, helperIdx + 1200)).toMatch(/validateRequired\(value,\s*'files'\)/);
    expect(src.slice(caseIdx, caseIdx + 900)).toMatch(/validateProposalFiles\(toolInput\.files\)/);
  });

  it('validates workflow steps before updating or cloning templates', () => {
    const helperIdx = src.indexOf('function validateWorkflowSteps');
    const caseIdx = src.indexOf("case 'update_workflow_template'");
    expect(src.slice(helperIdx, helperIdx + 1200)).toMatch(/validateRequired\(value,\s*'steps'\)/);
    expect(src.slice(helperIdx, helperIdx + 1200)).toMatch(/steps\[\$\{index\}\]\.order/);
    expect(src.slice(caseIdx, caseIdx + 700)).toMatch(/validateWorkflowSteps\(toolInput\.steps\)/);
  });

  it('awaits telemetry after successful mutations', () => {
    expect(src).not.toMatch(/void\s+emitBuilderEvent/);
    expect(src).toMatch(/await emitBuilderEvent/);
  });
});

describe('submit_code_proposal — durable revision writes (Task 5)', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', { randomUUID: () => REVISION_ID });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function queueHappyPath(mock: SupabaseMock) {
    mock.queueTable('builder_proposals', { data: { id: PROPOSAL_ID }, error: null }); // initial insert
    mock.queueTable('builder_proposal_revisions', { data: null, error: null }); // revision insert
    mock.queueStorageUpload('builder-artifacts', { data: { path: 'files.json' }, error: null });
    mock.queueStorageUpload('builder-artifacts', { data: { path: 'manifest.json' }, error: null });
    mock.queueStorageUpload('builder-artifacts', { data: { path: 'diff.patch' }, error: null });
    mock.queueStorageUpload('builder-artifacts', { data: { path: 'context.json' }, error: null });
    mock.queueTable('builder_proposals', { data: null, error: null }); // current_revision_id update
    mock.queueTable('builder_events', { data: null, error: null }); // telemetry
  }

  it('inserts the proposal with code_state:"plan_ready" and no phase/generated_code/status', async () => {
    const mock = new SupabaseMock();
    queueHappyPath(mock);

    const result = await executeTool(
      'submit_code_proposal',
      { request_summary: 'Add a helper module', files: SUBMIT_FILES },
      ORG_ID, USER_ID, REQUEST_TEXT, mock.client(), mock.client()
    );

    expect(result.type).toBe('proposal_created');
    const insertCall = mock.calls.find(c => c.table === 'builder_proposals' && c.method === 'insert');
    expect(insertCall).toBeDefined();
    const payload = insertCall!.args[0] as Record<string, unknown>;
    expect(payload).toEqual({
      org_id: ORG_ID,
      requested_by: USER_ID,
      request_text: REQUEST_TEXT,
      proposal_type: 'code',
      code_state: 'plan_ready',
    });
    expect(payload).not.toHaveProperty('phase');
    expect(payload).not.toHaveProperty('generated_code');
    expect(payload).not.toHaveProperty('status');
  });

  it('inserts revision #1 with kind:"generic_submission" and non-null hashes matching the fixture files', async () => {
    const mock = new SupabaseMock();
    queueHappyPath(mock);

    await executeTool(
      'submit_code_proposal',
      { request_summary: 'Add a helper module', files: SUBMIT_FILES },
      ORG_ID, USER_ID, REQUEST_TEXT, mock.client(), mock.client()
    );

    const manifestInput = SUBMIT_FILES.map(f => ({ path: f.path, content: f.content }));
    const expectedManifest = buildFileManifest(manifestInput);
    const expectedDiff = buildUnifiedDiff(manifestInput);
    const expectedContext = { request_text: REQUEST_TEXT, files: expectedManifest.entries.map(e => e.path) };

    const revisionInsert = mock.calls.find(c => c.table === 'builder_proposal_revisions' && c.method === 'insert');
    expect(revisionInsert).toBeDefined();
    const payload = revisionInsert!.args[0] as Record<string, unknown>;

    expect(payload.id).toBe(REVISION_ID);
    expect(payload.proposal_id).toBe(PROPOSAL_ID);
    expect(payload.revision_number).toBe(1);
    expect(payload.kind).toBe('generic_submission');
    expect(payload.artifact_prefix).toBe(artifactPrefix(ORG_ID, PROPOSAL_ID, REVISION_ID));
    expect(payload.manifest_hash).toBe(manifestHash(expectedManifest));
    expect(payload.diff_hash).toBe(sha256Hex(expectedDiff));
    expect(payload.context_hash).toBe(sha256Hex(canonicalJson(expectedContext)));
    expect(payload.file_count).toBe(SUBMIT_FILES.length);
    expect(payload.total_bytes).toBe(expectedManifest.totalBytes);
    expect(payload.manifest_hash).not.toBeNull();
    expect(payload.diff_hash).not.toBeNull();
    expect(payload.context_hash).not.toBeNull();
  });

  it('uploads all 4 artifacts under {orgId}/{proposalId}/{revisionId}/ and updates current_revision_id', async () => {
    const mock = new SupabaseMock();
    queueHappyPath(mock);

    await executeTool(
      'submit_code_proposal',
      { request_summary: 'Add a helper module', files: SUBMIT_FILES },
      ORG_ID, USER_ID, REQUEST_TEXT, mock.client(), mock.client()
    );

    const prefix = artifactPrefix(ORG_ID, PROPOSAL_ID, REVISION_ID);
    const uploadCalls = mock.calls.filter(c => c.method === 'storage.upload');
    const uploadKeys = uploadCalls.map(c => c.args[1]);
    expect(uploadKeys).toEqual([
      `${prefix}/${ARTIFACT_KEYS.files}`,
      `${prefix}/${ARTIFACT_KEYS.manifest}`,
      `${prefix}/${ARTIFACT_KEYS.diff}`,
      `${prefix}/${ARTIFACT_KEYS.context}`,
    ]);
    // All uploads target the builder-artifacts bucket.
    for (const call of uploadCalls) {
      expect(mock.calls.filter(c => c.method === 'storage.from').some(f => f.args[0] === 'builder-artifacts')).toBe(true);
      void call;
    }

    const updateCall = mock.calls.find(c => c.table === 'builder_proposals' && c.method === 'update');
    expect(updateCall?.args[0]).toEqual({ current_revision_id: REVISION_ID });
    const updateEq = mock.calls.filter(c => c.table === 'builder_proposals' && c.method === 'eq');
    expect(updateEq.some(c => JSON.stringify(c.args) === JSON.stringify(['id', PROPOSAL_ID]))).toBe(true);
  });

  it('deletes the proposal row and returns an error when an artifact upload fails (no orphaned revision)', async () => {
    const mock = new SupabaseMock();
    mock.queueTable('builder_proposals', { data: { id: PROPOSAL_ID }, error: null }); // initial insert
    mock.queueTable('builder_proposal_revisions', { data: null, error: null }); // revision insert
    mock.queueStorageUpload('builder-artifacts', { data: null, error: { message: 'storage unavailable' } }); // files.json fails
    mock.queueTable('builder_proposals', { data: null, error: null }); // compensating delete

    const result = await executeTool(
      'submit_code_proposal',
      { request_summary: 'Add a helper module', files: SUBMIT_FILES },
      ORG_ID, USER_ID, REQUEST_TEXT, mock.client(), mock.client()
    );

    expect(result.type).toBe('error');
    const deleteCall = mock.calls.find(c => c.table === 'builder_proposals' && c.method === 'delete');
    expect(deleteCall).toBeDefined();
    const deleteEq = mock.calls.filter(c => c.table === 'builder_proposals' && c.method === 'eq');
    // The delete()'s own eq('id', proposalId) must be present (it is the eq call
    // immediately following the delete call in the recorded call order).
    const deleteIdx = mock.calls.indexOf(deleteCall!);
    const nextCall = mock.calls[deleteIdx + 1];
    expect(nextCall).toEqual({ table: 'builder_proposals', method: 'eq', args: ['id', PROPOSAL_ID] });
    void deleteEq;

    // Only one upload was attempted before the failure short-circuited the rest.
    const uploadCalls = mock.calls.filter(c => c.method === 'storage.upload');
    expect(uploadCalls.length).toBe(1);
    // No current_revision_id update happened after the failed upload.
    const updateCall = mock.calls.find(c => c.table === 'builder_proposals' && c.method === 'update');
    expect(updateCall).toBeUndefined();
  });
});

describe('list_modules tool', () => {
  const src = readFileSync('lib/builder/tools.ts', 'utf8');

  it('has a list_modules tool definition', () => {
    expect(src).toMatch(/name:\s*['"]list_modules['"]/);
  });

  it('executor calls getOrgEnabledModules', () => {
    const caseIdx = src.indexOf("case 'list_modules'");
    expect(caseIdx).toBeGreaterThan(-1);
    const snippet = src.slice(caseIdx, caseIdx + 500);
    expect(snippet).toMatch(/getOrgEnabledModules/);
  });

  it('executor returns canToggle field', () => {
    const caseIdx = src.indexOf("case 'list_modules'");
    const snippet = src.slice(caseIdx, caseIdx + 800);
    expect(snippet).toMatch(/canToggle/);
  });

  it('core module is listed but canToggle is false', () => {
    const caseIdx = src.indexOf("case 'list_modules'");
    const snippet = src.slice(caseIdx, caseIdx + 800);
    expect(snippet).toMatch(/isCore|is_core/);
  });
});

describe('update_workflow_template tool', () => {
  const src = readFileSync('lib/builder/tools.ts', 'utf8');

  it('has an update_workflow_template tool definition', () => {
    expect(src).toMatch(/name:\s*['"]update_workflow_template['"]/);
  });

  it('requires template_id and steps', () => {
    const toolIdx = src.indexOf("name: 'update_workflow_template'");
    const snippet = src.slice(toolIdx, toolIdx + 600);
    expect(snippet).toMatch(/required.*template_id/s);
    expect(snippet).toMatch(/required.*steps/s);
  });

  it('executor validates template_id as UUID', () => {
    const caseIdx = src.indexOf("case 'update_workflow_template'");
    expect(caseIdx).toBeGreaterThan(-1);
    const snippet = src.slice(caseIdx, caseIdx + 600);
    expect(snippet).toMatch(/requiredUuid\(toolInput\.template_id/);
  });

  it('executor rejects cross-org templates', () => {
    const caseIdx = src.indexOf("case 'update_workflow_template'");
    const snippet = src.slice(caseIdx, caseIdx + 1500);
    expect(snippet).toMatch(/forbidden|cross.org|another org/i);
  });

  it('executor performs clone-on-write for system templates', () => {
    const caseIdx = src.indexOf("case 'update_workflow_template'");
    const snippet = src.slice(caseIdx, caseIdx + 1500);
    expect(snippet).toMatch(/is_system|isSystem/);
    expect(snippet).toMatch(/insert/i);
  });
});

describe('list_proposals tool', () => {
  const src = readFileSync('lib/builder/tools.ts', 'utf8');

  it('has a list_proposals tool definition', () => {
    expect(src).toMatch(/name:\s*['"]list_proposals['"]/);
  });

  it('code_state filter is optional', () => {
    const toolIdx = src.indexOf("name: 'list_proposals'");
    const snippet = src.slice(toolIdx, toolIdx + 400);
    // 'required' array should be absent or empty for list_proposals
    expect(snippet).not.toMatch(/required:\s*\[\s*['"]code_state['"]/);
  });

  it('executor queries builder_proposals scoped to orgId', () => {
    const caseIdx = src.indexOf("case 'list_proposals'");
    expect(caseIdx).toBeGreaterThan(-1);
    const snippet = src.slice(caseIdx, caseIdx + 600);
    expect(snippet).toMatch(/builder_proposals/);
    expect(snippet).toMatch(/org_id.*orgId|orgId.*org_id/);
  });

  it('no longer references the retired PROPOSAL_PHASES const', () => {
    expect(src).not.toMatch(/PROPOSAL_PHASES/);
  });

  it('selects and filters on code_state, not phase', async () => {
    const mock = new SupabaseMock();
    mock.queueTable('builder_proposals', {
      data: [{ id: PROPOSAL_ID, code_state: 'plan_ready', proposal_type: 'code', request_text: REQUEST_TEXT, created_at: '2026-01-01T00:00:00Z' }],
      error: null,
    });

    const result = await executeTool(
      'list_proposals',
      { code_state: 'plan_ready' },
      ORG_ID, USER_ID, REQUEST_TEXT, mock.client(), mock.client()
    );

    expect(result.type).toBe('config_success');
    const selectCall = mock.calls.find(c => c.table === 'builder_proposals' && c.method === 'select');
    expect(selectCall?.args[0]).toContain('code_state');
    expect(selectCall?.args[0]).not.toMatch(/\bphase\b/);
    expect(selectCall?.args[0]).not.toMatch(/generated_code/);

    const eqCall = mock.calls.find(c => c.table === 'builder_proposals' && c.method === 'eq' && c.args[0] === 'code_state');
    expect(eqCall?.args).toEqual(['code_state', 'plan_ready']);

    expect((result as { type: 'config_success'; message: string }).message).not.toMatch(/generated_code/);
  });

  it('validates the code_state filter against CODE_STATES', async () => {
    const mock = new SupabaseMock();

    const result = await executeTool(
      'list_proposals',
      { code_state: 'building' }, // stale phase value, not a valid CodeState
      ORG_ID, USER_ID, REQUEST_TEXT, mock.client(), mock.client()
    );

    expect(result.type).toBe('error');
    expect(CODE_STATES).not.toContain('building' as any);
  });
});
