// lib/org-import/loader.ts
// Inserts an archive's rows, one statement per table.

import type { Tx } from '@/lib/org-import/connection';
import type { LoadOrder } from '@/lib/org-import/order';
import type { ArchiveContents } from '@/lib/org-import/reader';

export type LoadReport = { table: string; inserted: number; expected: number }[];

/**
 * Columns an INSERT may name. Generated columns are excluded because Postgres
 * rejects an explicit value for one, which would make every insert on that
 * table fail.
 */
export async function insertableColumns(tx: Tx, table: string): Promise<string[]> {
  const { rows } = await tx.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
       AND is_generated <> 'ALWAYS'
     ORDER BY ordinal_position`, [table]);
  return rows.map(row => row.column_name);
}

async function hasIdentityColumn(tx: Tx, table: string): Promise<boolean> {
  const { rows } = await tx.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 AND is_identity='YES'`, [table]);
  return rows[0].n !== '0';
}

export async function loadTables(
  tx: Tx,
  contents: ArchiveContents,
  plan: LoadOrder,
): Promise<LoadReport> {
  const report: LoadReport = [];
  const deferredByTable = new Map<string, string[]>();
  for (const entry of plan.deferred) {
    deferredByTable.set(entry.table, [...(deferredByTable.get(entry.table) ?? []), entry.column]);
  }

  for (const table of plan.order) {
    const lines = contents.tables.get(table);
    if (!lines || lines.length === 0) continue;

    const deferred = new Set(deferredByTable.get(table) ?? []);
    const parsed = lines.map(line => JSON.parse(line) as Record<string, unknown>);

    // Only columns the archive actually carries. Naming a column the archive
    // lacks would make jsonb_populate_record supply NULL and override the
    // column's default - which breaks NOT NULL DEFAULT now() outright, and
    // silently breaks the promise that an archive older than the target lets
    // newer columns take their defaults.
    const present = new Set<string>();
    for (const row of parsed) {
      for (const key of Object.keys(row)) present.add(key);
    }

    const columns = (await insertableColumns(tx, table))
      .filter(c => !deferred.has(c) && present.has(c));
    const quoted = columns.map(c => `"${c}"`).join(', ');
    const selected = columns.map(c => `r."${c}"`).join(', ');

    // Identity columns need the override, or preserved ids are renumbered and
    // the foreign keys this design chose not to rewrite point at nothing.
    const overriding = (await hasIdentityColumn(tx, table)) ? 'OVERRIDING SYSTEM VALUE' : '';

    // One statement per table. Per-row inserts across tens of thousands of
    // rows would make one transaction span far more round trips than it needs.
    //
    // Table and column names are interpolated because SQL cannot parameterise
    // them. They come from information_schema and the export manifest, never
    // from user input.
    const { rowCount } = await tx.query(
      `INSERT INTO public."${table}" (${quoted}) ${overriding}
       SELECT ${selected}
       FROM jsonb_array_elements($1::jsonb) AS line,
            LATERAL jsonb_populate_record(NULL::public."${table}", line) AS r
       ON CONFLICT DO NOTHING`,
      [JSON.stringify(parsed)],
    );

    const expected = contents.manifest.files
      .find(file => file.path === `tables/${table}.ndjson.gz`)?.rows ?? lines.length;

    // ON CONFLICT DO NOTHING swallows a row that violates a constraint this
    // design did not anticipate. Without this check a partial import commits
    // and reports success.
    if (rowCount !== expected) {
      throw new Error(
        `Table ${table}: expected ${expected} rows, inserted ${rowCount}. ` +
        'The archive holds rows this database rejected; nothing has been committed.',
      );
    }

    report.push({ table, inserted: rowCount, expected });
  }

  // Repair the cycle back-edges now that both ends exist.
  for (const [table, columns] of deferredByTable) {
    const lines = contents.tables.get(table);
    if (!lines || lines.length === 0) continue;
    for (const column of columns) {
      await tx.query(
        `UPDATE public."${table}" AS t
         SET "${column}" = (line->>'${column}')::uuid
         FROM jsonb_array_elements($1::jsonb) AS line
         WHERE t.id = (line->>'id')::uuid AND line->>'${column}' IS NOT NULL`,
        [JSON.stringify(lines.map(line => JSON.parse(line)))],
      );
    }
  }

  return report;
}
