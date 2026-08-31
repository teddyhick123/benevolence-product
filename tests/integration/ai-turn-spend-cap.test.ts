// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const SESSIONS = readFileSync(join(ROOT, 'db/migrations/0033_ai_sessions.sql'), 'utf8');
const CHAT = readFileSync(join(ROOT, 'lib/api/repositories/ai-chat.ts'), 'utf8');

describe('spend cap at turn start', () => {
  it('checks the cap inside begin_ai_turn', () => {
    expect(SESSIONS).toMatch(/org_platform_spend/);
    expect(SESSIONS).toMatch(/cap_exceeded/);
  });

  // Only hard_stop refuses. read_only and own_key change how a turn resolves,
  // which is the resolver's job.
  it('refuses only for hard_stop', () => {
    expect(SESSIONS).toMatch(/on_limit\s*=\s*'hard_stop'/);
  });

  // A workload routed to an organization deployment is org-funded and must
  // not be capped: that is their provider bill, not platform cost.
  it('exempts workloads with an enabled organization route', () => {
    expect(SESSIONS).toMatch(/org_ai_routes/);
  });

  it('returns rather than raises, so a cap is distinguishable from a fault', () => {
    const capIndex = SESSIONS.indexOf('cap_exceeded');
    const block = SESSIONS.slice(capIndex - 500, capIndex + 400);
    expect(block).not.toMatch(/RAISE EXCEPTION/);
  });

  it('handles the refusal before the identity check that would reject it', () => {
    const capIndex = CHAT.indexOf('cap_exceeded');
    const identityIndex = CHAT.indexOf('requireRpcIdentity(result)');
    expect(capIndex).toBeGreaterThan(-1);
    expect(capIndex).toBeLessThan(identityIndex);
  });
});
