// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { aggregate, runWorkloadEvaluation } from '@/lib/ai/evals/runner';
import { FakeConnector } from '@/lib/ai/evals/testing/fake-connector';
import { EvalTransportError } from '@/lib/ai/evals/types';
import { AIExecutionError } from '@/lib/ai/execution';

const PLAN = {
  workloadId: 'letters',
  operation: 'text_generation',
  connector: 'openrouter',
  requestedModel: 'm',
  maxOutputTokens: 2000,
  timeoutMs: 30_000,
} as never;

describe('verdict aggregation', () => {
  it('passes when every required case passes', () => {
    expect(aggregate([
      { caseId: 'a', required: true, passed: true, detail: '' },
      { caseId: 'b', required: false, passed: true, detail: '' },
    ])).toBe('passed');
  });

  it('is conditional when only an advisory case fails', () => {
    expect(aggregate([
      { caseId: 'a', required: true, passed: true, detail: '' },
      { caseId: 'b', required: false, passed: false, detail: '' },
    ])).toBe('conditional');
  });

  it('is blocked when any required case fails', () => {
    expect(aggregate([
      { caseId: 'a', required: true, passed: false, detail: '' },
      { caseId: 'b', required: false, passed: true, detail: '' },
    ])).toBe('blocked');
  });

  it('is blocked when there are no results at all', () => {
    expect(aggregate([])).toBe('blocked');
  });
});

describe('runWorkloadEvaluation', () => {
  it('records a result per case and reports the verdict', async () => {
    const letter = 'Dear Acme Trust, thank you for your gift of $5,000 on 2026-03-14. Sincerely, Us.';
    const connector = new FakeConnector({
      responses: [{ content: [{ type: 'text', text: letter }], stopReason: 'end_turn', model: 'm' }],
    });

    const verdict = await runWorkloadEvaluation(connector, PLAN, 'letters');

    expect(verdict.workloadId).toBe('letters');
    expect(verdict.verdict).toBe('passed');
    expect(verdict.results).toHaveLength(4);
  });

  it('marks a case failed when an assertion fails, without stopping the run', async () => {
    const connector = new FakeConnector({
      responses: [{ content: [{ type: 'text', text: 'Dear [INSERT NAME]' }], stopReason: 'end_turn', model: 'm' }],
    });

    const verdict = await runWorkloadEvaluation(connector, PLAN, 'letters');

    expect(verdict.verdict).toBe('blocked');
    expect(verdict.results.filter(r => !r.passed).length).toBeGreaterThan(1);
  });

  it('reports each result as it completes', async () => {
    const connector = new FakeConnector({
      responses: [{ content: [{ type: 'text', text: 'Dear Acme Trust, $5,000 2026-03-14' }], stopReason: 'end_turn', model: 'm' }],
    });
    const onResult = vi.fn();

    await runWorkloadEvaluation(connector, PLAN, 'letters', onResult);

    expect(onResult).toHaveBeenCalledTimes(4);
  });

  // A provider outage must never be recorded as the model failing.
  it('propagates a transport failure instead of recording case failures', async () => {
    const connector = new FakeConnector({
      responses: [],
      failWith: new AIExecutionError('rate_limited', 'AI provider rate limit exceeded'),
    });

    await expect(runWorkloadEvaluation(connector, PLAN, 'letters'))
      .rejects.toBeInstanceOf(EvalTransportError);
  });
});
