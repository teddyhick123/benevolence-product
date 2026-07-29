// app/api/admin/imports/[id]/progress/route.ts
// GET /api/admin/imports/:id/progress
// Returns an SSE stream of ProgressEvent objects for a live import job

import { ImportProgressEmitter } from '@/lib/import/progress-emitter';
import { requireAppAdmin } from '@/lib/api/access';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireAppAdmin();
  if (!access.ok) return access.response;

  const { id } = await params;
  const stream = ImportProgressEmitter.subscribe(id);

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
