import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';

const getSupabase = createSupabaseServerClient;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: holdingId } = await params;
  const supabase = await getSupabase();

  const { data: holding, error: holdingError } = await supabase
    .from('holdings')
    .select('portfolio_id')
    .eq('id', holdingId)
    .single();

  if (holdingError || !holding) {
    return NextResponse.json(
      { error: 'Holding not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const { data: canView, error: canViewErr } = await supabase.rpc('can_view_portfolio', {
    p_portfolio_id: holding.portfolio_id,
  });

  if (canViewErr || !canView) {
    return NextResponse.json(
      { error: 'not authorized' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // Fetch news articles for this holding
  const { data, error } = await supabase
    .from('news_articles')
    .select('*')
    .eq('holding_id', holdingId)
    .order('published_at', { ascending: false })
    .limit(10);

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
