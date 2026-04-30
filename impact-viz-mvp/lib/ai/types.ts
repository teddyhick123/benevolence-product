/**
 * AI Assistant Types
 *
 * Shared type definitions for the AI assistant system.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * AI Action - Tracks AI-initiated changes with undo/redo capability
 */
export type AIAction = {
  id: string;
  sessionId: string;
  portfolioId: string;
  userId: string;
  actionType: 'create' | 'update' | 'delete';
  entityType: 'holding' | 'metric_fact' | 'widget' | 'location' | 'contribution' | 'kpi_definition';
  entityId?: string;
  operationData: {
    table: string;
    before?: any;
    after?: any;
  };
  aiReasoning?: string;
  userPrompt?: string;
  status: 'applied' | 'undone' | 'redone';
  batchId?: string;
  sequenceOrder?: number;
};

/**
 * Tool execution result
 */
export type ToolResult = {
  action: AIAction | null;
  additionalActions?: AIAction[];
  output: any;
};

/**
 * Time window options for data queries
 */
export type TimeWindow = '3m' | '6m' | '12m' | '24m' | 'all';

/**
 * Context passed to tool executors
 */
export interface ToolExecutorContext {
  supabase: SupabaseClient;
  portfolioId: string;
  userId: string;
  sessionId: string;
  batchId: string;
  sequenceOrder: number;
  userPrompt: string;
}

/**
 * Chart colors for visualizations
 */
export const CHART_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
];

/**
 * Time window helper for calculating date ranges
 */
export const TimeWindowHelper = {
  getStartDate(window: TimeWindow): string {
    const windowDays: Record<TimeWindow, number> = {
      '3m': 90,
      '6m': 180,
      '12m': 365,
      '24m': 730,
      'all': 3650,
    };
    const days = windowDays[window] || 365;
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  },
};

/**
 * AI Message - Represents a message in an AI conversation
 */
export interface AIMessage {
  role: 'user' | 'assistant';
  content: string | AIContentBlock[];
}

/**
 * Content block types for AI messages
 */
export type AIContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

/**
 * Tool definition for AI tool use
 */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * AI Response - Response from an AI provider
 */
export interface AIResponse {
  content: AIContentBlock[];
  stopReason: string | null;
  model: string;
}

/**
 * Stream chunk from an AI provider streaming response
 */
export type AIStreamChunk =
  | { type: 'content_block_start'; blockType: 'text' | 'tool_use'; id?: string; name?: string }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_input_delta'; partialJson: string }
  | { type: 'content_block_stop' }
  | { type: 'message_stop'; stopReason: string | null };
