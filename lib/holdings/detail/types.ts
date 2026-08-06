export type HoldingRow = {
  id: string;
  org_id: string;
  portfolio_id: string;
  name: string;
  asset_type?: string | null;
  description?: string | null;
  primary_contact_name?: string | null;
  primary_contact_email?: string | null;
  primary_contact_phone?: string | null;
  primary_contact_photo?: string | null;
  primary_contact_notes?: string | null;
  website?: string | null;
  location_city?: string | null;
  location_state?: string | null;
  location_country?: string | null;
  theory_of_action?: string | null;
  cost_per_outcome?: number | null;
  cost_per_outcome_unit?: string | null;
  funds_allocated?: number | null;
  total_org_funding?: number | null;
  status?: string | null;
  sector?: string | null;
  as_of?: string | null;
  charity_id?: string | null;
};

export type FactRow = {
  id: string;
  holding_id: string;
  metric_code: string;
  value?: number | string | null;
  updated_at: string;
  period_start?: string | null;
  period_end?: string | null;
  source?: string | null;
};

export type ContributionRow = {
  id: string;
  portfolio_id: string;
  holding_id: string;
  amount_usd: number;
  contribution_date: string;
  notes?: string | null;
};

export type HoldingLocationRow = {
  id: string;
  holding_id: string;
  portfolio_id: string;
  name: string;
  lon: number;
  lat: number;
  status: string | null;
  tags: string[];
};

export type HoldingDetailData = {
  holding: HoldingRow | null;
  holdingError: unknown | null;
  facts: FactRow[];
  contributions: ContributionRow[];
  metricNames: Map<string, string>;
  locations: HoldingLocationRow[];
  orgSubmittedFacts: unknown[];
  linkedOrg: { id: string; name: string } | null;
  grantDetails: { next_report_due?: string | null } | null;
};
