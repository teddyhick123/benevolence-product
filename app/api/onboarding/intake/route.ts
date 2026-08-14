import { NextRequest } from 'next/server';
import { z } from 'zod';
import { isAccessDenied, requireUserAccess } from '@/lib/api/access';
import { createOnboardingRepository } from '@/lib/api/repositories/onboarding';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { OnboardingAssistant, type QuickIntake } from '@/lib/onboarding/assistant';

export const runtime = 'nodejs';

const quickIntakeSchema = z.object({
  sessionId: z.string().uuid(),
  org_type: z.enum(['private_foundation', 'family_office', 'daf_sponsor', 'nonprofit']),
  org_name: z.string().min(1).max(200),
  org_size: z.enum(['solo', 'small', 'medium', 'large']),
  primary_focus: z.array(z.string()).optional(),
  existing_tools: z.array(z.string()).optional(),
});

/** POST /api/onboarding/intake — save quick intake for one owned session. */
export async function POST(req: NextRequest) {
  const access = await requireUserAccess();
  if (isAccessDenied(access)) return access.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const validation = quickIntakeSchema.safeParse(body);
  if (!validation.success) {
    return jsonError('Validation failed', 400, {
      details: validation.error.format(),
    });
  }

  const { sessionId, ...quickIntake } = validation.data;
  try {
    const repository = createOnboardingRepository(access.context.principal.userId);
    const session = await repository.resolveSession(sessionId);
    if (!session) return jsonError('Session not found', 404);

    const welcomeMessage = OnboardingAssistant.getWelcomeMessage(quickIntake as QuickIntake);
    const initialMessages = [{
      role: 'assistant' as const,
      content: welcomeMessage,
      timestamp: new Date().toISOString(),
    }];
    await session.saveIntake(quickIntake, initialMessages);

    return jsonOk({
      success: true,
      sessionId,
      status: 'conversation',
      messages: initialMessages,
      welcomeMessage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return jsonError(message, 500);
  }
}
