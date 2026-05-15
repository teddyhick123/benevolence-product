import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('AI chat viewer write bypass', () => {
  const chatSrc = readFileSync('app/api/ai/chat/route.ts', 'utf8');
  const assistantSrc = readFileSync('lib/ai/assistant/executor.ts', 'utf8');

  it('chat route passes memberRole to assistant.chat()', () => {
    expect(chatSrc).toContain('memberRole');
  });

  it('chat route imports the provider-neutral assistant entrypoint', () => {
    expect(chatSrc).toContain("@/lib/ai/portfolio-assistant");
    expect(chatSrc).not.toContain("ClaudePortfolioAssistant");
  });

  it('executeTool guards write tools from viewers', () => {
    expect(assistantSrc).toMatch(/viewer/i);
    expect(assistantSrc).toMatch(/WRITE_TOOLS|write_tools/i);
  });
});
