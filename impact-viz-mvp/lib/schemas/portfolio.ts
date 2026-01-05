import { z } from 'zod';

/**
 * Asset type enumeration - formal taxonomy for portfolio classification
 */
export const assetTypeSchema = z.enum([
  // Investment types
  'equity_investment',              // Public stocks
  'private_equity_investment',      // Private equity funds, PE investments
  'venture_capital_investment',     // VC funds, startup investments
  'debt_investment',                // Bonds, notes, loans
  'impact_bond',                    // Social/Green/Development Impact Bonds
  'conservation_investment',        // Forest carbon credits, wetland banking
  'pri',                            // Program Related Investment (IRS qualified)
  'mri',                            // Mission Related Investment

  // Grant types
  'foundation_grant',               // Direct foundation grant
  'daf_grant',                      // Donor Advised Fund grant

  // Donation types
  'donation',                       // General charitable contribution
  'real_estate_donation',           // Donated property, conservation easements
  'qcd_distribution',               // Qualified Charitable Distribution from IRA
  'cryptocurrency_donation',        // Bitcoin, Ethereum, other digital assets
  'artwork_collectible_donation',   // Art, collectibles (requires related-use)

  // Other
  'other',                          // Uncategorized
]);

export type AssetType = z.infer<typeof assetTypeSchema>;

/**
 * Human-readable labels for asset types
 */
export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  equity_investment: 'Public Equity',
  private_equity_investment: 'Private Equity',
  venture_capital_investment: 'Venture Capital',
  debt_investment: 'Debt Investment',
  impact_bond: 'Impact Bond',
  conservation_investment: 'Conservation Investment',
  pri: 'Program Related Investment (PRI)',
  mri: 'Mission Related Investment (MRI)',
  foundation_grant: 'Foundation Grant',
  daf_grant: 'DAF Grant',
  donation: 'Donation',
  real_estate_donation: 'Real Estate Donation',
  qcd_distribution: 'QCD Distribution',
  cryptocurrency_donation: 'Cryptocurrency Donation',
  artwork_collectible_donation: 'Artwork/Collectible Donation',
  other: 'Other',
};

/**
 * Asset type descriptions for UI help text
 */
export const ASSET_TYPE_DESCRIPTIONS: Record<AssetType, string> = {
  equity_investment: 'Publicly traded stocks and equity securities',
  private_equity_investment: 'Private equity funds, direct PE investments (requires qualified appraisal)',
  venture_capital_investment: 'VC funds, startup investments (requires qualified appraisal)',
  debt_investment: 'Bonds, notes, loans, and other debt instruments',
  impact_bond: 'Social Impact Bonds, Green Bonds, Development Impact Bonds',
  conservation_investment: 'Forest carbon credits, wetland banking, habitat restoration investments',
  pri: 'Program Related Investments - IRS qualified investments below market rate for charitable purposes',
  mri: 'Mission Related Investments - market-rate investments aligned with mission',
  foundation_grant: 'Grant directly from foundation to charitable organization',
  daf_grant: 'Grant recommended from Donor Advised Fund',
  donation: 'General charitable contribution (cash, stock, crypto, etc.)',
  real_estate_donation: 'Donated property, conservation easements (requires qualified appraisal >$5k)',
  qcd_distribution: 'Qualified Charitable Distribution from IRA (age 70.5+, excluded from income, max $100k/year)',
  cryptocurrency_donation: 'Bitcoin, Ethereum, other digital assets (avoid capital gains on appreciated crypto)',
  artwork_collectible_donation: 'Art, collectibles (requires qualified appraisal and related-use determination)',
  other: 'Other asset type not categorized above',
};

/**
 * Asset types that are considered investments (track financial performance)
 */
export const INVESTMENT_ASSET_TYPES: AssetType[] = [
  'equity_investment',
  'private_equity_investment',
  'venture_capital_investment',
  'debt_investment',
  'impact_bond',
  'conservation_investment',
  'pri',
  'mri',
];

/**
 * Asset types that are considered grants (track milestones)
 */
export const GRANT_ASSET_TYPES: AssetType[] = [
  'foundation_grant',
  'daf_grant',
];

/**
 * Asset types that are tax-deductible donations
 */
export const DONATION_ASSET_TYPES: AssetType[] = [
  'donation',
  'real_estate_donation',
  'qcd_distribution',
  'cryptocurrency_donation',
  'artwork_collectible_donation',
  'foundation_grant',
  'daf_grant',
];

/**
 * Standard color palette for asset types (for visualizations)
 * These colors are used across all widgets and charts for consistency
 */
export const ASSET_TYPE_COLORS: Record<AssetType, string> = {
  // Investment types - blue/purple spectrum
  equity_investment: '#3b82f6',           // blue-500 (public equity)
  private_equity_investment: '#1e40af',   // blue-800 (darker for private)
  venture_capital_investment: '#0ea5e9',  // sky-500 (lighter blue for VC)
  debt_investment: '#8b5cf6',             // purple-500
  impact_bond: '#7c3aed',                 // violet-600
  conservation_investment: '#059669',     // green-600 (nature)
  pri: '#10b981',                         // green-500 (charitable)
  mri: '#f59e0b',                         // amber-500 (mission-aligned)

  // Grant types - purple/indigo spectrum
  foundation_grant: '#a855f7',            // purple-500
  daf_grant: '#6366f1',                   // indigo-500

  // Donation types - pink/rose spectrum
  donation: '#ec4899',                    // pink-500 (general)
  real_estate_donation: '#be185d',        // pink-700 (property)
  qcd_distribution: '#f43f5e',            // rose-500 (retirement)
  cryptocurrency_donation: '#f97316',     // orange-500 (digital)
  artwork_collectible_donation: '#db2777', // pink-600 (collectibles)

  // Other
  other: '#6b7280',                       // neutral-500
};

/**
 * Helper to get color for an asset type
 */
export function getAssetTypeColor(assetType: AssetType): string {
  return ASSET_TYPE_COLORS[assetType] || ASSET_TYPE_COLORS.other;
}

/**
 * Schema for creating a new holding
 */
export const createHoldingSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name too long'),
  status: z.enum(['Active', 'Exited', 'Pipeline']).optional(),
  asset_type: assetTypeSchema.optional(),
  asset_subtype: z.string().max(200, 'Asset subtype too long').optional().nullable(),
  custodian: z.string().max(100).optional(),
  valuation_method: z.string().max(100).optional(),
  sector: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  investee_id: z.string().uuid().optional().nullable(),
  funds_allocated: z.number().positive('Funds allocated must be positive').optional().nullable(),
  nav: z.number().positive('NAV must be positive').optional().nullable(), // Legacy support
  as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().nullable(),
  as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().nullable(), // Legacy support
  // Location fields for geocoding
  location_city: z.string().max(100).optional().nullable(),
  location_state: z.string().max(100).optional().nullable(),
  location_country: z.string().max(100).optional().nullable(),
  // Geocoding results (usually auto-populated, but can be manually overridden)
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
});

/**
 * Schema for updating an existing holding
 */
export const updateHoldingSchema = createHoldingSchema.partial();

/**
 * Schema for creating a portfolio widget
 */
export const createWidgetSchema = z.object({
  type: z.string().min(1, 'Widget type is required'),
  title: z.string().max(255).optional().nullable(),
  config: z.record(z.any()).optional().nullable(),
});

/**
 * Schema for updating a widget
 */
export const updateWidgetSchema = z.object({
  type: z.string().min(1).max(50).optional(),
  title: z.string().max(255).optional().nullable(),
  config: z.record(z.any()).optional().nullable(),
  position: z.number().int().min(0).optional().nullable(),
});

/**
 * Schema for creating a KPI definition
 */
export const createKpiSchema = z.object({
  metric_code: z.string().min(1, 'Metric code is required').max(50),
  display_name: z.string().min(1, 'Display name is required').max(255),
  target_value: z.number().optional().nullable(),
  target_date: z.string().datetime().optional().nullable(),
  order_index: z.number().int().optional().nullable(),
  calculation: z.string().max(1000).optional().nullable(),
  unit: z.string().max(50).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
});

/**
 * Schema for updating a KPI definition
 */
export const updateKpiSchema = createKpiSchema.partial().extend({
  metric_code: z.string().max(50).optional(), // Make optional for updates
});

/**
 * Common query parameter schemas
 */
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
