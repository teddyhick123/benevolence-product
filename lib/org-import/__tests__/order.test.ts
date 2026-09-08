// @vitest-environment node

import { describe, expect, it, beforeAll } from 'vitest';
import { planLoadOrder, readForeignKeys, type ForeignKey } from '@/lib/org-import/order';
import { withTransaction } from '@/lib/org-import/connection';
import { exportableTables } from '@/lib/export/tables';

const LOCAL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
beforeAll(() => { process.env.SUPABASE_DB_URL = process.env.SUPABASE_DB_URL ?? LOCAL; });

const fk = (child: string, parent: string, column = 'parent_id', nullable = false): ForeignKey =>
  ({ child, parent, column, nullable });

describe('planLoadOrder', () => {
  it('places a parent before its child', () => {
    const { order } = planLoadOrder(['child', 'parent'], [fk('child', 'parent')]);
    expect(order.indexOf('parent')).toBeLessThan(order.indexOf('child'));
  });

  it('keeps tables with no relationships', () => {
    const { order } = planLoadOrder(['alone', 'parent', 'child'], [fk('child', 'parent')]);
    expect([...order].sort()).toEqual(['alone', 'child', 'parent']);
  });

  it('ignores a self-reference rather than calling it a cycle', () => {
    const { order } = planLoadOrder(['t'], [fk('t', 't', 'parent_id', true)]);
    expect(order).toEqual(['t']);
  });

  // Both real cycles in this schema are broken this way.
  it('breaks a two-table cycle at its nullable edge and defers that column', () => {
    const { order, deferred } = planLoadOrder(['a', 'b'], [
      fk('b', 'a', 'a_id', false),
      fk('a', 'b', 'b_id', true),
    ]);
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(deferred).toEqual([{ table: 'a', column: 'b_id' }]);
  });

  // An unimportable schema must fail in a test, not on a client's data.
  it('throws when a cycle has no nullable edge to break', () => {
    expect(() => planLoadOrder(['a', 'b'], [
      fk('b', 'a', 'a_id', false),
      fk('a', 'b', 'b_id', false),
    ])).toThrow(/cycle/i);
  });

  it('ignores a foreign key to a table outside the load set', () => {
    const { order } = planLoadOrder(['child'], [fk('child', 'auth.users', 'user_id')]);
    expect(order).toEqual(['child']);
  });
});

describe('readForeignKeys against the real schema', () => {
  it('includes composite foreign keys', async () => {
    const fks = await withTransaction(tx => readForeignKeys(tx));
    // Phase 4B's classification walk filtered these out; the sort must not.
    const composite = fks.filter(f =>
      f.child === 'pledge_installments' && f.parent === 'contributions_received');
    expect(composite.length).toBeGreaterThan(0);
  });

  it('orders every exportable table without throwing', async () => {
    const fks = await withTransaction(tx => readForeignKeys(tx));
    const tables = exportableTables().map(rule => rule.table);
    const { order } = planLoadOrder(tables, fks);
    expect([...order].sort()).toEqual([...tables].sort());
  });

  // Phase 4B's classification walk filtered composite keys out, so its
  // via_parent parents were chosen without seeing them. Re-check that every
  // declared parent is a real foreign-key target now that composites are read.
  //
  // Exactly one table is scoped through a relationship the database does not
  // declare. Listing it exactly - rather than filtering by prefix - means a
  // second appearing later fails this test instead of slipping in unnoticed.
  //
  // This corrects a claim made during Phase 4B. ai_turns and ai_messages were
  // recorded there as declaring no foreign key to their parent; they do, as
  // three-column composites, which that phase's single-column walk could not
  // see. The classification was right; the stated reason was not.
  it('confirms every via_parent parent is a real foreign-key target', async () => {
    const HAND_CLASSIFIED = [
      // profiles.id references auth.users. Membership is the scoping path,
      // and no foreign key expresses it.
      'profiles->organization_members',
    ];

    const fks = await withTransaction(tx => readForeignKeys(tx));
    const edges = new Set(fks.map(f => `${f.child}->${f.parent}`));
    const unbacked: string[] = [];

    for (const rule of exportableTables()) {
      if (rule.kind !== 'via_parent') continue;
      const pair = `${rule.table}->${rule.parent}`;
      if (!edges.has(pair)) unbacked.push(pair);
    }

    expect(unbacked.sort()).toEqual([...HAND_CLASSIFIED].sort());
  });

  it('finds exactly the two known cycles', async () => {
    const fks = await withTransaction(tx => readForeignKeys(tx));
    const tables = exportableTables().map(rule => rule.table);
    const { deferred } = planLoadOrder(tables, fks);
    expect(deferred.map(d => `${d.table}.${d.column}`).sort()).toEqual([
      'builder_proposals.current_revision_id',
      'contributions_received.pledge_installment_id',
    ]);
  });
});
