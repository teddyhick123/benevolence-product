// POST /api/admin/imports/[id]/resume
// Resets a paused import job back to processing so the queue picks it up.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import type { ImportJob } from '@/lib/import/types';

async function requireAdmin(): Promise<string | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: adminRow } = await supabase
    .from('admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  return adminRow ? user.id : null;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAdmin();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: job } = await supabase
    .from('import_jobs')
    .select('status')
    .eq('id', id)
    .single();

  if (!job) {
    return NextResponse.json({ error: 'Import job not found' }, { status: 404 });
  }

  if (job.status !== 'paused') {
    return NextResponse.json(
      { error: `Cannot resume a job with status '${job.status}'` },
      { status: 422 }
    );
  }

  const { data: updated, error } = await supabase
    .from('import_jobs')
    .update({ status: 'processing', pause_reason: null })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ job: updated as ImportJob });
}
