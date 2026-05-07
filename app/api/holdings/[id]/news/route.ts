import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';

const getSupabase = createSupabaseServerClient;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: holdingId } = await params;
  const supabase = await getSupabase();

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
    { headers: { 'Cache-Control': 's-maxage=900, stale-while-revalidate=1800' } } // Cache 15 min
  );
}
