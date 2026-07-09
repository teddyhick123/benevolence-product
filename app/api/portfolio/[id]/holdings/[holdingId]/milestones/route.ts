import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { createMilestoneSchema } from '@/lib/schemas/grant';
import { withMilestoneDisplayStatus } from '@/lib/grants/milestones';

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
 * GET /api/portfolio/[id]/holdings/[holdingId]/milestones
 * Get all milestones for a grant holding
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; holdingId: string }> }
) {
  try {
    const { id: portfolioId, holdingId } = await params;
    const supabase = await getSupabase();

    // Verify holding belongs to portfolio and user has access
    const { data: holding, error: holdingError } = await supabase
      .from('holdings')
      .select('id, name, portfolio_id')
      .eq('id', holdingId)
      .eq('portfolio_id', portfolioId)
      .single();

    if (holdingError || !holding) {
      return json(
        { error: 'Holding not found or access denied' },
        { status: 404 }
      );
    }

    // Find the grant record for this holding
    const { data: grantRecord } = await supabase
      .from('grants')
      .select('id')
      .eq('holding_id', holdingId)
      .maybeSingle();

    if (!grantRecord) {
      return json({
        data: [],
        count: 0,
        message: 'No grant found for this holding',
      });
    }

    // Get milestones ordered by due date (nulls last)
    const { data: milestones, error } = await supabase
      .from('grant_milestones')
      .select('*')
      .eq('grant_id', grantRecord.id)
      .order('due_date', { ascending: true, nullsFirst: false });

    if (error) {
      console.error('Error fetching milestones:', error);
      return json({ error: 'Failed to fetch milestones' }, { status: 500 });
    }

    return json({
      data: (milestones || []).map((milestone: any) => withMilestoneDisplayStatus(milestone)),
      count: milestones?.length || 0,
    });
  } catch (error) {
    console.error('Unexpected error in GET milestones:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/portfolio/[id]/holdings/[holdingId]/milestones
 * Create a new milestone
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; holdingId: string }> }
) {
  try {
    const { id: portfolioId, holdingId } = await params;
    const body = await req.json();
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

    const { data: holding } = await supabase
      .from('holdings')
      .select('id')
      .eq('id', holdingId)
      .eq('portfolio_id', portfolioId)
      .single();

    if (!holding) {
      return json({ error: 'Holding not found' }, { status: 404 });
    }

    // Get the grant record for this holding
    const { data: grantRecord } = await supabase
      .from('grants')
      .select('id')
      .eq('holding_id', holdingId)
      .single();

    if (!grantRecord) {
      return json(
        { error: 'Grant not found for this holding. Create a grant first.' },
        { status: 404 }
      );
    }

    // Validate request body
    const validated = createMilestoneSchema.parse({
      ...body,
      grant_id: grantRecord.id, // Ensure grant_id matches the holding's grant
    });

    const completedDate = validated.status === 'completed'
      ? validated.completed_date ?? new Date().toISOString().slice(0, 10)
      : validated.completed_date ?? null;

    // Insert milestone
    const { data: milestone, error } = await supabase
      .from('grant_milestones')
      .insert({
        grant_id: validated.grant_id,
        milestone_name: validated.milestone_name,
        description: validated.description ?? null,
        due_date: validated.due_date ?? null,
        completed_date: completedDate,
        status: validated.status,
        notes: validated.notes ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating milestone:', error);
      return json({ error: 'Failed to create milestone' }, { status: 500 });
    }

    return json({ data: withMilestoneDisplayStatus(milestone) }, { status: 201 });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Unexpected error in POST milestone:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
