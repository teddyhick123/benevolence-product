import { z } from 'zod';

/**
 * Portfolio-level donation summary type (from v_portfolio_donation_summary view)
 */
export type PortfolioDonationSummary = {
  portfolio_id: string;
  total_donations: number;
  active_donations: number;
  total_donation_amount: number;
  avg_donation_amount: number;
  largest_donation: number;
  linked_tax_contributions: number;
  total_tax_deductible_amount: number;
  total_appreciated_asset_gain: number;
  total_carryforward_available: number;
};

/**
 * Query parameters for donations endpoint
 */
export const donationQuerySchema = z.object({
  portfolio_id: z.string().uuid().optional(),
  status: z.enum(['active', 'exited', 'pipeline']).optional(),
  min_amount: z.coerce.number().optional(),
  max_amount: z.coerce.number().optional(),
  has_tax_contribution: z.coerce.boolean().optional(),
  sort_by: z.enum(['name', 'funds_allocated', 'created_at']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
