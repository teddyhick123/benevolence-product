import { NextResponse } from 'next/server';
import { supabasePublic } from '@/lib/supabase';
import { requirePortfolioAccess, isAccessDenied } from '@/lib/portfolio-auth';

function computeProgress(
  current: number | null | undefined,
  baseline: number | null | undefined,
  target: number | null | undefined,
  directionality: 'higher_is_better' | 'lower_is_better' | null
) {
  if (current == null || baseline == null || target == null) return null;

  if (directionality === 'lower_is_better') {
    const total = baseline - target;
    if (total === 0) return current <= target ? 1 : 0;
    return Math.max(0, Math.min(1, (baseline - current) / total));
  } else {
    const total = target - baseline;
    if (total === 0) return current >= target ? 1 : 0;
    return Math.max(0, Math.min(1, (current - baseline) / total));
  }
}

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params; // <-- await params
  const access = await requirePortfolioAccess(portfolio_id);
  if (isAccessDenied(access)) return access.error;
  const sb = await supabasePublic();                  // <-- instantiate per request

  // 1) Fetch targets for this portfolio
  const { data: targets, error: tErr } = await sb
    .from('targets')
    .select('*')
    .eq('portfolio_id', portfolio_id)
    .order('target_date', { ascending: true });

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  if (!targets?.length) return NextResponse.json({ data: [], aggregates: {} });

  // 2) Load metric metadata
  const codes = Array.from(new Set(targets.map(t => t.metric_code).filter(Boolean)));
  let byMetric: Record<string, any> = {};
  if (codes.length) {
    const { data: metrics, error: mErr } = await sb
      .from('metrics')
      .select('code, unit, directionality, name')
      .in('code', codes);
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
    byMetric = Object.fromEntries((metrics ?? []).map(m => [m.code, m]));
  }

  // 3) Compute latest portfolio-level value per metric_code
  const { data: holdingIds, error: hErr } = await sb
    .from('holdings')
    .select('id')
    .eq('portfolio_id', portfolio_id);
  if (hErr) return NextResponse.json({ error: hErr.message }, { status: 500 });

  const holdingIdList = (holdingIds ?? []).map((h: any) => h.id);
  const currentByMetric: Record<string, number> = {};

  if (holdingIdList.length && codes.length) {
    const { data: facts, error: fErr } = await sb
      .from('metric_facts')
      .select('holding_id, metric_code, value, period_end')
      .in('holding_id', holdingIdList)
      .in('metric_code', codes)
      .order('period_end', { ascending: false });
    if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });

    const seen = new Set<string>(); // key = holding_id|metric_code
    for (const row of facts ?? []) {
      const key = `${row.holding_id}|${row.metric_code}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const v = Number(row.value ?? 0);
      currentByMetric[row.metric_code!] = (currentByMetric[row.metric_code!] ?? 0) + (isFinite(v) ? v : 0);
    }
  }

  // 4) Shape response
  const data = (targets ?? []).map(t => {
    const meta = byMetric[t.metric_code] || { unit: null, directionality: null, name: t.metric_code };
    const current = currentByMetric[t.metric_code] ?? null;
    const progress = computeProgress(current, t.baseline_value, t.target_value, meta.directionality as any);

    return {
      ...t,
      metric_name: meta.name ?? t.metric_code,
      unit: meta.unit,
      current_value: current,
      progress,
    };
  });

  const aggregates = data.reduce<Record<string, any>>((acc, r) => {
    acc[r.metric_code] = {
      metric_code: r.metric_code,
      name: r.metric_name,
      unit: r.unit,
      current_value: r.current_value,
      target_value: r.target_value,
      baseline_value: r.baseline_value,
      progress: r.progress,
    };
    return acc;
  }, {});

  return NextResponse.json({ data, aggregates });
}