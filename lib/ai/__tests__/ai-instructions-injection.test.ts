import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('provider-neutral portfolio assistant instructions', () => {
  const src = readFileSync('lib/ai/assistant/portfolio-assistant.ts', 'utf8');

  it('imports the organization-aware runtime gateway', () => {
    expect(src).toMatch(/from ['"]@\/lib\/ai\/runtime['"]/);
  });

  it('does not import raw model or provider selection', () => {
    expect(src).not.toMatch(/from ['"]@\/lib\/ai\/(?:models|factory)['"]/);
  });

  it('no longer directly instantiates Anthropic client in constructor', () => {
    expect(src).not.toMatch(/this\.anthropic\s*=\s*new Anthropic/);
  });

  it('exports provider-neutral PortfolioAssistant', () => {
    expect(src).toMatch(/export class PortfolioAssistant/);
  });

  it('resolves the assistant workload once for each chat execution', () => {
    expect(src.match(/gateway\.resolve\('assistant'\)/g)).toHaveLength(2);
    expect(src).toMatch(/gateway\.runToolConversation\(executionPlan/);
    expect(src).toMatch(/gateway\.streamToolConversation\(executionPlan/);
  });

  it('fetches ai_instructions in initializeForOrg', () => {
    expect(src).toMatch(/ai_instructions/);
  });
});
