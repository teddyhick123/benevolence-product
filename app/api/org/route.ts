import { NextRequest } from 'next/server';
import { z } from 'zod';
import { isAccessDenied, requireUserAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { createOrganizationProvisioningRepository } from '@/lib/api/repositories/organization-provisioning';

export const dynamic = 'force-dynamic';

const createOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(255),
  ein: z.string().trim().max(32).optional().nullable(),
  org_type: z.enum([
    'private_foundation',
    'family_office',
    'daf_sponsor',
    'community_foundation',
    'nonprofit',
    'corporation',
    'individual',
  ]).default('private_foundation'),
  fiscal_year_end: z.string().trim().max(50).optional().nullable(),
  state_of_incorporation: z.string().trim().max(100).optional().nullable(),
}).strict();

// GET /api/org — list orgs the current user belongs to
export async function GET() {
  try {
    const access = await requireUserAccess();
    if (isAccessDenied(access)) return access.response;

    const { data, error } = await access.context.db
      .from('organization_members')
      .select(`role, organizations (*)`)
      .eq('user_id', access.context.user.id)
      .is('deleted_at', null)
      .not('accepted_at', 'is', null);

    if (error) {
      return jsonError(error.message, 500);
    }

    const organizations = (data || []).map((row: any) => ({
      ...row.organizations,
      role: row.role,
    }));

    return jsonOk({ organizations });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}

// POST /api/org — create a new organization
export async function POST(req: NextRequest) {
  try {
    const access = await requireUserAccess();
    if (isAccessDenied(access)) return access.response;

    const parsed = createOrganizationSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return jsonError('Validation failed', 400, { details: parsed.error.format() });
    }

    const organization = await createOrganizationProvisioningRepository(access.context).create({
      name: parsed.data.name,
      ein: parsed.data.ein,
      orgType: parsed.data.org_type,
      fiscalYearEnd: parsed.data.fiscal_year_end,
      stateOfIncorporation: parsed.data.state_of_incorporation,
    });

    return jsonOk(organization, { status: 201 });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}
