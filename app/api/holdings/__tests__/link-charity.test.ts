import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('link-charity ownership contract', () => {
  const src = readFileSync(
    'app/api/holdings/[id]/link-charity/route.ts',
    'utf8'
  );

  it('uses the shared holding edit boundary for link and unlink', () => {
    expect(src.match(/requireHoldingAccess\(holdingId, 'member'\)/g)).toHaveLength(2);
    expect(src).toContain('isAccessDenied(access)');
    expect(src).toContain('access.context.db');
    expect(src).not.toContain('createServerClient');
  });
});
