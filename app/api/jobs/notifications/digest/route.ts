// app/api/jobs/notifications/digest/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { runDigestForOrg } from '@/lib/notifications/digest';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const LOG = '[notifications:digest]';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-job-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const dryRun: boolean = body.dry_run ?? false;
  const orgIdFilter: string | undefined = body.org_id;
  const periodEnd = body.now ?? new Date().toISOString();
  const periodStart = body.since ?? new Date(new Date(periodEnd).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const db = createAdminClient();

  let totalSent = 0;
  let totalSkipped = 0;
  const allErrors: string[] = [];

  try {
    let query = db.from('organizations').select('id');
    if (orgIdFilter) query = query.eq('id', orgIdFilter);

    const { data: orgs, error: orgsError } = await query;
    if (orgsError) throw orgsError;

    console.log(`${LOG} running for ${orgs?.length ?? 0} orgs dry_run=${dryRun}`);

    for (const org of (orgs ?? []) as Array<{ id: string }>) {
      try {
        const result = await runDigestForOrg(db, org.id, periodStart, periodEnd, dryRun);
        totalSent += result.sent;
        totalSkipped += result.skipped;
        allErrors.push(...result.errors);
      } catch (err: any) {
        allErrors.push(`org ${org.id}: ${err.message}`);
      }
    }

    return NextResponse.json({
      ok: true,
      orgs_processed: orgs?.length ?? 0,
      sent: totalSent,
      skipped: totalSkipped,
      errors: allErrors,
    });
  } catch (err: any) {
    console.error(`${LOG} fatal:`, err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

// Vercel Cron invocation — GET with Authorization: Bearer <CRON_SECRET>
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return POST(new NextRequest(req.url, { method: 'POST', headers: req.headers, body: '{}' }));
}
