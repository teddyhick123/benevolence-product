import { describe, it, expect } from 'vitest';
import {
  uploadIngestSchema,
  createAdminPortfolioSchema,
  portfolioSettingsSchema,
  addPortfolioMemberSchema,
  updateMemberRoleSchema,
  adminUpdateKpiSchema,
} from './admin';

describe('Admin Schemas', () => {
  describe('uploadIngestSchema', () => {
    it('should validate valid upload ingest request', () => {
      const validData = {
        uploadId: '550e8400-e29b-41d4-a716-446655440000',
        autoApprove: true,
      };

      const result = uploadIngestSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.uploadId).toBe('550e8400-e29b-41d4-a716-446655440000');
        expect(result.data.autoApprove).toBe(true);
      }
    });

    it('should default autoApprove to false', () => {
      const minimalData = {
        uploadId: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = uploadIngestSchema.safeParse(minimalData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.autoApprove).toBe(false);
      }
    });

    it('should reject invalid UUID', () => {
      const invalidData = {
        uploadId: 'not-a-uuid',
      };

      const result = uploadIngestSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('createAdminPortfolioSchema', () => {
    it('should validate valid portfolio creation', () => {
      const validData = {
        name: 'Impact Portfolio 2024',
        base_currency: 'USD',
        owner_user_id: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = createAdminPortfolioSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should require name', () => {
      const invalidData = {
        base_currency: 'EUR',
      };

      const result = createAdminPortfolioSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should default base_currency to USD', () => {
      const minimalData = {
        name: 'Test Portfolio',
      };

      const result = createAdminPortfolioSchema.safeParse(minimalData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.base_currency).toBe('USD');
      }
    });

    it('should enforce 3-character currency code', () => {
      const invalidData = {
        name: 'Test',
        base_currency: 'US', // Too short
      };

      const result = createAdminPortfolioSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should convert currency to uppercase', () => {
      const lowerCaseData = {
        name: 'Test',
        base_currency: 'eur',
      };

      const result = createAdminPortfolioSchema.safeParse(lowerCaseData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.base_currency).toBe('EUR');
      }
    });

    it('should validate owner_email format', () => {
      const validData = {
        name: 'Test',
        owner_email: 'owner@example.com',
      };

      const result = createAdminPortfolioSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const invalidData = {
        name: 'Test',
        owner_email: 'not-an-email',
      };

      const result = createAdminPortfolioSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('portfolioSettingsSchema', () => {
    it('should validate settings with show_map', () => {
      const validData = {
        show_map: true,
      };

      const result = portfolioSettingsSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate settings with widgets array', () => {
      const validData = {
        widgets: ['widget1', 'widget2', 'widget3'],
      };

      const result = portfolioSettingsSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should allow empty object', () => {
      const emptyData = {};

      const result = portfolioSettingsSchema.safeParse(emptyData);
      expect(result.success).toBe(true);
    });

    it('should reject non-boolean show_map', () => {
      const invalidData = {
        show_map: 'yes',
      };

      const result = portfolioSettingsSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('addPortfolioMemberSchema', () => {
    it('should validate valid member addition', () => {
      const validData = {
        user_id: '550e8400-e29b-41d4-a716-446655440000',
        role: 'member' as const,
      };

      const result = addPortfolioMemberSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should require user_id and role', () => {
      const invalidData = {
        user_id: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = addPortfolioMemberSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should only allow valid roles', () => {
      const invalidData = {
        user_id: '550e8400-e29b-41d4-a716-446655440000',
        role: 'editor',
      };

      const result = addPortfolioMemberSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should accept viewer role', () => {
      const validData = {
        user_id: '550e8400-e29b-41d4-a716-446655440000',
        role: 'viewer' as const,
      };

      const result = addPortfolioMemberSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should accept owner role', () => {
      const validData = {
        user_id: '550e8400-e29b-41d4-a716-446655440000',
        role: 'owner' as const,
      };

      const result = addPortfolioMemberSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });

  describe('updateMemberRoleSchema', () => {
    it('should validate role update', () => {
      const validData = {
        role: 'member' as const,
      };

      const result = updateMemberRoleSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should require role field', () => {
      const invalidData = {};

      const result = updateMemberRoleSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('adminUpdateKpiSchema', () => {
    it('should validate full KPI update', () => {
      const validData = {
        slug: 'updated_kpi',
        name: 'Updated KPI',
        target_value: 5000,
        display_order: 2,
      };

      const result = adminUpdateKpiSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should allow partial updates', () => {
      const partialData = {
        name: 'New Name',
      };

      const result = adminUpdateKpiSchema.safeParse(partialData);
      expect(result.success).toBe(true);
    });

    it('should enforce max length on slug', () => {
      const tooLong = {
        slug: 'a'.repeat(60), // Max is 50
      };

      const result = adminUpdateKpiSchema.safeParse(tooLong);
      expect(result.success).toBe(false);
    });

    it('should require integer for display_order', () => {
      const invalidData = {
        display_order: 3.5,
      };

      const result = adminUpdateKpiSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });
});
