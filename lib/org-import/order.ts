// lib/org-import/order.ts
// Insert order for archive import, derived from the live schema rather than a
// hand-maintained list — which would rot the moment a table was added.

import type { Tx } from '@/lib/org-import/connection';

export type ForeignKey = {
  child: string;
  parent: string;
  column: string;
  nullable: boolean;
};

export type LoadOrder = {
  order: string[];
  /** Columns set to NULL during insert and repaired afterwards. */
  deferred: { table: string; column: string }[];
};

/**
 * Every single-column edge of every foreign key, composite ones included. A
 * composite key contributes one row per column; for ordering only the table
 * pair matters, and for cycle breaking only nullability does.
 */
export async function readForeignKeys(tx: Tx): Promise<ForeignKey[]> {
  const { rows } = await tx.query<{
    child: string; parent: string; column: string; nullable: boolean;
  }>(`
    SELECT c.conrelid::regclass::text            AS child,
           c.confrelid::regclass::text           AS parent,
           a.attname                             AS column,
           NOT a.attnotnull                      AS nullable
    FROM pg_constraint c
    JOIN LATERAL unnest(c.conkey) AS k(attnum) ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
  `);
  // regclass renders unqualified for tables on the search path, which is what
  // the load set uses; anything else (auth.users) stays qualified and is
  // filtered out by planLoadOrder as outside the set.
  return rows;
}

export function planLoadOrder(tables: string[], fks: ForeignKey[]): LoadOrder {
  const inSet = new Set(tables);
  const edges = fks.filter(f =>
    inSet.has(f.child) && inSet.has(f.parent) && f.child !== f.parent);

  const deferred: LoadOrder['deferred'] = [];
  const active = new Set(edges.map((_, i) => i));

  const order: string[] = [];
  const remaining = new Set(tables);

  const parentsOf = (table: string) => [...active]
    .map(i => edges[i])
    .filter(edge => edge.child === table && remaining.has(edge.parent));

  // Kahn's algorithm, breaking a cycle whenever progress stalls.
  while (remaining.size > 0) {
    const ready = [...remaining].filter(table => parentsOf(table).length === 0).sort();

    if (ready.length > 0) {
      for (const table of ready) {
        order.push(table);
        remaining.delete(table);
      }
      continue;
    }

    // Stalled: every remaining table waits on another, so a cycle exists.
    // Break it at a nullable edge — the column is set NULL on insert and
    // repaired after the cycle's tables are loaded.
    const breakable = [...active]
      .map(i => ({ i, edge: edges[i] }))
      .filter(({ edge }) =>
        edge.nullable && remaining.has(edge.child) && remaining.has(edge.parent))
      .sort((a, b) =>
        `${a.edge.child}.${a.edge.column}`.localeCompare(`${b.edge.child}.${b.edge.column}`))[0];

    if (!breakable) {
      throw new Error(
        `Foreign-key cycle with no nullable edge among: ${[...remaining].sort().join(', ')}. ` +
        'This schema cannot be imported; make one edge of the cycle nullable.',
      );
    }

    active.delete(breakable.i);
    if (!deferred.some(d => d.table === breakable.edge.child && d.column === breakable.edge.column)) {
      deferred.push({ table: breakable.edge.child, column: breakable.edge.column });
    }
  }

  return { order, deferred: deferred.sort((a, b) => a.table.localeCompare(b.table)) };
}
