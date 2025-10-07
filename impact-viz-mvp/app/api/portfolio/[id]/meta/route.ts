import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const sb = await createSupabaseServerClient();

  const { data, error } = await sb
    .from('portfolios')
    .select('name')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json({ name: data?.name ?? null }, { headers: { 'Cache-Control': 'no-store' } });
}