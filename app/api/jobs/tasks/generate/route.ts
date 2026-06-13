// app/api/jobs/tasks/generate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { runProducers, PRODUCER_IDS } from '@/lib/tasks/automation/run';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get('x-job-secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    producer?: string;
    org_id?: string;
    source_type?: string;
    source_id?: string;
    dry_run?: boolean;
    now?: string;
  };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const { producer, org_id, source_type, source_id, dry_run = false, now: nowStr } = body;

  if (producer && !PRODUCER_IDS.includes(producer)) {
    return NextResponse.json(
      { error: `Unknown producer: ${producer}. Valid: ${PRODUCER_IDS.join(', ')}` },
      { status: 400 }
    );
  }

  const now = nowStr ? new Date(nowStr) : new Date();
  const db = createAdminClient();
  const runId = crypto.randomUUID();

  // Advisory lock (best-effort; primary gate is status check below)
  await db.rpc('try_task_automation_lock', {
    lock_key: `task_automation:${producer ?? 'all'}:${org_id ?? 'all'}`,
  });

  // Concurrent run check
  let inflightQuery = db
    .from('task_automation_runs')
    .select('id')
    .eq('status', 'running')
    .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString());
  if (producer) inflightQuery = (inflightQuery as any).eq('producer', producer);
  if (org_id) inflightQuery = (inflightQuery as any).eq('org_id', org_id);
  const { data: inflightRun } = await (inflightQuery as any).maybeSingle();

  if (inflightRun) {
    return NextResponse.json(
      { error: 'Concurrent run in progress', run_id: inflightRun.id },
      { status: 409 }
    );
  }

  if (!dry_run) {
    await db.from('task_automation_runs').insert({
      id: runId,
      producer: producer ?? null,
      org_id: org_id ?? null,
      dry_run: false,
      status: 'running',
    });
  }

  try {
    const results = await runProducers({
      producerId: producer,
      orgId: org_id,
      sourceType: source_type,
      sourceId: source_id,
      dryRun: dry_run,
      now,
    });

    const totals = results.reduce(
      (acc, r) => ({
        scanned: acc.scanned + r.scanned,
        created: acc.created + r.created,
        updated: acc.updated + r.updated,
        completed: acc.completed + r.completed,
        skipped: acc.skipped + r.skipped,
        errors: acc.errors + r.errors.length,
      }),
      { scanned: 0, created: 0, updated: 0, completed: 0, skipped: 0, errors: 0 }
    );

    if (!dry_run) {
      await db
        .from('task_automation_runs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          scanned: totals.scanned,
          created_count: totals.created,
          updated_count: totals.updated,
          completed_count: totals.completed,
          skipped_count: totals.skipped,
          error_count: totals.errors,
          metadata: { results },
        })
        .eq('id', runId);
    }

    return NextResponse.json({ ok: true, run_id: dry_run ? null : runId, results });
  } catch (err: any) {
    if (!dry_run) {
      await db
        .from('task_automation_runs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          metadata: { error: err.message },
        })
        .eq('id', runId);
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Vercel Cron invocation — GET with Authorization: Bearer <CRON_SECRET>
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Delegate to POST with an empty body — runs all producers for all orgs
  return POST(new NextRequest(req.url, { method: 'POST', headers: req.headers, body: '{}' }));
}
