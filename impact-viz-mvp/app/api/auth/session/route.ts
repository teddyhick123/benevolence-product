// app/api/auth/session/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const access_token  = body?.access_token  ?? body?.accessToken;
  const refresh_token = body?.refresh_token ?? body?.refreshToken;

  if (!access_token || !refresh_token) {
    return NextResponse.json({ error: 'Missing tokens' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) {
    // Suppress "Already Used" errors as they're expected when tokens are refreshed
    if (error.message?.includes('Already Used')) {
      return NextResponse.json({ ok: true, warning: 'Token already refreshed' }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}