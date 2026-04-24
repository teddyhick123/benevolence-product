// __tests__/invitations.test.ts
import { describe, it, expect } from 'vitest';
import { createInvitationSchema, acceptInvitationSchema } from '../lib/schemas/invitations';
import { inviteMemberSchema } from '../lib/schemas/admin';

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

describe('inviteMemberSchema (fixed)', () => {
  it('accepts admin role', () => {
    const result = inviteMemberSchema.safeParse({ email: 'x@x.com', role: 'admin' });
    expect(result.success).toBe(true);
  });

  it('rejects editor role (old value)', () => {
    const result = inviteMemberSchema.safeParse({ email: 'x@x.com', role: 'editor' });
    expect(result.success).toBe(false);
  });
});

describe('acceptInvitationSchema', () => {
  it('accepts a valid token', () => {
    const result = acceptInvitationSchema.safeParse({ token: 'abc123' });
    expect(result.success).toBe(true);
  });

  it('rejects empty token', () => {
    const result = acceptInvitationSchema.safeParse({ token: '' });
    expect(result.success).toBe(false);
  });
});
