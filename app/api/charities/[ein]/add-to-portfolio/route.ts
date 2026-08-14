import { NextResponse } from 'next/server';
import { getRequestDatabase } from '@/lib/api/server-client';

// POST /api/charities/[ein]/add-to-portfolio
// Body: { portfolio_id, notes?, min_investment?, max_investment? }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ ein: string }> }
) {
  const sb = await getRequestDatabase();
  const { ein } = await params;

  try {
    const body = await req.json();
    const { portfolio_id, notes, min_investment, max_investment } = body;

    if (!portfolio_id) {
      return NextResponse.json(
        { error: 'portfolio_id is required' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const { data: canModify, error: permErr } = await sb.rpc('can_edit_portfolio', {
      p_portfolio_id: portfolio_id,
    });
    if (permErr || !canModify) {
      return NextResponse.json(
        { error: 'Not authorized to modify this portfolio' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Verify charity exists
    const { data: charity } = await sb
      .from('charities')
      .select('ein')
      .eq('ein', ein)
      .eq('is_active', true)
      .maybeSingle();

    if (!charity) {
      return NextResponse.json(
        { error: 'Charity not found' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Check if already in portfolio
    const { data: existing } = await sb
      .from('portfolio_charities')
      .select('id, status')
      .eq('portfolio_id', portfolio_id)
      .eq('charity_ein', ein)
      .maybeSingle();

    if (existing) {
      if (existing.status === 'archived') {
        const { data: updated, error: updateErr } = await sb
          .from('portfolio_charities')
          .update({ status: 'active', notes, min_investment, max_investment })
          .eq('id', existing.id)
          .select()
          .single();

        if (updateErr) {
          return NextResponse.json(
            { error: 'Failed to reactivate charity in portfolio' },
            { status: 500, headers: { 'Cache-Control': 'no-store' } }
          );
        }
        return NextResponse.json(
          { data: updated, message: 'Charity reactivated in portfolio' },
          { status: 200, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      return NextResponse.json(
        { error: 'Charity already in portfolio', entry_id: existing.id },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const { data: entry, error: createErr } = await sb
      .from('portfolio_charities')
      .insert({
        portfolio_id,
        charity_ein: ein,
        added_by: user.id,
        notes,
        min_investment,
        max_investment,
        status: 'active',
      })
      .select()
      .single();

    if (createErr) {
      return NextResponse.json(
        { error: 'Failed to add charity to portfolio' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return NextResponse.json(
      { data: entry, message: 'Charity added to portfolio successfully' },
      { status: 201, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
