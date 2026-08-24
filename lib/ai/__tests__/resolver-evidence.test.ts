// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { currentVerificationResult } from '@/lib/ai/resolver';
import { SUITE_VERSION } from '@/lib/ai/evals/version';

const now = () => new Date().toISOString();

describe('evidence validity', () => {
  it('accepts current-suite evidence inside the window', () => {
    expect(currentVerificationResult({
      evalSuiteVersion: SUITE_VERSION, verifiedAt: now(), result: 'passed',
    })).toBe('passed');
  });

  // The BENE_OK smoke test must not survive as evidence.
  it('rejects phase 1 compatibility evidence', () => {
    expect(currentVerificationResult({
      evalSuiteVersion: 'phase1-compatibility-v1', verifiedAt: now(), result: 'conditional',
    })).toBeNull();
  });

  it('rejects evidence from a superseded suite major', () => {
    expect(currentVerificationResult({
      evalSuiteVersion: 'deployment-suite-v0', verifiedAt: now(), result: 'passed',
    })).toBeNull();
  });

  it('still rejects evidence older than ninety days', () => {
    const old = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
    expect(currentVerificationResult({
      evalSuiteVersion: SUITE_VERSION, verifiedAt: old, result: 'passed',
    })).toBeNull();
  });
});
