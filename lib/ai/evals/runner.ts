import type { AIConnector, AIExecutionPlan } from '@/lib/ai/execution';
import type { AIWorkloadId } from '@/lib/ai/workloads';
import { getAIWorkload } from '@/lib/ai/workloads';
import { DRIVERS } from '@/lib/ai/evals/drivers';
import { casesForWorkload } from '@/lib/ai/evals/registry';
import type { CaseResult, EvalVerdict, WorkloadVerdict } from '@/lib/ai/evals/types';

/**
 * No results means no required case passed, so the safe reading is blocked.
 * The coverage guard in registry.test.ts prevents this arising from an empty
 * case list, but the rule must still be correct on its own terms.
 */
export function aggregate(results: readonly CaseResult[]): EvalVerdict {
  if (results.length === 0) return 'blocked';
  if (results.some(result => result.required && !result.passed)) return 'blocked';
  if (results.some(result => !result.passed)) return 'conditional';
  return 'passed';
}

export async function runWorkloadEvaluation(
  connector: AIConnector,
  plan: AIExecutionPlan,
  workloadId: AIWorkloadId,
  onResult?: (_result: CaseResult) => void | Promise<void>,
): Promise<WorkloadVerdict> {
  const workload = getAIWorkload(workloadId);
  const driver = DRIVERS[workload.operation];
  const results: CaseResult[] = [];

  for (const evalCase of casesForWorkload(workloadId)) {
    // A driver throwing EvalTransportError aborts the whole run: the provider
    // is unavailable, which says nothing about the model's behaviour.
    const observed = await driver(connector, plan, evalCase);

    const failures = evalCase.assertions
      .map(assertion => ({ assertion, outcome: assertion.check(observed) }))
      .filter(entry => !entry.outcome.passed);

    const result: CaseResult = {
      caseId: evalCase.id,
      required: evalCase.required,
      passed: failures.length === 0,
      detail: failures.length === 0
        ? 'All assertions passed'
        : failures.map(entry => `${entry.assertion.id}: ${entry.outcome.detail}`).join('; '),
    };
    results.push(result);
    await onResult?.(result);
  }

  return { workloadId, verdict: aggregate(results), results };
}
