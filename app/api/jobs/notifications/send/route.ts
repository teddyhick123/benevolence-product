// app/api/jobs/notifications/send/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { deliverEmailNotification } from '@/lib/notifications/delivery';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const LOG = '[notifications:send]';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-job-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const dryRun: boolean = body.dry_run ?? false;

  const db = createAdminClient();

  let scanned = 0;
  let sent = 0;
  let suppressed = 0;
  let failed = 0;
  const errors: Array<{ notificationId: string; message: string }> = [];

  try {
    const now = new Date().toISOString();

    const [pendingRes, retryRes] = await Promise.all([
      db
        .from('notification_events')
        .select('id')
        .eq('channel', 'email')
        .eq('status', 'pending')
        .lte('scheduled_for', now)
        .limit(200),
      db
        .from('notification_events')
        .select('id')
        .eq('channel', 'email')
        .eq('status', 'failed')
        .lte('next_attempt_at', now)
        .limit(200),
    ]);

    const ids = [
      ...((pendingRes.data ?? []).map((n: any) => n.id as string)),
      ...((retryRes.data ?? []).map((n: any) => n.id as string)),
    ];

    scanned = ids.length;
    console.log(`${LOG} scanned=${scanned} dry_run=${dryRun}`);

    for (const id of ids) {
      if (dryRun) {
        suppressed++;
        continue;
      }
      const deliveryResult = await deliverEmailNotification(db, id, false);
      if (deliveryResult === 'sent') sent++;
      else if (deliveryResult === 'suppressed') suppressed++;
      else {
        failed++;
        errors.push({ notificationId: id, message: 'delivery failed — see logs' });
      }
    }

    return NextResponse.json({ ok: true, scanned, sent, suppressed, failed, errors });
  } catch (err: any) {
    console.error(`${LOG} fatal:`, err);
    return NextResponse.json({ ok: false, error: err.message, scanned, sent, suppressed, failed, errors }, { status: 500 });
  }
}
