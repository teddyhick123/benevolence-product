// lib/ai/assistant/executors/tax.ts
//
// AI tool implementations for the tax_optimization module.
// Each function maps to one tool case in executeAssistantTool.
//
// Canonical data sources:
//   AGI          : tax_years.adjusted_gross_income (primary)
//                  fallback → tax_profiles.estimated_agi
//   Carryforward : tax_carryforwards / v_active_carryforwards
//                  (NOT tax_contributions — carryforwards have their own table)
//   Filing status: tax_years.filing_status

import type { ToolResult } from '@/lib/ai/types';
import { getStandardDeduction } from '@/lib/tax/constants';
import type { FilingStatus } from '@/lib/schemas/tax';

type DB = any; // supabase client

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Read AGI for the requested year from the canonical source hierarchy:
 *   1. tax_years.adjusted_gross_income  (year-specific, most accurate)
 *   2. tax_profiles.estimated_agi       (year-specific planning estimate)
 *
 * Returns null if no value is found — callers must handle this and return an
 * explicit error; never substitute a hardcoded default.
 */
async function readAGI(
  supabase: DB,
  portfolioId: string,
  taxYear: number
): Promise<{ agi: number | null; filingStatus: string | null }> {
  // Primary: tax_years
  const { data: taxYearData } = await supabase
    .from('tax_years')
    .select('adjusted_gross_income, filing_status')
    .eq('portfolio_id', portfolioId)
    .eq('tax_year', taxYear)
    .maybeSingle();

  if (taxYearData?.adjusted_gross_income != null) {
    return {
      agi: Number(taxYearData.adjusted_gross_income),
      filingStatus: taxYearData.filing_status ?? null,
    };
  }

  // Fallback: tax_profiles.estimated_agi (also year-scoped)
  const { data: profileData } = await supabase
    .from('tax_profiles')
    .select('estimated_agi, filing_status')
    .eq('portfolio_id', portfolioId)
    .eq('tax_year', taxYear)
    .maybeSingle();

  if (profileData?.estimated_agi != null) {
    return {
      agi: Number(profileData.estimated_agi),
      filingStatus: profileData.filing_status ?? null,
    };
  }

  return { agi: null, filingStatus: null };
}

/** Resolve AGI-limit percentage based on asset type and recipient type. */
function agiLimitPercent(assetType: string, recipientType: string): number {
  if (assetType === 'cash' && recipientType === 'public_charity') return 0.6;
  if (assetType === 'cash' && recipientType === 'private_foundation') return 0.3;
  if (assetType === 'public_stock' && recipientType === 'public_charity') return 0.3;
  if (assetType === 'public_stock' && recipientType === 'private_foundation') return 0.2;
  return 0.3; // conservative default for other assets
}

// ---------------------------------------------------------------------------
// run_tax_scenario
// ---------------------------------------------------------------------------

export async function runTaxScenario(
  supabase: DB,
  args: any,
  portfolioId: string
): Promise<ToolResult> {
  const scenarioType: string = args.scenario_type;
  const donationAmount: number = args.donation_amount;
  const taxYear: number = args.tax_year ?? new Date().getFullYear();

  // Read AGI from canonical source
  const { agi, filingStatus } = await readAGI(supabase, portfolioId, taxYear);

  if (agi == null) {
    return {
      action: null,
      output: {
        error: 'AGI not configured',
        message:
          'Please set your Adjusted Gross Income in the Tax Center (Tax Profile tab) before running tax scenarios.',
      },
    };
  }

  // Use a reasonable marginal rate estimate; a full implementation would read
  // this from tax_years or let the user supply it.
  const taxBracket = 0.37;

  const result: any = {
    scenario_type: scenarioType,
    donation_amount: donationAmount,
    tax_year: taxYear,
    agi,
    filing_status: filingStatus,
    tax_bracket: taxBracket,
    tax_bracket_note: 'Estimated at 37%; actual marginal rate may vary. Update in Tax Center for precise scenarios.',
  };

  switch (scenarioType) {
    case 'cash_vs_stock': {
      // Cash donation — 60% AGI limit for public charities
      const cashDeductionLimit = agi * 0.6;
      const cashDeduction = Math.min(donationAmount, cashDeductionLimit);
      const cashTaxSavings = cashDeduction * taxBracket;
      const cashCarryforward = Math.max(0, donationAmount - cashDeductionLimit);

      // Appreciated stock — 30% AGI limit for public charities
      const stockDeductionLimit = agi * 0.3;
      const stockDeduction = Math.min(donationAmount, stockDeductionLimit);
      const assets: any[] = args.assets ?? [];
      let totalGainAvoided = 0;
      for (const a of assets) {
        if (a.holding_period === 'long') {
          totalGainAvoided += a.current_value - a.cost_basis;
        }
      }
      const capGainsTaxAvoided = totalGainAvoided * 0.2; // 20% LTCG rate
      const stockTaxSavings = stockDeduction * taxBracket + capGainsTaxAvoided;
      const stockCarryforward = Math.max(0, donationAmount - stockDeductionLimit);

      result.scenarios = {
        cash: {
          deduction: cashDeduction,
          tax_savings: cashTaxSavings,
          carryforward: cashCarryforward,
          effective_cost: donationAmount - cashTaxSavings,
        },
        appreciated_stock: {
          deduction: stockDeduction,
          tax_savings: stockTaxSavings,
          capital_gains_avoided: capGainsTaxAvoided,
          carryforward: stockCarryforward,
          effective_cost: donationAmount - stockTaxSavings,
        },
      };
      result.recommendation =
        stockTaxSavings > cashTaxSavings
          ? 'Donating appreciated stock saves more in taxes'
          : 'Cash donation provides better tax benefits in this case';
      break;
    }

    case 'bunching': {
      const knownFilingStatuses: FilingStatus[] = [
        'single', 'married_joint', 'married_separate', 'head_of_household',
      ];
      const resolvedFilingStatus: FilingStatus =
        knownFilingStatuses.includes(filingStatus as FilingStatus)
          ? (filingStatus as FilingStatus)
          : 'single';
      const stdDeduction = getStandardDeduction(taxYear, resolvedFilingStatus);
      const spreadYearlyDonation = donationAmount / 2;
      const spreadDeduction = Math.max(0, spreadYearlyDonation - stdDeduction) * 2;
      const bunchedDeduction = Math.max(0, donationAmount - stdDeduction);

      result.scenarios = {
        spread_over_2_years: {
          yearly_donation: spreadYearlyDonation,
          total_itemized_benefit: spreadDeduction,
          tax_savings: spreadDeduction * taxBracket,
        },
        bunched_in_1_year: {
          donation: donationAmount,
          itemized_benefit: bunchedDeduction,
          tax_savings: bunchedDeduction * taxBracket,
        },
      };
      result.standard_deduction_used = stdDeduction;
      result.recommendation =
        bunchedDeduction > spreadDeduction
          ? 'Bunching donations in one year provides better tax benefits'
          : 'Spreading donations may work better for your situation';
      break;
    }

    default:
      result.message = `Scenario type '${scenarioType}' analysis would be performed here`;
  }

  return { action: null, output: result };
}

// ---------------------------------------------------------------------------
// calculate_deduction
// ---------------------------------------------------------------------------

export async function calculateDeduction(
  supabase: DB,
  args: any,
  portfolioId: string
): Promise<ToolResult> {
  const amount: number = args.amount;
  const assetType: string = args.asset_type;
  const recipientType: string = args.recipient_type;
  const taxYear: number = args.tax_year ?? new Date().getFullYear();

  // Prefer caller-supplied AGI; otherwise read from canonical source
  let agi: number | null = args.agi != null ? Number(args.agi) : null;
  if (agi == null) {
    const result = await readAGI(supabase, portfolioId, taxYear);
    agi = result.agi;
  }

  if (agi == null) {
    return {
      action: null,
      output: {
        error: 'AGI not configured',
        message:
          'Please set your Adjusted Gross Income in the Tax Center (Tax Profile tab) before running tax scenarios.',
      },
    };
  }

  const limitPercent = agiLimitPercent(assetType, recipientType);
  const maxDeduction = agi * limitPercent;
  const allowedDeduction = Math.min(amount, maxDeduction);
  const carryforward = Math.max(0, amount - maxDeduction);

  return {
    action: null,
    output: {
      contribution_amount: amount,
      asset_type: assetType,
      recipient_type: recipientType,
      agi,
      tax_year: taxYear,
      agi_limit_percent: limitPercent * 100,
      max_deduction_this_year: maxDeduction,
      allowed_deduction: allowedDeduction,
      carryforward_amount: carryforward,
      carryforward_years: carryforward > 0 ? 5 : 0,
    },
  };
}

// ---------------------------------------------------------------------------
// get_carryforward
// ---------------------------------------------------------------------------

export async function getCarryforward(
  supabase: DB,
  args: any,
  portfolioId: string
): Promise<ToolResult> {
  const taxYear: number = args.tax_year ?? new Date().getFullYear();

  // Query tax_carryforwards directly so we can filter by the requested taxYear.
  // v_active_carryforwards filters on CURRENT_DATE at the DB level, which
  // ignores the caller's taxYear argument — use the base table instead.
  const { data: rows, error } = await supabase
    .from('tax_carryforwards')
    .select(
      'id, portfolio_id, originating_tax_year, expires_tax_year, amount, amount_remaining, agi_limit_category, recipient_name'
    )
    .eq('portfolio_id', portfolioId)
    .gt('amount_remaining', 0)
    .gte('expires_tax_year', taxYear)       // not yet expired for the requested year
    .lte('originating_tax_year', taxYear);  // already originated by the requested year

  if (error) {
    return {
      action: null,
      output: {
        error: 'Failed to read carryforward data',
        message: error.message,
      },
    };
  }

  const carryforwards = (rows ?? []).map((cf: any) => {
    const yearsUntilExpiry = cf.expires_tax_year - taxYear;
    const status =
      cf.amount_remaining <= 0
        ? 'fully_used'
        : cf.amount_remaining < cf.amount
        ? 'partially_used'
        : 'available';
    return {
      id: cf.id,
      originating_tax_year: cf.originating_tax_year,
      expires_tax_year: cf.expires_tax_year,
      original_amount: cf.amount,
      amount_remaining: cf.amount_remaining,
      agi_limit_category: cf.agi_limit_category,
      recipient_name: cf.recipient_name,
      status,
      years_until_expiry: yearsUntilExpiry,
    };
  });

  // Also include expiring-soon carryforwards as a heads-up
  const expiringSoon = carryforwards.filter(
    (cf: any) => cf.years_until_expiry != null && cf.years_until_expiry <= 1
  );

  const totalCarryforward = carryforwards.reduce(
    (sum: number, cf: any) => sum + Number(cf.amount_remaining ?? 0),
    0
  );

  return {
    action: null,
    output: {
      tax_year: taxYear,
      total_carryforward: totalCarryforward,
      carryforwards,
      expiring_soon: expiringSoon,
      message:
        totalCarryforward > 0
          ? `You have $${totalCarryforward.toLocaleString()} in charitable contribution carryforwards available`
          : 'No active carryforward amounts found',
    },
  };
}
