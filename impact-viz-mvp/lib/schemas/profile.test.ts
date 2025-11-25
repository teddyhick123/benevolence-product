import { describe, it, expect } from 'vitest';
import { updateProfileSchema, changePasswordSchema } from './profile';

describe('Profile Schemas', () => {
  describe('updateProfileSchema', () => {
    it('should validate valid profile updates', () => {
      const validData = {
        display_name: 'John Doe',
        bio: 'Software engineer passionate about impact investing',
        organization: 'Impact Foundation',
      };

      const result = updateProfileSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.display_name).toBe('John Doe');
        expect(result.data.organization).toBe('Impact Foundation');
      }
    });

    it('should allow all fields to be optional', () => {
      const emptyData = {};

      const result = updateProfileSchema.safeParse(emptyData);
      expect(result.success).toBe(true);
    });

    it('should allow partial updates', () => {
      const partialData = {
        display_name: 'Jane Smith',
      };

      const result = updateProfileSchema.safeParse(partialData);
      expect(result.success).toBe(true);
    });

    it('should enforce max length on display_name', () => {
      const tooLong = {
        display_name: 'A'.repeat(300), // Max is 255
      };

      const result = updateProfileSchema.safeParse(tooLong);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('too long');
      }
    });

    it('should enforce max length on bio', () => {
      const tooLong = {
        bio: 'A'.repeat(1500), // Max is 1000
      };

      const result = updateProfileSchema.safeParse(tooLong);
      expect(result.success).toBe(false);
    });

    it('should enforce max length on organization', () => {
      const tooLong = {
        organization: 'A'.repeat(300), // Max is 255
      };

      const result = updateProfileSchema.safeParse(tooLong);
      expect(result.success).toBe(false);
    });
  });

  describe('changePasswordSchema', () => {
    it('should validate valid password change request', () => {
      const validData = {
        currentPassword: 'oldPassword123',
        newPassword: 'newSecurePassword456',
      };

      const result = changePasswordSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.currentPassword).toBe('oldPassword123');
        expect(result.data.newPassword).toBe('newSecurePassword456');
      }
    });

    it('should require both currentPassword and newPassword', () => {
      const missingNew = {
        currentPassword: 'oldPassword',
      };

      const result = changePasswordSchema.safeParse(missingNew);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.path.includes('newPassword'))).toBe(true);
      }
    });

    it('should enforce minimum password length', () => {
      const tooShort = {
        currentPassword: 'old123',
        newPassword: '12345', // Less than 6 chars
      };

      const result = changePasswordSchema.safeParse(tooShort);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('at least 6 characters');
      }
    });

    it('should accept password exactly 6 characters', () => {
      const exactLength = {
        currentPassword: 'oldpwd',
        newPassword: 'new123',
      };

      const result = changePasswordSchema.safeParse(exactLength);
      expect(result.success).toBe(true);
    });

    it('should not allow empty currentPassword', () => {
      const emptyData = {
        currentPassword: '',
        newPassword: 'newPassword123',
      };

      const result = changePasswordSchema.safeParse(emptyData);
      expect(result.success).toBe(false);
    });
  });
});
