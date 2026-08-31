import { z } from 'zod';
import { isAccessDenied, requireAppAdmin } from '@/lib/api/access';
import { createAISpendCapRepository } from '@/lib/api/repositories/ai-spend-caps';
import { jsonError, jsonOk } from '@/lib/api/responses';

type RouteParams = { params: Promise<{ orgId: string }> };

const inputSchema = z.object({
  platformLimitUsd: z.number().nonnegative().nullable(),
}).strict();

/**
 * The platform ceiling. App admin only: this bounds money the platform pays,
 * so an organization must not be able to raise it.
 */
export async function PUT(request: Request, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireAppAdmin();
  if (isAccessDenied(access)) return access.response;

  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError('Validation failed', 400, { details: parsed.error.format() });

  const caps = createAISpendCapRepository({ orgId });
  try {
    // Clamps the organization's limit in the same write, so lowering a ceiling
    // below an existing org limit succeeds rather than violating the CHECK.
    await caps.setPlatformLimit(parsed.data.platformLimitUsd);
    return jsonOk({ cap: await caps.getStatus() });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Platform spend ceiling could not be updated',
      400,
    );
  }
}
