import { NextResponse } from 'next/server';
import { isAccessDenied, requireAppAdmin } from '@/lib/api/access';

/**
 * GET /api/metrics
 * Returns all available metrics from the metrics table
 * Used by admin KPI management to populate metric selection dropdown
 */
export async function GET() {
  const access = await requireAppAdmin();
  if (isAccessDenied(access)) return access.response;
  const supabase = access.context.db;

  const { data, error } = await supabase
    .from('metrics')
    .select('code, name, unit')
    .order('code', { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    { data: data || [] },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
