import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/admin-auth';

export const runtime = 'nodejs';

function supabaseService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!,
    { auth: { persistSession: false } }
  );
}

/**
 * Approve a staged fact - copies it to metric_facts and marks as approved
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ factId: string }> }
) {
  const userId = await requireAdmin();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { factId } = await params;

    if (!factId) {
      return NextResponse.json({ error: 'factId required' }, { status: 400 });
    }

    const sb = supabaseService();

    // 1. Get the staged fact
    const { data: stagedFact, error: fetchError } = await sb
      .from('staging_metric_facts')
      .select('*')
      .eq('id', factId)
      .single();

    if (fetchError || !stagedFact) {
      return NextResponse.json({ error: 'Staged fact not found' }, { status: 404 });
    }

    // 2. Insert into metric_facts (the canonical table)
    const { error: insertError } = await sb
      .from('metric_facts')
      .insert({
        investee_id: stagedFact.investee_id,
        holding_id: stagedFact.holding_id,
        metric_code: stagedFact.metric_code,
        period_start: stagedFact.period_start,
        period_end: stagedFact.period_end,
        value: stagedFact.value,
        source: stagedFact.source,
        verification_level: stagedFact.verification_level,
        data_quality_score: stagedFact.data_quality_score,
        unit: stagedFact.unit,
      });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // 3. Mark staged fact as approved
    const { error: updateError } = await sb
      .from('staging_metric_facts')
      .update({
        approved: true,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', factId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message || 'Failed to approve fact',
    }, { status: 500 });
  }
}
