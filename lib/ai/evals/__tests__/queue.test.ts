// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runEvaluationJob, type EvaluationJobDeps, type EvaluationJobData } from '@/lib/ai/evals/queue';
import { FakeConnector } from '@/lib/ai/evals/testing/fake-connector';

function passingConnector() {
  return new FakeConnector({
    responses: [{
      content: [{ type: 'text', text: 'Dear Acme Trust, thank you for $5,000 on 2026-03-14.' }],
      stopReason: 'end_turn',
      model: 'm',
    }],
  });
}

function deps(overrides: Partial<Record<keyof EvaluationJobDeps, unknown>> = {}) {
  return {
    claimRun: vi.fn().mockResolvedValue(true),
    recordCaseResult: vi.fn().mockResolvedValue(undefined),
    finishRun: vi.fn().mockResolvedValue(undefined),
    recordEvidence: vi.fn().mockResolvedValue(undefined),
    recordUsage: vi.fn().mockResolvedValue(undefined),
    resolvePlan: vi.fn().mockResolvedValue({
      workloadId: 'letters',
      operation: 'text_generation',
      connector: 'openrouter',
      requestedModel: 'm',
      maxOutputTokens: 2000,
      timeoutMs: 30_000,
      targetPosition: 0,
    }),
    buildConnector: vi.fn().mockResolvedValue(passingConnector()),
    ...overrides,
  };
}

/** The mocks are structurally compatible; the cast is only to satisfy arity. */
function asDeps(d: ReturnType<typeof deps>): EvaluationJobDeps {
  return d as unknown as EvaluationJobDeps;
}

const JOB: EvaluationJobData = {
  runId: 'r1',
  orgId: 'o1',
  deploymentId: 'd1',
  actorId: 'u1',
  workloadIds: ['letters'],
};

beforeEach(() => vi.clearAllMocks());

describe('evaluation job', () => {
  it('claims the run before doing any work', async () => {
    const d = deps();
    await runEvaluationJob(JOB, asDeps(d));
    expect(d.claimRun).toHaveBeenCalledWith('r1');
    expect(d.buildConnector).toHaveBeenCalled();
  });

  it('does nothing when the run was already claimed', async () => {
    const d = deps({ claimRun: vi.fn().mockResolvedValue(false) });
    await runEvaluationJob(JOB, asDeps(d));
    expect(d.buildConnector).not.toHaveBeenCalled();
    expect(d.finishRun).not.toHaveBeenCalled();
  });

  it('writes evidence and marks the run succeeded', async () => {
    const d = deps();
    await runEvaluationJob(JOB, asDeps(d));
    expect(d.recordEvidence).toHaveBeenCalledWith('d1', 'letters', expect.objectContaining({
      result: 'passed',
      evalSuiteVersion: expect.stringMatching(/^deployment-suite-v\d+$/),
    }));
    expect(d.finishRun).toHaveBeenCalledWith('r1', expect.objectContaining({ status: 'succeeded' }));
  });

  it('records usage so evaluation spend is attributable', async () => {
    const d = deps();
    await runEvaluationJob(JOB, asDeps(d));
    expect(d.recordUsage).toHaveBeenCalled();
  });

  // A blocked verdict is a completed run, not a broken one.
  it('marks the run succeeded and writes no evidence when the model fails', async () => {
    const d = deps({
      buildConnector: vi.fn().mockResolvedValue(new FakeConnector({
        responses: [{ content: [{ type: 'text', text: 'Dear [INSERT NAME]' }], stopReason: 'end_turn', model: 'm' }],
      })),
    });
    await runEvaluationJob(JOB, asDeps(d));
    expect(d.recordEvidence).not.toHaveBeenCalled();
    expect(d.finishRun).toHaveBeenCalledWith('r1', expect.objectContaining({ status: 'succeeded' }));
  });

  it('marks the run failed with a transport kind when the provider is unavailable', async () => {
    const d = deps({ buildConnector: vi.fn().mockRejectedValue(new Error('connection refused')) });
    await runEvaluationJob(JOB, asDeps(d));
    expect(d.finishRun).toHaveBeenCalledWith('r1', expect.objectContaining({
      status: 'failed',
      failureKind: 'transport',
    }));
  });

  it('preserves evidence for workloads that finished before a later one failed', async () => {
    let call = 0;
    const d = deps({
      buildConnector: vi.fn().mockImplementation(() => {
        call += 1;
        if (call > 1) throw new Error('provider died');
        return passingConnector();
      }),
    });
    await runEvaluationJob({ ...JOB, workloadIds: ['letters', 'summaries'] }, asDeps(d));
    expect(d.recordEvidence).toHaveBeenCalledWith('d1', 'letters', expect.anything());
    expect(d.finishRun).toHaveBeenCalledWith('r1', expect.objectContaining({ status: 'failed' }));
  });
});
