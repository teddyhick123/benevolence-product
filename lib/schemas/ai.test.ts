import { describe, it, expect } from 'vitest';
import {
  aiChatRequestSchema,
  aiUndoSchema,
  aiRedoSchema,
} from './ai';

describe('AI Schemas', () => {
  describe('aiChatRequestSchema', () => {
    it('should validate valid AI chat request', () => {
      const validData = {
        portfolioId: '550e8400-e29b-41d4-a716-446655440000',
        message: 'Show me the impact metrics for Q4',
        sessionId: '660e8400-e29b-41d4-a716-446655440001',
        conversationHistory: [
          { role: 'user' as const, content: 'Hello' },
          { role: 'assistant' as const, content: 'Hi there!' },
        ],
      };

      const result = aiChatRequestSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should require portfolioId and message', () => {
      const invalidData = {
        message: 'Test message',
      };

      const result = aiChatRequestSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should default conversationHistory to empty array', () => {
      const minimalData = {
        portfolioId: '550e8400-e29b-41d4-a716-446655440000',
        message: 'Test',
      };

      const result = aiChatRequestSchema.safeParse(minimalData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.conversationHistory).toEqual([]);
      }
    });

    it('should enforce max message length', () => {
      const tooLong = {
        portfolioId: '550e8400-e29b-41d4-a716-446655440000',
        message: 'A'.repeat(15000), // Max is 10000
      };

      const result = aiChatRequestSchema.safeParse(tooLong);
      expect(result.success).toBe(false);
    });

    it('should require non-empty message', () => {
      const emptyMessage = {
        portfolioId: '550e8400-e29b-41d4-a716-446655440000',
        message: '',
      };

      const result = aiChatRequestSchema.safeParse(emptyMessage);
      expect(result.success).toBe(false);
    });

    it('should validate portfolioId as UUID', () => {
      const invalidUuid = {
        portfolioId: 'not-a-uuid',
        message: 'Test',
      };

      const result = aiChatRequestSchema.safeParse(invalidUuid);
      expect(result.success).toBe(false);
    });
  });

  describe('aiUndoSchema', () => {
    it('should validate with actionId', () => {
      const validData = {
        actionId: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = aiUndoSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate with batchId', () => {
      const validData = {
        batchId: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = aiUndoSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate with both actionId and batchId', () => {
      const validData = {
        actionId: '550e8400-e29b-41d4-a716-446655440000',
        batchId: '660e8400-e29b-41d4-a716-446655440001',
      };

      const result = aiUndoSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should require at least one of actionId or batchId', () => {
      const invalidData = {};

      const result = aiUndoSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('actionId or batchId');
      }
    });

    it('should validate UUIDs', () => {
      const invalidData = {
        actionId: 'not-a-uuid',
      };

      const result = aiUndoSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('aiRedoSchema', () => {
    it('should validate valid redo request', () => {
      const validData = {
        actionId: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = aiRedoSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should require actionId', () => {
      const invalidData = {};

      const result = aiRedoSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should validate actionId as UUID', () => {
      const invalidData = {
        actionId: 'not-a-uuid',
      };

      const result = aiRedoSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });
});
