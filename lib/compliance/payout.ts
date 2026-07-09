export interface Foundation990PfData {
  avg_fair_market_value?: number | string | null;
  fair_market_value_assets?: number | string | null;
  exempt_use_assets?: number | string | null;
  acquisition_indebtedness?: number | string | null;
  excise_tax_rate?: number | string | null;
  excise_tax_amount?: number | string | null;
  net_investment_income?: number | string | null;
  required_payout?: number | string | null;
  actual_payout?: number | string | null;
}

export interface PayoutCalculation {
  assetBase: number | null;
  avgFmvUsed: boolean;
  actualDistributions: number;
  exemptUseAssets: number;
  acquisitionIndebtedness: number;
  netValueNonCharitable: number | null;
  minimumInvestmentReturn: number | null;
  exciseTaxRate: number;
  exciseTaxAmount: number;
  distributableAmount: number | null;
  requiredPayout: number | null;
  surplusOrDeficit: number | null;
  pctDistributed: number | null;
}

function numeric(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function currency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculatePayout(
  pf990: Foundation990PfData | null | undefined,
  qualifyingDistributionTotal: number
): PayoutCalculation {
  const avgFmv = numeric(pf990?.avg_fair_market_value);
  const yearEndFmv = numeric(pf990?.fair_market_value_assets);
  const assetBase = avgFmv ?? yearEndFmv;
  const avgFmvUsed = avgFmv !== null;

  const actualDistributions = currency(numeric(pf990?.actual_payout) ?? qualifyingDistributionTotal);
  const exemptUseAssets = numeric(pf990?.exempt_use_assets) ?? 0;
  const acquisitionIndebtedness = numeric(pf990?.acquisition_indebtedness) ?? 0;

  const netValueNonCharitable = assetBase !== null
      ? currency(Math.max(0, assetBase - exemptUseAssets - acquisitionIndebtedness))
      : null;

  const minimumInvestmentReturn = netValueNonCharitable !== null
    ? currency(netValueNonCharitable * 0.05)
    : null;

  const exciseTaxRate = numeric(pf990?.excise_tax_rate) ?? 1.39;
  const exciseTaxAmount =
    numeric(pf990?.excise_tax_amount) ??
    currency(((numeric(pf990?.net_investment_income) ?? 0) * exciseTaxRate) / 100);

  const distributableAmount = minimumInvestmentReturn !== null
    ? currency(Math.max(0, minimumInvestmentReturn - exciseTaxAmount))
    : null;

  const requiredPayout = numeric(pf990?.required_payout) ?? distributableAmount;
  const surplusOrDeficit = requiredPayout !== null
    ? currency(actualDistributions - requiredPayout)
    : null;
  const pctDistributed =
    requiredPayout !== null && requiredPayout > 0
      ? Math.round((actualDistributions / requiredPayout) * 10000) / 100
      : null;

  return {
    assetBase,
    avgFmvUsed,
    actualDistributions,
    exemptUseAssets,
    acquisitionIndebtedness,
    netValueNonCharitable,
    minimumInvestmentReturn,
    exciseTaxRate,
    exciseTaxAmount,
    distributableAmount,
    requiredPayout,
    surplusOrDeficit,
    pctDistributed,
  };
}
