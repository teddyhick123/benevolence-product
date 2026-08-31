import { z } from 'zod';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { createAISpendCapRepository } from '@/lib/api/repositories/ai-spend-caps';
import { jsonError, jsonOk } from '@/lib/api/responses';

type RouteParams = { params: Promise<{ orgId: string }> };

const inputSchema = z.object({
  orgLimitUsd: z.number().nonnegative().nullable().optional(),
  onLimit: z.enum(['hard_stop', 'read_only', 'own_key']).optional(),
  warnAtPercent: z.number().int().min(1).max(100).optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'At least one field is required');

/**
 * The organization's own limit and its behaviour at the ceiling. The platform
 * ceiling is not settable here: the platform pays for platform-funded spend,
 * so an organization raising its own ceiling would make the cap advisory.
 */
export async function PUT(request: Request, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;

  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError('Validation failed', 400, { details: parsed.error.format() });

  const caps = createAISpendCapRepository({ orgId });
  try {
    if (parsed.data.orgLimitUsd !== undefined) {
      await caps.setOrgLimit(parsed.data.orgLimitUsd);
    }
    if (parsed.data.onLimit !== undefined || parsed.data.warnAtPercent !== undefined) {
      const current = await caps.getStatus();
      await caps.setBehaviour(
        parsed.data.onLimit ?? current.onLimit,
        parsed.data.warnAtPercent ?? current.warnAtPercent,
      );
    }
    return jsonOk({ cap: await caps.getStatus() });
  } catch (error) {
    // A limit above the platform ceiling throws from the repository.
    return jsonError(
      error instanceof Error ? error.message : 'Spend cap could not be updated',
      400,
    );
  }
}
