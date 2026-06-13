// app/api/jobs/notifications/fanout/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { fanOutTaskEvent } from '@/lib/notifications/fanout';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const LOG = '[notifications:fanout]';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-job-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const dryRun: boolean = body.dry_run ?? false;
  const nowOverride: string | undefined = body.now;
  const taskEventIdFilter: string | undefined = body.task_event_id;

  const until = nowOverride ? new Date(nowOverride) : new Date();
  const since = body.since ? new Date(body.since) : new Date(until.getTime() - 24 * 60 * 60 * 1000);

  const db = createAdminClient();

  let scanned = 0;
  let created = 0;
  let suppressed = 0;
  const errors: Array<{ taskEventId: string; message: string }> = [];

  try {
    let query = db
      .from('task_events')
      .select('id')
      .gte('created_at', since.toISOString())
      .lte('created_at', until.toISOString());

    if (taskEventIdFilter) {
      query = query.eq('id', taskEventIdFilter);
    }

    const { data: events, error: fetchError } = await query;
    if (fetchError) throw fetchError;

    const eventIds = (events ?? []).map((e: any) => e.id as string);
    scanned = eventIds.length;

    if (eventIds.length === 0) {
      return NextResponse.json({ ok: true, scanned, created, suppressed, errors });
    }

    const { data: alreadyFanedOut } = await db
      .from('notification_events')
      .select('task_event_id')
      .in('task_event_id', eventIds);

    const alreadyDone = new Set((alreadyFanedOut ?? []).map((n: any) => n.task_event_id as string));
    const pending = eventIds.filter(id => !alreadyDone.has(id));

    console.log(`${LOG} scanned=${scanned} pending=${pending.length} dry_run=${dryRun}`);

    for (const evId of pending) {
      if (dryRun) {
        suppressed++;
        continue;
      }
      const result = await fanOutTaskEvent(db, { taskEventId: evId, now: nowOverride });
      created += result.created;
      suppressed += result.suppressed;
      if (result.error) {
        errors.push({ taskEventId: evId, message: result.error });
      }
    }

    return NextResponse.json({ ok: true, scanned, created, suppressed, errors });
  } catch (err: any) {
    console.error(`${LOG} fatal:`, err);
    return NextResponse.json({ ok: false, error: err.message, scanned, created, suppressed, errors }, { status: 500 });
  }
}

// Vercel Cron invocation — GET with Authorization: Bearer <CRON_SECRET>
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const fwdHeaders = new Headers(req.headers);
  fwdHeaders.set('x-job-secret', token);
  return POST(new NextRequest(req.url, { method: 'POST', headers: fwdHeaders, body: '{}' }));
}
