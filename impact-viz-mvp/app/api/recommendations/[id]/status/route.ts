// app/api/recommendations/[id]/status/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { z } from 'zod';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

const updateStatusSchema = z.object({
  status: z.enum([
    'new',
    'reviewing',
    'interested',
    'contacted',
    'meeting_scheduled',
    'in_discussion',
    'approved',
    'declined',
    'donated',
  ]),
  notes: z.string().max(500).optional(),
});

// GET /api/recommendations/[id]/status - Get status history
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();

  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: cacheHeaders() }
      );
    }

    // Fetch status history with user information
    const { data, error } = await supabase
      .from('recommendation_status_history')
      .select(`
        *,
        user:user_id (
          id,
          email
        )
      `)
      .eq('recommendation_id', id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ data: data || [] }, { headers: cacheHeaders() });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch status history' },
      { status: 500, headers: cacheHeaders() }
    );
  }
}

// PUT /api/recommendations/[id]/status - Update recommendation status
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();

  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: cacheHeaders() }
      );
    }

    // Parse and validate request body
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400, headers: cacheHeaders() }
      );
    }

    const validation = updateStatusSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.format(),
        },
        { status: 400, headers: cacheHeaders() }
      );
    }

    const { status: newStatus, notes } = validation.data;

    // Get the recommendation to check access
    const { data: rec, error: recError } = await supabase
      .from('portfolio_recommendations')
      .select('id, portfolio_id, interaction_status')
      .eq('id', id)
      .eq('status', 'active')
      .single();

    if (recError || !rec) {
      return NextResponse.json(
        { error: 'Recommendation not found' },
        { status: 404, headers: cacheHeaders() }
      );
    }

    // Verify user is a portfolio member
    const { data: member } = await supabase
      .from('portfolio_members')
      .select('user_id')
      .eq('portfolio_id', rec.portfolio_id)
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403, headers: cacheHeaders() }
      );
    }

    // Update the status
    const { data, error } = await supabase
      .from('portfolio_recommendations')
      .update({
        interaction_status: newStatus,
        status_updated_at: new Date().toISOString(),
        status_updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // If notes provided, add them to the most recent history entry
    if (notes && notes.trim()) {
      // Get the most recent history entry (created by trigger)
      const { data: latestHistory } = await supabase
        .from('recommendation_status_history')
        .select('id')
        .eq('recommendation_id', id)
        .eq('new_status', newStatus)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (latestHistory) {
        await supabase
          .from('recommendation_status_history')
          .update({ notes })
          .eq('id', latestHistory.id);
      }
    }

    return NextResponse.json({ data }, { headers: cacheHeaders() });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to update status' },
      { status: 500, headers: cacheHeaders() }
    );
  }
}
