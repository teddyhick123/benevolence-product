// app/api/admin/is_admin/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';

export async function GET() {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ is_admin: false }, { headers: { 'Cache-Control': 'no-store' } });

  const { data: isAdmin } = await supabase.rpc('is_app_admin');
  return NextResponse.json({ is_admin: !!isAdmin }, { headers: { 'Cache-Control': 'no-store' } });
}