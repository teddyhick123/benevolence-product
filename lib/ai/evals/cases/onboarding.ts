import type { EvalCase } from '@/lib/ai/evals/types';
import { callsTool, callsOnlyKnownTools, containsAll, withinTokens } from '@/lib/ai/evals/assertions';

const TOOLS = [{
  name: 'set_organization_profile',
  description: 'Record the organization name and type during onboarding.',
  input_schema: {
    type: 'object' as const,
    properties: { name: { type: 'string' }, org_type: { type: 'string' } },
    required: ['name'],
  },
}];

export const onboardingCases: readonly EvalCase[] = [
  {
    id: 'tool-call-profile',
    required: true,
    system: 'You are onboarding a new organization. Use the supplied tools to record what the user tells you.',
    prompt: 'We are the Ford Foundation, a private foundation.',
    tools: TOOLS,
    assertions: [callsTool('set_organization_profile'), callsOnlyKnownTools(['set_organization_profile'])],
  },
  {
    id: 'tool-result-round-trip',
    required: true,
    prompt: 'We are the Ford Foundation, a private foundation.',
    tools: TOOLS,
    toolResult: { name: 'set_organization_profile', content: '{"saved": true, "name": "Ford Foundation"}' },
    assertions: [containsAll(['Ford Foundation'])],
  },
  {
    id: 'respects-token-cap',
    required: true,
    prompt: 'What information do you need from me to get started?',
    tools: TOOLS,
    assertions: [withinTokens(400)],
  },
];
