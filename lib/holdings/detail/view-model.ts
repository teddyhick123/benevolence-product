import type { ContributionRow, FactRow, HoldingRow } from './types';

export function humanDate(iso?: string | null) {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

function latestByMetric(facts: FactRow[]) {
  const latest = new Map<string, FactRow>();
  for (const fact of facts) {
    if (!latest.has(fact.metric_code)) latest.set(fact.metric_code, fact);
  }
  return Array.from(latest.entries()).map(([metric_code, fact]) => ({
    metric_code,
    value:
      typeof fact.value === 'number'
        ? fact.value
        : fact.value != null && !Number.isNaN(Number(fact.value))
          ? Number(fact.value)
          : Number.NaN,
    updated_at: fact.updated_at,
  }));
}

export function buildHoldingDetailViewModel(
  holding: HoldingRow,
  facts: FactRow[],
  contributions: ContributionRow[],
  metricNames: Map<string, string>,
) {
  const totalContributions = contributions.reduce(
    (sum, contribution) => sum + (Number(contribution.amount_usd) || 0),
    0,
  );
  const funds = totalContributions > 0
    ? totalContributions
    : Number(holding.funds_allocated ?? 0) || 0;
  const totalOrgFunding = Number(holding.total_org_funding ?? 0) || 0;
  const kpiCards = latestByMetric(facts).map((metric) => {
    const value = typeof metric.value === 'number' ? metric.value : Number.NaN;
    let costPerOutcome: number | null = null;
    let attributedOutcomes: number | null = null;
    if (Number.isFinite(value) && value > 0) {
      if (totalOrgFunding > 0 && funds > 0) {
        attributedOutcomes = value * (funds / totalOrgFunding);
        costPerOutcome = funds / attributedOutcomes;
      } else if (funds > 0) {
        costPerOutcome = funds / value;
        attributedOutcomes = value;
      }
    }
    return {
      key: metric.metric_code,
      displayName: metricNames.get(metric.metric_code) || metric.metric_code,
      value,
      updated_at: metric.updated_at,
      costPerOutcome,
      outcomesPerThousand:
        funds > 0 && attributedOutcomes != null && Number.isFinite(attributedOutcomes)
          ? attributedOutcomes / (funds / 1000)
          : null,
      attributedOutcomes,
      hasProportionalAttribution: totalOrgFunding > 0,
    };
  });

  const locationParts = [holding.location_city, holding.location_state, holding.location_country]
    .filter(Boolean);
  const latestFact = facts[0];
  let grantPeriodStatus: 'Active' | 'Expired' | 'Pipeline' | null = null;
  if (latestFact?.period_end) {
    const now = new Date();
    if (new Date(latestFact.period_end) < now) grantPeriodStatus = 'Expired';
    else if (latestFact.period_start && new Date(latestFact.period_start) > now) {
      grantPeriodStatus = 'Pipeline';
    } else grantPeriodStatus = 'Active';
  }

  return {
    totalContributions,
    funds,
    totalOrgFunding,
    kpiCards,
    location: locationParts.length ? locationParts.join(', ') : null,
    legacyCostPerOutcome:
      holding.cost_per_outcome != null
        ? `${holding.cost_per_outcome}${holding.cost_per_outcome_unit ? ` ${holding.cost_per_outcome_unit}` : ''}`
        : null,
    hasBasicInfo: Boolean(holding.name && holding.asset_type && holding.sector && holding.status),
    grantPeriodStatus,
  };
}
