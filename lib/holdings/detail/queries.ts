import { createSupabaseServerClient } from '@/lib/supabase';
import type {
  ContributionRow,
  FactRow,
  HoldingDetailData,
  HoldingLocationRow,
  HoldingRow,
} from './types';
import { getPrimaryHoldingContact } from '@/lib/holdings/contacts';

async function fetchHolding(holdingId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('holdings')
    .select('id, org_id, portfolio_id, name, asset_type, description, website, location_city, location_state, location_country, theory_of_action, cost_per_outcome, cost_per_outcome_unit, funds_allocated, total_org_funding, status, sector, as_of, investees(charity_id)')
    .eq('id', holdingId)
    .single();

  if (!data) return { holding: null, error };

  try {
    const contact = await getPrimaryHoldingContact(supabase, holdingId);
    const investee = Array.isArray(data.investees) ? data.investees[0] : data.investees;
    const holding: HoldingRow = {
      ...data,
      primary_contact_name: contact?.name ?? null,
      primary_contact_email: contact?.email ?? null,
      primary_contact_phone: contact?.phone ?? null,
      primary_contact_photo: contact?.photo_path ?? null,
      primary_contact_notes: contact?.notes ?? null,
      charity_id: investee?.charity_id ?? null,
    };
    return { holding, error };
  } catch (contactError) {
    return { holding: null, error: contactError };
  }
}

export async function resolveHoldingPhotoUrl(photo: string | null | undefined) {
  if (!photo) return null;
  if (/^https?:\/\//.test(photo) || photo.startsWith('data:')) return photo;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.storage.from('holding-contact-photos').createSignedUrl(photo, 3600);
  return data?.signedUrl ?? null;
}

async function fetchFacts(holdingId: string): Promise<FactRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('metric_facts')
    .select('id, holding_id, metric_code, value, updated_at, period_start, period_end, source')
    .eq('holding_id', holdingId)
    .order('period_end', { ascending: false, nullsFirst: false })
    .limit(1000);
  return error || !data ? [] : (data as FactRow[]);
}

async function fetchContributions(portfolioId: string, holdingId: string): Promise<ContributionRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('holding_contributions')
    .select('id, portfolio_id, holding_id, amount_usd, contribution_date, notes')
    .eq('portfolio_id', portfolioId)
    .eq('holding_id', holdingId)
    .order('contribution_date', { ascending: false });
  return error || !data ? [] : (data as ContributionRow[]);
}

async function fetchMetricNames(portfolioId: string): Promise<Map<string, string>> {
  const supabase = await createSupabaseServerClient();
  const metricMap = new Map<string, string>();
  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('org_id')
    .eq('id', portfolioId)
    .single();
  if (!portfolio) return metricMap;

  const { data: kpis } = await supabase
    .from('kpi_definitions')
    .select('slug, name')
    .eq('org_id', portfolio.org_id)
    .eq('is_active', true);
  for (const kpi of kpis ?? []) {
    if (kpi.name) metricMap.set(kpi.slug, kpi.name);
  }
  return metricMap;
}

async function fetchGrantDetails(holdingId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('grants')
    .select('next_report_due')
    .eq('holding_id', holdingId)
    .maybeSingle();
  return data ?? null;
}

async function fetchLocations(portfolioId: string, holdingId: string): Promise<HoldingLocationRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('holding_locations')
    .select('id, holding_id, portfolio_id, name, lon, lat, status, tags')
    .eq('portfolio_id', portfolioId)
    .eq('holding_id', holdingId)
    .order('name');
  return error || !data ? [] : (data as HoldingLocationRow[]);
}

async function fetchOrgSubmittedFacts(holdingId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('staging_metric_facts')
    .select(`
      id,
      metric_code,
      value,
      unit,
      period_end,
      source,
      created_at,
      metrics (name, unit),
      organizations:submitted_by_org_id (name)
    `)
    .eq('holding_id', holdingId)
    .not('submitted_by_org_id', 'is', null)
    .eq('approved', false)
    .order('created_at', { ascending: false });
  return error || !data ? [] : data;
}

async function fetchLinkedOrg(orgId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .single();
  return error || !data ? null : { id: data.id, name: data.name };
}

export async function getHoldingDetail(holdingId: string): Promise<HoldingDetailData> {
  const { holding, error } = await fetchHolding(holdingId);
  if (!holding) {
    return {
      holding: null,
      holdingError: error,
      facts: [],
      contributions: [],
      metricNames: new Map(),
      locations: [],
      orgSubmittedFacts: [],
      linkedOrg: null,
      grantDetails: null,
    };
  }

  const portfolioId = String(holding.portfolio_id);
  const [facts, contributions, metricNames, locations, orgSubmittedFacts, linkedOrg, grantDetails] =
    await Promise.all([
      fetchFacts(holdingId),
      fetchContributions(portfolioId, holdingId),
      fetchMetricNames(portfolioId),
      fetchLocations(portfolioId, holdingId),
      fetchOrgSubmittedFacts(holdingId),
      fetchLinkedOrg(holding.org_id),
      fetchGrantDetails(holdingId),
    ]);

  return {
    holding,
    holdingError: error,
    facts,
    contributions,
    metricNames,
    locations,
    orgSubmittedFacts,
    linkedOrg,
    grantDetails,
  };
}
