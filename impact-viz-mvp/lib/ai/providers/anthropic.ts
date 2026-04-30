// lib/ai/providers/anthropic.ts
import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, AIRequestConfig } from '../provider';
import type { AIResponse, AIStreamChunk, AIContentBlock } from '../types';

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
      // Required when running in jsdom test environments; production usage is server-side only
      dangerouslyAllowBrowser: typeof window !== 'undefined',
    });
  }

  async createMessage(config: AIRequestConfig): Promise<AIResponse> {
    const response = await this.client.messages.create({
      model: config.model,
      max_tokens: config.maxTokens ?? 4096,
      system: config.system,
      messages: config.messages.map(m => ({
        role: m.role,
        content: typeof m.content === 'string'
          ? m.content
          : (m.content as AIContentBlock[]).map(block => {
              if (block.type === 'text') return { type: 'text' as const, text: block.text };
              if (block.type === 'tool_use') return { type: 'tool_use' as const, id: block.id, name: block.name, input: block.input };
              // tool_result
              return { type: 'tool_result' as const, tool_use_id: block.tool_use_id, content: block.content };
            }),
      })),
      tools: config.tools as unknown as Anthropic.Tool[],
    });

    const content: AIContentBlock[] = response.content.map(block => {
      if (block.type === 'text') return { type: 'text', text: block.text };
      if (block.type === 'tool_use') return { type: 'tool_use', id: block.id, name: block.name, input: block.input as Record<string, unknown> };
      return { type: 'text', text: '' };
    });

    return { content, stopReason: response.stop_reason ?? null, model: response.model };
  }

  async *createStream(config: AIRequestConfig): AsyncIterable<AIStreamChunk> {
    const stream = this.client.messages.stream({
      model: config.model,
      max_tokens: config.maxTokens ?? 4096,
      system: config.system,
      messages: config.messages.map(m => ({
        role: m.role,
        content: typeof m.content === 'string'
          ? m.content
          : (m.content as AIContentBlock[]).map(block => {
              if (block.type === 'text') return { type: 'text' as const, text: block.text };
              if (block.type === 'tool_use') return { type: 'tool_use' as const, id: block.id, name: block.name, input: block.input };
              return { type: 'tool_result' as const, tool_use_id: block.tool_use_id, content: block.content };
            }),
      })),
      tools: config.tools as unknown as Anthropic.Tool[],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          yield { type: 'content_block_start', blockType: 'tool_use', id: event.content_block.id, name: event.content_block.name };
        } else if (event.content_block.type === 'text') {
          yield { type: 'content_block_start', blockType: 'text' };
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield { type: 'text_delta', text: event.delta.text };
        } else if (event.delta.type === 'input_json_delta') {
          yield { type: 'tool_input_delta', partialJson: event.delta.partial_json };
        }
      } else if (event.type === 'content_block_stop') {
        yield { type: 'content_block_stop' };
      } else if (event.type === 'message_delta') {
        yield { type: 'message_stop', stopReason: event.delta.stop_reason ?? null };
      }
    }
  }
}
