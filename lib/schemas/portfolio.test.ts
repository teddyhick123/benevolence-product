import { describe, it, expect } from 'vitest';
import {
  createHoldingSchema,
  updateHoldingSchema,
  createWidgetSchema,
  updateWidgetSchema,
  createKpiSchema,
  updateKpiSchema,
  assetTypeSchema,
  ASSET_TYPE_LABELS,
} from './portfolio';

describe('Portfolio Schemas', () => {
  describe('assetTypeSchema', () => {
    it('should validate valid asset types', () => {
      const validTypes = [
        'equity_investment',
        'debt_investment',
        'pri',
        'mri',
        'foundation_grant',
        'daf_grant',
        'donation',
        'other',
      ];

      validTypes.forEach(type => {
        const result = assetTypeSchema.safeParse(type);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid asset types', () => {
      const result = assetTypeSchema.safeParse('invalid_type');
      expect(result.success).toBe(false);
    });

    it('should have labels for all asset types', () => {
      const types = assetTypeSchema.options;
      types.forEach(type => {
        expect(ASSET_TYPE_LABELS[type]).toBeDefined();
        expect(ASSET_TYPE_LABELS[type].length).toBeGreaterThan(0);
      });
    });
  });

  describe('createHoldingSchema', () => {
    it('should validate valid holding data', () => {
      const validData = {
        name: 'Test Holding',
        status: 'Active' as const,
        asset_type: 'equity_investment' as const,
        asset_subtype: 'Public Stock',
        funds_allocated: 100000,
        as_of: '2024-01-15',
      };

      const result = createHoldingSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Test Holding');
        expect(result.data.asset_type).toBe('equity_investment');
        expect(result.data.funds_allocated).toBe(100000);
      }
    });

    it('should validate holding without asset_type', () => {
      const validData = {
        name: 'Test Holding',
        funds_allocated: 100000,
      };

      const result = createHoldingSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid asset_type', () => {
      const invalidData = {
        name: 'Test',
        asset_type: 'invalid_type',
      };

      const result = createHoldingSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should require name field', () => {
      const invalidData = {
        status: 'Active',
      };

      const result = createHoldingSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('name');
      }
    });

    it('should reject invalid status enum', () => {
      const invalidData = {
        name: 'Test',
        status: 'InvalidStatus',
      };

      const result = createHoldingSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should validate date format for as_of', () => {
      const validDate = {
        name: 'Test',
        as_of: '2024-12-31',
      };

      const result = createHoldingSchema.safeParse(validDate);
      expect(result.success).toBe(true);
    });

    it('should reject invalid date format', () => {
      const invalidDate = {
        name: 'Test',
        as_of: '12/31/2024', // Invalid format
      };

      const result = createHoldingSchema.safeParse(invalidDate);
      expect(result.success).toBe(false);
    });

    it('should reject negative funds_allocated', () => {
      const invalidData = {
        name: 'Test',
        funds_allocated: -1000,
      };

      const result = createHoldingSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('updateHoldingSchema', () => {
    it('should make all fields optional', () => {
      const minimalData = {};

      const result = updateHoldingSchema.safeParse(minimalData);
      expect(result.success).toBe(true);
    });

    it('should validate partial updates', () => {
      const partialData = {
        name: 'Updated Name',
      };

      const result = updateHoldingSchema.safeParse(partialData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Updated Name');
      }
    });
  });

  describe('createWidgetSchema', () => {
    it('should validate valid widget data', () => {
      const validData = {
        type: 'bar-chart',
        title: 'Test Widget',
        config: { xAxis: 'date', yAxis: 'value' },
      };

      const result = createWidgetSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('bar-chart');
        expect(result.data.config).toEqual({ xAxis: 'date', yAxis: 'value' });
      }
    });

    it('should require type field', () => {
      const invalidData = {
        title: 'Test',
      };

      const result = createWidgetSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should allow null title and config', () => {
      const validData = {
        type: 'line-chart',
        title: null,
        config: null,
      };

      const result = createWidgetSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });

  describe('updateWidgetSchema', () => {
    it('should validate widget updates with type', () => {
      const updateData = {
        type: 'pie-chart',
        title: 'Updated Title',
      };

      const result = updateWidgetSchema.safeParse(updateData);
      expect(result.success).toBe(true);
    });

    it('should validate position as non-negative integer', () => {
      const validData = {
        position: 5,
      };

      const result = updateWidgetSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject negative position', () => {
      const invalidData = {
        position: -1,
      };

      const result = updateWidgetSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('createKpiSchema', () => {
    it('should validate valid KPI data', () => {
      const validData = {
        metric_code: 'IMPACT_001',
        display_name: 'Lives Improved',
        target_value: 10000,
        target_date: '2024-12-31T00:00:00Z',
      };

      const result = createKpiSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metric_code).toBe('IMPACT_001');
        expect(result.data.target_value).toBe(10000);
      }
    });

    it('should require metric_code and display_name', () => {
      const invalidData = {
        target_value: 5000,
      };

      const result = createKpiSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.path.includes('metric_code'))).toBe(true);
        expect(result.error.issues.some(i => i.path.includes('display_name'))).toBe(true);
      }
    });

    it('should enforce max lengths', () => {
      const tooLongMetricCode = {
        metric_code: 'A'.repeat(100), // Max is 50
        display_name: 'Test',
      };

      const result = createKpiSchema.safeParse(tooLongMetricCode);
      expect(result.success).toBe(false);
    });

    it('should allow optional fields', () => {
      const minimalData = {
        metric_code: 'TEST_001',
        display_name: 'Test KPI',
      };

      const result = createKpiSchema.safeParse(minimalData);
      expect(result.success).toBe(true);
    });
  });

  describe('updateKpiSchema', () => {
    it('should make metric_code optional for updates', () => {
      const updateData = {
        display_name: 'Updated KPI Name',
        target_value: 15000,
      };

      const result = updateKpiSchema.safeParse(updateData);
      expect(result.success).toBe(true);
    });

    it('should allow order_index as integer', () => {
      const validData = {
        order_index: 3,
      };

      const result = updateKpiSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });
});
