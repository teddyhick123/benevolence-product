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

    // The repository RPC applies the milestone patch, generated-task state,
    // and task events in one database transaction.
    const milestone = await createGrantRepository({
      orgId: access.context.orgId,
      actorId: access.context.user.id,
    }).updateMilestoneWithTaskSync({
      portfolioId,
      holdingId,
      milestoneId,
      patch: validated,
    });

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
