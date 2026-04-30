import { describe, it, expect } from 'vitest';
import { addPortfolioMemberSchema, updateMemberRoleSchema } from '../schemas/admin';

describe('admin schema role enum matches DB member_role_enum', () => {
  const validRoles = ['owner', 'admin', 'member', 'viewer'];
  const invalidRoles = ['editor'];

  it('addPortfolioMemberSchema accepts valid DB roles', () => {
    for (const role of validRoles) {
      const result = addPortfolioMemberSchema.safeParse({ user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', role });
      expect(result.success, `role '${role}' should be valid`).toBe(true);
    }
  });

  it('addPortfolioMemberSchema rejects editor', () => {
    const result = addPortfolioMemberSchema.safeParse({ user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', role: 'editor' });
    expect(result.success).toBe(false);
  });

  it('updateMemberRoleSchema accepts valid DB roles', () => {
    for (const role of validRoles) {
      const result = updateMemberRoleSchema.safeParse({ role });
      expect(result.success, `role '${role}' should be valid`).toBe(true);
    }
  });

  it('updateMemberRoleSchema rejects editor', () => {
    const result = updateMemberRoleSchema.safeParse({ role: 'editor' });
    expect(result.success).toBe(false);
  });
});
