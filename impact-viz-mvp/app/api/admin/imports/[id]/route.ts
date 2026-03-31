// app/api/admin/imports/[id]/route.ts
// GET: return import job + progress summary

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';

async function requireAdmin(): Promise<string | null> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: adminRow } = await supabase
    .from('admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  return adminRow ? user.id : null;
}

type StagingTable =
  | 'staging_import_holdings'
  | 'staging_import_investees'
  | 'staging_import_contributions'
  | 'staging_import_metrics'
  | 'staging_import_users';

interface StagingCounts {
  total: number;
  valid: number;
  invalid: number;
  pending: number;
  warning: number;
}

// GET /api/admin/imports/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAdmin();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: job, error: jobError } = await supabase
    .from('import_jobs')
    .select('*')
    .eq('id', id)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: 'Import job not found' }, { status: 404 });
  }

  // Fetch staging counts for each entity type
  const stagingTables: Record<string, StagingTable> = {
    holdings: 'staging_import_holdings',
    investees: 'staging_import_investees',
    contributions: 'staging_import_contributions',
    metrics: 'staging_import_metrics',
    users: 'staging_import_users',
  };

  const stagingCounts: Record<string, StagingCounts> = {};

  await Promise.all(
    Object.entries(stagingTables).map(async ([entityType, table]) => {
      const { data: rows } = await supabase
        .from(table)
        .select('validation_status')
        .eq('import_job_id', id);

      const counts: StagingCounts = { total: 0, valid: 0, invalid: 0, pending: 0, warning: 0 };

      if (rows) {
        counts.total = rows.length;
        for (const row of rows) {
          const status = row.validation_status as keyof StagingCounts;
          if (status in counts) counts[status]++;
        }
      }

      stagingCounts[entityType] = counts;
    })
  );

  return NextResponse.json(
    { job, staging_counts: stagingCounts },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
