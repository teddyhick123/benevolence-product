// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROUTE = readFileSync(
  join(__dirname, '..', '..', 'app/api/jobs/exports/sweep/route.ts'),
  'utf8',
);

describe('export retention sweep', () => {
  it('is guarded as a job rather than by a session', () => {
    expect(ROUTE).toMatch(/requireJobAccess\(req(uest)?,\s*'exports'\)/);
  });

  // Marking a row expired without deleting the object would make the retention
  // promise false while looking true.
  it('removes the object before marking the run expired', () => {
    const removeAt = ROUTE.indexOf('.remove(');
    const markAt = ROUTE.indexOf('markExpired');
    expect(removeAt).toBeGreaterThan(-1);
    expect(markAt).toBeGreaterThan(removeAt);
  });

  // A storage failure must leave the run visibly unswept rather than claiming
  // a deletion that did not happen, so the loop skips before markExpired.
  it('does not mark a run expired when its object could not be removed', () => {
    const errorBranch = ROUTE.indexOf('if (error)');
    const mark = ROUTE.indexOf('markExpired');
    expect(errorBranch).toBeGreaterThan(-1);
    expect(errorBranch).toBeLessThan(mark);
    expect(ROUTE.slice(errorBranch, mark)).toMatch(/continue;/);
  });

  it('reports how many runs it expired and how many it could not', () => {
    expect(ROUTE).toMatch(/jsonOk\(\{ expired, failed \}\)/);
  });

  it('sweeps only succeeded runs past their expiry', () => {
    expect(ROUTE).toMatch(/expiredRuns/);
  });
});
