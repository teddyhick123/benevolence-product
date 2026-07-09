import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createAdminClient } from '@/lib/supabase';
import { updateMilestoneSchema } from '@/lib/schemas/grant';
import { withMilestoneDisplayStatus } from '@/lib/grants/milestones';
import { completeGeneratedTasks, cancelGeneratedTasks } from '@/lib/tasks/automation/task-writer';

const getSupabase = createSupabaseServerClient;

function json(body: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...init?.headers,
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * PATCH /api/portfolio/[id]/holdings/[holdingId]/milestones/[milestoneId]
 * Update an existing milestone
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; holdingId: string; milestoneId: string }> }
) {
  try {
    const { id: portfolioId, holdingId, milestoneId } = await params;
    const body = await req.json();
    const supabase = await getSupabase();

    // Validate request body
    const validated = updateMilestoneSchema.parse(body);

    // Verify holding belongs to portfolio and user can edit
    const { data: canEdit, error: canEditErr } = await supabase.rpc('can_edit_portfolio', {
      p_portfolio_id: portfolioId,
    });

    if (canEditErr || !canEdit) {
      return json(
        { error: 'Permission denied: cannot edit this portfolio' },
        { status: 403 }
      );
    }

    // Verify milestone exists and belongs to this holding's grant
    const { data: existingMilestone, error: fetchError } = await supabase
      .from('grant_milestones')
      .select(`
        id,
        grant_id,
        grants!inner(holding_id, portfolio_id)
      `)
      .eq('id', milestoneId)
      .single();

    if (fetchError || !existingMilestone) {
      return json(
        { error: 'Milestone not found' },
        { status: 404 }
      );
    }

    // Verify the milestone belongs to the specified holding
    const grantDetails = existingMilestone.grants as any;
    if (grantDetails.holding_id !== holdingId || grantDetails.portfolio_id !== portfolioId) {
      return json(
        { error: 'Milestone does not belong to this holding' },
        { status: 403 }
      );
    }

    // Update milestone
    const updateData: any = {};
    if (validated.milestone_name !== undefined) updateData.milestone_name = validated.milestone_name;
    if (validated.description !== undefined) updateData.description = validated.description;
    if (validated.due_date !== undefined) updateData.due_date = validated.due_date;
    if (validated.completed_date !== undefined) updateData.completed_date = validated.completed_date;
    if (validated.status !== undefined) updateData.status = validated.status;
    if (validated.notes !== undefined) updateData.notes = validated.notes;
    if (validated.status === 'completed' && updateData.completed_date === undefined) {
      updateData.completed_date = new Date().toISOString().slice(0, 10);
    }
    updateData.updated_at = new Date().toISOString();

    const { data: milestone, error } = await supabase
      .from('grant_milestones')
      .update(updateData)
      .eq('id', milestoneId)
      .select()
      .single();

    if (error) {
      console.error('Error updating milestone:', error);
      return json({ error: 'Failed to update milestone' }, { status: 500 });
    }

    const newStatus = validated.status;
    if (newStatus === 'completed' || newStatus === 'cancelled') {
      const adminDb = createAdminClient();
      const { data: portfolio, error: portfolioError } = await adminDb
        .from('portfolios')
        .select('org_id')
        .eq('id', portfolioId)
        .single();
      if (portfolioError) throw portfolioError;
      if (portfolio?.org_id) {
        if (newStatus === 'completed') {
          await completeGeneratedTasks(
            adminDb,
            portfolio.org_id,
            `grant_milestone:${milestoneId}:`,
            'Milestone marked completed'
          );
        } else {
          await cancelGeneratedTasks(
            adminDb,
            portfolio.org_id,
            `grant_milestone:${milestoneId}:`,
            'Milestone cancelled'
          );
        }
      }
    }

    return json({ data: withMilestoneDisplayStatus(milestone) });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Unexpected error in PATCH milestone:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/portfolio/[id]/holdings/[holdingId]/milestones/[milestoneId]
 * Delete a milestone
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; holdingId: string; milestoneId: string }> }
) {
  try {
    const { id: portfolioId, holdingId, milestoneId } = await params;
    const supabase = await getSupabase();

    // Verify holding belongs to portfolio and user can edit
    const { data: canEdit, error: canEditErr } = await supabase.rpc('can_edit_portfolio', {
      p_portfolio_id: portfolioId,
    });

    if (canEditErr || !canEdit) {
      return json(
        { error: 'Permission denied: cannot edit this portfolio' },
        { status: 403 }
      );
    }

    // Verify milestone exists and belongs to this holding's grant
    const { data: existingMilestone, error: fetchError } = await supabase
      .from('grant_milestones')
      .select(`
        id,
        grant_id,
        grants!inner(holding_id, portfolio_id)
      `)
      .eq('id', milestoneId)
      .single();

    if (fetchError || !existingMilestone) {
      return json(
        { error: 'Milestone not found' },
        { status: 404 }
      );
    }

    // Verify the milestone belongs to the specified holding
    const grantDetails = existingMilestone.grants as any;
    if (grantDetails.holding_id !== holdingId || grantDetails.portfolio_id !== portfolioId) {
      return json(
        { error: 'Milestone does not belong to this holding' },
        { status: 403 }
      );
    }

    // Delete milestone
    const { error } = await supabase
      .from('grant_milestones')
      .delete()
      .eq('id', milestoneId);

    if (error) {
      console.error('Error deleting milestone:', error);
      return json({ error: 'Failed to delete milestone' }, { status: 500 });
    }

    return json({ success: true, message: 'Milestone deleted' });
  } catch (error) {
    console.error('Unexpected error in DELETE milestone:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
