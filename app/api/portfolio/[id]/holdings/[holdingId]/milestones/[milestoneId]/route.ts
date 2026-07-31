import { NextRequest } from 'next/server';
import { isAccessDenied, requirePortfolioAccess } from '@/lib/api/access';
import { createGrantRepository } from '@/lib/api/repositories/grants';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { updateMilestoneSchema } from '@/lib/schemas/grant';
import { withMilestoneDisplayStatus } from '@/lib/grants/milestones';

/**
 * PATCH /api/portfolio/[id]/holdings/[holdingId]/milestones/[milestoneId]
 * Update an existing milestone
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; holdingId: string; milestoneId: string }> }
) {
  const { id: portfolioId, holdingId, milestoneId } = await params;
  const access = await requirePortfolioAccess(portfolioId, 'member');
  if (isAccessDenied(access)) return access.response;

  try {
    const body = await req.json();
    const supabase = access.context.db;

    // Validate request body
    const validated = updateMilestoneSchema.parse(body);

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
      return jsonError('Milestone not found', 404);
    }

    // Verify the milestone belongs to the specified holding
    const grantDetails = existingMilestone.grants as any;
    if (grantDetails.holding_id !== holdingId || grantDetails.portfolio_id !== portfolioId) {
      return jsonError('Milestone does not belong to this holding', 403);
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
      return jsonError('Failed to update milestone', 500);
    }

    const newStatus = validated.status;
    if (newStatus === 'completed' || newStatus === 'cancelled') {
      await createGrantRepository({
        orgId: access.context.orgId,
        actorId: access.context.user.id,
      }).syncMilestoneTasks({ milestoneId, status: newStatus });
    }

    return jsonOk({ data: withMilestoneDisplayStatus(milestone) });
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
      const details = 'errors' in error ? error.errors : undefined;
      return jsonError('Validation error', 400, { details });
    }
    console.error('Unexpected error in PATCH milestone:', error);
    return jsonError('Internal server error', 500);
  }
}

/**
 * DELETE /api/portfolio/[id]/holdings/[holdingId]/milestones/[milestoneId]
 * Delete a milestone
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; holdingId: string; milestoneId: string }> }
) {
  const { id: portfolioId, holdingId, milestoneId } = await params;
  const access = await requirePortfolioAccess(portfolioId, 'member');
  if (isAccessDenied(access)) return access.response;

  try {
    const supabase = access.context.db;

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
      return jsonError('Milestone not found', 404);
    }

    // Verify the milestone belongs to the specified holding
    const grantDetails = existingMilestone.grants as any;
    if (grantDetails.holding_id !== holdingId || grantDetails.portfolio_id !== portfolioId) {
      return jsonError('Milestone does not belong to this holding', 403);
    }

    // Delete milestone
    const { error } = await supabase
      .from('grant_milestones')
      .delete()
      .eq('id', milestoneId);

    if (error) {
      console.error('Error deleting milestone:', error);
      return jsonError('Failed to delete milestone', 500);
    }

    return jsonOk({ success: true, message: 'Milestone deleted' });
  } catch (error) {
    console.error('Unexpected error in DELETE milestone:', error);
    return jsonError('Internal server error', 500);
  }
}
