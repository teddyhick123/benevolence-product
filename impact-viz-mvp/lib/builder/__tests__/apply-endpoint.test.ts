import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('apply endpoint', () => {
  const src = readFileSync(
    'app/api/admin/builder/proposals/[proposalId]/apply/route.ts',
    'utf8'
  );

  it('exports a POST handler', () => {
    expect(src).toMatch(/export async function POST/);
  });

  it('requires super_admin', () => {
    expect(src).toMatch(/is_super_admin/);
  });

  it('uses fs.writeFileSync to write files', () => {
    expect(src).toMatch(/writeFileSync|writeFile/);
  });

  it('updates phase to applied', () => {
    expect(src).toMatch(/applied/);
  });

  it('does not run git commands', () => {
    expect(src).not.toMatch(/git add|git commit|execSync.*git/);
  });
});
