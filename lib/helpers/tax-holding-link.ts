import { AssetType } from '@/lib/schemas/portfolio';

/**
 * Contribution type for tax contributions
 */
export type ContributionType =
  | 'cash'
  | 'check'
  | 'wire'
  | 'ach'
  | 'stock'
  | 'crypto'
  | 'other_property'
  | 'real_estate'
  | 'vehicle'
  | 'art'
  | 'other';

/**
 * Maps asset types to recommended contribution types
 */
export const ASSET_TYPE_TO_CONTRIBUTION_TYPE: Record<AssetType, ContributionType> = {
  // Investment types
  equity_investment: 'stock',
  private_equity_investment: 'other_property',
  venture_capital_investment: 'other_property',
  debt_investment: 'other_property',
  impact_bond: 'other_property',
  conservation_investment: 'other_property',
  pri: 'other_property',
  mri: 'stock',

  // Grant types
  foundation_grant: 'cash',
  daf_grant: 'cash',

  // Donation types
  donation: 'cash',
  real_estate_donation: 'real_estate',
  qcd_distribution: 'ach',
  cryptocurrency_donation: 'crypto',
  artwork_collectible_donation: 'art',

  // Other
  other: 'other_property',
};

/**
 * Gets the recommended contribution type for a given asset type
 */
export function suggestContributionType(assetType: AssetType): ContributionType {
  return ASSET_TYPE_TO_CONTRIBUTION_TYPE[assetType] || 'other_property';
}

/**
 * Validates if a contribution type is compatible with an asset type
 */
export function isContributionTypeValid(
  assetType: AssetType,
  contributionType: ContributionType
): { valid: boolean; reason?: string } {
  switch (assetType) {
    case 'equity_investment':
      if (!['stock', 'crypto'].includes(contributionType)) {
        return {
          valid: false,
          reason: 'Public equity investments must use stock or crypto contribution type',
        };
      }
      break;

    case 'private_equity_investment':
    case 'venture_capital_investment':
      if (contributionType !== 'other_property') {
        return {
          valid: false,
          reason: 'Private equity and VC investments require other_property contribution type (requires qualified appraisal)',
        };
      }
      break;

    case 'debt_investment':
    case 'impact_bond':
      if (!['other_property', 'cash'].includes(contributionType)) {
        return {
          valid: false,
          reason: 'Debt investments and impact bonds should use other_property or cash contribution type',
        };
      }
      break;

    case 'conservation_investment':
      if (contributionType !== 'other_property') {
        return {
          valid: false,
          reason: 'Conservation investments should use other_property contribution type',
        };
      }
      break;

    case 'pri':
    case 'mri':
      if (contributionType !== 'other_property') {
        return {
          valid: false,
          reason: 'PRI/MRI investments should use other_property contribution type',
        };
      }
      break;

    case 'foundation_grant':
    case 'daf_grant':
      if (!['cash', 'check', 'wire', 'ach'].includes(contributionType)) {
        return {
          valid: false,
          reason: 'Foundation and DAF grants should use cash-based contribution types',
        };
      }
      break;

    case 'real_estate_donation':
      if (contributionType !== 'real_estate') {
        return {
          valid: false,
          reason: 'Real estate donations must use real_estate contribution type',
        };
      }
      break;

    case 'qcd_distribution':
      if (contributionType !== 'ach') {
        return {
          valid: false,
          reason: 'QCD distributions must come directly from IRA via ACH (cannot go to DAF or supporting organization)',
        };
      }
      break;

    case 'cryptocurrency_donation':
      if (contributionType !== 'crypto') {
        return {
          valid: false,
          reason: 'Cryptocurrency donations must use crypto contribution type',
        };
      }
      break;

    case 'artwork_collectible_donation':
      if (contributionType !== 'art') {
        return {
          valid: false,
          reason: 'Artwork/collectible donations must use art contribution type',
        };
      }
      break;

    case 'donation':
      // Donations can be any type (stock, cash, crypto, real_estate, etc.)
      // This allows for appreciated stock donations which are tax-advantaged
      break;

    case 'other':
      // Allow any contribution type for 'other'
      break;
  }

  return { valid: true };
}

/**
 * Interface for holding data needed to create a tax contribution
 */
export interface HoldingForTax {
  id: string;
  name: string;
  asset_type?: AssetType | null;
  funds_allocated?: number | null;
  created_at?: string;
  // Optional fields from investment tracking
  cost_basis?: number | null;
  current_nav?: number | null;
}

/**
 * Interface for auto-populated tax contribution data
 */
export interface TaxContributionDraft {
  holding_id: string;
  contribution_type: ContributionType;
  amount_usd: number;
  cost_basis?: number | null;
  fmv_at_donation?: number | null;
  recipient_name: string;
  donation_date?: string;
  deduction_year?: number;
  notes?: string;
}

/**
 * Creates a draft tax contribution from a holding
 * This suggests values but doesn't persist to database
 */
export function createTaxContributionDraft(holding: HoldingForTax): TaxContributionDraft {
  const assetType = holding.asset_type || 'other';
  const contributionType = suggestContributionType(assetType);

  // Base draft
  const draft: TaxContributionDraft = {
    holding_id: holding.id,
    contribution_type: contributionType,
    amount_usd: holding.funds_allocated || 0,
    recipient_name: holding.name,
  };

  // For investments with cost basis and NAV, populate those fields
  if (holding.cost_basis !== undefined && holding.cost_basis !== null) {
    draft.cost_basis = holding.cost_basis;
  }

  if (holding.current_nav !== undefined && holding.current_nav !== null) {
    draft.fmv_at_donation = holding.current_nav;
  }

  // For equity investments, use funds_allocated as both cost basis and FMV if not already set
  if (assetType === 'equity_investment' && !draft.cost_basis) {
    draft.cost_basis = holding.funds_allocated || 0;
    draft.fmv_at_donation = holding.funds_allocated || 0;
  }

  // Suggest donation date based on holding creation date
  if (holding.created_at) {
    const createdDate = new Date(holding.created_at);
    draft.donation_date = createdDate.toISOString().split('T')[0];
    draft.deduction_year = createdDate.getFullYear();
  } else {
    // Default to current year
    const now = new Date();
    draft.donation_date = now.toISOString().split('T')[0];
    draft.deduction_year = now.getFullYear();
  }

  // Add helpful note
  draft.notes = `Auto-generated from ${assetType} holding: ${holding.name}`;

  return draft;
}

/**
 * Calculates capital gains avoided for a tax contribution
 */
export function calculateCapitalGainsAvoided(
  costBasis?: number | null,
  fmvAtDonation?: number | null
): number | null {
  if (costBasis === null || costBasis === undefined) return null;
  if (fmvAtDonation === null || fmvAtDonation === undefined) return null;

  return fmvAtDonation - costBasis;
}

/**
 * Gets display label for contribution type
 */
export const CONTRIBUTION_TYPE_LABELS: Record<ContributionType, string> = {
  cash: 'Cash',
  check: 'Check',
  wire: 'Wire Transfer',
  ach: 'ACH Transfer',
  stock: 'Publicly Traded Stock',
  crypto: 'Cryptocurrency',
  other_property: 'Other Property',
  real_estate: 'Real Estate',
  vehicle: 'Vehicle',
  art: 'Art/Collectibles',
  other: 'Other',
};

/**
 * Tax metadata for asset types - helps auto-populate enhanced tax fields
 */
export interface TaxMetadata {
  requires_appraisal: boolean;
  appraisal_threshold?: number;
  agi_limit_percentage?: number;
  carryforward_eligible: boolean;
  carryforward_years?: number;
  holding_period_ltcg_required?: boolean;
  potential_ubit?: boolean;
  qcd_qualified?: boolean;
  conservation_eligible?: boolean;
  related_use_consideration?: boolean;
  form_8283_required?: boolean;
  notes?: string;
}

/**
 * Gets tax metadata for a given asset type
 * Used to auto-populate enhanced tax tracking fields
 */
export function getAssetTaxMetadata(assetType: AssetType): TaxMetadata {
  switch (assetType) {
    case 'equity_investment':
      return {
        requires_appraisal: false,
        agi_limit_percentage: 30, // 30% for appreciated property to public charity
        carryforward_eligible: true,
        carryforward_years: 5,
        holding_period_ltcg_required: true,
        potential_ubit: false,
        notes: 'Long-term appreciated stock allows FMV deduction + avoids capital gains. Must hold >1 year.',
      };

    case 'private_equity_investment':
      return {
        requires_appraisal: true,
        appraisal_threshold: 10000,
        agi_limit_percentage: 30,
        carryforward_eligible: true,
        carryforward_years: 5,
        holding_period_ltcg_required: true,
        potential_ubit: true,
        notes: 'Requires qualified appraisal. May trigger UBIT if charity holds operating business interest. Consider timing for valuation.',
      };

    case 'venture_capital_investment':
      return {
        requires_appraisal: true,
        appraisal_threshold: 10000,
        agi_limit_percentage: 30,
        carryforward_eligible: true,
        carryforward_years: 5,
        holding_period_ltcg_required: true,
        potential_ubit: true,
        notes: 'Requires qualified appraisal. Illiquid nature may complicate valuation. May trigger UBIT.',
      };

    case 'debt_investment':
      return {
        requires_appraisal: false,
        agi_limit_percentage: 30,
        carryforward_eligible: true,
        carryforward_years: 5,
        potential_ubit: false,
        notes: 'Bonds typically valued at market price. Corporate bonds may have different AGI limits than muni bonds.',
      };

    case 'impact_bond':
      return {
        requires_appraisal: false,
        agi_limit_percentage: 30,
        carryforward_eligible: true,
        carryforward_years: 5,
        potential_ubit: false,
        notes: 'Social/Green bonds valued at market. May have state/local tax incentives.',
      };

    case 'conservation_investment':
      return {
        requires_appraisal: true,
        appraisal_threshold: 5000,
        agi_limit_percentage: 50, // Enhanced for conservation easements
        carryforward_eligible: true,
        carryforward_years: 15, // Extended carryforward for conservation
        conservation_eligible: true,
        notes: 'Conservation easements may qualify for enhanced 50% AGI limit and 15-year carryforward. Requires qualified appraisal and baseline documentation.',
      };

    case 'real_estate_donation':
      return {
        requires_appraisal: true,
        appraisal_threshold: 5000,
        agi_limit_percentage: 30,
        carryforward_eligible: true,
        carryforward_years: 5,
        conservation_eligible: true,
        notes: 'Requires qualified appraisal for property >$5k. Consider environmental assessments. Conservation easements may qualify for enhanced deduction.',
      };

    case 'qcd_distribution':
      return {
        requires_appraisal: false,
        agi_limit_percentage: 100, // Not actually AGI limited, excluded from income
        carryforward_eligible: false, // QCDs don't carry forward
        qcd_qualified: true,
        notes: 'QCD excluded from income (better than deduction). Age 70.5+, max $100k/year, counts toward RMD. Cannot go to DAF or supporting org.',
      };

    case 'cryptocurrency_donation':
      return {
        requires_appraisal: false, // Unless >$5k
        appraisal_threshold: 5000,
        agi_limit_percentage: 30,
        carryforward_eligible: true,
        carryforward_years: 5,
        holding_period_ltcg_required: true,
        notes: 'Treated as property. Avoid capital gains on appreciated crypto. Needs clear documentation of FMV at donation time.',
      };

    case 'artwork_collectible_donation':
      return {
        requires_appraisal: true,
        appraisal_threshold: 5000,
        agi_limit_percentage: 30, // If related-use qualified
        carryforward_eligible: true,
        carryforward_years: 5,
        related_use_consideration: true,
        notes: 'Related-use rule critical: if art is related to charity exempt purpose, FMV deduction. If unrelated, limited to cost basis. Requires qualified appraisal.',
      };

    case 'pri':
      return {
        requires_appraisal: false,
        agi_limit_percentage: 20, // 20% for donations to private foundations
        carryforward_eligible: true,
        carryforward_years: 5,
        notes: 'Program Related Investments to private foundations. Below-market rate acceptable. 20% AGI limit.',
      };

    case 'mri':
      return {
        requires_appraisal: false,
        agi_limit_percentage: 30,
        carryforward_eligible: true,
        carryforward_years: 5,
        notes: 'Mission Related Investments at market rate. Tax treatment similar to appreciated property.',
      };

    case 'foundation_grant':
      return {
        requires_appraisal: false,
        agi_limit_percentage: 30, // 30% for private foundations, 60% for public charities
        carryforward_eligible: true,
        carryforward_years: 5,
        notes: 'Cash donations to private foundations: 30% AGI limit. To public charities: 60% limit.',
      };

    case 'daf_grant':
      return {
        requires_appraisal: false,
        agi_limit_percentage: 60, // Cash to public charity (DAF)
        carryforward_eligible: true,
        carryforward_years: 5,
        notes: 'DAF contributions (to fund itself) are 60% AGI for cash. Deduction when contributed to DAF, not when granted out.',
      };

    case 'donation':
      return {
        requires_appraisal: false,
        agi_limit_percentage: 60, // Default for cash to public charity
        carryforward_eligible: true,
        carryforward_years: 5,
        notes: 'General donation. Cash to public charity: 60% AGI. Appreciated property: 30% AGI.',
      };

    case 'other':
      return {
        requires_appraisal: false,
        carryforward_eligible: true,
        carryforward_years: 5,
        notes: 'Unclassified asset type. Review IRS rules for specific property type.',
      };
  }
}
