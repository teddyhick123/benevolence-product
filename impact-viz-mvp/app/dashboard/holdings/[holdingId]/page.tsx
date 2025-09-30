import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import React from 'react';
import { revalidatePath } from 'next/cache';

type HoldingRow = {
  id: string;
  portfolio_id: string;
  name: string;
  asset_class?: string | null;
  description?: string | null;
  primary_contact_name?: string | null;
  primary_contact_email?: string | null;
  location_city?: string | null;
  location_state?: string | null;
  location_country?: string | null;
  theory_of_action?: string | null;
  cost_per_outcome?: number | null;            // legacy/manual optional
  cost_per_outcome_unit?: string | null;       // legacy/manual optional
  funds_allocated?: number | null;             // <-- used for cost/efficiency
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
async function getSupabase() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
      },
    }
  );
  return supabase;
}

async function fetchHolding(holdingId: string): Promise<{ holding: HoldingRow | null; error: any | null }> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('holdings')
    .select('id, portfolio_id, name, asset_class, description, primary_contact_name, primary_contact_email, location_city, location_state, location_country, theory_of_action, cost_per_outcome, cost_per_outcome_unit, funds_allocated, status, sector, as_of')
    .eq('id', holdingId)
    .single();

  return { holding: (data as any) ?? null, error };
}

async function fetchFacts(holdingId: string): Promise<FactRow[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('metric_facts')
    .select('id, holding_id, metric_code, value, updated_at, source')
    .eq('holding_id', holdingId)
    .order('updated_at', { ascending: false })
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

export async function updateHoldingBasics(formData: FormData) {
  'use server';
  const supabase = await getSupabase();
  const holdingId = String(formData.get('holding_id'));
  const updates: any = {
    name: formData.get('name') || null,
    asset_class: formData.get('asset_class') || null,
    sector: formData.get('sector') || null,
    primary_contact_name: formData.get('primary_contact_name') || null,
    primary_contact_email: formData.get('primary_contact_email') || null,
    location_city: formData.get('location_city') || null,
    location_state: formData.get('location_state') || null,
    location_country: formData.get('location_country') || null,
    status: formData.get('status') || null,
    as_of: formData.get('as_of') || null,
    funds_allocated: numOrNull(formData.get('funds_allocated')),
    theory_of_action: formData.get('theory_of_action') || null,
    cost_per_outcome: numOrNull(formData.get('cost_per_outcome')),
    cost_per_outcome_unit: formData.get('cost_per_outcome_unit') || null,
  };
  const { error } = await supabase.from('holdings').update(updates).eq('id', holdingId);
  if (error) console.error('updateHoldingBasics error', error);
  revalidatePath(`/dashboard/holdings/${holdingId}`);
}

export async function addFact(formData: FormData) {
  'use server';
  const supabase = await getSupabase();
  const holdingId = String(formData.get('holding_id'));
  const row = {
    holding_id: holdingId,
    metric_code: String(formData.get('metric_code') || ''),
    value: formData.get('value') ?? null,
    source: (formData.get('source') || null) as string | null,
  };
  const { error } = await supabase.from('metric_facts').insert(row);
  if (error) console.error('addFact error', error);
  revalidatePath(`/dashboard/holdings/${holdingId}`);
}

export async function addContribution(formData: FormData) {
  'use server';
  const supabase = await getSupabase();
  const holdingId = String(formData.get('holding_id'));
  const portfolioId = String(formData.get('portfolio_id'));
  const row = {
    portfolio_id: portfolioId,
    holding_id: holdingId,
    amount: numOrNull(formData.get('amount')),
    contributed_at: formData.get('contributed_at') || new Date().toISOString(),
    memo: (formData.get('memo') || null) as string | null,
    source: (formData.get('source') || null) as string | null,
  };
  const { error } = await supabase.from('holding_contributions').insert(row as any);
  if (error) console.error('addContribution error', error);
  revalidatePath(`/dashboard/holdings/${holdingId}`);
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

  const [facts, contributions] = await Promise.all([
    fetchFacts(holdingId),
    fetchContributions(portfolioId, holdingId),
  ]);

  const latestMetrics = latestByMetric(facts);

  const funds = Number(holding.funds_allocated ?? 0) || 0;

  // Prepare KPI cards with efficiency
  const kpiCards = latestMetrics.map((m) => {
    const mVal = typeof m.value === 'number' ? m.value : Number.NaN;
    // cost per outcome (funds / outcomes), efficiency (outcomes per $1k)
    const costPerOutcome = funds > 0 && typeof mVal === 'number' && isFinite(mVal) && mVal > 0 ? (funds / mVal) : null;
    const outcomesPerThousand = funds > 0 && typeof mVal === 'number' && isFinite(mVal) ? (mVal / (funds / 1000)) : null;
    return {
      key: m.metric_code,
      value: mVal,
      updated_at: m.updated_at,
      costPerOutcome,
      outcomesPerThousand,
    };
  });

  const contact = {
    name: holding.primary_contact_name ?? null,
    email: holding.primary_contact_email ?? null,
  };

  const locationParts = [holding.location_city, holding.location_state, holding.location_country].filter(Boolean);
  const location = locationParts.length ? locationParts.join(', ') : null;

  const legacyCostPerOutcome =
    holding.cost_per_outcome != null
      ? `${holding.cost_per_outcome}${holding.cost_per_outcome_unit ? ' ' + holding.cost_per_outcome_unit : ''}`
      : null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-col gap-1">
        <p className="text-xs text-neutral-500">Holding</p>
        <h1 className="text-2xl font-semibold text-neutral-900">{holding.name}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-700">
          {holding.asset_class ? <span>Class: <span className="font-medium">{holding.asset_class}</span></span> : null}
          {holding.sector ? <span>Sector: <span className="font-medium">{holding.sector}</span></span> : null}
          {location ? <span>Location: <span className="font-medium">{location}</span></span> : null}
          {holding.status ? <span>Status: <span className="font-medium">{holding.status}</span></span> : null}
          {holding.as_of ? <span>As of: <span className="font-medium">{humanDate(holding.as_of)}</span></span> : null}
        </div>
      </header>

      <details className="mt-3 rounded-xl border border-neutral-200 bg-white/60 p-4 open:shadow-sm">
        <summary className="cursor-pointer text-sm font-medium text-neutral-700">Edit basics</summary>
        <form action={updateHoldingBasics} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input type="hidden" name="holding_id" value={holding.id} />
          <label className="text-xs text-neutral-600">Name
            <input name="name" defaultValue={holding.name} className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm" />
          </label>
          <label className="text-xs text-neutral-600">Asset class
            <input name="asset_class" defaultValue={holding.asset_class ?? ''} className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm" />
          </label>
          <label className="text-xs text-neutral-600">Sector
            <input name="sector" defaultValue={holding.sector ?? ''} className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm" />
          </label>
          <label className="text-xs text-neutral-600">Funds allocated (USD)
            <input name="funds_allocated" defaultValue={holding.funds_allocated ?? ''} inputMode="decimal" className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm" />
          </label>
          <label className="text-xs text-neutral-600">Status
            <input name="status" defaultValue={holding.status ?? ''} className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm" />
          </label>
          <label className="text-xs text-neutral-600">As of
            <input type="date" name="as_of" defaultValue={holding.as_of ?? ''} className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm" />
          </label>
          <label className="col-span-full text-xs text-neutral-600">Theory of action
            <textarea name="theory_of_action" defaultValue={holding.theory_of_action ?? ''} rows={3} className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm" />
          </label>
          <div className="col-span-full flex justify-end">
            <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800">Save</button>
          </div>
        </form>
      </details>

      <details className="rounded-xl border border-neutral-200 bg-white/60 p-4 open:shadow-sm">
        <summary className="cursor-pointer text-sm font-medium text-neutral-700">Edit location & status</summary>
        <form action={updateHoldingBasics} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input type="hidden" name="holding_id" value={holding.id} />
          <label className="text-xs text-neutral-600">City
            <input name="location_city" defaultValue={holding.location_city ?? ''} className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm" />
          </label>
          <label className="text-xs text-neutral-600">State / Region
            <input name="location_state" defaultValue={holding.location_state ?? ''} className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm" />
          </label>
          <label className="text-xs text-neutral-600">Country
            <input name="location_country" defaultValue={holding.location_country ?? ''} className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm" />
          </label>
          <div className="col-span-full flex justify-end">
            <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800">Save</button>
          </div>
        </form>
      </details>

      {/* Contact + Key details */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-neutral-700">Primary Contact</h3>
          <div className="mt-2 text-sm text-neutral-800">
            {contact.name ? <p className="font-medium">{contact.name}</p> : <p className="text-neutral-500">—</p>}
            {contact.email ? (
              <p className="mt-0.5">
                <a className="text-indigo-600 underline" href={`mailto:${contact.email}`}>{contact.email}</a>
              </p>
            ) : null}
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-neutral-600">Edit contact</summary>
            <form action={updateHoldingBasics} className="mt-2 grid grid-cols-1 gap-2">
              <input type="hidden" name="holding_id" value={holding.id} />
              <label className="text-xs text-neutral-600">Name
                <input name="primary_contact_name" defaultValue={contact.name ?? ''} className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm" />
              </label>
              <label className="text-xs text-neutral-600">Email
                <input name="primary_contact_email" defaultValue={contact.email ?? ''} type="email" className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm" />
              </label>
              <div className="flex justify-end">
                <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800">Save</button>
              </div>
            </form>
          </details>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-neutral-700">Funds Allocated</h3>
          <p className="mt-2 text-2xl font-semibold text-neutral-900">
            {isFinite(funds) ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(funds) : '—'}
          </p>
          <p className="mt-1 text-xs text-neutral-500">Used to compute cost per outcome & efficiency below.</p>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-neutral-600">Edit funds</summary>
            <form action={updateHoldingBasics} className="mt-2 grid grid-cols-1 gap-2">
              <input type="hidden" name="holding_id" value={holding.id} />
              <input name="funds_allocated" defaultValue={holding.funds_allocated ?? ''} inputMode="decimal" className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm" />
              <div className="flex justify-end">
                <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800">Save</button>
              </div>
            </form>
          </details>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-neutral-700">Legacy Cost per Outcome</h3>
          <p className="mt-2 text-2xl font-semibold text-neutral-900">{legacyCostPerOutcome ?? '—'}</p>
          <p className="mt-1 text-xs text-neutral-500">Displayed if manually set on the holding. Auto-calculated KPIs shown below.</p>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-neutral-600">Edit legacy cost</summary>
            <form action={updateHoldingBasics} className="mt-2 grid grid-cols-1 gap-2">
              <input type="hidden" name="holding_id" value={holding.id} />
              <label className="text-xs text-neutral-600">Cost per outcome
                <input name="cost_per_outcome" defaultValue={holding.cost_per_outcome ?? ''} inputMode="decimal" className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm" />
              </label>
              <label className="text-xs text-neutral-600">Unit
                <input name="cost_per_outcome_unit" defaultValue={holding.cost_per_outcome_unit ?? ''} className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm" />
              </label>
              <div className="flex justify-end">
                <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800">Save</button>
              </div>
            </form>
          </details>
        </div>
      </section>

      {/* Theory of Action */}
      <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-medium text-neutral-700">Theory of Action</h3>
        <div className="mt-2 prose prose-sm max-w-none text-neutral-800">
          {holding.theory_of_action ? (
            <p>{holding.theory_of_action}</p>
          ) : (
            <p className="text-neutral-500">No theory of action recorded yet.</p>
          )}
        </div>
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
                <p className="text-xs text-neutral-500">{m.key}</p>
                <p className="mt-1 text-2xl font-semibold text-neutral-900">
                  {Number.isFinite(m.value) ? m.value : '—'}
                </p>
                <p className="mt-1 text-[11px] text-neutral-500">Latest: {humanDate(m.updated_at)}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-lg border border-neutral-200 p-2">
                    <p className="text-neutral-500">Cost / Outcome</p>
                    <p className="font-medium">
                      {m.costPerOutcome != null && isFinite(m.costPerOutcome)
                        ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(m.costPerOutcome)
                        : '—'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-neutral-200 p-2 col-span-2">
                    <p className="text-neutral-500">Outcomes per $1k</p>
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

      {/* Facts Table (chronological) */}
      <section>
        <h3 className="text-sm font-medium text-neutral-700">All Facts</h3>
        <div className="mt-2 overflow-hidden rounded-2xl border border-black/10 bg-white">
          <form action={addFact} className="p-3 flex flex-wrap items-end gap-2 border-b border-neutral-200 bg-neutral-50/60">
            <input type="hidden" name="holding_id" value={holding.id} />
            <label className="text-xs text-neutral-600">Metric
              <input name="metric_code" className="mt-1 w-36 rounded-md border border-neutral-300 px-2 py-1 text-sm" placeholder="e.g. JOBS" required />
            </label>
            <label className="text-xs text-neutral-600">Value
              <input name="value" className="mt-1 w-32 rounded-md border border-neutral-300 px-2 py-1 text-sm" placeholder="e.g. 12" />
            </label>
            <label className="text-xs text-neutral-600">Source URL
              <input name="source" className="mt-1 w-64 rounded-md border border-neutral-300 px-2 py-1 text-sm" placeholder="https://…" />
            </label>
            <button className="ml-auto rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800">Add fact</button>
          </form>
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-700">Observed</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-700">Metric</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-700">Value</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-700">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {facts.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-sm text-neutral-600" colSpan={4}>No facts recorded yet.</td>
                </tr>
              ) : (
                facts.map((f) => (
                  <tr key={f.id} className="hover:bg-neutral-50">
                    <td className="px-3 py-2 text-sm text-neutral-800">{humanDate(f.updated_at)}</td>
                    <td className="px-3 py-2 text-sm text-neutral-800">{f.metric_code}</td>
                    <td className="px-3 py-2 text-sm text-neutral-800">{f.value ?? '—'}</td>
                    <td className="px-3 py-2 text-sm">
                      {f.source ? <a className="text-indigo-600 underline" href={f.source} target="_blank" rel="noreferrer">Source</a> : <span className="text-neutral-500">—</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* History of Contributions */}
      <section>
        <h3 className="text-sm font-medium text-neutral-700">History of Contributions</h3>
        <div className="mt-2 overflow-hidden rounded-2xl border border-black/10 bg-white">
          <form action={addContribution} className="p-3 flex flex-wrap items-end gap-2 border-b border-neutral-200 bg-neutral-50/60">
            <input type="hidden" name="portfolio_id" value={portfolioId} />
            <input type="hidden" name="holding_id" value={holding.id} />
            <label className="text-xs text-neutral-600">Amount (USD)
              <input name="amount" inputMode="decimal" className="mt-1 w-40 rounded-md border border-neutral-300 px-2 py-1 text-sm" placeholder="e.g. 50000" />
            </label>
            <label className="text-xs text-neutral-600">Date
              <input type="date" name="contributed_at" className="mt-1 w-40 rounded-md border border-neutral-300 px-2 py-1 text-sm" />
            </label>
            <label className="text-xs text-neutral-600">Memo
              <input name="memo" className="mt-1 w-56 rounded-md border border-neutral-300 px-2 py-1 text-sm" placeholder="optional" />
            </label>
            <label className="text-xs text-neutral-600">Source URL
              <input name="source" className="mt-1 w-64 rounded-md border border-neutral-300 px-2 py-1 text-sm" placeholder="https://…" />
            </label>
            <button className="ml-auto rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800">Add</button>
          </form>
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-700">Date</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-700">Amount</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-700">Memo</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-neutral-700">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {contributions.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-sm text-neutral-600" colSpan={4}>No contributions recorded yet.</td>
                </tr>
              ) : (
                contributions.map((c) => (
                  <tr key={c.id} className="hover:bg-neutral-50">
                    <td className="px-3 py-2 text-sm text-neutral-800">{humanDate(c.contributed_at)}</td>
                    <td className="px-3 py-2 text-sm text-neutral-800">
                      {new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(c.amount)}
                    </td>
                    <td className="px-3 py-2 text-sm text-neutral-800">{c.memo ?? '—'}</td>
                    <td className="px-3 py-2 text-sm">
                      {c.source ? <a className="text-indigo-600 underline" href={c.source} target="_blank" rel="noreferrer">Link</a> : <span className="text-neutral-500">—</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Widgets Area */}
      <section className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-medium text-neutral-700">Widgets</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-dashed border-black/10 p-6 text-sm text-neutral-600">Add a chart or widget here…</div>
          <div className="rounded-xl border border-dashed border-black/10 p-6 text-sm text-neutral-600">Add a breakdown or timeseries…</div>
          <div className="rounded-xl border border-dashed border-black/10 p-6 text-sm text-neutral-600">Map / geo overlay…</div>
        </div>
      </section>
    </div>
  );
}
