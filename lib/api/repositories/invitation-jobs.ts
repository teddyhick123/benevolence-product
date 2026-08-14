import { createElevatedClient } from '@/lib/api/admin-client';
import type { JobAccessContext } from '@/lib/api/principals';
import { drainInvitationEmailOutbox } from '@/lib/invitations/email-outbox';

export class InvalidInvitationJobPrincipalError extends Error {
  constructor() {
    super('Invitation worker requires the invitations job principal');
  }
}

/** Global invitation email delivery, available only to the invitations job. */
export function createInvitationJobRepository(context: JobAccessContext) {
  if (context.principal.job !== 'invitations') throw new InvalidInvitationJobPrincipalError();
  const db = createElevatedClient();

  return {
    async deliver(input: { dryRun: boolean; limit?: number }) {
      try {
        const result = await drainInvitationEmailOutbox(db, input);
        return { ok: true as const, ...result };
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : String(error),
          scanned: 0, sent: 0, cancelled: 0, failed: 0, errors: [],
        };
      }
    },
  };
}
