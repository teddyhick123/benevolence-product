/** Place at app/api/org/[orgId]/{module_name}/route.ts. */
import { NextRequest } from 'next/server';
import { requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { create{ModuleName}Repository } from '@/lib/{module_name}/repository';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'viewer');
  if (!access.ok) return access.response;
  const { data: enabled } = await access.context.db.rpc('org_has_module', {
    p_org_id: orgId,
    p_module: '{module_slug}',
  });
  if (!enabled) return jsonError('Module not enabled', 403);

  const repository = create{ModuleName}Repository({
    orgId: access.context.orgId,
    actorId: access.context.user.id,
  });
  const items = await repository.list({
    status: request.nextUrl.searchParams.get('status'),
  });
  return jsonOk({ items });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'member');
  if (!access.ok) return access.response;
  const { data: enabled } = await access.context.db.rpc('org_has_module', {
    p_org_id: orgId,
    p_module: '{module_slug}',
  });
  if (!enabled) return jsonError('Module not enabled', 403);

  const body = await request.json();
  if (typeof body?.name !== 'string' || !body.name.trim()) {
    return jsonError('name is required', 400);
  }

  const repository = create{ModuleName}Repository({
    orgId: access.context.orgId,
    actorId: access.context.user.id,
  });
  const item = await repository.create({ name: body.name.trim() });
  return jsonOk({ item }, { status: 201 });
}
