// lib/export/rows.ts
// Streams a table's rows for one organization as NDJSON lines.
//
// supabase-js buffers a whole response, so a large table has to be paged. The
// cursor is keyset rather than offset, and the lines arrive pre-serialised from
// Postgres so no JavaScript ever parses a numeric.

import type { ElevatedClient } from '@/lib/api/admin-client';
import type { TableExportRule } from '@/lib/export/tables';

export const DEFAULT_PAGE_SIZE = 1000;

export async function* streamTableRows(
  db: ElevatedClient,
  rule: TableExportRule,
  orgId: string,
  pageSize: number = DEFAULT_PAGE_SIZE,
): AsyncGenerator<string> {
  if (rule.kind !== 'org_scoped' && rule.kind !== 'via_parent') return;

  let after: string | null = null;
  for (;;) {
    const { data, error } = await db.rpc('export_table_page', {
      p_table: rule.table,
      p_org_id: orgId,
      p_after: after,
      p_limit: pageSize,
      // Null for a directly scoped table; the SQL function refuses a table with
      // no scoping column unless all three are supplied.
      p_parent: rule.kind === 'via_parent' ? rule.parent : null,
      p_parent_key: rule.kind === 'via_parent' ? rule.parentKey : null,
      p_local_key: rule.kind === 'via_parent' ? rule.localKey : null,
      // 'id' only for the organizations row itself.
      p_org_column: rule.kind === 'org_scoped' ? rule.column : 'org_id',
    });
    if (error) throw error;

    const page = (data ?? []) as { row_id: string; line: string }[];
    if (page.length === 0) return;

    for (const row of page) yield row.line;

    // A short page is the last page.
    if (page.length < pageSize) return;
    after = page[page.length - 1].row_id;
  }
}
