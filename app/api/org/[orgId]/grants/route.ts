import { NextRequest } from 'next/server';
import { LIFECYCLE_STAGES } from '@/lib/grants/lifecycle';
import { requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { createGrantRepository } from '@/lib/api/repositories/grants';

export const dynamic = 'force-dynamic';

const LIFECYCLE_STAGE_SET = new Set<string>(LIFECYCLE_STAGES);

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

function errorMessage(error: unknown): string {
  return typeof error === 'object'
    && error !== null
    && 'message' in error
    && typeof error.message === 'string'
    ? error.message
    : 'Internal error';
}

// GET /api/org/[orgId]/grants
// Query params: stage, owner_id, risk_level, due_before, q, portfolio_id, page, page_size
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;

    const access = await requireOrgAccess(orgId, 'viewer');
    if (!access.ok) return access.response;

    const url = new URL(req.url);
    const stage = url.searchParams.get('stage');
    const owner_id = url.searchParams.get('owner_id');
    const risk_level = url.searchParams.get('risk_level');
    const due_before = url.searchParams.get('due_before');
    const q = url.searchParams.get('q')?.trim();
    const portfolio_id = url.searchParams.get('portfolio_id');
    const requestedPage = Number.parseInt(url.searchParams.get('page') ?? '1', 10);
    const requestedPageSize = Number.parseInt(url.searchParams.get('page_size') ?? '50', 10);
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const page_size = Number.isFinite(requestedPageSize) && requestedPageSize > 0
      ? Math.min(100, requestedPageSize)
      : 50;

    const db = access.context.db;

    let query = db
      .from('grants')
      .select(
        `id, org_id, portfolio_id, holding_id, lifecycle_stage, requested_amount,
         approved_amount, currency, purpose, grant_type, grant_period_start,
         grant_period_end, internal_owner_id, risk_level, reporting_frequency,
         renewal_eligible, created_at, updated_at,
         holdings!inner(name, ein, city, country, investee_id),
         portfolios(name)`,
        { count: 'exact' }
      )
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range((page - 1) * page_size, page * page_size - 1);

    if (stage) query = query.eq('lifecycle_stage', stage);
    if (owner_id) query = query.eq('internal_owner_id', owner_id);
    if (risk_level) query = query.eq('risk_level', risk_level);
    if (portfolio_id) query = query.eq('portfolio_id', portfolio_id);
    if (due_before) query = query.lte('grant_period_end', due_before);
    if (q) query = query.ilike('holdings.name', `%${q.slice(0, 120)}%`);

    const { data, error, count } = await (query as any);
    if (error) throw error;

    return jsonOk({
      data,
      pagination: { page, page_size, total: count ?? 0 },
    });
  } catch (err: unknown) {
    return jsonError(errorMessage(err), 500);
  }
}

// POST /api/org/[orgId]/grants
// Atomically creates an optional investee row + holdings row + grants row
// + status history row (+ optional workflow instance) through a DB RPC.
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;

    const access = await requireOrgAccess(orgId, 'member');
    if (!access.ok) return access.response;
    const { user } = access.context;

    const body = await req.json();
    const {
      portfolio_id,
      investee_id,
      new_grantee,
      purpose,
      requested_amount,
      currency = 'USD',
      grant_type,
      grant_period_start,
      grant_period_end,
      lifecycle_stage = 'draft',
      internal_owner_id,
      risk_level,
      reporting_frequency,
      renewal_eligible,
      workflow_template_id,
    } = body;

    if (!portfolio_id) {
      return jsonError('portfolio_id is required', 400);
    }
    if (!purpose) {
      return jsonError('purpose is required', 400);
    }
    const numericRequestedAmount = Number(requested_amount);
    if (!Number.isFinite(numericRequestedAmount) || numericRequestedAmount < 0) {
      return jsonError('requested_amount must be a non-negative number', 400);
    }
    if (!LIFECYCLE_STAGE_SET.has(lifecycle_stage)) {
      return jsonError('Invalid lifecycle_stage', 400);
    }
    if (!investee_id && !new_grantee) {
      return jsonError('Provide either investee_id or new_grantee', 422);
    }
    if (investee_id && new_grantee) {
      return jsonError('Provide investee_id OR new_grantee, not both', 422);
    }

    const repository = createGrantRepository({ orgId, actorId: user.id });

    // Verify portfolio belongs to org
    const { data: portfolio } = await repository.findPortfolio(portfolio_id);
    if (!portfolio) {
      return jsonError('Portfolio not found in this org', 404);
    }

    if (internal_owner_id) {
      const { data: owner } = await repository.findOrganizationMember(internal_owner_id);
      if (!owner) return jsonError('internal_owner_id is not a member of this organization', 400);
    }

    const { data: created, error: createError } = await repository.createWithFoundationRecords({
      portfolioId: portfolio_id,
      purpose,
      requestedAmount: numericRequestedAmount,
      investeeId: investee_id,
      newGrantee: new_grantee,
      currency,
      grantType: grant_type,
      grantPeriodStart: grant_period_start,
      grantPeriodEnd: grant_period_end,
      lifecycleStage: lifecycle_stage,
      internalOwnerId: internal_owner_id,
      riskLevel: risk_level,
      reportingFrequency: reporting_frequency,
      renewalEligible: renewal_eligible ?? false,
      workflowTemplateId: workflow_template_id,
    });

    if (createError) {
      throw new Error(`Failed to create grant atomically: ${createError.message}`);
    }

    return jsonOk({
      grant: created?.grant ?? null,
      holding: created?.holding ?? null,
      workflow_instance: created?.workflow_instance ?? null,
    },
      { status: 201 }
    );
  } catch (err: unknown) {
    return jsonError(errorMessage(err), 500);
  }
}
