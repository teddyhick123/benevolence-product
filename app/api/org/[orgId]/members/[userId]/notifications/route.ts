// app/api/org/[orgId]/members/[userId]/notifications/route.ts
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { createNotificationPreferenceRepository } from '@/lib/api/repositories/notifications';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; userId: string }>;
}

const notificationPrefsSchema = z.object({
  digest: z.enum(['daily', 'weekly', 'never']).optional(),
  channels: z.object({
    in_app: z.boolean().optional(),
    email: z.boolean().optional(),
  }).optional(),
  alerts: z.record(z.string(), z.boolean()).optional(),
});

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, userId } = await params;
    const access = await requireOrgAccess(orgId);
    if (isAccessDenied(access)) return access.response;
    if (access.context.principal.userId !== userId) {
      return jsonError('Unauthorized', 403);
    }

    const body = await req.json().catch(() => ({}));
    const validation = notificationPrefsSchema.safeParse(body);
    if (!validation.success) {
      return jsonError('Validation failed', 400, {
        details: validation.error.format(),
      });
    }

    const repository = createNotificationPreferenceRepository(access.context);
    const notificationPrefs = await repository.updateOwnPreferences(validation.data);
    return jsonOk({ notification_prefs: notificationPrefs });
  } catch (err: any) {
    return jsonError(err.message, 500);
  }
}
