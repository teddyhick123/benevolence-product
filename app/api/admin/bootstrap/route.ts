// app/api/admin/bootstrap/route.ts
// First-run admin bootstrap: promotes the authenticated user to app admin if and
// only if no app admin exists yet. Safe to call repeatedly — idempotent.
import { NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';

function noStore() {
  return { 'Cache-Control': 'no-store' } as const;
}

export async function POST() {
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401, headers: noStore() });
  }

  const admin = createAdminClient();

  // Check whether any app admin already exists
  const { count, error: countErr } = await admin
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('is_app_admin', true);

  if (countErr) {
    return NextResponse.json({ error: countErr.message }, { status: 500, headers: noStore() });
  }

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'An admin already exists. Ask them to promote you via the admin console.' },
      { status: 403, headers: noStore() }
    );
  }

  // No admin yet — promote the current user
  const { error: updateErr } = await admin
    .from('profiles')
    .update({ is_app_admin: true })
    .eq('id', user.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500, headers: noStore() });
  }

  return NextResponse.json({ success: true, promoted_user_id: user.id }, { headers: noStore() });
}
