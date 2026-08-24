// @vitest-environment node

import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');

function callersOf(symbol: string): string[] {
  const output = execSync(
    `grep -rn "${symbol}(" lib app --include=*.ts --include=*.tsx || true`,
    { cwd: ROOT, encoding: 'utf8' },
  );
  return output.split('\n').filter(Boolean).filter(line => !line.includes('__tests__'));
}

describe('no provider bypass', () => {
  // After Phase 3A the only sanctioned caller is the Builder boundary. Any
  // other hit is a path whose spend is invisible.
  it('confines createAIProvider to the factory and the Builder boundary', () => {
    const offenders = callersOf('createAIProvider')
      .filter(line => !line.startsWith('lib/ai/factory.ts'))
      .filter(line => !line.startsWith('lib/builder/ai.ts'));
    expect(offenders, `unmetered provider construction:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('routes builder call sites through the boundary', () => {
    const boundaryUsers = callersOf('builderPlan')
      .concat(callersOf('builderBuild'))
      .concat(callersOf('builderReview'))
      .concat(callersOf('builderChatStream'));
    expect(boundaryUsers.length).toBeGreaterThanOrEqual(4);
  });
});
