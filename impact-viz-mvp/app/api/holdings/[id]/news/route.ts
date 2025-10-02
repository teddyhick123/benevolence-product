import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

async function getSupabase() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: (name: string, value: string, options: any) => {
          try {
            cookieStore.set(name, value, options);
          } catch (error) {
            // Ignore errors in Server Components
          }
        },
        remove: (name: string, options: any) => {
          try {
            cookieStore.set(name, '', options);
          } catch (error) {
            // Ignore errors in Server Components
          }
        },
      },
    }
  );
  return supabase;
}

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
