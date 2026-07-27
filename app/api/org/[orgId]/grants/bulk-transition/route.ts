import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  LIFECYCLE_STAGES,
  type LifecycleStage,
  type DecisionPayload,
  canTransition,
  requiresDecision,
  transitionGrant,
} from '@/lib/grants/lifecycle';
import { requireOrgAccess } from '@/lib/api/access';
import { jsonOk } from '@/lib/api/responses';
import {
  createGrantRepository,
  type GrantWorkflowRow,
} from '@/lib/api/repositories/grants';

export const dynamic = 'force-dynamic';

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
  dry_run: z.boolean().optional().default(false),
  rollback_on_error: z.boolean().optional().default(false),
}).strict();

function json(body: unknown, init: ResponseInit = {}) {
  return jsonOk(body, init);
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;

    const access = await requireOrgAccess(orgId, 'member');
    if (!access.ok) return access.response;
    const { user } = access.context;
    const repository = createGrantRepository({ orgId, actorId: user.id });

    const body = await req.json().catch(() => ({}));
    const parsed = bulkTransitionSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const { transitions, dry_run: dryRun, rollback_on_error: rollbackOnError } = parsed.data;

    // Reject duplicate grantIds
    const grantIds = transitions.map(t => t.grantId);
    const uniqueIds = new Set(grantIds);
    if (uniqueIds.size !== grantIds.length) {
      return json({ error: 'Duplicate grantId values in request' }, { status: 400 });
    }

    // Preflight: fetch all requested grants scoped to this org in one query
    const { data: scopedGrants, error: prefetchErr } =
      await repository.findWorkflowGrants(grantIds);

    if (prefetchErr) {
      return json({ error: 'Failed to fetch grants' }, { status: 500 });
    }

    const grantMap = new Map<string, GrantWorkflowRow>();
    for (const g of scopedGrants ?? []) {
      grantMap.set(g.id, g);
    }

    const results: Array<{
      grantId: string;
      fromStage?: LifecycleStage;
      targetStage?: LifecycleStage;
      success: boolean;
      error?: string;
      dryRun?: boolean;
    }> = [];

    const executableTransitions: Array<{
      item: (typeof transitions)[number];
      decisionPayload?: DecisionPayload;
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

      // Workflow gate check — runs before the rollbackOnError branch decision.
      const gate = await repository.checkWorkflowGate(
        item.grantId,
        item.expectedFromStage as LifecycleStage,
        dbGrant
      );
      if (gate.blocked) {
        results.push({
          grantId: item.grantId,
          success: false,
          error: `Transition blocked: ${gate.reasons.join('; ')}`,
          blocking_items: gate.reasons,
        } as any);
        continue;
      }

      const decisionPayload: DecisionPayload | undefined = item.decision
        ? {
            ...item.decision,
            decision_date: item.decision.decision_date ?? new Date().toISOString().slice(0, 10),
            decided_by: user.id,
          }
        : undefined;

      executableTransitions.push({ item, decisionPayload });
      results.push({
        grantId: item.grantId,
        fromStage: item.expectedFromStage as LifecycleStage,
        targetStage: item.targetStage as LifecycleStage,
        success: true,
        dryRun,
      });
    }

    const preflightSuccessCount = results.filter(r => r.success).length;
    const preflightFailureCount = results.length - preflightSuccessCount;

    if (dryRun) {
      return json({
        mode: 'dry_run',
        dryRun: true,
        rollbackOnError,
        partialExecution: false,
        successCount: preflightSuccessCount,
        failureCount: preflightFailureCount,
        results,
      }, { status: preflightFailureCount > 0 ? 207 : 200 });
    }

    if (rollbackOnError && preflightFailureCount > 0) {
      return json({
        mode: 'rollback_on_error',
        dryRun: false,
        rollbackOnError: true,
        partialExecution: false,
        writesStarted: false,
        successCount: 0,
        failureCount: results.length,
        results: results.map(r => r.success
          ? { ...r, success: false, error: 'Not attempted because rollback_on_error requires every transition to pass preflight validation.' }
          : r
        ),
      }, { status: 409 });
    }

    if (rollbackOnError) {
      const { data: batchResult, error: batchError } =
        await repository.transitionLifecycleBatch(
          executableTransitions.map(({ item, decisionPayload }) => ({
            grantId: item.grantId,
            expectedFromStage: item.expectedFromStage as LifecycleStage,
            targetStage: item.targetStage as LifecycleStage,
            reason: item.reason,
            decisionPayload,
          }))
        );

      if (batchError) {
        return json({
          mode: 'rollback_on_error',
          dryRun: false,
          rollbackOnError: true,
          partialExecution: false,
          rollbackPerformed: true,
          successCount: 0,
          failureCount: transitions.length,
          results: transitions.map(item => ({
            grantId: item.grantId,
            fromStage: item.expectedFromStage,
            targetStage: item.targetStage,
            success: false,
            error: `Batch rolled back: ${batchError.message}`,
          })),
        }, { status: 409 });
      }

      return json({
        mode: 'rollback_on_error',
        dryRun: false,
        rollbackOnError: true,
        partialExecution: false,
        ...(batchResult ?? {
          successCount: executableTransitions.length,
          failureCount: 0,
          results,
        }),
      }, { status: 200 });
    }

    const executionResults = results.filter(r => !r.success);

    for (const { item, decisionPayload } of executableTransitions) {
      try {
        await transitionGrant(
          item.grantId,
          item.targetStage as LifecycleStage,
          user.id,
          item.reason,
          decisionPayload,
          orgId
        );
        executionResults.push({
          grantId: item.grantId,
          fromStage: item.expectedFromStage as LifecycleStage,
          targetStage: item.targetStage as LifecycleStage,
          success: true,
        });
      } catch (err: any) {
        executionResults.push({ grantId: item.grantId, success: false, error: err?.message ?? 'Unknown error' });
      }
    }

    const successCount = executionResults.filter(r => r.success).length;
    const failureCount = executionResults.length - successCount;

    return json({
      mode: 'partial',
      dryRun: false,
      rollbackOnError: false,
      partialExecution: true,
      contract: 'Each grant transition is atomic, but the batch is not rolled back in partial mode.',
      successCount,
      failureCount,
      results: executionResults,
    }, { status: 207 });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}
