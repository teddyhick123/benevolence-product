// lib/ai/__tests__/models.test.ts
import { describe, it, expect } from 'vitest';
import { AI_MODELS } from '@/lib/ai/models';

describe('AI_MODELS', () => {
  it('exports assistant model with a default', async () => {
    const { AI_MODELS } = await import('../models');
    expect(typeof AI_MODELS.assistant).toBe('string');
    expect(AI_MODELS.assistant.length).toBeGreaterThan(0);
  });

  it('exports separate models for each scaffold phase', async () => {
    const { AI_MODELS } = await import('../models');
    expect(AI_MODELS.scaffoldPlan).toBeDefined();
    expect(AI_MODELS.scaffoldBuild).toBeDefined();
    expect(AI_MODELS.scaffoldReview).toBeDefined();
  });
});

describe('platform default models', () => {
  it('uses current-generation model identifiers', () => {
    expect(AI_MODELS.assistant).toBe('claude-opus-5');
    expect(AI_MODELS.scaffoldPlan).toBe('claude-opus-5');
    expect(AI_MODELS.scaffoldBuild).toBe('claude-sonnet-5');
    expect(AI_MODELS.scaffoldReview).toBe('claude-opus-5');
  });

  it('never carries a date suffix', () => {
    for (const id of Object.values(AI_MODELS)) {
      expect(id).not.toMatch(/-\d{8}$/);
    }
  });
});
