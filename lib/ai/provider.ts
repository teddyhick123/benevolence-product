/**
 * AI Provider Interface
 *
 * Abstraction layer for different AI provider implementations.
 */

import type { AIMessage, AIResponse, AIStreamChunk, ToolDefinition } from './types';

/**
 * Configuration for an AI request
 */
export interface AIRequestConfig {
  model: string;
  system?: string;
  messages: AIMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

/**
 * Abstract interface for AI providers
 */
export interface AIProvider {
  /**
   * Create a non-streaming message
   */
  createMessage(_config: AIRequestConfig): Promise<AIResponse>;

  /**
   * Create a streaming message
   */
  createStream(_config: AIRequestConfig): AsyncIterable<AIStreamChunk>;
}
