import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { createGrantRepository } from '@/lib/api/repositories/grants';
import type { SessionClient } from '@/lib/api/server-client';

export const dynamic = 'force-dynamic';

const decisionSchema = z.object({
  decision_type: z.enum(['approval', 'decline', 'defer', 'renewal', 'closeout', 'payment_release']),
  decision: z.enum(['approved', 'declined', 'deferred', 'conditional', 'not_applicable']),
  decision_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  decided_by: z.string().uuid().optional(),
  amount: z.number().finite().nonnegative().optional().nullable(),
  conditions: z.string().max(5000).optional().nullable(),
  rationale: z.string().max(5000).optional().nullable(),
  board_meeting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
}).strict();

interface RouteParams {
  params: Promise<{ orgId: string; grantId: string }>;
}

async function requireGrantInOrg(db: SessionClient, grantId: string, orgId: string) {
  const { data, error } = await db
    .from('grants')
    .select('id')
    .eq('id', grantId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

async function requireUserInOrg(db: SessionClient, userId: string, orgId: string) {
  const { data, error } = await db
    .from('organization_members')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, grantId } = await params;

    const access = await requireOrgAccess(orgId, 'viewer');
    if (!access.ok) return access.response;

    const db = access.context.db;
    const grantInOrg = await requireGrantInOrg(db, grantId, orgId);
    if (!grantInOrg) {
      return jsonError('Grant not found', 404);
    }

    const { data, error } = await db
      .from('grant_decisions')
      .select('*')
      .eq('grant_id', grantId)
      .eq('org_id', orgId)
      .order('decision_date', { ascending: false });

    if (error) throw error;

    return jsonOk({ data });
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, grantId } = await params;

    const access = await requireOrgAccess(orgId, 'member');
    if (!access.ok) return access.response;
    const { db, user } = access.context;

    const body = await req.json().catch(() => ({}));
    const parsed = decisionSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError('Validation failed', 400, { details: parsed.error.format() });
    }
    const input = parsed.data;

    const decidedBy = input.decided_by ?? user.id;
    if (!(await requireUserInOrg(db, decidedBy, orgId))) {
      return jsonError('decided_by is not a member of this organization', 400);
    }

    const repository = createGrantRepository({ orgId, actorId: user.id });
    const { data, error, notFound } = await repository.recordDecision({
      grantId,
      decisionType: input.decision_type,
      decision: input.decision,
      decisionDate: input.decision_date,
      decidedBy,
      amount: input.amount,
      conditions: input.conditions,
      rationale: input.rationale,
      boardMeetingDate: input.board_meeting_date,
      metadata: input.metadata,
    });

    if (notFound) return jsonError('Grant not found', 404);
    if (error) throw error;

    return jsonOk({ data }, { status: 201 });
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}
