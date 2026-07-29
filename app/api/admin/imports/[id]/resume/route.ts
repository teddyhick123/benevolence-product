// POST /api/admin/imports/[id]/resume
// Resets a review-blocked import job back to processing so the queue picks it up.

import { NextRequest } from 'next/server';
import { requireAppAdmin } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import type { ImportJob } from '@/lib/import/types';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireAppAdmin();
  if (!access.ok) return access.response;

  const { id } = await params;
  const { db } = access.context;

  const { data: job } = await db
    .from('import_jobs')
    .select('status')
    .eq('id', id)
    .single();

  if (!job) {
    return jsonError('Import job not found', 404);
  }

  if (job.status !== 'needs_review') {
    return jsonError(
      `Cannot resume a job with status '${job.status}'. Job must be in needs_review.`,
      422
    );
  }

  const { data: updated, error } = await db
    .from('import_jobs')
    .update({ status: 'processing', error_message: null })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    return jsonError(error.message, 500);
  }

  return jsonOk({ job: updated as ImportJob });
}
