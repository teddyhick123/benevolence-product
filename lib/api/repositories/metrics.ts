import type { SessionClient } from '@/lib/api/server-client';

export type PortfolioKpiSum = {
  metric_code: string;
  total_value: number;
  latest_period: string | null;
};

export type HoldingTopKpi = {
  holding_id: string;
  metric_code: string;
  display_name: string;
  value: number;
  unit: string | null;
  period_end: string;
};

/** Reads only canonical KPI views and always applies the authorized portfolio. */
export function createPortfolioMetricsRepository(db: SessionClient, portfolioId: string) {
  return {
    async latestSums(): Promise<PortfolioKpiSum[]> {
      const { data, error } = await db
        .from('v_portfolio_kpi_latest')
        .select('metric_code, value, period_end')
        .eq('portfolio_id', portfolioId);
      if (error) throw error;

      const totals = new Map<string, PortfolioKpiSum>();
      for (const row of data ?? []) {
        const current = totals.get(row.metric_code) ?? {
          metric_code: row.metric_code,
          total_value: 0,
          latest_period: null,
        };
        current.total_value += Number(row.value ?? 0);
        if (row.period_end && (!current.latest_period || row.period_end > current.latest_period)) {
          current.latest_period = row.period_end;
        }
        totals.set(row.metric_code, current);
      }
      return [...totals.values()].sort((a, b) => a.metric_code.localeCompare(b.metric_code));
    },

    async topByHolding(holdingIds: string[], limit = 3): Promise<HoldingTopKpi[]> {
      if (holdingIds.length === 0) return [];
      const { data, error } = await db
        .from('v_portfolio_kpi_latest')
        .select('holding_id, metric_code, display_name, value, unit, period_end, progress_percentage')
        .eq('portfolio_id', portfolioId)
        .in('holding_id', holdingIds)
        .order('progress_percentage', { ascending: false, nullsFirst: false })
        .order('period_end', { ascending: false });
      if (error) throw error;

      const counts = new Map<string, number>();
      const result: HoldingTopKpi[] = [];
      for (const row of data ?? []) {
        const count = counts.get(row.holding_id) ?? 0;
        if (count >= limit) continue;
        counts.set(row.holding_id, count + 1);
        result.push({
          holding_id: row.holding_id,
          metric_code: row.metric_code,
          display_name: row.display_name,
          value: Number(row.value),
          unit: row.unit,
          period_end: row.period_end,
        });
      }
      return result;
    },
  };
}
