// lib/builder/ai.ts
// The only place Builder touches the AI gateway. Every Builder model call is
// attributed to an organization and metered through the shared recorder;
// nothing here constructs a provider directly.

import { createAIExecutionGateway } from '@/lib/ai/runtime';
import type { AIMessage, AIStreamChunk, ToolDefinition } from '@/lib/ai/types';

export type BuilderScope = {
  orgId: string;
  /** Absent for queued scaffold work, which runs with no user present. */
  actorId?: string;
};

type Gateway = ReturnType<typeof createAIExecutionGateway>;

function gatewayFor(scope: BuilderScope): Gateway {
  return createAIExecutionGateway({
    kind: 'organization',
    orgId: scope.orgId,
    actorId: scope.actorId,
  });
}

async function generate(
  scope: BuilderScope,
  workloadId: 'builder_plan' | 'builder_build' | 'builder_review',
  input: { system: string; prompt: string },
  gateway?: Gateway,
): Promise<string> {
  const active = gateway ?? gatewayFor(scope);
  const plan = await active.resolve(workloadId);
  const { text } = await active.generateText(plan, {
    system: input.system,
    messages: [{ role: 'user', content: input.prompt }],
  });
  return text;
}

export function builderPlan(
  scope: BuilderScope,
  input: { system: string; prompt: string },
  gateway?: Gateway,
): Promise<string> {
  return generate(scope, 'builder_plan', input, gateway);
}

export function builderBuild(
  scope: BuilderScope,
  input: { system: string; prompt: string },
  gateway?: Gateway,
): Promise<string> {
  return generate(scope, 'builder_build', input, gateway);
}

export function builderReview(
  scope: BuilderScope,
  input: { system: string; prompt: string },
  gateway?: Gateway,
): Promise<string> {
  return generate(scope, 'builder_review', input, gateway);
}

export async function* builderChatStream(
  scope: BuilderScope,
  input: { system: string; messages: AIMessage[]; tools: ToolDefinition[] },
  gateway?: Gateway,
): AsyncIterable<AIStreamChunk> {
  const active = gateway ?? gatewayFor(scope);
  const plan = await active.resolve('builder_chat');
  for await (const chunk of active.streamToolConversation(plan, {
    system: input.system,
    messages: input.messages,
    tools: input.tools,
  })) {
    yield chunk;
  }
}
