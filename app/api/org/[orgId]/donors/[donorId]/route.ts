import { NextRequest, NextResponse } from 'next/server';
import { requireOrgAccess } from '@/lib/api/access';
import { AUTHENTICATED_JSON_CACHE_CONTROL, jsonError, jsonOk } from '@/lib/api/responses';
import { updateDonorSchema } from '@/lib/schemas/donor';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; donorId: string }>;
}

// GET /api/org/[orgId]/donors/[donorId]
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, donorId } = await params;
    const access = await requireOrgAccess(orgId, 'member');
    if (!access.ok) return access.response;
    const db = access.context.db;

    const { data: donor, error } = await db
      .from('v_donor_summary')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', donorId)
      .maybeSingle();

    if (error) {
      return jsonError(error.message, 500);
    }
    if (!donor) {
      return jsonError('Donor not found', 404);
    }

    const [contributionResult, letterResult] = await Promise.all([
      db.from('contributions_received')
        .select('*')
        .eq('org_id', orgId)
        .eq('donor_id', donorId)
        .order('contribution_date', { ascending: false }),
      db.from('acknowledgment_letters')
        .select('id, letter_type, status, subject, delivery_method, sent_at, storage_path, created_at')
        .eq('org_id', orgId)
        .eq('donor_id', donorId)
        .order('created_at', { ascending: false }),
    ]);
    if (contributionResult.error) throw contributionResult.error;
    if (letterResult.error) throw letterResult.error;

    return jsonOk({
      donor,
      contributions: contributionResult.data || [],
      letters: (letterResult.data || []).map((letter) => ({
        ...letter,
        sent_via: letter.delivery_method,
        pdf_url: null,
      })),
    });
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}

// PATCH /api/org/[orgId]/donors/[donorId]
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, donorId } = await params;
    const access = await requireOrgAccess(orgId, 'member');
    if (!access.ok) return access.response;
    const parsed = updateDonorSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return jsonError('Validation failed', 400, { details: parsed.error.format() });
    if (Object.keys(parsed.data).length === 0) return jsonError('No updates provided', 400);

    const { data: donor, error } = await access.context.db
      .from('donors')
      .update(parsed.data)
      .eq('id', donorId)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error) {
      return jsonError(error.message, 500);
    }

    return jsonOk(donor);
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}

// DELETE /api/org/[orgId]/donors/[donorId]
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, donorId } = await params;
    const access = await requireOrgAccess(orgId, 'admin');
    if (!access.ok) return access.response;
    const { db, user } = access.context;

    const { data: donor, error } = await db
      .from('donors')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
      })
      .eq('id', donorId)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();

    if (error) {
      return jsonError(error.message, 500);
    }
    if (!donor) return jsonError('Donor not found', 404);

    return new NextResponse(null, {
      status: 204,
      headers: { 'Cache-Control': AUTHENTICATED_JSON_CACHE_CONTROL },
    });
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}
