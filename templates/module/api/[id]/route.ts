/** Place at app/api/org/[orgId]/{module_name}/[id]/route.ts. */
import { NextRequest } from 'next/server';
import { requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { create{ModuleName}Repository } from '@/lib/{module_name}/repository';

interface RouteParams {
  params: Promise<{ orgId: string; id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { orgId, id } = await params;
  const access = await requireOrgAccess(orgId, 'member');
  if (!access.ok) return access.response;
  const { data: enabled } = await access.context.db.rpc('org_has_module', {
    p_org_id: orgId,
    p_module: '{module_slug}',
  });
  if (!enabled) return jsonError('Module not enabled', 403);

  const body = await request.json();
  const repository = create{ModuleName}Repository({
    orgId: access.context.orgId,
    actorId: access.context.user.id,
  });
  const item = await repository.update(id, body);
  return item ? jsonOk({ item }) : jsonError('Item not found', 404);
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { orgId, id } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
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
  const deleted = await repository.remove(id);
  return deleted ? jsonOk({ deletedId: id }) : jsonError('Item not found', 404);
}
