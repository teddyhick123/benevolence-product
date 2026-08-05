// app/api/recommendations/[id]/status/route.ts
import { NextResponse } from 'next/server';
import { isAccessDenied, requireRecommendationAccess } from '@/lib/api/access';
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
  const access = await requireRecommendationAccess(id);
  if (isAccessDenied(access)) return access.response;
  const supabase = access.context.db;

  try {
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
  const access = await requireRecommendationAccess(id, 'member');
  if (isAccessDenied(access)) return access.response;
  const supabase = access.context.db;

  try {
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

    const { data, error } = await supabase
      .rpc('update_recommendation_interaction_status', {
        p_recommendation_id: id,
        p_status: newStatus,
        p_notes: notes?.trim() || null,
      });

    if (error) {
      const message = error.message || '';
      if (message.includes('Recommendation not found')) {
        return NextResponse.json(
          { error: 'Recommendation not found' },
          { status: 404, headers: cacheHeaders() }
        );
      }
      if (message.includes('Access denied')) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403, headers: cacheHeaders() }
        );
      }
      throw error;
    }

    return NextResponse.json({ data }, { headers: cacheHeaders() });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to update status' },
      { status: 500, headers: cacheHeaders() }
    );
  }
}
