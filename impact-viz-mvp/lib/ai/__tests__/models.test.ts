// lib/ai/__tests__/models.test.ts
import { describe, it, expect } from 'vitest';

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
