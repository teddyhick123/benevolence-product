// app/admin/portfolios/[id]/kpis/page.tsx
import { createSupabaseServerClient } from '@/lib/supabase-server';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type KpiRow = {
  id: string;
  metric_code: string;
  display_name: string | null;
  target_value: number | null;
  target_date: string | null;
  order_index: number | null;
};

type Metric = {
  code: string;
  name: string;
  unit: string | null;
};

async function loadData(portfolioId: string) {
  const supabase = await createSupabaseServerClient();

  // Admin gate
  const { data: isAdmin, error: adminErr } = await supabase.rpc('is_admin');
  if (adminErr || !isAdmin) {
    return { error: 'Not authorized', kpis: [] as KpiRow[], metrics: [] as Metric[] };
  }

  const [{ data: kpis, error: kErr }, { data: metrics, error: mErr }] = await Promise.all([
    supabase
      .from('kpi_definitions')
      .select('id, metric_code, display_name, target_value, target_date, order_index')
      .eq('portfolio_id', portfolioId)
      .order('order_index', { ascending: true }),
    supabase
      .from('metrics')
      .select('code, name, unit')
      .order('code', { ascending: true }),
  ]);

  const error = kErr?.message || mErr?.message || null;
  return { error, kpis: (kpis ?? []) as KpiRow[], metrics: (metrics ?? []) as Metric[] };
}

function MetricCodeSelect({
  name,
  metrics,
  defaultValue,
}: {
  name: string;
  metrics: Metric[];
  defaultValue?: string | null;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue ?? ''}
      className="border rounded-2xl px-3 py-2 w-full"
      required
    >
      <option value="" disabled>
        Select a metric…
      </option>
      {metrics.map((m) => (
        <option key={m.code} value={m.code}>
          {m.code} {m.unit ? `(${m.unit})` : ''} — {m.name}
        </option>
      ))}
    </select>
  );
}

export default async function KpisPage(ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolioId } = await ctx.params;
  const { error, kpis, metrics } = await loadData(portfolioId);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">KPIs</h1>
          <p className="text-sm text-neutral-600">Manage key performance indicators for this portfolio.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/portfolios/${encodeURIComponent(portfolioId)}/members`}
            className="px-4 py-2 rounded-2xl border border-black/10 hover:bg-white shadow-sm hover:shadow transition"
          >
            Members
          </Link>
          <Link
            href={`/dashboard?portfolio_id=${encodeURIComponent(portfolioId)}`}
            className="px-4 py-2 rounded-2xl bg-azure text-white shadow-soft hover:opacity-90 transition"
          >
            Dashboard
          </Link>
        </div>
      </div>

      {error && (
        <div className="card p-4 text-sm text-red-700 bg-red-50 border border-red-200">
          {error}
        </div>
      )}

      {/* Create KPI */}
      <div className="card p-4 space-y-4">
        <h2 className="text-lg font-medium">Add KPI</h2>
        <form
          action={`/api/admin/portfolios/${encodeURIComponent(portfolioId)}/kpis`}
          method="post"
          className="grid grid-cols-1 md:grid-cols-5 gap-3"
        >
          <div className="md:col-span-2">
            <MetricCodeSelect name="metric_code" metrics={metrics} />
          </div>
          <input
            name="display_name"
            placeholder="Display name (optional)"
            className="border rounded-2xl px-3 py-2 w-full"
          />
          <input
            name="target_value"
            placeholder="Target value"
            type="number"
            step="any"
            className="border rounded-2xl px-3 py-2 w-full"
          />
          <input
            name="target_date"
            placeholder="Target date (YYYY-MM-DD)"
            pattern="\\d{4}-\\d{2}-\\d{2}"
            className="border rounded-2xl px-3 py-2 w-full"
          />
          <input
            name="order_index"
            placeholder="Order"
            type="number"
            className="border rounded-2xl px-3 py-2 w-full"
          />
          <div className="md:col-span-5 flex items-center gap-2">
            <button
              type="submit"
              className="px-4 py-2 rounded-2xl bg-azure text-white shadow-soft hover:opacity-90 transition"
            >
              Create KPI
            </button>
            <span className="text-xs text-neutral-500">You can reorder later by changing order numbers.</span>
          </div>
          <input type="hidden" name="__from" value="ui" />
        </form>
      </div>

      {/* List / Edit KPIs */}
      <div className="card p-4">
        {kpis.length === 0 ? (
          <div className="text-sm text-neutral-600">No KPIs yet. Create one above.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/5">
                  <th className="text-left px-3 py-2 font-medium text-neutral-700">Metric</th>
                  <th className="text-left px-3 py-2 font-medium text-neutral-700">Display name</th>
                  <th className="text-left px-3 py-2 font-medium text-neutral-700">Target</th>
                  <th className="text-left px-3 py-2 font-medium text-neutral-700">Target date</th>
                  <th className="text-left px-3 py-2 font-medium text-neutral-700">Order</th>
                  <th className="text-right px-3 py-2 font-medium text-neutral-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {kpis.map((k) => (
                  <tr key={k.id} className="border-b border-black/5 align-top">
                    <td className="px-3 py-2 min-w-[220px]">
                      <form
                        action={`/api/admin/kpis/${encodeURIComponent(k.id)}`}
                        method="post"
                        className="grid grid-cols-1 gap-2 md:grid-cols-1"
                      >
                        <input type="hidden" name="_method" value="PUT" />
                        <MetricCodeSelect name="metric_code" metrics={metrics} defaultValue={k.metric_code} />
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mt-2">
                          <input
                            name="display_name"
                            defaultValue={k.display_name ?? ''}
                            placeholder="Display name"
                            className="border rounded-2xl px-3 py-2 md:col-span-2"
                          />
                          <input
                            name="target_value"
                            defaultValue={k.target_value ?? ''}
                            placeholder="Target value"
                            type="number"
                            step="any"
                            className="border rounded-2xl px-3 py-2"
                          />
                          <input
                            name="target_date"
                            defaultValue={k.target_date ?? ''}
                            placeholder="YYYY-MM-DD"
                            pattern="\\d{4}-\\d{2}-\\d{2}"
                            className="border rounded-2xl px-3 py-2"
                          />
                          <input
                            name="order_index"
                            defaultValue={k.order_index ?? 0}
                            placeholder="Order"
                            type="number"
                            className="border rounded-2xl px-3 py-2"
                          />
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <button className="px-3 py-1.5 rounded-2xl bg-azure text-white shadow-soft hover:opacity-90 transition">
                            Save
                          </button>
                          <form
                            action={`/api/admin/kpis/${encodeURIComponent(k.id)}`}
                            method="post"
                            onSubmit={(e) => {
                              if (!confirm('Delete this KPI?')) e.preventDefault();
                            }}
                          >
                            <input type="hidden" name="_method" value="DELETE" />
                            <button
                              className="px-3 py-1.5 rounded-2xl border border-black/10 hover:bg-white shadow-sm hover:shadow transition"
                              type="submit"
                            >
                              Delete
                            </button>
                          </form>
                        </div>
                      </form>
                    </td>
                    <td className="px-3 py-2 align-top"></td>
                    <td className="px-3 py-2 align-top"></td>
                    <td className="px-3 py-2 align-top"></td>
                    <td className="px-3 py-2 align-top"></td>
                    <td className="px-3 py-2 align-top text-right"></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
