import type { AssistantToolExecutor } from '../../executor-types';

export const executeProjectMetricTrend: AssistantToolExecutor = async (
  runtime,
) => {
  const { db: supabase, args, portfolioId } = runtime;
  {
    const metricCode = args.metric_code;
    const holdingId = args.holding_id;
    const periodsAhead = args.periods_ahead || 4;
    const method = args.method || 'linear';

    // Get historical data
    let query = supabase
      .from('metric_facts')
      .select('value, period_start, period_end, holdings!inner(portfolio_id)')
      .eq('holdings.portfolio_id', portfolioId)
      .eq('metric_code', metricCode)
      .order('period_start', { ascending: true });

    if (holdingId) {
      query = query.eq('holding_id', holdingId);
    }

    const { data: historicalData, error } = await query;

    if (error || !historicalData || historicalData.length < 2) {
      return {
        action: null,
        output: {
          error:
            'Not enough historical data for projection. Need at least 2 data points.',
          data_points: historicalData?.length || 0,
        },
      };
    }

    // Simple linear projection
    const values = historicalData.map((d: any) => d.value);
    const n = values.length;

    // Calculate slope and intercept
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((a: number, b: number) => a + b, 0);
    const sumXY = values.reduce(
      (sum: number, y: number, x: number) => sum + x * y,
      0,
    );
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Generate projections
    const projections = [];
    const lastPeriod = new Date(
      historicalData[n - 1].period_end || historicalData[n - 1].period_start,
    );

    for (let i = 1; i <= periodsAhead; i++) {
      const projectedValue = intercept + slope * (n - 1 + i);
      const projectedDate = new Date(lastPeriod);
      projectedDate.setMonth(projectedDate.getMonth() + 3 * i); // Assuming quarterly

      // Simple confidence interval (gets wider further out)
      const stdDev = Math.sqrt(
        values.reduce((sum: number, v: number, idx: number) => {
          const predicted = intercept + slope * idx;
          return sum + Math.pow(v - predicted, 2);
        }, 0) /
          (n - 2),
      );
      const confidenceMargin =
        stdDev * 1.96 * Math.sqrt(1 + 1 / n + Math.pow(i, 2) / sumX2);

      projections.push({
        period: projectedDate.toISOString().split('T')[0],
        projected_value: Math.max(0, projectedValue),
        confidence_low: Math.max(0, projectedValue - confidenceMargin),
        confidence_high: projectedValue + confidenceMargin,
      });
    }

    return {
      action: null,
      output: {
        metric_code: metricCode,
        method,
        historical_data_points: n,
        trend: slope > 0 ? 'increasing' : slope < 0 ? 'decreasing' : 'stable',
        slope_per_period: slope,
        projections,
      },
    };
  }
};
