import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase";
import { assetTypeSchema } from "@/lib/schemas/portfolio";
import { geocodeLocation } from "@/lib/services/google-maps";

const getSupabase = createSupabaseServerClient;
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

export async function updateHoldingBasics(formData: FormData) {
  'use server';
  const supabase = await getSupabase();
  const holdingId = String(formData.get('holding_id'));

  const updates: any = {};

  // Only include fields that are present in the form
  const name = getValue(formData, 'name');
  if (name !== undefined) updates.name = name;

  const asset_type = getValue(formData, 'asset_type');
  if (asset_type !== undefined) {
    const parsed = assetTypeSchema.nullable().safeParse(asset_type || null);
    if (!parsed.success) throw new Error(`Invalid asset_type: ${asset_type}`);
    updates.asset_type = parsed.data;
  }

  const sector = getValue(formData, 'sector');
  if (sector !== undefined) updates.sector = sector;

  const description = getValue(formData, 'description');
  if (description !== undefined) updates.description = description;

  const status = getValue(formData, 'status');
  if (status !== undefined) {
    const VALID_STATUSES = ['active', 'pending', 'committed', 'exited', 'written_off'] as const;
    if (status !== null && status !== '' && !VALID_STATUSES.includes(status as any)) {
      throw new Error(`Invalid status: ${status}`);
    }
    updates.status = status || null;
  }

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

export async function updateHoldingContact(formData: FormData) {
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

export async function updateHoldingLocation(formData: FormData) {
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

export async function updateHoldingFunds(formData: FormData) {
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

export async function updateHoldingOrgFunding(formData: FormData) {
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

export async function updateDescription(holdingId: string, description: string) {
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

export async function updateTheoryOfAction(holdingId: string, theory_of_action: string) {
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

export async function updateContactNotes(holdingId: string, primary_contact_notes: string) {
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

export async function updateHoldingCostPerOutcome(formData: FormData) {
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

export async function addFact(formData: FormData) {
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

export async function addContribution(formData: FormData) {
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

export async function updateFact(formData: FormData) {
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

export async function deleteFact(formData: FormData) {
  'use server';
  const supabase = await getSupabase();
  const factId = String(formData.get('fact_id'));
  const holdingId = String(formData.get('holding_id'));


  const { error } = await supabase
    .from('metric_facts')
    .delete()
    .eq('id', factId)
    .eq('holding_id', holdingId);

  if (error) {
    console.error('deleteFact error:', error);
    throw new Error(`Failed to delete fact: ${error.message}`);
  }

  revalidatePath(`/dashboard/holdings/${holdingId}`);
  revalidatePath(`/dashboard`);
}

export async function addHoldingLocation(formData: FormData) {
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

export async function updateHoldingLocationRecord(formData: FormData) {
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
    console.error('updateHoldingLocationRecord error:', error);
    throw new Error(`Failed to update location: ${error.message}`);
  }

  revalidatePath(`/dashboard/holdings/${holdingId}`);
  revalidatePath(`/dashboard`);
}

export async function deleteHoldingLocation(formData: FormData) {
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