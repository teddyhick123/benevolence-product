import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { rollbackImport, type RollbackScope } from '@/lib/import/rollback';
import type { ImportJob } from '@/lib/import/types';
import { getOrgAccess, hasOrgAccess } from '@/lib/org-access';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; jobId: string }>;
}

const VALID_STATUSES = ['completed', 'needs_review', 'failed'];
const VALID_SCOPES: RollbackScope[] = ['full', 'donors', 'investees', 'holdings', 'contributions', 'metrics'];

async function requireOrgAdmin(orgId: string) {
  const supabase = await createServerClient();
  const access = await getOrgAccess(supabase, orgId);
  if (!access.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasOrgAccess(access, 'admin')) {
    return NextResponse.json({ error: 'Org admin access required' }, { status: 403 });
  }

  return null;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { orgId, jobId } = await params;
  const accessError = await requireOrgAdmin(orgId);
  if (accessError) return accessError;

  const body = await req.json().catch(() => ({}));
  const scope: RollbackScope = VALID_SCOPES.includes(body.scope) ? body.scope : 'full';
  const admin = createAdminClient();

  const { data: job, error: jobError } = await admin
    .from('import_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('org_id', orgId)
    .single();

  if (jobError || !job) return NextResponse.json({ error: 'Import job not found' }, { status: 404 });
  if (!VALID_STATUSES.includes(job.status)) {
    return NextResponse.json(
      { error: `Job must be completed, needs_review, or failed to rollback. Current: ${job.status}` },
      { status: 400 }
    );
  }

  try {
    const result = await rollbackImport(admin, jobId, scope);
    const { data: updatedJob } = await admin
      .from('import_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('org_id', orgId)
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
