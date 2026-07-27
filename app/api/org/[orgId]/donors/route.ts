import { NextRequest } from 'next/server';
import { requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { createDonorSchema } from '@/lib/schemas/donor';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

// GET /api/org/[orgId]/donors — list donors via v_donor_summary
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    // Donor PII is intentionally stricter than ordinary org reads.
    const access = await requireOrgAccess(orgId, 'member');
    if (!access.ok) return access.response;
    const db = access.context.db;
    const { searchParams } = new URL(req.url);

    let query = db
      .from('v_donor_summary')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId);

    const name = searchParams.get('name');
    const tier = searchParams.get('donor_tier');
    const recencyStatus = searchParams.get('recency_status');
    const minGiving = searchParams.get('min_lifetime_giving');
    const pendingAcks = searchParams.get('pending_acknowledgments');
    const requestedLimit = Number.parseInt(searchParams.get('limit') || '50', 10);
    const requestedOffset = Number.parseInt(searchParams.get('offset') || '0', 10);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 500)
      : 50;
    const offset = Number.isFinite(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;

    if (name) query = query.ilike('display_name', `%${name}%`);
    if (tier) query = query.eq('computed_tier', tier);
    if (recencyStatus) query = query.eq('recency_status', recencyStatus);
    if (minGiving) {
      const parsedMinGiving = Number.parseFloat(minGiving);
      if (Number.isFinite(parsedMinGiving)) {
        query = query.gte('total_lifetime_giving', parsedMinGiving);
      }
    }
    if (pendingAcks === 'true') query = query.eq('has_pending_acknowledgments', true);

    const { data: donors, count, error } = await query
      .order('total_lifetime_giving', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return jsonError(error.message, 500);
    }

    return jsonOk({
      donors,
      total: count ?? donors?.length ?? 0,
      count: donors?.length || 0,
    });
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}

// POST /api/org/[orgId]/donors — create donor
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const access = await requireOrgAccess(orgId, 'member');
    if (!access.ok) return access.response;
    const parsed = createDonorSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return jsonError('Validation failed', 400, { details: parsed.error.format() });
    const {
      first_name, last_name, email, phone,
      organization_name, is_organization, preferred_name,
      address_line1, address_line2, city, state, zip, country,
      tier, notes, tags,
    } = parsed.data;

    const { data: donor, error } = await access.context.db
      .from('donors')
      .insert({
        org_id: orgId,
        first_name: first_name || null,
        last_name: last_name || null,
        email: email || null,
        phone: phone || null,
        organization_name: organization_name || null,
        is_organization: is_organization || false,
        preferred_name: preferred_name || null,
        address_line1: address_line1 || null,
        address_line2: address_line2 || null,
        city: city || null,
        state: state || null,
        zip: zip || null,
        country: country || 'US',
        tier: tier || 'prospect',
        notes: notes || null,
        tags: tags || [],
      })
      .select()
      .single();

    if (error) {
      return jsonError(error.message, 500);
    }

    return jsonOk(donor, { status: 201 });
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}
