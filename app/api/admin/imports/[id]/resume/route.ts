// POST /api/admin/imports/[id]/resume
// Resets a review-blocked import job back to processing so the queue picks it up.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import type { ImportJob } from '@/lib/import/types';
import { requireAdmin } from '@/lib/admin-auth';

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

  if (job.status !== 'needs_review') {
    return NextResponse.json(
      { error: `Cannot resume a job with status '${job.status}'. Job must be in needs_review.` },
      { status: 422 }
    );
  }

  const { data: updated, error } = await supabase
    .from('import_jobs')
    .update({ status: 'processing', error_message: null })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ job: updated as ImportJob });
}
