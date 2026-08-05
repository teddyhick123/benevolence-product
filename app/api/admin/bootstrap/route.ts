// app/api/admin/bootstrap/route.ts
// First-run admin bootstrap: promotes the authenticated user to app admin if and
// only if no app admin exists yet. Safe to call repeatedly — idempotent.
import { NextResponse } from 'next/server';
import { isAccessDenied, requireUserAccess } from '@/lib/api/access';

function noStore() {
  return { 'Cache-Control': 'no-store' } as const;
}

export async function POST() {
  const access = await requireUserAccess();
  if (isAccessDenied(access)) return access.response;

  const { data: promoted, error } = await access.context.db.rpc('bootstrap_app_admin');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: noStore() });
  }

  if (!promoted) {
    return NextResponse.json(
      { error: 'An admin already exists. Ask them to promote you via the admin console.' },
      { status: 403, headers: noStore() }
    );
  }

  return NextResponse.json(
    { success: true, promoted_user_id: access.context.user.id },
    { headers: noStore() }
  );
}
