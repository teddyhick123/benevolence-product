import { z } from 'zod';

/**
 * Schema for AI chat message
 */
export const aiChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1, 'Message content is required'),
  timestamp: z.string().datetime().optional(),
});

/**
 * Schema for AI chat request
 */
export const aiChatRequestSchema = z.object({
  portfolioId: z.string().uuid('Invalid portfolio ID'),
  message: z.string().min(1, 'Message is required').max(10000, 'Message too long'),
  requestId: z.string().uuid('Invalid request ID').optional(),
  sessionId: z.string().uuid('Invalid session ID').optional(),
  conversationHistory: z.array(aiChatMessageSchema).optional().default([]),
});

/**
 * Schema for AI undo/redo request
 */
export const aiActionRequestSchema = z.object({
  portfolioId: z.string().uuid('Invalid portfolio ID'),
  sessionId: z.string().uuid('Invalid session ID'),
  actionId: z.string().uuid('Invalid action ID'),
});

/**
 * Schema for AI undo operation
 */
export const aiUndoSchema = z.object({
  actionId: z.string().uuid().optional(),
  batchId: z.string().uuid().optional(),
}).refine(data => data.actionId || data.batchId, {
  message: 'Either actionId or batchId must be provided',
});

/**
 * Schema for AI redo operation
 */
export const aiRedoSchema = z.object({
  actionId: z.string().uuid('Invalid action ID'),
});
