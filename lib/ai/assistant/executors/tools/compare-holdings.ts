import type { AssistantToolExecutor } from '../../executor-types';
import { InputValidator, ValidationError } from '../../helpers';

export const executeCompareHoldings: AssistantToolExecutor = async (
  runtime,
) => {
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
    InputValidator.validateArray(args.holding_ids, 'holding_ids', {
      maxLength: 100,
    });
    if (args.holding_ids) {
      args.holding_ids.forEach((id: string, idx: number) => {
        InputValidator.validateUUID(id, `holding_ids[${idx}]`);
      });
    }
    InputValidator.validateEnum(args.sort_order, 'sort_order', [
      'asc',
      'desc',
    ] as const);
    InputValidator.validateNumber(args.limit, 'limit', { min: 1, max: 100 });

    const { data: holdings } = await supabase
      .from('holdings')
      .select('id, name, sector')
      .eq('portfolio_id', portfolioId);

    const holdingMap = new Map((holdings || []).map((h: any) => [h.id, h]));
    const requestedHoldingIds =
      args.holding_ids || holdings?.map((h: any) => h.id) || [];
    const holdingIds = requestedHoldingIds.filter((id: string) =>
      holdingMap.has(id),
    );

    const { data: facts } = await supabase
      .from('metric_facts')
      .select('holding_id, value, unit, period_end')
      .eq('metric_code', args.metric_code)
      .in('holding_id', holdingIds)
      .order('period_end', { ascending: false });

    const latestByHolding: Record<
      string,
      { value: number; unit: string | null; date: string }
    > = {};
    (facts || []).forEach((fact: any) => {
      if (!latestByHolding[fact.holding_id]) {
        latestByHolding[fact.holding_id] = {
          value: fact.value,
          unit: fact.unit,
          date: fact.period_end,
        };
      }
    });

    const comparison = Object.entries(latestByHolding)
      .map(([holdingId, data]) => ({
        holding_id: holdingId,
        holding_name: holdingMap.get(holdingId)?.name || 'Unknown',
        sector: holdingMap.get(holdingId)?.sector || null,
        value: data.value,
        unit: data.unit,
        date: data.date,
      }))
      .sort((a, b) =>
        args.sort_order === 'asc' ? a.value - b.value : b.value - a.value,
      )
      .slice(0, args.limit || 10);

    if (comparison.length === 0) {
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
          comparison: [],
          holdings_with_data: 0,
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
        comparison,
        holdings_with_data: comparison.length,
      },
    };
  }
};
