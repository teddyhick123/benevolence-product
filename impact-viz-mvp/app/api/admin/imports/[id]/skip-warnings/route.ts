// app/api/admin/imports/[id]/skip-warnings/route.ts
// POST /api/admin/imports/:id/skip-warnings
// Marks all rows with only warnings (no errors) as valid

import { createAdminClient, createServerClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/admin-auth';

const STAGING_TABLES = [
  'staging_import_holdings',
  'staging_import_investees',
  'staging_import_contributions',
  'staging_import_metrics',
  'staging_import_users',
];

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAdmin();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: importJobId } = await params;
  const supabase = createAdminClient();

  let totalUpdated = 0;

  for (const table of STAGING_TABLES) {
    // Find rows that are 'warning' status — these have only warnings, no hard errors
    const { data: warningRows } = await supabase
      .from(table)
      .select('id, validation_errors')
      .eq('import_job_id', importJobId)
      .eq('validation_status', 'warning');

    if (!warningRows || warningRows.length === 0) continue;

    // Only promote rows where ALL errors have severity === 'warning' (no 'error' severity)
    const rowsToPromote = warningRows.filter((row) => {
      const errors = (row.validation_errors as Array<{ severity: string }> | null) ?? [];
      return errors.every((e) => e.severity === 'warning');
    });

    if (rowsToPromote.length === 0) continue;

    const ids = rowsToPromote.map((r) => r.id as string);
    const { error } = await supabase
      .from(table)
      .update({
        validation_status: 'valid',
        updated_at: new Date().toISOString(),
      })
      .in('id', ids);

    if (!error) {
      totalUpdated += rowsToPromote.length;
    }
  }

  return Response.json({ updated: totalUpdated });
}
