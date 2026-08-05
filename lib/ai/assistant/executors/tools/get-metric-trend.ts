import type { AssistantToolExecutor } from '../../executor-types';
import {
  InputValidator,
  TimeWindowHelper,
  ValidationError,
} from '../../helpers';
import type { TimeWindow } from '../../helpers';

export const executeGetMetricTrend: AssistantToolExecutor = async (runtime) => {
  const { db: supabase, args, portfolioId } = runtime;
  {
    if (args.metric_code) {
      args.metric_code = String(args.metric_code).toUpperCase();
    }
    InputValidator.validateString(args.metric_code, 'metric_code', {
      maxLength: 100,
      pattern: /^[A-Z0-9_]+$/,
    });
    if (!args.metric_code) {
      throw new ValidationError('metric_code is required');
    }
    if (args.holding_id) {
      InputValidator.validateUUID(args.holding_id, 'holding_id');
    }
    InputValidator.validateEnum(args.window, 'window', [
      '3m',
      '6m',
      '12m',
      '24m',
      'all',
    ] as const);

    const window: TimeWindow = (args.window as TimeWindow) || 'all';
    const startDate = TimeWindowHelper.getStartDate(window);

    let query = supabase
      .from('metric_facts')
      .select(
        'value, unit, period_start, period_end, holdings!inner(id, name, portfolio_id)',
      )
      .eq('metric_code', args.metric_code)
      .eq('holdings.portfolio_id', portfolioId)
      .gte('period_end', startDate)
      .order('period_end', { ascending: true });

    if (args.holding_id) {
      query = query.eq('holding_id', args.holding_id);
    }

    const { data } = await query;

    const byPeriod: Record<string, { total: number; count: number }> = {};
    (data || []).forEach((fact: any) => {
      const period = fact.period_end || fact.period_start;
      if (!byPeriod[period]) {
        byPeriod[period] = { total: 0, count: 0 };
      }
      byPeriod[period].total += fact.value || 0;
      byPeriod[period].count++;
    });

    const trend = Object.entries(byPeriod)
      .map(([date, { total }]) => ({ date, value: total }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (trend.length === 0) {
      const { data: availableMetrics } = await supabase
        .from('metric_facts')
        .select('metric_code, holdings!inner(portfolio_id)')
        .eq('holdings.portfolio_id', portfolioId);

      const uniqueMetrics = [
        ...new Set((availableMetrics || []).map((m: any) => m.metric_code)),
      ];

      return {
        action: null,
        output: {
          metric_code: args.metric_code,
          window,
          trend: [],
          data_points: 0,
          no_data: true,
          message: `No data found for metric '${args.metric_code}' in this portfolio.`,
          available_metrics: uniqueMetrics,
          suggestion:
            uniqueMetrics.length > 0
              ? `Try one of these metrics instead: ${uniqueMetrics.slice(0, 10).join(', ')}`
              : 'No metric data exists in this portfolio yet. Upload reports or add metrics to holdings first.',
        },
      };
    }

    return {
      action: null,
      output: {
        metric_code: args.metric_code,
        window,
        trend,
        data_points: trend.length,
        unit: data?.[0]?.unit || null,
      },
    };
  }
};
