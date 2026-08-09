/**
 * Split this example between provider-neutral definitions and one small
 * executor file under lib/ai/assistant/executors/tools/.
 */
import type { ToolDefinition, ToolResult } from '@/lib/ai/types';
import type { AssistantToolRuntime } from '@/lib/ai/assistant/executor-types';
import { InputValidator } from '@/lib/ai/validators';

export const {module_name}ToolDefinitions: ToolDefinition[] = [
  {
    name: 'create_{module_name}_item',
    description: 'Create a {ModuleName} item in the current organization.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Item name.' },
      },
      required: ['name'],
    },
  },
];

export async function create{ModuleName}Item(
  runtime: AssistantToolRuntime,
): Promise<ToolResult> {
  const name = InputValidator.validateString(runtime.args.name, 'name', {
    required: true,
    maxLength: 200,
  });

  // Add a tenant-scoped method to AssistantToolCapabilities. The chat route
  // constructs those capabilities only after access is proven; elevated
  // clients never enter the executor.
  const item = await runtime.capabilities.{module_name}.createItem({ name });

  return {
    action: {
      id: crypto.randomUUID(),
      sessionId: runtime.sessionId,
      portfolioId: runtime.portfolioId,
      userId: runtime.userId,
      actionType: 'create',
      entityType: '{module_name}_item',
      entityId: item.id,
      operationData: { table: '{module_name}_items', after: item },
      aiReasoning: `Created {ModuleName} item: ${name}`,
      userPrompt: runtime.userPrompt,
      status: 'applied',
      batchId: runtime.batchId,
      sequenceOrder: runtime.sequenceOrder,
    },
    output: { success: true, item },
  };
}

// Do not persist ai_turns or ai_messages here. The assistant route owns the
// request-ID idempotency boundary, append-only messages, action persistence,
// and terminal turn state for both first attempts and retries.
