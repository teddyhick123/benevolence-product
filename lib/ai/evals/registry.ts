import type { AIWorkloadId } from '@/lib/ai/workloads';
import type { EvalCase } from '@/lib/ai/evals/types';
import { assistantCases } from '@/lib/ai/evals/cases/assistant';
import { onboardingCases } from '@/lib/ai/evals/cases/onboarding';
import { extractionCases } from '@/lib/ai/evals/cases/extraction';
import { importCases } from '@/lib/ai/evals/cases/import';
import { importChatCases } from '@/lib/ai/evals/cases/import-chat';
import { lettersCases } from '@/lib/ai/evals/cases/letters';
import { summariesCases } from '@/lib/ai/evals/cases/summaries';
import { financialProfileCases } from '@/lib/ai/evals/cases/financial-profile';
import { transcriptionCases } from '@/lib/ai/evals/cases/transcription';

/**
 * Keyed by evaluable workload. Platform tooling such as the builder_*
 * workloads is not org-routable and therefore never evaluated against an
 * organization's deployment, so it has no cases. The coverage guard in
 * registry.test.ts enforces completeness over the org-routable set.
 */
export const ALL_EVAL_CASES: Readonly<Partial<Record<AIWorkloadId, readonly EvalCase[]>>> = {
  assistant: assistantCases,
  onboarding: onboardingCases,
  extraction: extractionCases,
  import: importCases,
  import_chat: importChatCases,
  letters: lettersCases,
  summaries: summariesCases,
  financial_profile: financialProfileCases,
  transcription: transcriptionCases,
};

export function casesForWorkload(workloadId: AIWorkloadId): readonly EvalCase[] {
  return ALL_EVAL_CASES[workloadId] ?? [];
}
