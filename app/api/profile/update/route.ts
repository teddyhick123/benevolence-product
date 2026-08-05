import { NextRequest } from 'next/server';
import { updateProfileSchema } from '@/lib/schemas/profile';
import { isAccessDenied, requireUserAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';

export async function POST(request: NextRequest) {
  try {
    const access = await requireUserAccess();
    if (isAccessDenied(access)) return access.response;

    // Parse and validate request body
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError('Invalid JSON body', 400);
    }

    const validation = updateProfileSchema.safeParse(body);
    if (!validation.success) {
      return jsonError('Validation failed', 400, { details: validation.error.format() });
    }

    const { display_name, bio, organization } = validation.data;

    // Update user metadata
    const { error: updateError } = await access.context.db.auth.updateUser({
      data: {
        display_name,
        bio,
        organization
      }
    });

    if (updateError) {
      return jsonError(updateError.message, 400);
    }

    return jsonOk({ success: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Internal server error', 500);
  }
}
