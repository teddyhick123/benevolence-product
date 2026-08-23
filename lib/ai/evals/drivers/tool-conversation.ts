import type { AIContentBlock, AIMessage } from '@/lib/ai/types';
import type { Observed } from '@/lib/ai/evals/types';
import { EvalTransportError } from '@/lib/ai/evals/types';
import { guardTransport, type Driver } from '@/lib/ai/evals/drivers/text-generation';

function textOf(response: { content: AIContentBlock[] }): string {
  return response.content
    .filter((block): block is Extract<AIContentBlock, { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('');
}

export const toolConversationDriver: Driver = async (connector, plan, evalCase): Promise<Observed> => {
  if (!connector.runToolConversation) throw new EvalTransportError('Connector cannot run tool conversations');
  const tools = evalCase.tools ?? [];
  const messages: AIMessage[] = [{ role: 'user', content: evalCase.prompt }];

  const first = await guardTransport(() => connector.runToolConversation!(plan, {
    system: evalCase.system,
    messages,
    tools,
    maxOutputTokens: plan.maxOutputTokens,
  }));

  const call = first.content.find(
    (block): block is Extract<AIContentBlock, { type: 'tool_use' }> => block.type === 'tool_use',
  );
  if (!evalCase.toolResult || !call) {
    return { text: textOf(first), response: first };
  }

  // Second turn: hand the tool result back and observe whether the model can
  // close the loop with it.
  const second = await guardTransport(() => connector.runToolConversation!(plan, {
    system: evalCase.system,
    messages: [
      ...messages,
      { role: 'assistant', content: first.content },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: call.id, content: evalCase.toolResult!.content }],
      },
    ],
    tools,
    maxOutputTokens: plan.maxOutputTokens,
  }));
  return { text: textOf(second), response: second };
};
