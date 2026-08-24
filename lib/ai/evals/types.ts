import type { AIResponse, AIStreamChunk, ToolDefinition } from '@/lib/ai/types';
import type { AIWorkloadId } from '@/lib/ai/workloads';

/** Everything a driver observed while running one case. */
export type Observed = {
  text: string;
  response?: AIResponse;
  chunks?: AIStreamChunk[];
  json?: unknown;
  /** Source document a grounding assertion checks values against. */
  sourceText?: string;
};

export type AssertionOutcome = { passed: boolean; detail: string };

export type Assertion = {
  id: string;
  check(_observed: Observed): AssertionOutcome;
};

export type EvalCase = {
  id: string;
  /** Required failures block verification; advisory failures downgrade it. */
  required: boolean;
  prompt: string;
  system?: string;
  tools?: ToolDefinition[];
  /** Feeds a second turn so a tool-result round trip can be observed. */
  toolResult?: { name: string; content: string };
  sourceText?: string;
  responseSchema?: Record<string, unknown>;
  assertions: Assertion[];
};

export type CaseResult = {
  caseId: string;
  required: boolean;
  passed: boolean;
  detail: string;
};

export type EvalVerdict = 'passed' | 'conditional' | 'blocked';

export type WorkloadVerdict = {
  workloadId: AIWorkloadId;
  verdict: EvalVerdict;
  results: CaseResult[];
};

/**
 * Thrown when a case could not be run because the provider or transport
 * failed. Distinct from a case failing, which is a finding about the model.
 */
export class EvalTransportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'EvalTransportError';
  }
}
