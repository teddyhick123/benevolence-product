import { NextResponse } from 'next/server';
import { supabasePublic } from '@/lib/supabase';

export async function GET(_: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;
  const sb = await supabasePublic();
  const { data, error } = await sb
    .from('uploads')
    .select('status, updated_at')
    .eq('id', jobId)
    .single();

  if (error) {
    if (String(error.code) === 'PGRST116' || /Results contain 0 rows/.test(error.message)) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: data?.status, updated_at: data?.updated_at });
}