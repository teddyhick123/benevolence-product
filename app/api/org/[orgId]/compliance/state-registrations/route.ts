import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable();
const stateRegistrationSchema = z.object({
  state: z.string().trim().regex(/^[A-Za-z]{2}$/),
  registration_number: z.string().trim().max(200).optional().nullable(),
  registration_type: z.string().trim().min(1).max(200).optional(),
  registration_date: dateSchema,
  expiration_date: dateSchema,
  renewal_due_date: dateSchema,
  last_renewed_date: dateSchema,
  status: z.enum(['active', 'pending', 'renewal_due', 'expired', 'exempt', 'not_registered']).optional(),
  exemption_basis: z.string().trim().max(500).optional().nullable(),
  annual_fee: z.coerce.number().finite().nonnegative().optional().nullable(),
  notes: z.string().max(10_000).optional().nullable(),
}).strict();

// GET /api/org/[orgId]/compliance/state-registrations
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const access = await requireOrgAccess(orgId, 'viewer');
    if (!access.ok) return access.response;

    const { data, error } = await access.context.db
      .from('state_registrations')
      .select('*')
      .eq('org_id', orgId)
      .order('state');

    if (error) {
      return jsonError(error.message, 500);
    }

    return jsonOk({ data: data || [] });
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}

// POST /api/org/[orgId]/compliance/state-registrations — upsert on org+state+type
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const access = await requireOrgAccess(orgId, 'admin');
    if (!access.ok) return access.response;
    const parsed = stateRegistrationSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return jsonError('Validation failed', 400, { details: parsed.error.format() });
    const {
      state, registration_number, registration_type, registration_date,
      expiration_date, renewal_due_date, last_renewed_date, status,
      exemption_basis, annual_fee, notes,
    } = parsed.data;

    const { data, error } = await access.context.db
      .from('state_registrations')
      .upsert(
        {
          org_id: orgId,
          state: state.toUpperCase(),
          registration_number: registration_number || null,
          registration_type: registration_type || 'charitable_solicitation',
          registration_date: registration_date || null,
          expiration_date: expiration_date || null,
          renewal_due_date: renewal_due_date || null,
          last_renewed_date: last_renewed_date || null,
          status: status || 'active',
          exemption_basis: exemption_basis || null,
          annual_fee: annual_fee ?? null,
          notes: notes || null,
        },
        { onConflict: 'org_id,state,registration_type' }
      )
      .select()
      .single();

    if (error) {
      return jsonError(error.message, 500);
    }

    return jsonOk({ data }, { status: 201 });
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}
