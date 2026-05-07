// app/api/recommendations/comments/[commentId]/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { z } from 'zod';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

const updateCommentSchema = z.object({
  content: z.string().min(1).max(2000),
});

// PUT /api/recommendations/comments/[commentId] - Update a comment
export async function PUT(req: Request, ctx: { params: Promise<{ commentId: string }> }) {
  const { commentId } = await ctx.params;
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

    const validation = updateCommentSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.format(),
        },
        { status: 400, headers: cacheHeaders() }
      );
    }

    // Update comment (RLS ensures user owns it)
    const { data, error } = await supabase
      .from('recommendation_comments')
      .update({
        content: validation.data.content,
        updated_at: new Date().toISOString(),
      })
      .eq('id', commentId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .select(`
        *,
        user:user_id (
          id,
          email
        )
      `)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Comment not found or access denied' },
          { status: 404, headers: cacheHeaders() }
        );
      }
      throw error;
    }

    return NextResponse.json({ data }, { headers: cacheHeaders() });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to update comment' },
      { status: 500, headers: cacheHeaders() }
    );
  }
}

// DELETE /api/recommendations/comments/[commentId] - Soft delete a comment
export async function DELETE(req: Request, ctx: { params: Promise<{ commentId: string }> }) {
  const { commentId } = await ctx.params;
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

    // Soft delete comment (RLS ensures user owns it)
    const { data, error } = await supabase
      .from('recommendation_comments')
      .update({
        deleted_at: new Date().toISOString(),
      })
      .eq('id', commentId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Comment not found or access denied' },
          { status: 404, headers: cacheHeaders() }
        );
      }
      throw error;
    }

    return NextResponse.json(
      { message: 'Comment deleted successfully' },
      { headers: cacheHeaders() }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to delete comment' },
      { status: 500, headers: cacheHeaders() }
    );
  }
}
