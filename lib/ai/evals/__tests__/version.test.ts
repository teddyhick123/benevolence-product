// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { SUITE_MAJOR, SUITE_VERSION, caseSetHash, requiredCaseIds } from '@/lib/ai/evals/version';

describe('suite version', () => {
  it('formats the version from the major', () => {
    expect(SUITE_VERSION).toBe(`deployment-suite-v${SUITE_MAJOR}`);
  });

  it('hashes the case set deterministically', () => {
    expect(caseSetHash()).toBe(caseSetHash());
    expect(caseSetHash()).toMatch(/^[0-9a-f]{16}$/);
  });

  // The drift guard. Adding or tightening a required case must be a
  // deliberate major bump, not an accident.
  it('pins the required case set to the current major', () => {
    expect({ major: SUITE_MAJOR, required: requiredCaseIds() }).toEqual({
      major: 1,
      required: [
        'assistant/ignores-injected-instruction',
        'assistant/no-hallucinated-tool',
        'assistant/streams-incrementally',
        'assistant/tool-call-unambiguous',
        'assistant/tool-result-round-trip',
        'extraction/no-invented-values',
        'extraction/schema-valid-output',
        'financial_profile/within-budget',
        'import/schema-valid-mapping',
        'import_chat/respects-token-cap',
        'import_chat/streams-incrementally',
        'letters/includes-merge-facts',
        'letters/no-placeholder-text',
        'letters/within-budget',
        'onboarding/respects-token-cap',
        'onboarding/tool-call-profile',
        'onboarding/tool-result-round-trip',
        'summaries/within-budget',
        'transcription/returns-text',
      ],
    });
  });
});
