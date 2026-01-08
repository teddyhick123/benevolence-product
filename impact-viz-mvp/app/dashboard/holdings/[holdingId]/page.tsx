import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase';
import React from 'react';
import { revalidatePath } from 'next/cache';
import HoldingHeader from '@/components/HoldingHeader';
import ContactPhotoUpload from '@/components/ContactPhotoUpload';
import EditableDescription from '@/components/EditableDescription';
import EditableContactNotes from '@/components/EditableContactNotes';
import HoldingWidgetsSection from '@/components/vis/HoldingWidgetsSection';
import NewsSection from '@/components/NewsSection';
import FactRow from '@/components/FactRow';
import LocationsManagerWrapper from '@/components/holdings/LocationsManagerWrapper';
import { geocodeLocation } from '@/lib/services/google-maps';

type HoldingRow = {
  id: string;
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
  cost_per_outcome?: number | null;            // legacy/manual optional
  cost_per_outcome_unit?: string | null;       // legacy/manual optional
  funds_allocated?: number | null;             // <-- used for cost/efficiency
  total_org_funding?: number | null;           // <-- total org budget for proportional attribution
  status?: string | null;
  sector?: string | null;
  as_of?: string | null;
};

type FactRow = {
  id: string;
  holding_id: string;
  metric_code: string;
  value?: number | string | null;
  updated_at: string; // ISO date
  period_start?: string | null; // ISO date
  period_end?: string | null; // ISO date
  source?: string | null;
};

type ContributionRow = {
  id: string;
  portfolio_id: string;
  holding_id: string;
  amount: number;
  contributed_at: string; // ISO
  memo?: string | null;
  source?: string | null;
};

// Build a Supabase server client with SSR cookies
const getSupabase = createSupabaseServerClient;

async function fetchHolding(holdingId: string): Promise<{ holding: HoldingRow | null; error: any | null }> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('holdings')
    .select('id, portfolio_id, name, asset_type, description, primary_contact_name, primary_contact_email, primary_contact_phone, primary_contact_photo, primary_contact_notes, website, location_city, location_state, location_country, theory_of_action, cost_per_outcome, cost_per_outcome_unit, funds_allocated, total_org_funding, status, sector, as_of')
    .eq('id', holdingId)
    .single();

  return { holding: (data as any) ?? null, error };
}

async function fetchFacts(holdingId: string): Promise<FactRow[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('metric_facts')
    .select('id, holding_id, metric_code, value, updated_at, period_start, period_end, source')
    .eq('holding_id', holdingId)
    .order('period_end', { ascending: false, nullsFirst: false })
    .limit(1000);
  if (error || !data) return [];
  return data as FactRow[];
}

async function fetchContributions(portfolioId: string, holdingId: string): Promise<ContributionRow[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('holding_contributions')
    .select('id, portfolio_id, holding_id, amount, contributed_at, memo, source')
    .eq('portfolio_id', portfolioId)
    .eq('holding_id', holdingId)
    .order('contributed_at', { ascending: false });
  if (error || !data) return [];
  return data as ContributionRow[];
}

async function fetchMetricNames(portfolioId: string): Promise<Map<string, string>> {
  const supabase = await getSupabase();
  const metricMap = new Map<string, string>();

  // First try to get portfolio-specific display names from kpi_definitions
  const { data: kpiDefs } = await supabase
    .from('kpi_definitions')
    .select('metric_code, display_name')
    .eq('portfolio_id', portfolioId);

  if (kpiDefs) {
    for (const def of kpiDefs) {
      if (def.display_name) {
        metricMap.set(def.metric_code, def.display_name);
      }
    }
  }

  // Then get global metric names from metrics table
  const { data: metrics } = await supabase
    .from('metrics')
    .select('code, name');

  if (metrics) {
    for (const metric of metrics) {
      // Only add if not already set by kpi_definitions (portfolio-specific takes precedence)
      if (!metricMap.has(metric.code) && metric.name) {
        metricMap.set(metric.code, metric.name);
      }
    }
  }

  return metricMap;
}

type HoldingLocationRow = {
  id: string;
  holding_id: string;
  portfolio_id: string;
  name: string;
  lon: number;
  lat: number;
  status: string | null;
  tags: string[];
};

async function fetchLocations(portfolioId: string, holdingId: string): Promise<HoldingLocationRow[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('holding_locations')
    .select('id, holding_id, portfolio_id, name, lon, lat, status, tags')
    .eq('portfolio_id', portfolioId)
    .eq('holding_id', holdingId)
    .order('name');
  if (error || !data) return [];
  return data as HoldingLocationRow[];
}


function humanDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

function latestByMetric(facts: FactRow[]) {
  const latestMap = new Map<string, FactRow>();
  for (const f of facts) {
    if (!latestMap.has(f.metric_code)) {
      latestMap.set(f.metric_code, f);
    }
  }
  return Array.from(latestMap.entries()).map(([metric_code, f]) => ({
    metric_code,
    value: typeof f.value === 'number' ? f.value : (f.value != null && !isNaN(Number(f.value)) ? Number(f.value) : NaN),
    updated_at: f.updated_at,
  }));
}

// --- Server Actions (inline editing) ---
function numOrNull(v: FormDataEntryValue | null) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Helper to get form value, converting empty strings to null
function getValue(formData: FormData, key: string) {
  const val = formData.get(key);
  if (val === null || val === undefined) return undefined; // Don't include in update
  const str = String(val).trim();
  return str === '' ? null : str;
}

async function updateHoldingBasics(formData: FormData) {
  'use server';
  const supabase = await getSupabase();
  const holdingId = String(formData.get('holding_id'));

  const updates: any = {};

  // Only include fields that are present in the form
  const name = getValue(formData, 'name');
  if (name !== undefined) updates.name = name;

  const asset_type = getValue(formData, 'asset_type');
  if (asset_type !== undefined) updates.asset_type = asset_type;

  const sector = getValue(formData, 'sector');
  if (sector !== undefined) updates.sector = sector;

  const description = getValue(formData, 'description');
  if (description !== undefined) updates.description = description;

  const status = getValue(formData, 'status');
  if (status !== undefined) updates.status = status;

  const as_of = getValue(formData, 'as_of');
  if (as_of !== undefined) updates.as_of = as_of;

  const theory_of_action = getValue(formData, 'theory_of_action');
  if (theory_of_action !== undefined) updates.theory_of_action = theory_of_action;

  const funds_allocated = formData.has('funds_allocated') ? numOrNull(formData.get('funds_allocated')) : undefined;
  if (funds_allocated !== undefined) updates.funds_allocated = funds_allocated;


  const { error, data } = await supabase.from('holdings').update(updates).eq('id', holdingId).select();

  if (error) {
    console.error('updateHoldingBasics error:', error);
    throw new Error(`Failed to update holding: ${error.message}`);
  }

  revalidatePath(`/dashboard/holdings/${holdingId}`);
  revalidatePath(`/dashboard`);
}

async function updateHoldingContact(formData: FormData) {
  'use server';
  const supabase = await getSupabase();
  const holdingId = String(formData.get('holding_id'));

  const updates: any = {};

  const primary_contact_name = getValue(formData, 'primary_contact_name');
  if (primary_contact_name !== undefined) updates.primary_contact_name = primary_contact_name;

  const primary_contact_email = getValue(formData, 'primary_contact_email');
  if (primary_contact_email !== undefined) updates.primary_contact_email = primary_contact_email;

  const primary_contact_phone = getValue(formData, 'primary_contact_phone');
  if (primary_contact_phone !== undefined) updates.primary_contact_phone = primary_contact_phone;

  const primary_contact_photo = getValue(formData, 'primary_contact_photo');
  if (primary_contact_photo !== undefined) updates.primary_contact_photo = primary_contact_photo;

  const primary_contact_notes = getValue(formData, 'primary_contact_notes');
  if (primary_contact_notes !== undefined) updates.primary_contact_notes = primary_contact_notes;

  const website = getValue(formData, 'website');
  if (website !== undefined) updates.website = website;


  const { error, data } = await supabase.from('holdings').update(updates).eq('id', holdingId).select();

  if (error) {
    console.error('updateHoldingContact error:', error);
    throw new Error(`Failed to update contact: ${error.message}`);
  }

  revalidatePath(`/dashboard/holdings/${holdingId}`);
  revalidatePath(`/dashboard`);
}

async function updateHoldingLocation(formData: FormData) {
  'use server';
  const supabase = await getSupabase();
  const holdingId = String(formData.get('holding_id'));

  const updates: any = {};

  const location_city = getValue(formData, 'location_city');
  if (location_city !== undefined) updates.location_city = location_city;

  const location_state = getValue(formData, 'location_state');
  if (location_state !== undefined) updates.location_state = location_state;

  const location_country = getValue(formData, 'location_country');
  if (location_country !== undefined) updates.location_country = location_country;

  // Auto-geocode if location fields are provided
  if (location_city || location_state || location_country) {
    try {
      const geocodeResult = await geocodeLocation({
        city: location_city || undefined,
        state: location_state || undefined,
        country: location_country || undefined,
      });

      if (geocodeResult) {
        updates.latitude = geocodeResult.latitude;
        updates.longitude = geocodeResult.longitude;
        updates.geocoded_at = new Date().toISOString();
        updates.geocode_status = 'success';
        updates.geocode_provider = 'google_maps';
        updates.geocode_metadata = {
          formatted_address: geocodeResult.formattedAddress,
          place_id: geocodeResult.placeId,
          accuracy: geocodeResult.accuracy,
        };

        console.log(`[Geocoding] Success for holding ${holdingId}: ${geocodeResult.formattedAddress}`);
      } else {
        updates.geocode_status = 'no_results';
        console.log(`[Geocoding] No results for holding ${holdingId}`);
      }
    } catch (error) {
      console.error(`[Geocoding] Error for holding ${holdingId}:`, error);
      updates.geocode_status = 'error';
      // Don't throw - allow location update to proceed even if geocoding fails
    }
  }

  const { error, data } = await supabase.from('holdings').update(updates).eq('id', holdingId).select();

  if (error) {
    console.error('updateHoldingLocation error:', error);
    throw new Error(`Failed to update location: ${error.message}`);
  }

  revalidatePath(`/dashboard/holdings/${holdingId}`);
  revalidatePath(`/dashboard`);
}

async function updateHoldingFunds(formData: FormData) {
  'use server';
  const supabase = await getSupabase();
  const holdingId = String(formData.get('holding_id'));

  const funds_allocated = numOrNull(formData.get('funds_allocated'));

  const updates: any = { funds_allocated };


  const { error, data } = await supabase.from('holdings').update(updates).eq('id', holdingId).select();

  if (error) {
    console.error('updateHoldingFunds error:', error);
    throw new Error(`Failed to update funds: ${error.message}`);
  }

  revalidatePath(`/dashboard/holdings/${holdingId}`);
  revalidatePath(`/dashboard`);
}

async function updateHoldingOrgFunding(formData: FormData) {
  'use server';
  const supabase = await getSupabase();
  const holdingId = String(formData.get('holding_id'));

  const total_org_funding = numOrNull(formData.get('total_org_funding'));

  const updates: any = { total_org_funding };


  const { error, data } = await supabase.from('holdings').update(updates).eq('id', holdingId).select();

  if (error) {
    console.error('updateHoldingOrgFunding error:', error);
    throw new Error(`Failed to update org funding: ${error.message}`);
  }

  revalidatePath(`/dashboard/holdings/${holdingId}`);
  revalidatePath(`/dashboard`);
}

async function updateDescription(holdingId: string, description: string) {
  'use server';
  const supabase = await getSupabase();

  const { error } = await supabase
    .from('holdings')
    .update({ description })
    .eq('id', holdingId);

  if (error) {
    console.error('updateDescription error:', error);
    throw new Error(`Failed to update description: ${error.message}`);
  }

  revalidatePath(`/dashboard/holdings/${holdingId}`);
}

async function updateTheoryOfAction(holdingId: string, theory_of_action: string) {
  'use server';
  const supabase = await getSupabase();

  const { error } = await supabase
    .from('holdings')
    .update({ theory_of_action })
    .eq('id', holdingId);

  if (error) {
    console.error('updateTheoryOfAction error:', error);
    throw new Error(`Failed to update theory of action: ${error.message}`);
  }

  revalidatePath(`/dashboard/holdings/${holdingId}`);
}

async function updateContactNotes(holdingId: string, primary_contact_notes: string) {
  'use server';
  const supabase = await getSupabase();

  const { error } = await supabase
    .from('holdings')
    .update({ primary_contact_notes })
    .eq('id', holdingId);

  if (error) {
    console.error('updateContactNotes error:', error);
    throw new Error(`Failed to update contact notes: ${error.message}`);
  }

  revalidatePath(`/dashboard/holdings/${holdingId}`);
}

async function updateHoldingCostPerOutcome(formData: FormData) {
  'use server';
  const supabase = await getSupabase();
  const holdingId = String(formData.get('holding_id'));

  const updates: any = {
    cost_per_outcome: numOrNull(formData.get('cost_per_outcome')),
    cost_per_outcome_unit: getValue(formData, 'cost_per_outcome_unit'),
  };


  const { error, data } = await supabase.from('holdings').update(updates).eq('id', holdingId).select();

  if (error) {
    console.error('updateHoldingCostPerOutcome error:', error);
    throw new Error(`Failed to update cost per outcome: ${error.message}`);
  }

  revalidatePath(`/dashboard/holdings/${holdingId}`);
  revalidatePath(`/dashboard`);
}

async function addFact(formData: FormData) {
  'use server';
  const supabase = await getSupabase();
  const holdingId = String(formData.get('holding_id'));

  const metricCode = String(formData.get('metric_code') || '').trim().toUpperCase();
  const valueRaw = formData.get('value');
  const value = valueRaw ? Number(valueRaw) : null;
  const periodEnd = formData.get('period_end') ? String(formData.get('period_end')).trim() : null;
  const source = formData.get('source') ? String(formData.get('source')).trim() : null;

  if (!metricCode) {
    throw new Error('Metric code is required');
  }
  if (value === null || !Number.isFinite(value)) {
    throw new Error('Valid numeric value is required');
  }

  // Set period_end to today if not specified (required for time-based queries)
  const finalPeriodEnd = periodEnd || new Date().toISOString().split('T')[0];

  const row = {
    holding_id: holdingId,
    metric_code: metricCode,
    value: value,
    period_end: finalPeriodEnd,
    source: source || null,
  };


  const { error, data } = await supabase.from('metric_facts').insert(row).select();

  if (error) {
    console.error('addFact error:', error);
    throw new Error(`Failed to add fact: ${error.message}`);
  }

  revalidatePath(`/dashboard/holdings/${holdingId}`);
  revalidatePath(`/dashboard`);
}

async function addContribution(formData: FormData) {
  'use server';
  const supabase = await getSupabase();
  const holdingId = String(formData.get('holding_id'));
  const portfolioId = String(formData.get('portfolio_id'));

  const amount = numOrNull(formData.get('amount'));
  if (amount === null || !Number.isFinite(amount)) {
    throw new Error('Valid amount is required');
  }

  const contributedAt = formData.get('contributed_at');
  if (!contributedAt) {
    throw new Error('Contribution date is required');
  }

  const memo = formData.get('memo') ? String(formData.get('memo')).trim() : null;
  const source = formData.get('source') ? String(formData.get('source')).trim() : null;

  const row = {
    portfolio_id: portfolioId,
    holding_id: holdingId,
    amount: amount,
    contributed_at: String(contributedAt),
    memo: memo || null,
    source: source || null,
  };


  const { error, data } = await supabase.from('holding_contributions').insert(row).select();

  if (error) {
    console.error('addContribution error:', error);
    throw new Error(`Failed to add contribution: ${error.message}`);
  }

  revalidatePath(`/dashboard/holdings/${holdingId}`);
  revalidatePath(`/dashboard`);
}

async function updateFact(formData: FormData) {
  'use server';
  const supabase = await getSupabase();
  const factId = String(formData.get('fact_id'));
  const holdingId = String(formData.get('holding_id'));

  const metricCode = String(formData.get('metric_code') || '').trim().toUpperCase();
  const valueRaw = formData.get('value');
  const value = valueRaw ? Number(valueRaw) : null;
  const periodEnd = formData.get('period_end') ? String(formData.get('period_end')).trim() : null;
  const source = formData.get('source') ? String(formData.get('source')).trim() : null;

  if (!metricCode) {
    throw new Error('Metric code is required');
  }
  if (value === null || !Number.isFinite(value)) {
    throw new Error('Valid numeric value is required');
  }

  const updates = {
    metric_code: metricCode,
    value: value,
    period_end: periodEnd,
    source: source || null,
  };


  const { error, data } = await supabase
    .from('metric_facts')
    .update(updates)
    .eq('id', factId)
    .select();

  if (error) {
    console.error('updateFact error:', error);
    throw new Error(`Failed to update fact: ${error.message}`);
  }

  revalidatePath(`/dashboard/holdings/${holdingId}`);
  revalidatePath(`/dashboard`);
}

async function deleteFact(formData: FormData) {
  'use server';
  const supabase = await getSupabase();
  const factId = String(formData.get('fact_id'));
  const holdingId = String(formData.get('holding_id'));


  const { error } = await supabase
    .from('metric_facts')
    .delete()
    .eq('id', factId);

  if (error) {
    console.error('deleteFact error:', error);
    throw new Error(`Failed to delete fact: ${error.message}`);
  }

  revalidatePath(`/dashboard/holdings/${holdingId}`);
  revalidatePath(`/dashboard`);
}

async function addHoldingLocation(formData: FormData) {
  'use server';
  const supabase = await getSupabase();
  const holdingId = String(formData.get('holding_id'));
  const portfolioId = String(formData.get('portfolio_id'));

  const name = getValue(formData, 'name');
  if (!name) {
    throw new Error('Location name is required');
  }

  const lon = formData.has('lon') ? numOrNull(formData.get('lon')) : null;
  const lat = formData.has('lat') ? numOrNull(formData.get('lat')) : null;

  if (lon === null || lat === null) {
    throw new Error('Coordinates (longitude and latitude) are required');
  }

  const row = {
    portfolio_id: portfolioId,
    holding_id: holdingId,
    name: name,
    lon,
    lat,
    status: getValue(formData, 'status') || 'Active',
    tags: [], // Could parse from formData if needed
  };

  const { error } = await supabase
    .from('holding_locations')
    .insert(row);

  if (error) {
    console.error('addHoldingLocation error:', error);
    throw new Error(`Failed to add location: ${error.message}`);
  }

  revalidatePath(`/dashboard/holdings/${holdingId}`);
  revalidatePath(`/dashboard`);
}

async function updateHoldingLocation(formData: FormData) {
  'use server';
  const supabase = await getSupabase();
  const locationId = String(formData.get('location_id'));
  const holdingId = String(formData.get('holding_id'));

  const updates: any = {};

  const name = getValue(formData, 'name');
  if (name !== undefined) updates.name = name;

  const status = getValue(formData, 'status');
  if (status !== undefined) updates.status = status;

  if (formData.has('lon')) {
    updates.lon = numOrNull(formData.get('lon'));
  }

  if (formData.has('lat')) {
    updates.lat = numOrNull(formData.get('lat'));
  }

  const { error } = await supabase
    .from('holding_locations')
    .update(updates)
    .eq('id', locationId);

  if (error) {
    console.error('updateHoldingLocation error:', error);
    throw new Error(`Failed to update location: ${error.message}`);
  }

  revalidatePath(`/dashboard/holdings/${holdingId}`);
  revalidatePath(`/dashboard`);
}

async function deleteHoldingLocation(formData: FormData) {
  'use server';
  const supabase = await getSupabase();
  const locationId = String(formData.get('location_id'));
  const holdingId = String(formData.get('holding_id'));

  const { error } = await supabase
    .from('holding_locations')
    .delete()
    .eq('id', locationId);

  if (error) {
    console.error('deleteHoldingLocation error:', error);
    throw new Error(`Failed to delete location: ${error.message}`);
  }

  revalidatePath(`/dashboard/holdings/${holdingId}`);
  revalidatePath(`/dashboard`);
}
// --- End Server Actions ---

export default async function HoldingMiniDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ holdingId: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { holdingId } = await params;
  const sp = searchParams ? await searchParams : undefined;
  const qpPortfolio = sp?.portfolio_id;
  const qpPortfolioId = Array.isArray(qpPortfolio) ? qpPortfolio[0] : qpPortfolio;

  const { holding, error: holdingErr } = await fetchHolding(holdingId);
  if (!holding) {
    return (
      <div className="m-6 rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
        <div className="font-medium mb-1">Couldn’t load holding <code className="font-mono">{holdingId}</code>.</div>
        {holdingErr ? (
          <div>Supabase error: <code className="font-mono">{String(holdingErr.message || holdingErr)}</code></div>
        ) : (
          <div>No error message was returned. This usually means <strong>RLS prevented the row from being read</strong> (missing membership) or the request wasn’t authenticated (cookies not present).</div>
        )}
        <div className="mt-2 text-neutral-700">If you prefer the 404 again later, we can switch this back once it’s working.</div>
      </div>
    );
  }

  // If a query param is provided, it must match the holding's portfolio for scope safety
  if (qpPortfolioId && String(qpPortfolioId) !== String(holding.portfolio_id)) return notFound();

  const portfolioId = String(holding.portfolio_id);

  const [facts, contributions, metricNames, locations] = await Promise.all([
    fetchFacts(holdingId),
    fetchContributions(portfolioId, holdingId),
    fetchMetricNames(portfolioId),
    fetchLocations(portfolioId, holdingId),
  ]);

  const latestMetrics = latestByMetric(facts);

  // Calculate total funds from contributions
  const totalContributions = contributions.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  const funds = totalContributions > 0 ? totalContributions : (Number(holding.funds_allocated ?? 0) || 0);

  // Get total org funding for proportional attribution
  const totalOrgFunding = Number(holding.total_org_funding ?? 0) || 0;

  // Prepare KPI cards with efficiency
  const kpiCards = latestMetrics.map((m) => {
    const mVal = typeof m.value === 'number' ? m.value : Number.NaN;

    // Cost per outcome with proportional attribution:
    // If total_org_funding is set: attributed_outcomes = total_outcomes * (your_funds / total_org_funding)
    // Your cost per outcome = your_funds / attributed_outcomes = total_org_funding / total_outcomes
    // If total_org_funding is NOT set: fall back to naive calculation (your_funds / total_outcomes)
    let costPerOutcome: number | null = null;
    let attributedOutcomes: number | null = null;

    if (typeof mVal === 'number' && isFinite(mVal) && mVal > 0) {
      if (totalOrgFunding > 0 && funds > 0) {
        // Proportional attribution: your share of outcomes based on funding ratio
        attributedOutcomes = mVal * (funds / totalOrgFunding);
        costPerOutcome = funds / attributedOutcomes; // = totalOrgFunding / mVal
      } else if (funds > 0) {
        // Fallback: naive calculation (no org funding data)
        costPerOutcome = funds / mVal;
        attributedOutcomes = mVal; // Assumes all outcomes are yours (not recommended)
      }
    }

    // Outcomes per $1k of YOUR funding (using attributed outcomes)
    const outcomesPerThousand = funds > 0 && attributedOutcomes != null && isFinite(attributedOutcomes)
      ? (attributedOutcomes / (funds / 1000))
      : null;

    return {
      key: m.metric_code,
      displayName: metricNames.get(m.metric_code) || m.metric_code,
      value: mVal,
      updated_at: m.updated_at,
      costPerOutcome,
      outcomesPerThousand,
      attributedOutcomes,
      hasProportionalAttribution: totalOrgFunding > 0,
    };
  });

  const contact = {
    name: holding.primary_contact_name ?? null,
    email: holding.primary_contact_email ?? null,
    phone: holding.primary_contact_phone ?? null,
    website: holding.website ?? null,
    photo: holding.primary_contact_photo ?? null,
    notes: holding.primary_contact_notes ?? null,
  };

  const locationParts = [holding.location_city, holding.location_state, holding.location_country].filter(Boolean);
  const location = locationParts.length ? locationParts.join(', ') : null;

  const legacyCostPerOutcome =
    holding.cost_per_outcome != null
      ? `${holding.cost_per_outcome}${holding.cost_per_outcome_unit ? ' ' + holding.cost_per_outcome_unit : ''}`
      : null;

  // Check if basic information is complete
  const hasBasicInfo = !!(
    holding.name &&
    holding.asset_type &&
    holding.sector &&
    holding.status
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <HoldingHeader
        holdingId={holding.id}
        portfolioId={portfolioId}
        name={holding.name}
        assetClass={holding.asset_type}
        sector={holding.sector}
        location={location}
        status={holding.status}
        asOf={holding.as_of}
        funds={funds}
        contributionCount={totalContributions > 0 ? contributions.length : undefined}
        isManualFunds={totalContributions === 0 && holding.funds_allocated != null}
      />

      {!hasBasicInfo && (
        <details className="mt-3 rounded-xl border border-neutral-200 bg-white shadow-sm p-5 open:shadow-md transition-shadow">
        <summary className="cursor-pointer text-sm font-semibold text-neutral-800 hover:text-neutral-900">Edit Basic Information</summary>
        <form action={updateHoldingBasics} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <input type="hidden" name="holding_id" value={holding.id} />

          <label className="block">
            <span className="text-xs font-medium text-neutral-700">Name *</span>
            <input
              name="name"
              defaultValue={holding.name}
              required
              className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Holding name"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-neutral-700">Asset Class</span>
            <input
              name="asset_type"
              defaultValue={holding.asset_type ?? ''}
              className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="e.g., Equity, Debt"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-neutral-700">Sector</span>
            <input
              name="sector"
              defaultValue={holding.sector ?? ''}
              className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="e.g., Clean Energy, Healthcare"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-neutral-700">Funds Allocated (USD)</span>
            <input
              name="funds_allocated"
              defaultValue={holding.funds_allocated ?? ''}
              type="number"
              step="0.01"
              className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="0.00"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-neutral-700">Status</span>
            <input
              name="status"
              defaultValue={holding.status ?? ''}
              className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="e.g., Active, Exited"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-neutral-700">As of Date</span>
            <input
              type="date"
              name="as_of"
              defaultValue={holding.as_of ?? ''}
              className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </label>

          <label className="col-span-full block">
            <span className="text-xs font-medium text-neutral-700">Description</span>
            <textarea
              name="description"
              defaultValue={holding.description ?? ''}
              rows={3}
              className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
              placeholder="Brief description of the holding..."
            />
          </label>

          <label className="col-span-full block">
            <span className="text-xs font-medium text-neutral-700">Theory of Action</span>
            <textarea
              name="theory_of_action"
              defaultValue={holding.theory_of_action ?? ''}
              rows={4}
              className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
              placeholder="Describe the theory of change and expected impact..."
            />
          </label>

          <div className="col-span-full flex justify-end pt-2">
            <button type="submit" className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 transition-colors shadow-sm">
              Save Changes
            </button>
          </div>
        </form>
      </details>
      )}

      {!hasBasicInfo && (
        <details className="rounded-xl border border-neutral-200 bg-white shadow-sm p-5 open:shadow-md transition-shadow">
        <summary className="cursor-pointer text-sm font-semibold text-neutral-800 hover:text-neutral-900">Edit Location</summary>
        <form action={updateHoldingLocation} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <input type="hidden" name="holding_id" value={holding.id} />

          <label className="block">
            <span className="text-xs font-medium text-neutral-700">City</span>
            <input
              name="location_city"
              defaultValue={holding.location_city ?? ''}
              className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="San Francisco"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-neutral-700">State / Region</span>
            <input
              name="location_state"
              defaultValue={holding.location_state ?? ''}
              className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="California"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-neutral-700">Country</span>
            <input
              name="location_country"
              defaultValue={holding.location_country ?? ''}
              className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="United States"
            />
          </label>

          <div className="col-span-full flex justify-end pt-2">
            <button type="submit" className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 transition-colors shadow-sm">
              Save Changes
            </button>
          </div>
        </form>
      </details>
      )}

      {/* Primary Contact + Analytics Carousel */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Primary Contact Card - Narrower */}
        <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-medium text-neutral-700 mb-4">Primary Contact</h3>

          <div className="flex gap-4 items-start">
            {/* Profile Photo */}
            <ContactPhotoUpload
              holdingId={holding.id}
              currentPhoto={contact.photo}
              contactName={contact.name}
            />

            {/* Contact Info */}
            <div className="flex-1 min-w-0">
              {contact.name ? (
                <p className="font-semibold text-lg text-neutral-900 truncate">{contact.name}</p>
              ) : (
                <p className="text-neutral-500 text-sm">No name</p>
              )}

              {contact.website && (
                <p className="mt-2 flex items-center gap-2 text-sm text-neutral-700">
                  <svg className="w-4 h-4 text-neutral-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                  <a className="text-indigo-600 hover:text-indigo-700 hover:underline truncate" href={contact.website} target="_blank" rel="noopener noreferrer">
                    {contact.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  </a>
                </p>
              )}

              {contact.email && (
                <p className="mt-1.5 flex items-center gap-2 text-sm text-neutral-700">
                  <svg className="w-4 h-4 text-neutral-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <a className="text-indigo-600 hover:text-indigo-700 hover:underline truncate" href={`mailto:${contact.email}`}>
                    {contact.email}
                  </a>
                </p>
              )}

              {contact.phone && (
                <p className="mt-1.5 flex items-center gap-2 text-sm text-neutral-700">
                  <svg className="w-4 h-4 text-neutral-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <a className="text-indigo-600 hover:text-indigo-700 hover:underline" href={`tel:${contact.phone}`}>
                    {contact.phone}
                  </a>
                </p>
              )}

              {!contact.website && !contact.email && !contact.phone && (
                <p className="text-neutral-500 text-sm mt-1">No contact information</p>
              )}
            </div>
          </div>

          {/* Contact Notes */}
          <div className="mt-4 pt-4 border-t border-neutral-200">
            <h4 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">Notes</h4>
            <EditableContactNotes
              holdingId={holding.id}
              notes={contact.notes ?? ''}
              updateAction={updateContactNotes}
            />
          </div>

          <details className="mt-5 pt-4 border-t border-neutral-200">
            <summary className="cursor-pointer text-sm font-medium text-neutral-700 hover:text-neutral-900">Edit Contact</summary>
            <form action={updateHoldingContact} className="mt-4 space-y-3">
              <input type="hidden" name="holding_id" value={holding.id} />

              <label className="block">
                <span className="text-xs font-medium text-neutral-700">Name</span>
                <input
                  name="primary_contact_name"
                  defaultValue={contact.name ?? ''}
                  className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="John Doe"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-neutral-700">Email</span>
                <input
                  name="primary_contact_email"
                  defaultValue={contact.email ?? ''}
                  type="email"
                  className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="john@example.com"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-neutral-700">Phone</span>
                <input
                  name="primary_contact_phone"
                  defaultValue={contact.phone ?? ''}
                  type="tel"
                  className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="+1 (555) 123-4567"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-neutral-700">Website</span>
                <input
                  name="website"
                  defaultValue={contact.website ?? ''}
                  type="url"
                  className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="https://example.org"
                />
              </label>

              <p className="text-xs text-neutral-500">
                Tip: Click the profile photo above to upload an image.
              </p>

              <div className="flex justify-end pt-2">
                <button type="submit" className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition-colors">
                  Save Changes
                </button>
              </div>
            </form>
          </details>

          {totalContributions === 0 && (
            <details className="mt-4 pt-4 border-t border-neutral-200">
              <summary className="cursor-pointer text-sm font-medium text-neutral-700 hover:text-neutral-900">Set Manual Funds</summary>
              <form action={updateHoldingFunds} className="mt-4 space-y-3">
                <input type="hidden" name="holding_id" value={holding.id} />
                <label className="block">
                  <span className="text-xs font-medium text-neutral-700">Amount (USD)</span>
                  <input
                    name="funds_allocated"
                    defaultValue={holding.funds_allocated ?? ''}
                    type="number"
                    step="0.01"
                    className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </label>
                <p className="text-xs text-neutral-400">Note: Once contributions are added, they will override this manual value.</p>
                <div className="flex justify-end pt-2">
                  <button type="submit" className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition-colors">
                    Save Changes
                  </button>
                </div>
              </form>
            </details>
          )}

          <details className="mt-4 pt-4 border-t border-neutral-200">
            <summary className="cursor-pointer text-sm font-medium text-neutral-700 hover:text-neutral-900">
              Set Total Org Funding
              {totalOrgFunding > 0 && (
                <span className="ml-2 text-xs text-neutral-500">
                  (${totalOrgFunding.toLocaleString()})
                </span>
              )}
            </summary>
            <form action={updateHoldingOrgFunding} className="mt-4 space-y-3">
              <input type="hidden" name="holding_id" value={holding.id} />
              <label className="block">
                <span className="text-xs font-medium text-neutral-700">Total Annual Budget (USD)</span>
                <input
                  name="total_org_funding"
                  defaultValue={holding.total_org_funding ?? ''}
                  type="number"
                  step="0.01"
                  className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="e.g., 10000000"
                />
              </label>
              <p className="text-xs text-neutral-400">
                Enter the organization&apos;s total annual funding/budget. This enables proportional impact attribution:
                your attributed outcomes = total outcomes × (your funding / org&apos;s total funding).
              </p>
              <div className="flex justify-end pt-2">
                <button type="submit" className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition-colors">
                  Save Changes
                </button>
              </div>
            </form>
          </details>
        </div>

        {/* Analytics Carousel - Takes up 2 columns */}
        <div className="lg:col-span-2">
          <HoldingWidgetsSection
            holdingId={holding.id}
            portfolioId={portfolioId}
            canEdit={true}
          />
        </div>

      </section>

      {/* Locations Manager */}
      <section>
        <LocationsManagerWrapper
          holdingId={holding.id}
          portfolioId={portfolioId}
          locations={locations as any}
          addAction={addHoldingLocation}
          updateAction={updateHoldingLocation}
          deleteAction={deleteHoldingLocation}
        />
      </section>

      {/* KPI Cards (latest per metric) */}
      <section>
        <h3 className="text-sm font-medium text-neutral-700">Key KPIs (Latest)</h3>
        {kpiCards.length === 0 ? (
          <div className="mt-2 rounded-xl border border-dashed border-black/10 p-6 text-sm text-neutral-600">
            No KPI facts yet for this holding.
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {kpiCards.map((m) => (
              <div key={m.key} className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
                <p className="text-xs text-neutral-500">{m.displayName}</p>
                <p className="mt-1 text-2xl font-semibold text-neutral-900">
                  {Number.isFinite(m.value) ? m.value.toLocaleString() : '—'}
                  <span className="text-sm font-normal text-neutral-500 ml-1">total</span>
                </p>
                {m.hasProportionalAttribution && m.attributedOutcomes != null && (
                  <p className="text-sm text-azure font-medium">
                    {m.attributedOutcomes.toLocaleString(undefined, { maximumFractionDigits: 1 })} attributed to you
                  </p>
                )}
                <p className="mt-1 text-[11px] text-neutral-500">Latest: {humanDate(m.updated_at)}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-lg border border-neutral-200 p-2">
                    <p className="text-neutral-500">Cost / Outcome</p>
                    <p className="font-medium">
                      {m.costPerOutcome != null && isFinite(m.costPerOutcome)
                        ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(m.costPerOutcome)
                        : '—'}
                    </p>
                    {!m.hasProportionalAttribution && m.costPerOutcome != null && (
                      <p className="text-[9px] text-amber-600 mt-0.5">* Not scaled</p>
                    )}
                  </div>
                  <div className="rounded-lg border border-neutral-200 p-2">
                    <p className="text-neutral-500">Your Outcomes / $1k</p>
                    <p className="font-medium">
                      {m.outcomesPerThousand != null && isFinite(m.outcomesPerThousand)
                        ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(m.outcomesPerThousand)
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Description, Theory of Action, and Legacy Cost */}
      <div className="grid grid-cols-1 gap-4">
        {/* Description */}
        {holding.description && (
          <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-medium text-neutral-700">Description</h3>
            <EditableDescription
              holdingId={holding.id}
              description={holding.description}
              updateAction={updateDescription}
            />
          </section>
        )}

        {/* Theory of Action */}
        {holding.theory_of_action && (
          <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-medium text-neutral-700">Theory of Action</h3>
            <EditableDescription
              holdingId={holding.id}
              description={holding.theory_of_action}
              updateAction={updateTheoryOfAction}
            />
          </section>
        )}

        {/* Legacy Cost per Outcome */}
        {legacyCostPerOutcome && (
          <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
            <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Legacy Cost/Outcome</h3>
            <p className="mt-2 text-2xl font-semibold text-neutral-900">{legacyCostPerOutcome}</p>
            <p className="mt-1 text-xs text-neutral-400">Manual entry (deprecated)</p>
          </section>
        )}

        {/* Recent News */}
        <NewsSection holdingId={holding.id} />
      </div>

      {/* History of Contributions */}
      <section>
        <h3 className="text-sm font-medium text-neutral-700 mb-3">History of Contributions</h3>
        <div className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
          <div className="p-5 border-b border-neutral-200 bg-neutral-50/60">
            <h4 className="text-sm font-medium text-neutral-800 mb-4">Add New Contribution</h4>
            <form action={addContribution} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <input type="hidden" name="portfolio_id" value={portfolioId} />
              <input type="hidden" name="holding_id" value={holding.id} />
              <label className="block">
                <span className="text-xs font-medium text-neutral-700">Amount (USD) *</span>
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="50000"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-700">Date *</span>
                <input
                  type="date"
                  name="contributed_at"
                  className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-700">Memo</span>
                <input
                  name="memo"
                  className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Series A investment"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-700">Source URL</span>
                <input
                  name="source"
                  type="url"
                  className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="https://..."
                />
              </label>
              <div className="flex items-end">
                <button type="submit" className="w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition-colors">
                  Add Contribution
                </button>
              </div>
            </form>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700">Memo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {contributions.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-sm text-neutral-500 text-center" colSpan={4}>
                      No contributions recorded yet. Add your first contribution above.
                    </td>
                  </tr>
                ) : (
                  contributions.map((c) => (
                    <tr key={c.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-neutral-800">{humanDate(c.contributed_at)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-neutral-900">
                        {new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(c.amount)}
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-800">{c.memo ?? '—'}</td>
                      <td className="px-4 py-3 text-sm">
                        {c.source ? (
                          <a
                            className="text-indigo-600 hover:text-indigo-700 hover:underline"
                            href={c.source}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View Source
                          </a>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Facts Table (chronological) */}
      <section>
        <h3 className="text-sm font-medium text-neutral-700 mb-3">All Facts</h3>
        <div className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
          <div className="p-5 border-b border-neutral-200 bg-neutral-50/60">
            <h4 className="text-sm font-medium text-neutral-800 mb-4">Add New Fact</h4>
            <form action={addFact} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <input type="hidden" name="holding_id" value={holding.id} />
              <label className="block">
                <span className="text-xs font-medium text-neutral-700">Period End</span>
                <input
                  type="date"
                  name="period_end"
                  defaultValue={new Date().toISOString().split('T')[0]}
                  className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-700">Metric Code *</span>
                <input
                  name="metric_code"
                  className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="e.g. JOBS"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-700">Value *</span>
                <input
                  name="value"
                  type="number"
                  step="any"
                  className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="e.g. 12"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-700">Source URL</span>
                <input
                  name="source"
                  type="url"
                  className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="https://..."
                />
              </label>
              <div className="flex items-end">
                <button type="submit" className="w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition-colors">
                  Add Fact
                </button>
              </div>
            </form>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700">Observed</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700">Metric</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700">Value</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {facts.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-sm text-neutral-500 text-center" colSpan={5}>
                      No facts recorded yet. Add your first fact above.
                    </td>
                  </tr>
                ) : (
                  facts.map((f) => (
                    <FactRow
                      key={f.id}
                      fact={f}
                      holdingId={holding.id}
                      updateAction={updateFact}
                      deleteAction={deleteFact}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

    </div>
  );
}
