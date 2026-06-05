import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import {
  LIFECYCLE_STAGES,
  type LifecycleStage,
  type DecisionPayload,
  canTransition,
  requiresDecision,
  transitionGrant,
} from '@/lib/grants/lifecycle';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = new Set(['owner', 'admin']);

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

const decisionSchema = z.object({
  decision_type: z.enum(['approval', 'decline', 'defer', 'renewal', 'closeout', 'payment_release']),
  decision: z.enum(['approved', 'declined', 'deferred', 'conditional', 'not_applicable']),
  rationale: z.string().max(5000).optional(),
  decision_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  board_meeting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amount: z.number().finite().nonnegative().optional(),
  conditions: z.string().max(5000).optional(),
}).strict();

const transitionItemSchema = z.object({
  grantId: z.string().uuid(),
  expectedFromStage: z.enum([...LIFECYCLE_STAGES] as [string, ...string[]]),
  targetStage: z.enum([...LIFECYCLE_STAGES] as [string, ...string[]]),
  reason: z.string().max(1000).optional(),
  decision: decisionSchema.optional(),
}).strict();

const bulkTransitionSchema = z.object({
  transitions: z.array(transitionItemSchema).min(1).max(50),
}).strict();

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role || !ADMIN_ROLES.has(role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = bulkTransitionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const { transitions } = parsed.data;

    // Reject duplicate grantIds
    const grantIds = transitions.map(t => t.grantId);
    const uniqueIds = new Set(grantIds);
    if (uniqueIds.size !== grantIds.length) {
      return NextResponse.json({ error: 'Duplicate grantId values in request' }, { status: 400 });
    }

    // Preflight: fetch all requested grants scoped to this org in one query
    const adminSupabase = createAdminClient();
    const { data: scopedGrants, error: prefetchErr } = await adminSupabase
      .from('grants')
      .select('id, lifecycle_stage, org_id')
      .eq('org_id', orgId)
      .in('id', grantIds);

    if (prefetchErr) {
      return NextResponse.json({ error: 'Failed to fetch grants' }, { status: 500 });
    }

    const grantMap = new Map<string, { lifecycle_stage: string; org_id: string }>();
    for (const g of scopedGrants ?? []) {
      grantMap.set(g.id, g);
    }

    // Process each transition
    const results: Array<{
      grantId: string;
      fromStage?: LifecycleStage;
      targetStage?: LifecycleStage;
      success: boolean;
      error?: string;
    }> = [];

    for (const item of transitions) {
      const dbGrant = grantMap.get(item.grantId);

      if (!dbGrant) {
        results.push({ grantId: item.grantId, success: false, error: 'Grant not found in organization' });
        continue;
      }

      if (dbGrant.lifecycle_stage !== item.expectedFromStage) {
        results.push({
          grantId: item.grantId,
          success: false,
          error: `Stage has changed: expected ${item.expectedFromStage}, current is ${dbGrant.lifecycle_stage}`,
        });
        continue;
      }

      if (!canTransition(item.expectedFromStage as LifecycleStage, item.targetStage as LifecycleStage)) {
        results.push({
          grantId: item.grantId,
          success: false,
          error: `Invalid transition: ${item.expectedFromStage} → ${item.targetStage}`,
        });
        continue;
      }

      if (requiresDecision(item.expectedFromStage as LifecycleStage, item.targetStage as LifecycleStage) && !item.decision) {
        results.push({
          grantId: item.grantId,
          success: false,
          error: `Decision required for ${item.expectedFromStage} → ${item.targetStage}`,
        });
        continue;
      }

      const decisionPayload: DecisionPayload | undefined = item.decision
        ? {
            ...item.decision,
            decision_date: item.decision.decision_date ?? new Date().toISOString().slice(0, 10),
            decided_by: user.id,
          }
        : undefined;

      try {
        await transitionGrant(
          item.grantId,
          item.targetStage as LifecycleStage,
          user.id,
          item.reason,
          decisionPayload
        );
        results.push({
          grantId: item.grantId,
          fromStage: item.expectedFromStage as LifecycleStage,
          targetStage: item.targetStage as LifecycleStage,
          success: true,
        });
      } catch (err: any) {
        results.push({ grantId: item.grantId, success: false, error: err?.message ?? 'Unknown error' });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    return NextResponse.json({ successCount, failureCount, results }, { status: 207 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}
