import { NextResponse } from 'next/server';
import { isAccessDenied, requireAppAdmin } from '@/lib/api/access';

export async function GET(_: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const access = await requireAppAdmin();
  if (isAccessDenied(access)) return access.response;

  const { jobId } = await ctx.params;
  const sb = access.context.db;
  const { data, error } = await sb
    .from('uploads')
    .select('status, updated_at')
    .eq('id', jobId)
    .single();

  if (error) {
    if (String(error.code) === 'PGRST116' || /Results contain 0 rows/.test(error.message)) {
      return NextResponse.json(
        { error: 'Upload not found' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    { status: data?.status, updated_at: data?.updated_at },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
