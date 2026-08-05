import type { AssistantToolExecutor } from '../../executor-types';
import {
  CHART_COLORS,
  InputValidator,
  TimeWindowHelper,
  ValidationError,
  type TimeWindow,
} from '../../helpers';
export const executeGetChartData: AssistantToolExecutor = async (runtime) => {
  const {
    db: supabase,
    args,
    portfolioId,
    userId,
    sessionId,
    batchId,
    sequenceOrder,
    userPrompt,
  } = runtime;
  if (args.metric_code) {
    args.metric_code = String(args.metric_code).toUpperCase();
  }
  const validDataTypes = [
    'holdings_by_sector',
    'holdings_by_country',
    'metric_trend',
    'metric_comparison',
    'allocation_breakdown',
    'status_breakdown',
  ] as const;
  InputValidator.validateEnum(args.data_type, 'data_type', validDataTypes);
  if (!args.data_type) {
    throw new ValidationError('data_type is required');
  }
  if (args.metric_code) {
    InputValidator.validateString(args.metric_code, 'metric_code', {
      maxLength: 100,
      pattern: /^[A-Z0-9_]+$/,
    });
  }
  if (
    ['metric_trend', 'metric_comparison'].includes(args.data_type) &&
    !args.metric_code
  ) {
    throw new ValidationError(
      `metric_code is required for data_type '${args.data_type}'`,
    );
  }
  InputValidator.validateEnum(args.window, 'window', [
    '3m',
    '6m',
    '12m',
    '24m',
    'all',
  ] as const);
  InputValidator.validateNumber(args.limit, 'limit', { min: 1, max: 100 });

  const limit = args.limit || 10;

  const createChartPreview = (
    title: string,
    chartType: string,
    data: any[],
    xField: string,
    yField: string,
    colors: string[],
  ) => {
    const isPieOrDonut = chartType === 'pie' || chartType === 'donut';
    const d3Config = {
      d3: {
        kind: chartType,
        data,
        encoding: {
          x: xField,
          y: yField,
          ...(isPieOrDonut && { label: xField, value: yField }),
        },
        options: {
          colors,
        },
      },
    };

    const widgetPreview = {
      id: crypto.randomUUID(),
      portfolio_id: portfolioId,
      type: 'd3_json',
      title,
      config: d3Config,
      position: 0,
      is_preview: true,
    };

    const previewAction: any = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      portfolio_id: portfolioId,
      user_id: userId,
      action_type: 'preview',
      entity_type: 'widget',
      entity_id: widgetPreview.id,
      operation_data: {
        table: 'holding_widgets',
        after: widgetPreview,
        is_preview: true,
      },
      ai_reasoning: `Created ${chartType} chart: "${title}"`,
      user_prompt: userPrompt,
      status: 'preview',
      batch_id: batchId,
      sequence_order: sequenceOrder,
    };

    return { previewAction, widgetPreview };
  };

  switch (args.data_type) {
    case 'holdings_by_sector': {
      const { data: holdings } = await supabase
        .from('holdings')
        .select('sector, funds_allocated')
        .eq('portfolio_id', portfolioId);

      const sectors: Record<string, number> = {};
      (holdings || []).forEach((h: any) => {
        const sector = h.sector || 'Unspecified';
        sectors[sector] = (sectors[sector] || 0) + (h.funds_allocated || 0);
      });

      const chartData = Object.entries(sectors)
        .map(([sector, funds]) => ({ sector, funds }))
        .sort((a, b) => b.funds - a.funds)
        .slice(0, limit);

      const sectorChartType = chartData.length <= 6 ? 'pie' : 'bar';
      const { previewAction: sectorAction, widgetPreview: sectorWidget } =
        createChartPreview(
          'Holdings by Sector',
          sectorChartType,
          chartData,
          'sector',
          'funds',
          CHART_COLORS,
        );

      return {
        action: sectorAction,
        output: {
          data: chartData,
          chart_generated: true,
          widget: sectorWidget,
          message: `Generated a ${sectorChartType} chart showing holdings by sector.`,
        },
      };
    }

    case 'holdings_by_country': {
      const { data: holdings } = await supabase
        .from('holdings')
        .select('country, funds_allocated')
        .eq('portfolio_id', portfolioId);

      const countries: Record<string, number> = {};
      (holdings || []).forEach((h: any) => {
        const country = h.country || 'Unspecified';
        countries[country] =
          (countries[country] || 0) + (h.funds_allocated || 0);
      });

      const chartData = Object.entries(countries)
        .map(([country, funds]) => ({ country, funds }))
        .sort((a, b) => b.funds - a.funds)
        .slice(0, limit);

      const countryChartType = chartData.length <= 6 ? 'pie' : 'bar';
      const { previewAction: countryAction, widgetPreview: countryWidget } =
        createChartPreview(
          'Holdings by Country',
          countryChartType,
          chartData,
          'country',
          'funds',
          CHART_COLORS,
        );

      return {
        action: countryAction,
        output: {
          data: chartData,
          chart_generated: true,
          widget: countryWidget,
          message: `Generated a ${countryChartType} chart showing holdings by country.`,
        },
      };
    }

    case 'metric_trend': {
      if (!args.metric_code) {
        throw new Error('metric_code is required for metric_trend');
      }

      const effectiveWindow = (args.window as TimeWindow) || 'all';
      const startDate = TimeWindowHelper.getStartDate(effectiveWindow);

      const { data: facts } = await supabase
        .from('metric_facts')
        .select('value, period_end, holdings!inner(portfolio_id)')
        .eq('metric_code', args.metric_code)
        .eq('holdings.portfolio_id', portfolioId)
        .gte('period_end', startDate)
        .order('period_end', { ascending: true });

      const byPeriod: Record<string, number> = {};
      (facts || []).forEach((fact: any) => {
        const period = fact.period_end;
        byPeriod[period] = (byPeriod[period] || 0) + (fact.value || 0);
      });

      const chartData = Object.entries(byPeriod)
        .map(([date, value]) => ({ date, value }))
        .sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );

      if (chartData.length === 0) {
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
            data: [],
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

      const chartTitle = `${args.metric_code} Trend`;
      const d3Config = {
        d3: {
          kind: 'line',
          data: chartData,
          encoding: {
            x: 'date',
            y: 'value',
          },
          options: {
            xType: 'time',
            colors: [CHART_COLORS[0]],
          },
        },
      };

      const widgetPreview = {
        id: crypto.randomUUID(),
        portfolio_id: portfolioId,
        type: 'd3_json',
        title: chartTitle,
        config: d3Config,
        position: 0,
        is_preview: true,
      };

      const previewAction: any = {
        id: crypto.randomUUID(),
        session_id: sessionId,
        portfolio_id: portfolioId,
        user_id: userId,
        action_type: 'preview',
        entity_type: 'widget',
        entity_id: widgetPreview.id,
        operation_data: {
          table: 'holding_widgets',
          after: widgetPreview,
          is_preview: true,
        },
        ai_reasoning: `Created trend chart for ${args.metric_code}`,
        user_prompt: userPrompt,
        status: 'preview',
        batch_id: batchId,
        sequence_order: sequenceOrder,
      };

      return {
        action: previewAction,
        output: {
          data: chartData,
          chart_generated: true,
          widget: widgetPreview,
          message: `Generated a line chart showing ${args.metric_code} trend with ${chartData.length} data points.`,
        },
      };
    }

    case 'metric_comparison': {
      if (!args.metric_code) {
        throw new Error('metric_code is required for metric_comparison');
      }

      const { data: holdings } = await supabase
        .from('holdings')
        .select('id, name')
        .eq('portfolio_id', portfolioId);

      const holdingMap = new Map(
        (holdings || []).map((h: any) => [h.id, h.name]),
      );

      const { data: facts } = await supabase
        .from('metric_facts')
        .select('holding_id, value, period_end')
        .eq('metric_code', args.metric_code)
        .in('holding_id', Array.from(holdingMap.keys()))
        .order('period_end', { ascending: false });

      const latestByHolding: Record<string, number> = {};
      (facts || []).forEach((fact: any) => {
        if (!latestByHolding[fact.holding_id]) {
          latestByHolding[fact.holding_id] = fact.value;
        }
      });

      const chartData = Object.entries(latestByHolding)
        .map(([holdingId, value]) => ({
          holding: holdingMap.get(holdingId) || 'Unknown',
          value,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, limit);

      if (chartData.length === 0) {
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
            data: [],
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

      const comparisonTitle = `${args.metric_code} by Holding`;
      const comparisonD3Config = {
        d3: {
          kind: 'bar',
          data: chartData,
          encoding: {
            x: 'holding',
            y: 'value',
          },
          options: {
            colors: ['#10b981'],
          },
        },
      };

      const comparisonWidgetPreview = {
        id: crypto.randomUUID(),
        portfolio_id: portfolioId,
        type: 'd3_json',
        title: comparisonTitle,
        config: comparisonD3Config,
        position: 0,
        is_preview: true,
      };

      const comparisonPreviewAction: any = {
        id: crypto.randomUUID(),
        session_id: sessionId,
        portfolio_id: portfolioId,
        user_id: userId,
        action_type: 'preview',
        entity_type: 'widget',
        entity_id: comparisonWidgetPreview.id,
        operation_data: {
          table: 'holding_widgets',
          after: comparisonWidgetPreview,
          is_preview: true,
        },
        ai_reasoning: `Created comparison chart for ${args.metric_code}`,
        user_prompt: userPrompt,
        status: 'preview',
        batch_id: batchId,
        sequence_order: sequenceOrder,
      };

      return {
        action: comparisonPreviewAction,
        output: {
          data: chartData,
          chart_generated: true,
          widget: comparisonWidgetPreview,
          message: `Generated a bar chart comparing ${args.metric_code} across ${chartData.length} holdings.`,
        },
      };
    }

    case 'allocation_breakdown': {
      const { data: holdings } = await supabase
        .from('holdings')
        .select('name, funds_allocated')
        .eq('portfolio_id', portfolioId)
        .order('funds_allocated', { ascending: false })
        .limit(limit);

      const chartData = (holdings || []).map((h: any) => ({
        name: h.name,
        funds: h.funds_allocated || 0,
      }));

      const { previewAction: allocAction, widgetPreview: allocWidget } =
        createChartPreview(
          'Portfolio Allocation',
          'donut',
          chartData,
          'name',
          'funds',
          CHART_COLORS,
        );

      return {
        action: allocAction,
        output: {
          data: chartData,
          chart_generated: true,
          widget: allocWidget,
          message: `Generated a donut chart showing portfolio allocation across ${chartData.length} holdings.`,
        },
      };
    }

    case 'status_breakdown': {
      const { data: holdings } = await supabase
        .from('holdings')
        .select('status')
        .eq('portfolio_id', portfolioId);

      const statuses: Record<string, number> = {};
      (holdings || []).forEach((h: any) => {
        const status = h.status || 'Unknown';
        statuses[status] = (statuses[status] || 0) + 1;
      });

      const chartData = Object.entries(statuses).map(([status, count]) => ({
        status,
        count,
      }));

      const { previewAction: statusAction, widgetPreview: statusWidget } =
        createChartPreview(
          'Holdings by Status',
          'pie',
          chartData,
          'status',
          'count',
          ['#10b981', '#6b7280', '#f59e0b'],
        );

      return {
        action: statusAction,
        output: {
          data: chartData,
          chart_generated: true,
          widget: statusWidget,
          message: `Generated a pie chart showing holdings by status.`,
        },
      };
    }

    default:
      throw new Error(`Unknown data_type: ${args.data_type}`);
  }
};
