import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('provider-neutral portfolio assistant instructions', () => {
  const src = readFileSync('lib/ai/assistant/portfolio-assistant.ts', 'utf8');

  it('imports createAIProvider from lib/ai/factory', () => {
    expect(src).toMatch(/from ['"]@\/lib\/ai\/factory['"]/);
  });

  it('imports AI_MODELS from lib/ai/models', () => {
    expect(src).toMatch(/from ['"]@\/lib\/ai\/models['"]/);
  });

  it('no longer directly instantiates Anthropic client in constructor', () => {
    expect(src).not.toMatch(/this\.anthropic\s*=\s*new Anthropic/);
  });

  it('exports provider-neutral PortfolioAssistant', () => {
    expect(src).toMatch(/export class PortfolioAssistant/);
  });

  it('uses AI_MODELS.assistant for the model string', () => {
    expect(src).toMatch(/AI_MODELS\.assistant/);
  });

  it('fetches ai_instructions in initializeForOrg', () => {
    expect(src).toMatch(/ai_instructions/);
  });
});
