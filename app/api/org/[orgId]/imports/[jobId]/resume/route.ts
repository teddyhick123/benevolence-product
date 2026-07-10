import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import type { ImportJob } from '@/lib/import/types';
import { getOrgAccess, hasOrgAccess } from '@/lib/org-access';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; jobId: string }>;
}

async function requireOrgAdmin(orgId: string) {
  const supabase = await createServerClient();
  const access = await getOrgAccess(supabase, orgId);
  if (!access.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasOrgAccess(access, 'admin')) {
    return NextResponse.json({ error: 'Org admin access required' }, { status: 403 });
  }

  return null;
}

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { orgId, jobId } = await params;
  const accessError = await requireOrgAdmin(orgId);
  if (accessError) return accessError;

  const admin = createAdminClient();
  const { data: job } = await admin
    .from('import_jobs')
    .select('id, status')
    .eq('id', jobId)
    .eq('org_id', orgId)
    .single();

  if (!job) return NextResponse.json({ error: 'Import job not found' }, { status: 404 });
  if (job.status !== 'needs_review') {
    return NextResponse.json(
      { error: `Cannot resume a job with status '${job.status}'. Job must be in needs_review.` },
      { status: 422 }
    );
  }

  const { data: updated, error } = await admin
    .from('import_jobs')
    .update({ status: 'processing', error_message: null })
    .eq('id', jobId)
    .eq('org_id', orgId)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(
    { job: updated as ImportJob },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
