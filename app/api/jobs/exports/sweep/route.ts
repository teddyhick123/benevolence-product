// app/api/jobs/exports/sweep/route.ts
// Deletes export archives past their retention window.
//
// Without this, expires_at is a column rather than a promise: the platform
// would hold a complete copy of every client's data indefinitely, which is the
// opposite of what the export exists to demonstrate.

import { NextRequest } from 'next/server';
import { isAccessDenied, requireJobAccess } from '@/lib/api/access';
import { createElevatedClient } from '@/lib/api/admin-client';
import { createOrgExportRepository } from '@/lib/api/repositories/org-exports';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const access = requireJobAccess(req, 'exports');
  if (isAccessDenied(access)) return access.response;

  const db = createElevatedClient();
  const repo = createOrgExportRepository(db);

  try {
    const due = await repo.expiredRuns(new Date().toISOString());
    let expired = 0;
    let failed = 0;

    for (const run of due) {
      if (run.storage_path) {
        const { error } = await db.storage.from('org-exports').remove([run.storage_path]);
        // A row is marked expired only once its object is actually gone, so a
        // storage failure leaves the run visibly unswept rather than silently
        // claiming a deletion that did not happen.
        if (error) {
          failed += 1;
          continue;
        }
      }
      await repo.markExpired(run.id);
      expired += 1;
    }

    return jsonOk({ expired, failed });
  } catch {
    return jsonError('Export retention sweep failed', 502);
  }
}
