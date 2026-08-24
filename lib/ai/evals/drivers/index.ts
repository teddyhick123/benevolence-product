import type { AIOperation } from '@/lib/ai/workloads';
import { textGenerationDriver, type Driver } from '@/lib/ai/evals/drivers/text-generation';
import { structuredGenerationDriver } from '@/lib/ai/evals/drivers/structured-generation';
import { toolConversationDriver } from '@/lib/ai/evals/drivers/tool-conversation';
import { transcriptionDriver } from '@/lib/ai/evals/drivers/transcription';

export type { Driver };

export const DRIVERS: Readonly<Record<AIOperation, Driver>> = {
  text_generation: textGenerationDriver,
  structured_generation: structuredGenerationDriver,
  tool_conversation: toolConversationDriver,
  transcription: transcriptionDriver,
};
