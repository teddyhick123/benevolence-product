// app/api/jobs/tasks/generate/route.ts
import { NextRequest } from 'next/server';
import { isAccessDenied, requireJobAccess } from '@/lib/api/access';
import { createTaskJobRepository } from '@/lib/api/repositories/task-jobs';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { PRODUCER_IDS } from '@/lib/tasks/automation/run';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const access = requireJobAccess(req, 'tasks');
  if (isAccessDenied(access)) return access.response;

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
    return jsonError(
      `Unknown producer: ${producer}. Valid: ${PRODUCER_IDS.join(', ')}`,
      400
    );
  }

  const result = await createTaskJobRepository(access.context).generate({
    producer,
    orgId: org_id,
    sourceType: source_type,
    sourceId: source_id,
    dryRun: dry_run,
    now: nowStr,
  });

  if (!result.ok) {
    return jsonError(
      result.error,
      result.status,
      'run_id' in result ? { run_id: result.run_id } : undefined
    );
  }
  return jsonOk({ ok: true, run_id: result.run_id, results: result.results });
}

// Vercel Cron invocation — GET with Authorization: Bearer <CRON_SECRET>
export async function GET(req: NextRequest) {
  return POST(req);
}
