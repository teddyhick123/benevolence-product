import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('update-basic auth contract', () => {
  const src = readFileSync(
    'app/api/holdings/[id]/update-basic/route.ts',
    'utf8'
  );

  it('uses the shared holding edit boundary and its session database', () => {
    expect(src).toContain("requireHoldingAccess(holdingId, 'member')");
    expect(src).toContain('isAccessDenied(access)');
    expect(src).toContain('access.context.db');
    expect(src).not.toContain('auth.getUser()');
    expect(src).not.toContain('createServerClient');
  });
});
