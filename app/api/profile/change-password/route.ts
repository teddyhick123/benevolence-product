import { NextRequest } from 'next/server';
import { changePasswordSchema } from '@/lib/schemas/profile';
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

    const validation = changePasswordSchema.safeParse(body);
    if (!validation.success) {
      return jsonError('Validation failed', 400, { details: validation.error.format() });
    }

    const { currentPassword, newPassword } = validation.data;

    // Verify current password by attempting to sign in
    const { error: signInError } = await access.context.db.auth.signInWithPassword({
      email: access.context.user.email!,
      password: currentPassword
    });

    if (signInError) {
      return jsonError('Current password is incorrect', 401);
    }

    // Update password
    const { error: updateError } = await access.context.db.auth.updateUser({
      password: newPassword
    });

    if (updateError) {
      return jsonError(updateError.message, 400);
    }

    return jsonOk({ success: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Internal server error', 500);
  }
}
