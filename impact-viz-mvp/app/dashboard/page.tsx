import { createSupabaseServerClient } from '@/lib/supabase-server';
import KpiSection from '@/components/KpiSection';
import HoldingsSection from '@/components/HoldingsSection';
import WidgetsSection from '@/components/vis/WidgetsSection';
import SummarySection from '@/components/SummarySection';
import MapSection from '@/components/MapSection';
import Reveal from '@/components/Reveal';
import { headers } from 'next/headers';
import AIAssistantButton from '@/components/AIAssistantButton';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type OverviewRow = {
  portfolio_id: string;
  metric_code?: string | null;    // new shape
  value?: number | null;          // new shape
  unit?: string | null;           // new shape (nullable)
  period_start?: string | null;   // new shape
  period_end?: string | null;     // new shape
  created_at?: string | null;     // new shape
  holding_name?: string | null;
  sector?: string | null;
  country?: string | null;
  metric_name?: string | null;
  metric_value?: number | null;
  as_of_date?: string | null;
};

type KpiSum = { metric_code: string; total_value: number | null; latest_period: string | null };

async function getBaseUrl() {
  const h = await headers(); // <-- await removed
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host') ?? 'localhost:3000';
  return `${proto}://${host}`;
}

const getSupabase = createSupabaseServerClient;

export default async function Dashboard({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = (await searchParams ?? {}) as Record<string, any>;
  const pidSnake = typeof sp?.portfolio_id === 'string' ? sp.portfolio_id : Array.isArray(sp?.portfolio_id) ? sp?.portfolio_id[0] : undefined;
  const pidCamel = typeof sp?.portfolioId === 'string' ? sp?.portfolioId : Array.isArray(sp?.portfolioId) ? sp?.portfolioId[0] : undefined;
  const base = await getBaseUrl();
  const reqHeaders = await headers();
  const cookieHeader = reqHeaders.get('cookie') ?? '';
  const urlPortfolio = pidSnake || pidCamel;

  let me: { recommended_portfolio_id?: string | null } | null = null;
  try {
    const meRes = await fetch(`${base}/api/me`, { cache: 'no-store', headers: { cookie: cookieHeader } });
    if (meRes.ok) me = await meRes.json();
  } catch {}
  // Avoid env fallback here so we never silently use the default portfolio
  const portfolioId = urlPortfolio || me?.recommended_portfolio_id || '';

  if (!portfolioId) {
    return <div className="p-6">No portfolio selected.</div>;
  }

  let portfolioName = '';
  try {
    const metaRes = await fetch(`${base}/api/portfolio/${portfolioId}/meta`, { cache: 'no-store', headers: { cookie: cookieHeader } });
    if (metaRes?.ok) {
      const meta = await metaRes.json().catch(() => ({} as any));
      portfolioName = (meta?.name as string) || '';
    }
  } catch {}

  const roleRes = await fetch(`${base}/api/portfolio/${portfolioId}/role`, { cache: 'no-store', headers: { cookie: cookieHeader } }).catch(() => undefined);
  const roleJson: { role?: string; can_edit?: boolean } = roleRes && roleRes.ok ? await roleRes.json() : { role: 'viewer', can_edit: false };
  const canEdit = !!roleJson?.can_edit;

  const settingsRes = await fetch(`${base}/api/portfolio/${portfolioId}/settings`, { cache: 'no-store', headers: { cookie: cookieHeader } }).catch(() => undefined);
  const settingsJson: { show_map?: boolean; widgets?: string[] } = settingsRes && settingsRes.ok ? await settingsRes.json() : { show_map: true, widgets: [] };
  const showMap = settingsJson.show_map !== false;

  // Fetch portfolio-level KPI sums (sum of latest per holding)
  let kpiSums: KpiSum[] = [];
  try {
    const supabase = await getSupabase();
    const { data } = await supabase.rpc('get_portfolio_latest_kpis_sum', { p_portfolio_id: portfolioId });
    kpiSums = Array.isArray(data) ? data as KpiSum[] : [];
  } catch {}

  return (
    <div className="space-y-8 isolate w-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between w-full gap-4">
        <div>
          <div className="text-sm text-neutral-500">{portfolioName || `Portfolio: ${portfolioId}`}</div>
          <h1 className="text-3xl font-serif">Portfolio Dashboard</h1>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <a
            href={"/dashboard/letter?portfolio_id=" + portfolioId}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md border border-azure text-azure hover:bg-azure/5 transition-all duration-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            View Letter
          </a>
          <a
            href={"/admin/upload?portfolio_id=" + portfolioId}
            className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white shadow-soft hover:opacity-90 transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none"
          >
            Upload
          </a>
        </div>
      </div>

      <Reveal>
        {/* Provide portfolio KPI sums as an optimization/hint; KpiSection can fall back to its own fetch if not used */}
        <KpiSection {...({ portfolioId, canEdit, initialSums: kpiSums, mode: 'portfolio-sum' } as any)} />
      </Reveal>

      <Reveal delay={75}>
        <div className="grid grid-cols-12 gap-6 xl:gap-8 2xl:gap-10 w-full">
          <div className="col-span-12 lg:col-span-6 xl:col-span-7 min-w-0 isolate">
            <HoldingsSection portfolioId={portfolioId} canEdit={canEdit} />
          </div>
          <div className="col-span-12 lg:col-span-6 xl:col-span-5 min-w-0 isolate">
            <WidgetsSection portfolioId={portfolioId} canEdit={canEdit} />
          </div>
        </div>
      </Reveal>

      <Reveal delay={150}>
        <SummarySection portfolioId={portfolioId} />
      </Reveal>

      {showMap && (
        <Reveal delay={225}>
          <MapSection portfolioId={portfolioId} />
        </Reveal>
      )}

      {/* AI Assistant */}
      <AIAssistantButton portfolioId={portfolioId} />
    </div>
  );
}