// lib/schemas/invitations.ts
import { z } from 'zod';

export const createInvitationSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['owner', 'admin', 'member', 'viewer'], {
    errorMap: () => ({ message: 'Role must be owner, admin, member, or viewer' }),
  }),
  message: z.string().max(500).optional().nullable(),
});

