import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePortfolioAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const runtime = 'nodejs';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable();
const erFieldsSchema = z.object({
  grantee_is_public_charity: z.boolean().optional(),
  grantee_ein: z.string().trim().max(20).optional().nullable(),
  grantee_501c3_verified: z.boolean().optional(),
  grantee_501c3_verified_at: dateSchema,
  er_agreement_signed_date: dateSchema,
  er_agreement_url: z.union([z.string().url().max(2000), z.literal('')]).optional().nullable(),
  er_reports_required: z.boolean().optional(),
  er_report_frequency: z.enum(['monthly', 'quarterly', 'semi_annual', 'annual']).optional().nullable(),
  er_reports_required_count: z.coerce.number().int().nonnegative().optional(),
  er_reports_received_count: z.coerce.number().int().nonnegative().optional(),
  terminal_report_required: z.boolean().optional(),
  terminal_report_received: z.boolean().optional(),
  terminal_report_date: dateSchema,
  er_status: z.enum(['pending_agreement', 'active', 'reporting_overdue', 'completed', 'terminated']).optional(),
  notes: z.string().max(10_000).optional().nullable(),
}).strict();
const createErGrantSchema = erFieldsSchema.extend({ grant_id: z.string().uuid() });

/**
 * GET /api/portfolio/[id]/compliance/er-grants?status=deficient
 * List ER grant tracking records with compliance flags
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: portfolioId } = await params;
    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get('status');

    const access = await requirePortfolioAccess(portfolioId, 'viewer');
    if (!access.ok) return access.response;

    let query = access.context.db
      .from('v_er_grant_compliance')
      .select('*')
      .eq('portfolio_id', portfolioId);

    if (statusFilter) {
      query = query.eq('er_status', statusFilter);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;

    return jsonOk({ data: data || [] });
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}

/**
 * POST /api/portfolio/[id]/compliance/er-grants
 * Create a new ER tracking record for a grant
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: portfolioId } = await params;
    const access = await requirePortfolioAccess(portfolioId, 'member');
    if (!access.ok) return access.response;
    const parsed = createErGrantSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return jsonError('Validation failed', 400, { details: parsed.error.format() });
    const { grant_id, ...rest } = parsed.data;
    const db = access.context.db;

    const { data: grant, error: grantError } = await db
      .from('grants')
      .select('id')
      .eq('id', grant_id)
      .eq('portfolio_id', portfolioId)
      .is('deleted_at', null)
      .maybeSingle();
    if (grantError) throw grantError;
    if (!grant) return jsonError('Grant not found', 404);

    const { data, error } = await db
      .from('expenditure_responsibility_grants')
      .insert({ portfolio_id: portfolioId, grant_id, ...rest })
      .select()
      .single();

    if (error) throw error;
    return jsonOk({ data }, { status: 201 });
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}

/**
 * PATCH /api/portfolio/[id]/compliance/er-grants?id=<er_grant_id>
 * Update an ER record (record received reports, terminal report, etc.)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: portfolioId } = await params;
    const { searchParams } = new URL(req.url);
    const erGrantId = searchParams.get('id');
    if (!erGrantId) return jsonError('id query param required', 400);
    const access = await requirePortfolioAccess(portfolioId, 'member');
    if (!access.ok) return access.response;
    const parsed = erFieldsSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return jsonError('Validation failed', 400, { details: parsed.error.format() });
    if (Object.keys(parsed.data).length === 0) return jsonError('No updates provided', 400);

    const { data, error } = await access.context.db
      .from('expenditure_responsibility_grants')
      .update(parsed.data)
      .eq('id', erGrantId)
      .eq('portfolio_id', portfolioId)
      .select()
      .single();

    if (error) throw error;
    return jsonOk({ data });
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}
