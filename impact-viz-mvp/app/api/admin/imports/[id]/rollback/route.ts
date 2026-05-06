// app/api/admin/imports/[id]/rollback/route.ts
// POST: rollback an import job (full or partial scope)

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { rollbackImport } from '@/lib/import/rollback';
import type { RollbackScope } from '@/lib/import/rollback';
import type { ImportJob } from '@/lib/import/types';
import { requireAdmin } from '@/lib/admin-auth';

const VALID_STATUSES = ['completed', 'paused', 'failed'];
const VALID_SCOPES: RollbackScope[] = ['full', 'investees', 'holdings', 'users', 'contributions', 'metrics'];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAdmin();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const scope: RollbackScope = VALID_SCOPES.includes(body.scope) ? body.scope : 'full';

  const supabase = createAdminClient();

  const { data: job, error: jobError } = await supabase
    .from('import_jobs')
    .select('*')
    .eq('id', id)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: 'Import job not found' }, { status: 404 });
  }

  if (!VALID_STATUSES.includes(job.status)) {
    return NextResponse.json(
      { error: `Job must be in completed, paused, or failed status to rollback. Current: ${job.status}` },
      { status: 400 }
    );
  }

  try {
    const result = await rollbackImport(supabase, id, scope);

    // Fetch updated job
    const { data: updatedJob } = await supabase
      .from('import_jobs')
      .select('*')
      .eq('id', id)
      .single();

    return NextResponse.json(
      { result, job: updatedJob as ImportJob },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
