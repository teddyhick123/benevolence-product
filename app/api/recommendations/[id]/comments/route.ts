// app/api/recommendations/[id]/comments/route.ts
import { NextResponse } from 'next/server';
import { isAccessDenied, requireRecommendationAccess } from '@/lib/api/access';
import { z } from 'zod';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

const createCommentSchema = z.object({
  content: z.string().min(1).max(2000),
  parent_comment_id: z.string().uuid().optional().nullable(),
});

// GET /api/recommendations/[id]/comments - Fetch all comments for a recommendation
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: recommendation_id } = await ctx.params;
  const access = await requireRecommendationAccess(recommendation_id);
  if (isAccessDenied(access)) return access.response;
  const supabase = access.context.db;

  try {
    // Fetch comments with user information
    const { data, error } = await supabase
      .from('recommendation_comments')
      .select(`
        *,
        user:user_id (
          id,
          email
        )
      `)
      .eq('recommendation_id', recommendation_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Organize comments into threads
    const comments = data || [];
    const commentMap = new Map();
    const rootComments: any[] = [];

    // First pass: create map of all comments
    comments.forEach(comment => {
      commentMap.set(comment.id, { ...comment, replies: [] });
    });

    // Second pass: organize into threads
    comments.forEach(comment => {
      const commentWithReplies = commentMap.get(comment.id);
      if (comment.parent_comment_id) {
        const parent = commentMap.get(comment.parent_comment_id);
        if (parent) {
          parent.replies.push(commentWithReplies);
        }
      } else {
        rootComments.push(commentWithReplies);
      }
    });

    return NextResponse.json({
      data: rootComments,
      total: comments.length
    }, { headers: cacheHeaders() });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch comments' },
      { status: 500, headers: cacheHeaders() }
    );
  }
}

// POST /api/recommendations/[id]/comments - Create a new comment
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: recommendation_id } = await ctx.params;
  const access = await requireRecommendationAccess(recommendation_id, 'member');
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

    const validation = createCommentSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.format(),
        },
        { status: 400, headers: cacheHeaders() }
      );
    }

    const { content, parent_comment_id } = validation.data;

    // Verify the recommendation remains active before accepting comments.
    const { data: rec } = await supabase
      .from('portfolio_recommendations')
      .select('portfolio_id')
      .eq('id', recommendation_id)
      .eq('status', 'active')
      .single();

    if (!rec) {
      return NextResponse.json(
        { error: 'Recommendation not found' },
        { status: 404, headers: cacheHeaders() }
      );
    }

    // If replying to a comment, verify parent exists
    if (parent_comment_id) {
      const { data: parentComment } = await supabase
        .from('recommendation_comments')
        .select('id')
        .eq('id', parent_comment_id)
        .eq('recommendation_id', recommendation_id)
        .is('deleted_at', null)
        .single();

      if (!parentComment) {
        return NextResponse.json(
          { error: 'Parent comment not found' },
          { status: 404, headers: cacheHeaders() }
        );
      }
    }

    // Create comment
    const { data, error } = await supabase
      .from('recommendation_comments')
      .insert({
        recommendation_id,
        user_id: access.context.user.id,
        content,
        parent_comment_id: parent_comment_id || null,
      })
      .select(`
        *,
        user:user_id (
          id,
          email
        )
      `)
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201, headers: cacheHeaders() });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to create comment' },
      { status: 500, headers: cacheHeaders() }
    );
  }
}
