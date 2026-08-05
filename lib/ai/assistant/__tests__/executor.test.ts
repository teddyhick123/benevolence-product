// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { executeAssistantTool } from '@/lib/ai/assistant/executor';
import { stubQuery } from '@/tests/helpers/supabase-mock';

function parameters(args: Record<string, unknown>) {
  const membership = stubQuery(
    { data: null, error: null },
    { single: { data: { role: 'member' }, error: null } }
  );
  return {
    db: { from: vi.fn(() => membership) } as never,
    functionName: 'list_holdings',
    args,
    portfolioId: 'portfolio-1',
    orgId: 'org-1',
    userId: 'user-1',
    sessionId: 'session-1',
    batchId: 'turn-1',
    sequenceOrder: 0,
    userPrompt: 'List holdings',
    memberRole: 'member',
    capabilities: { recordGrantPaymentAudit: vi.fn() },
  };
}

describe('assistant tool dispatcher scope', () => {
  it('rejects a model-supplied portfolio outside the authorized scope', async () => {
    await expect(executeAssistantTool(parameters({
      portfolio_id: 'portfolio-other',
    }))).rejects.toThrow('Tool portfolio scope does not match');
  });

  it('rejects a model-supplied organization outside the authorized scope', async () => {
    await expect(executeAssistantTool(parameters({
      organization_id: 'org-other',
    }))).rejects.toThrow('Tool organization scope does not match');
  });
});
