import { z } from 'zod';

/**
 * Transaction type enumeration
 */
export const transactionTypeSchema = z.enum([
  'initial_investment',
  'capital_call',
  'distribution',
  'return_of_capital',
  'reinvestment',
]);

export type TransactionType = z.infer<typeof transactionTypeSchema>;

/**
 * Human-readable labels for transaction types
 */
export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  initial_investment: 'Initial Investment',
  capital_call: 'Capital Call',
  distribution: 'Distribution',
  return_of_capital: 'Return of Capital',
  reinvestment: 'Reinvestment',
};

/**
 * Schema for creating a holding valuation
 */
export const createValuationSchema = z.object({
  holding_id: z.string().uuid('Invalid holding ID'),
  as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  nav: z.number().nonnegative('NAV must be non-negative'),
  units: z.number().positive('Units must be positive').optional().nullable(),
  valuation_source: z.string().max(255).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

/**
 * Schema for updating a valuation
 */
export const updateValuationSchema = createValuationSchema.partial().omit({ holding_id: true });

/**
 * Schema for creating a holding transaction
 */
export const createTransactionSchema = z.object({
  holding_id: z.string().uuid('Invalid holding ID'),
  transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  transaction_type: transactionTypeSchema,
  amount: z.number({ invalid_type_error: 'Amount is required' }),
  memo: z.string().max(500).optional().nullable(),
});

/**
 * Schema for updating a transaction
 */
export const updateTransactionSchema = createTransactionSchema.partial().omit({ holding_id: true });

/**
 * Schema for investment performance query parameters
 */
export const investmentPerformanceQuerySchema = z.object({
  portfolio_id: z.string().uuid().optional(),
  asset_type: z.enum(['equity_investment', 'debt_investment', 'pri', 'mri']).optional(),
  status: z.enum(['Active', 'Exited', 'Pipeline']).optional(),
  min_moic: z.coerce.number().optional(),
  max_moic: z.coerce.number().optional(),
  sort_by: z.enum(['name', 'moic', 'unrealized_gain', 'total_value', 'current_nav']).default('moic'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Type exports for database records
 */

export type Valuation = {
  id: string;
  holding_id: string;
  as_of_date: string;
  nav: number;
  units?: number | null;
  nav_per_unit?: number | null;
  valuation_source?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type Transaction = {
  id: string;
  holding_id: string;
  transaction_date: string;
  transaction_type: TransactionType;
  amount: number;
  memo?: string | null;
  created_at: string;
  updated_at: string;
};

export type InvestmentPerformance = {
  id: string;
  portfolio_id: string;
  name: string;
  asset_type: 'equity_investment' | 'debt_investment' | 'pri' | 'mri';
  asset_subtype?: string | null;
  status: string;
  sector?: string | null;
  country?: string | null;
  current_nav?: number | null;
  nav_as_of_date?: string | null;
  valuation_source?: string | null;
  cost_basis: number;
  total_distributions: number;
  unrealized_gain: number;
  unrealized_gain_pct?: number | null;
  total_value: number;
  moic?: number | null;
  investment_count?: number;
  distribution_count?: number;
  first_investment_date?: string | null;
  last_investment_date?: string | null;
  last_distribution_date?: string | null;
};

export type PortfolioInvestmentSummary = {
  portfolio_id: string;
  total_investments: number;
  active_investments: number;
  exited_investments: number;
  equity_count: number;
  debt_count: number;
  pri_count: number;
  mri_count: number;
  total_cost_basis: number;
  total_current_nav: number;
  total_distributions: number;
  total_unrealized_gain: number;
  total_value: number;
  portfolio_moic?: number | null;
  avg_unrealized_gain_pct?: number | null;
  avg_moic?: number | null;
};

/**
 * Helper function to calculate IRR (placeholder for future implementation)
 * IRR calculation requires dates and cash flows
 */
export function calculateIRR(cashFlows: { date: string; amount: number }[]): number | null {
  // TODO: Implement XIRR calculation
  // This would use Newton-Raphson method or similar
  // For now, return null
  return null;
}

/**
 * Helper function to format currency
 */
export function formatCurrency(amount: number | null | undefined, decimals: number = 0): string {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

/**
 * Helper function to format percentage
 */
export function formatPercentage(value: number | null | undefined, decimals: number = 1): string {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(decimals)}%`;
}

/**
 * Helper function to format multiple (e.g., MOIC)
 */
export function formatMultiple(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(decimals)}x`;
}

/**
 * Helper to determine MOIC color class for UI
 */
export function getMOICColorClass(moic: number | null | undefined): string {
  if (moic === null || moic === undefined) return 'text-neutral-600';
  if (moic >= 2.0) return 'text-green-600';
  if (moic >= 1.0) return 'text-blue-600';
  if (moic >= 0.5) return 'text-amber-600';
  return 'text-red-600';
}

/**
 * Helper to determine gain color class for UI
 */
export function getGainColorClass(gain: number | null | undefined): string {
  if (gain === null || gain === undefined) return 'text-neutral-600';
  if (gain > 0) return 'text-green-600';
  if (gain < 0) return 'text-red-600';
  return 'text-neutral-600';
}
