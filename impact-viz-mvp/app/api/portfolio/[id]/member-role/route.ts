// app/api/portfolio/[id]/member-role/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

// GET /api/portfolio/[id]/member-role - Get current user's role for this portfolio
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const supabase = await createSupabaseServerClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ role: null }, { headers: cacheHeaders() });
    }

    const { data, error } = await supabase
      .from('portfolio_members')
      .select('role')
      .eq('portfolio_id', portfolio_id)
      .eq('user_id', user.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ role: null }, { headers: cacheHeaders() });
    }

    return NextResponse.json({ role: data.role }, { headers: cacheHeaders() });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to get member role' },
      { status: 500, headers: cacheHeaders() }
    );
  }
}
