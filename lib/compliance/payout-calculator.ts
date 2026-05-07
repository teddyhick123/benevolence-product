/**
 * IRC §4942 Payout Requirement Calculator
 *
 * Pure functions for private foundation minimum distribution calculations.
 * All formulas are derived from IRC §4942 and Treasury Regulations §53.4942(a)-1.
 *
 * Key rule: A private foundation must distribute at least 5% of the
 * average fair market value of its non-charitable-use assets each year
 * as "qualifying distributions."
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PayoutHistoryInput {
  net_value_non_charitable: number;
  excise_tax_paid?: number;
  qualifying_distributions_total?: number;
  carryover_from_prior_years?: number;
}

export interface PayoutCalculation {
  net_value_non_charitable: number;
  minimum_investment_return: number;
  excise_tax_paid: number;
  distributable_amount: number;
}

export interface PayoutForecast {
  distributable_amount: number;
  distributions_to_date: number;
  pipeline_total: number;
  shortfall_before_pipeline: number;
  shortfall_after_pipeline: number;
  on_track: boolean;
  pct_complete: number;
  days_remaining: number;
}

export interface SelfDealingExciseTaxes {
  initial_excise_tax: number;    // IRC §4941(a): 10% of amount
  correction_excise_tax: number; // IRC §4941(b): 200% if not corrected
}

export interface ComplianceHealthInput {
  filings_overdue: number;
  incidents_open: number;       // flagged + confirmed
  state_renewals_overdue: number;
}

// ─── IRC §4942 Core Calculations ─────────────────────────────────────────────

/**
 * Calculate Minimum Investment Return (MIR).
 * MIR = net fair market value of non-charitable-use assets × 5%
 * Reg. §53.4942(a)-2(c)
 */
export function calculateMIR(netValueNonCharitable: number): number {
  if (netValueNonCharitable < 0) return 0;
  return round2(netValueNonCharitable * 0.05);
}

/**
 * Calculate distributable amount.
 * Distributable Amount = MIR - excise taxes paid under §4940
 * IRC §4942(d)
 */
export function calculateDistributableAmount(
  netValueNonCharitable: number,
  exciseTaxPaid: number = 0
): number {
  const mir = calculateMIR(netValueNonCharitable);
  return round2(Math.max(0, mir - exciseTaxPaid));
}

/**
 * Full payout calculation with all steps shown.
 * Returns each intermediate value for transparency (useful for 990-PF Part XI).
 */
export function calculatePayout(input: PayoutHistoryInput): PayoutCalculation {
  const exciseTaxPaid = input.excise_tax_paid ?? 0;
  const mir = calculateMIR(input.net_value_non_charitable);
  return {
    net_value_non_charitable: input.net_value_non_charitable,
    minimum_investment_return: mir,
    excise_tax_paid: exciseTaxPaid,
    distributable_amount: round2(Math.max(0, mir - exciseTaxPaid)),
  };
}

/**
 * Calculate surplus or deficit for the year.
 * Positive = surplus (carryover to next year).
 * Negative = shortfall (potential IRC §4942 excise tax exposure).
 */
export function calculateSurplusOrDeficit(
  qualifyingDistributionsTotal: number,
  distributableAmount: number
): number {
  return round2(qualifyingDistributionsTotal - distributableAmount);
}

// ─── Payout Forecast ─────────────────────────────────────────────────────────

/**
 * Calculate real-time payout forecast including pipeline grants.
 */
export function calculatePayoutForecast(
  distributableAmount: number,
  distributionsToDate: number,
  pipelineTotal: number,
  taxYear: number,
  today: Date = new Date()
): PayoutForecast {
  const shortfallBeforePipeline = Math.max(0, round2(distributableAmount - distributionsToDate));
  const shortfallAfterPipeline = Math.max(0, round2(shortfallBeforePipeline - pipelineTotal));
  const onTrack = shortfallAfterPipeline <= 0;

  const yearEnd = new Date(`${taxYear}-12-31`);
  const daysRemaining = Math.max(0, Math.floor((yearEnd.getTime() - today.getTime()) / MS_PER_DAY));

  const pctComplete = distributableAmount > 0
    ? Math.min(100, round1(distributionsToDate / distributableAmount * 100))
    : 100;

  return {
    distributable_amount: distributableAmount,
    distributions_to_date: distributionsToDate,
    pipeline_total: pipelineTotal,
    shortfall_before_pipeline: shortfallBeforePipeline,
    shortfall_after_pipeline: shortfallAfterPipeline,
    on_track: onTrack,
    pct_complete: pctComplete,
    days_remaining: daysRemaining,
  };
}

// ─── IRC §4941 Self-Dealing Excise Taxes ─────────────────────────────────────

/**
 * Calculate IRC §4941 excise taxes on self-dealing transactions.
 * §4941(a): initial tax = 10% of amount involved
 * §4941(b): correction tax = 200% of amount if not corrected timely
 */
export function calculateSelfDealingExciseTaxes(amount: number): SelfDealingExciseTaxes {
  if (amount < 0) throw new RangeError('Self-dealing amount must be non-negative');
  return {
    initial_excise_tax: round2(amount * 0.10),
    correction_excise_tax: round2(amount * 2.00),
  };
}

// ─── Compliance Health Score ──────────────────────────────────────────────────

/**
 * Compute the compliance health score (0–100).
 * Mirrors the formula in v_compliance_dashboard.
 *
 * Deductions:
 *  - 15 pts per overdue filing
 *  - 20 pts per open self-dealing incident
 *  - 10 pts per overdue state renewal
 */
export function calculateHealthScore(input: ComplianceHealthInput): number {
  const raw = 100
    - input.filings_overdue * 15
    - input.incidents_open * 20
    - input.state_renewals_overdue * 10;
  return Math.max(0, Math.min(100, raw));
}

/**
 * Classify a health score into a severity label.
 */
export function classifyHealthScore(score: number): 'good' | 'attention' | 'at_risk' {
  if (score >= 80) return 'good';
  if (score >= 60) return 'attention';
  return 'at_risk';
}

// ─── Self-Dealing Pre-Screen ──────────────────────────────────────────────────

export type SelfDealingRiskLevel = 'none' | 'medium' | 'high';

const HIGH_RISK_RELATIONSHIPS = new Set([
  'founder',
  'substantial_contributor',
  'foundation_manager',
]);

export interface DisqualifiedPersonRecord {
  full_name: string;
  relationship_type: string;
  ein?: string | null;
}

/**
 * Determine self-dealing risk level by matching a counterparty against
 * the disqualified persons registry.
 *
 * Matching rules:
 *  - Name: substring match (case-insensitive, bidirectional)
 *  - EIN: exact match after stripping hyphens
 *
 * Risk levels:
 *  - 'high'   → match found with founder / substantial_contributor / foundation_manager
 *  - 'medium' → match found with any other relationship type
 *  - 'none'   → no match
 */
export function assessSelfDealingRisk(
  counterpartyName: string,
  counterpartyEin: string | undefined,
  disqualifiedPersons: DisqualifiedPersonRecord[]
): { riskLevel: SelfDealingRiskLevel; matches: DisqualifiedPersonRecord[] } {
  const nameLower = counterpartyName.toLowerCase().trim();
  const einNormalized = counterpartyEin ? normalizeEin(counterpartyEin) : '';

  const matches = disqualifiedPersons.filter(p => {
    const personNameLower = p.full_name.toLowerCase().trim();
    const nameMatch =
      personNameLower.includes(nameLower) ||
      nameLower.includes(personNameLower);
    const einMatch = einNormalized && p.ein && normalizeEin(p.ein) === einNormalized;
    return nameMatch || einMatch;
  });

  if (matches.length === 0) return { riskLevel: 'none', matches: [] };

  const hasHighRisk = matches.some(m => HIGH_RISK_RELATIONSHIPS.has(m.relationship_type));
  return {
    riskLevel: hasHighRisk ? 'high' : 'medium',
    matches,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function normalizeEin(ein: string): string {
  return ein.replace(/-/g, '').trim();
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;
