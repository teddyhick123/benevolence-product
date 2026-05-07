import { describe, it, expect } from 'vitest';
import { updateRecommendationSchema } from './recommendations';

describe('Recommendations Schemas', () => {
  describe('updateRecommendationSchema', () => {
    it('should validate full recommendation update', () => {
      const validData = {
        organization_name: 'Green Earth Foundation',
        website: 'https://greenearth.org',
        sector: 'Environment',
        ein: '12-3456789',
        location: 'San Francisco, CA',
        description: 'An organization focused on environmental sustainability',
        impact_focus: 'Climate change mitigation',
        accreditation: 'GuideStar Platinum',
        contact_info: 'contact@greenearth.org',
        min_investment: 10000,
        max_investment: 500000,
        order_index: 1,
      };

      const result = updateRecommendationSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.organization_name).toBe('Green Earth Foundation');
        expect(result.data.min_investment).toBe(10000);
      }
    });

    it('should allow partial updates', () => {
      const partialData = {
        organization_name: 'Updated Name',
      };

      const result = updateRecommendationSchema.safeParse(partialData);
      expect(result.success).toBe(true);
    });

    it('should allow all fields to be optional', () => {
      const emptyData = {};

      const result = updateRecommendationSchema.safeParse(emptyData);
      expect(result.success).toBe(true);
    });

    it('should validate website as URL', () => {
      const validData = {
        website: 'https://example.org',
      };

      const result = updateRecommendationSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid URL', () => {
      const invalidData = {
        website: 'not-a-url',
      };

      const result = updateRecommendationSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Invalid URL');
      }
    });

    it('should enforce max length on organization_name', () => {
      const tooLong = {
        organization_name: 'A'.repeat(300), // Max is 255
      };

      const result = updateRecommendationSchema.safeParse(tooLong);
      expect(result.success).toBe(false);
    });

    it('should enforce max length on description', () => {
      const tooLong = {
        description: 'A'.repeat(2500), // Max is 2000
      };

      const result = updateRecommendationSchema.safeParse(tooLong);
      expect(result.success).toBe(false);
    });

    it('should require non-negative min_investment', () => {
      const invalidData = {
        min_investment: -1000,
      };

      const result = updateRecommendationSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('non-negative');
      }
    });

    it('should require non-negative max_investment', () => {
      const invalidData = {
        max_investment: -500,
      };

      const result = updateRecommendationSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should allow zero investment amounts', () => {
      const validData = {
        min_investment: 0,
        max_investment: 0,
      };

      const result = updateRecommendationSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should require order_index to be integer', () => {
      const invalidData = {
        order_index: 3.5,
      };

      const result = updateRecommendationSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should allow null values for optional fields', () => {
      const validData = {
        organization_name: 'Test Org',
        website: null,
        sector: null,
        description: null,
      };

      const result = updateRecommendationSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });
});
