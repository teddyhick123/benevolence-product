import { describe, expect, it } from 'vitest';
import { inviteMemberSchema } from './admin';
import { createInvitationSchema } from './invitations';

describe('createInvitationSchema', () => {
  it('accepts valid invitation', () => {
    const result = createInvitationSchema.safeParse({
      email: 'jane@example.com',
      role: 'member',
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid role', () => {
    const result = createInvitationSchema.safeParse({
      email: 'jane@example.com',
      role: 'editor',
    });

    expect(result.success).toBe(false);
  });

  it('rejects bad email', () => {
    const result = createInvitationSchema.safeParse({ email: 'notanemail', role: 'member' });

    expect(result.success).toBe(false);
  });
});

describe('inviteMemberSchema', () => {
  it('accepts admin role', () => {
    const result = inviteMemberSchema.safeParse({ email: 'x@x.com', role: 'admin' });

    expect(result.success).toBe(true);
  });

  it('rejects retired editor role', () => {
    const result = inviteMemberSchema.safeParse({ email: 'x@x.com', role: 'editor' });

    expect(result.success).toBe(false);
  });
});
