import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { z } from 'zod';
import { ORG_AUDIT_ACTIONS, writeOrgAuditEvent } from '@/lib/audit/org-audit';
import { getOrgAccess, hasOrgAccess } from '@/lib/org-access';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;
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

function json(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE,
      ...(init.headers || {}),
    },
  });
}

async function requireGrantInOrg(
  db: ReturnType<typeof createAdminClient>,
  grantId: string,
  orgId: string
) {
  const { data, error } = await db
    .from('grants')
    .select('id')
    .eq('id', grantId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

async function requireUserInOrg(
  db: ReturnType<typeof createAdminClient>,
  userId: string,
  orgId: string
) {
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

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, grantId } = await params;

    const supabase = await createServerClient();
    const access = await getOrgAccess(supabase, orgId);
    if (!access.user) return json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasOrgAccess(access, 'viewer')) return json({ error: 'Not authorized' }, { status: 403 });

    const db = createAdminClient();
    const grantInOrg = await requireGrantInOrg(db, grantId, orgId);
    if (!grantInOrg) {
      return json({ error: 'Grant not found' }, { status: 404 });
    }

    const { data, error } = await db
      .from('grant_decisions')
      .select('*')
      .eq('grant_id', grantId)
      .eq('org_id', orgId)
      .order('decision_date', { ascending: false });

    if (error) throw error;

    return json({ data });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, grantId } = await params;

    const supabase = await createServerClient();
    const access = await getOrgAccess(supabase, orgId);
    if (!access.user) return json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasOrgAccess(access, 'member')) return json({ error: 'Member access required' }, { status: 403 });
    const { user } = access;

    const body = await req.json().catch(() => ({}));
    const parsed = decisionSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }
    const input = parsed.data;

    const db = createAdminClient();
    const grantInOrg = await requireGrantInOrg(db, grantId, orgId);
    if (!grantInOrg) {
      return json({ error: 'Grant not found' }, { status: 404 });
    }

    const decidedBy = input.decided_by ?? user.id;
    if (!(await requireUserInOrg(db, decidedBy, orgId))) {
      return json({ error: 'decided_by is not a member of this organization' }, { status: 400 });
    }

    const { data, error } = await db
      .from('grant_decisions')
      .insert({
        grant_id: grantId,
        org_id: orgId,
        decision_type: input.decision_type,
        decision: input.decision,
        decision_date: input.decision_date,
        decided_by: decidedBy,
        amount: input.amount ?? null,
        conditions: input.conditions ?? null,
        rationale: input.rationale ?? null,
        board_meeting_date: input.board_meeting_date ?? null,
        metadata: input.metadata ?? null,
      })
      .select()
      .single();

    if (error) throw error;

    await writeOrgAuditEvent(db, {
      orgId,
      actorId: user.id,
      action: ORG_AUDIT_ACTIONS.GRANT_DECISION_RECORDED,
      targetId: grantId,
      metadata: {
        decision_id: data.id,
        decision_type: input.decision_type,
        decision: input.decision,
        decision_date: input.decision_date,
        decided_by: decidedBy,
        amount: input.amount ?? null,
        board_meeting_date: input.board_meeting_date ?? null,
      },
    });

    return json({ data }, { status: 201 });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}
