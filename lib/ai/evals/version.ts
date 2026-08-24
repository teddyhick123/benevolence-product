import { createHash } from 'node:crypto';
import { ALL_EVAL_CASES } from '@/lib/ai/evals/registry';

/**
 * Bump when a required case is added, removed, or tightened. Bumping
 * invalidates every organization's stored evidence and forces re-evaluation,
 * so it is a deliberate act — the drift guard in version.test.ts fails until
 * this and the pinned required-case list move together.
 */
export const SUITE_MAJOR = 1;

export const SUITE_VERSION = `deployment-suite-v${SUITE_MAJOR}`;

export function requiredCaseIds(): string[] {
  return Object.entries(ALL_EVAL_CASES)
    .flatMap(([workloadId, cases]) => cases
      .filter(evalCase => evalCase.required)
      .map(evalCase => `${workloadId}/${evalCase.id}`))
    .sort();
}

/** Content fingerprint of every case and assertion. Recorded, never gating. */
export function caseSetHash(): string {
  const material = Object.entries(ALL_EVAL_CASES)
    .flatMap(([workloadId, cases]) => cases.map(evalCase => [
      workloadId,
      evalCase.id,
      String(evalCase.required),
      evalCase.prompt,
      evalCase.system ?? '',
      evalCase.assertions.map(assertion => assertion.id).join(','),
    ].join('|')))
    .sort()
    .join('\n');
  return createHash('sha256').update(material).digest('hex').slice(0, 16);
}
