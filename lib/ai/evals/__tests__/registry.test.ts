// @vitest-environment node

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_EVAL_CASES, casesForWorkload } from '@/lib/ai/evals/registry';
import { AI_WORKLOADS } from '@/lib/ai/workloads';

describe('eval coverage guard', () => {
  // Without this, a workload with no cases aggregates to "all required
  // passed" and is trivially verified.
  it('gives every workload at least one required case', () => {
    for (const workloadId of Object.keys(AI_WORKLOADS)) {
      const cases = casesForWorkload(workloadId as never);
      expect(cases.length, `${workloadId} has no cases`).toBeGreaterThan(0);
      expect(
        cases.some(evalCase => evalCase.required),
        `${workloadId} has no required case`,
      ).toBe(true);
    }
  });

  it('gives every case a unique id within its workload', () => {
    for (const [workloadId, cases] of Object.entries(ALL_EVAL_CASES)) {
      const ids = cases.map(evalCase => evalCase.id);
      expect(new Set(ids).size, `${workloadId} has duplicate case ids`).toBe(ids.length);
    }
  });

  it('gives every case at least one assertion', () => {
    for (const [workloadId, cases] of Object.entries(ALL_EVAL_CASES)) {
      for (const evalCase of cases) {
        expect(evalCase.assertions.length, `${workloadId}/${evalCase.id} asserts nothing`).toBeGreaterThan(0);
      }
    }
  });

  it('declares tools on every case that asserts a tool call', () => {
    for (const [workloadId, cases] of Object.entries(ALL_EVAL_CASES)) {
      for (const evalCase of cases) {
        const assertsTools = evalCase.assertions.some(a => a.id.startsWith('calls-'));
        if (assertsTools) {
          expect(evalCase.tools?.length, `${workloadId}/${evalCase.id} asserts a tool call but declares no tools`)
            .toBeGreaterThan(0);
        }
      }
    }
  });

  it('supplies source text on every case that asserts grounding', () => {
    for (const [workloadId, cases] of Object.entries(ALL_EVAL_CASES)) {
      for (const evalCase of cases) {
        if (evalCase.assertions.some(a => a.id === 'grounded-in-source')) {
          expect(evalCase.sourceText, `${workloadId}/${evalCase.id} asserts grounding with no source`).toBeTruthy();
        }
      }
    }
  });
});

describe('runner purity', () => {
  // The runner's whole value is being testable without I/O. Enforce it.
  it('imports no Supabase, repository, Redis, or process.env from the pure modules', () => {
    const root = join(__dirname, '..');
    const forbidden = /@supabase|\/repositories\/|bullmq|ioredis|process\.env/;
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__' && entry.name !== 'testing') walk(path);
          continue;
        }
        if (!entry.name.endsWith('.ts') || entry.name === 'queue.ts') continue;
        if (forbidden.test(readFileSync(path, 'utf8'))) offenders.push(path);
      }
    };
    walk(root);

    expect(offenders, 'pure eval modules must not perform I/O').toEqual([]);
  });
});
