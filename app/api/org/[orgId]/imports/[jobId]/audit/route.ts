import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
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

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { orgId, jobId } = await params;
  const accessError = await requireOrgAdmin(orgId);
  if (accessError) return accessError;

  const { searchParams } = req.nextUrl;
  const tableName = searchParams.get('table_name');
  const operation = searchParams.get('operation');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);
  const admin = createAdminClient();

  const { data: job } = await admin
    .from('import_jobs')
    .select('id')
    .eq('id', jobId)
    .eq('org_id', orgId)
    .single();
  if (!job) return NextResponse.json({ error: 'Import job not found' }, { status: 404 });

  let query = admin
    .from('import_audit_log')
    .select('*', { count: 'exact' })
    .eq('import_job_id', jobId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (tableName) query = query.eq('table_name', tableName);
  if (operation) query = query.eq('operation', operation);

  const { data: entries, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    { entries: entries ?? [], total: count ?? 0 },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
