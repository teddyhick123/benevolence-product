import type { AssistantToolExecutor } from '../../executor-types';
import { InputValidator } from '../../helpers';

export const executeGenerateHoldingReport: AssistantToolExecutor = async (
  runtime,
) => {
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
  {
    InputValidator.validateUUID(args.holding_id, 'holding_id');

    // Parse optional parameters
    const requestedMetrics = args.metric_codes || [];
    const chartPrefs = args.chart_preferences || [];
    const includeSections = args.include_sections || [
      'overview',
      'financials',
      'impact',
      'trends',
    ];
    const timeRange = args.time_range || 'all';

    // Calculate date filter based on time_range
    const getTimeRangeStart = (range: string): string => {
      const now = new Date();
      switch (range) {
        case '3m':
          return new Date(
            now.getTime() - 90 * 24 * 60 * 60 * 1000,
          ).toISOString();
        case '6m':
          return new Date(
            now.getTime() - 180 * 24 * 60 * 60 * 1000,
          ).toISOString();
        case '12m':
          return new Date(
            now.getTime() - 365 * 24 * 60 * 60 * 1000,
          ).toISOString();
        case 'ytd':
          return new Date(now.getFullYear(), 0, 1).toISOString();
        default:
          return new Date(
            now.getTime() - 3650 * 24 * 60 * 60 * 1000,
          ).toISOString();
      }
    };
    const timeRangeStart = getTimeRangeStart(timeRange);

    const { data: holdingData } = await supabase
      .from('holdings')
      .select('*')
      .eq('id', args.holding_id)
      .eq('portfolio_id', portfolioId)
      .single();

    if (!holdingData) {
      throw new Error(`Holding ${args.holding_id} not found`);
    }

    const { data: investee } = holdingData.investee_id
      ? await supabase
          .from('investees')
          .select('charity_id')
          .eq('id', holdingData.investee_id)
          .maybeSingle()
      : { data: null };
    const { data: charity } = investee?.charity_id
      ? await supabase
          .from('charities')
          .select('ein, name, mission, website, city, state, country, total_revenue, total_expenses, net_assets, charity_navigator_rating, charity_navigator_score')
          .eq('id', investee.charity_id)
          .maybeSingle()
      : { data: null };

    let metricFactsQuery = supabase
      .from('metric_facts')
      .select('metric_code, value, unit, period_end')
      .eq('holding_id', args.holding_id)
      .gte('period_end', timeRangeStart)
      .order('period_end', { ascending: true });

    // Filter by requested metrics if specified
    if (requestedMetrics.length > 0) {
      metricFactsQuery = metricFactsQuery.in(
        'metric_code',
        requestedMetrics.map((m: string) => m.toUpperCase()),
      );
    }

    const { data: metricFacts } = await metricFactsQuery;
    const facts = metricFacts || [];

    const metricGroups: Record<
      string,
      Array<{ date: string; value: number; unit: string | null }>
    > = {};
    facts.forEach((f: any) => {
      const code = f.metric_code;
      if (!metricGroups[code]) metricGroups[code] = [];
      metricGroups[code].push({
        date: f.period_end || 'unknown',
        value: Number(f.value || 0),
        unit: f.unit,
      });
    });

    // Build content_blocks array for structured output
    const contentBlocks: Array<{
      type: 'text' | 'chart';
      content?: string;
      widget?: any;
    }> = [];
    const additionalActions: any[] = [];
    const palette = [
      '#3b82f6',
      '#10b981',
      '#f59e0b',
      '#ef4444',
      '#8b5cf6',
      '#06b6d4',
      '#ec4899',
    ];
    let chartIndex = 0;

    // Helper to get chart type preference
    const getChartType = (metricCode: string): string => {
      const pref = chartPrefs.find(
        (p: any) => p.metric_code?.toUpperCase() === metricCode.toUpperCase(),
      );
      return pref?.chart_type || 'line';
    };

    // Build metric summaries
    const metricSummaries: Record<
      string,
      {
        latest: number;
        total: number;
        count: number;
        unit: string | null;
        earliest: string;
        latest_date: string;
      }
    > = {};
    for (const [code, series] of Object.entries(metricGroups)) {
      const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
      metricSummaries[code] = {
        latest: sorted[sorted.length - 1].value,
        total: sorted.reduce((s, d) => s + d.value, 0),
        count: sorted.length,
        unit: sorted[0].unit,
        earliest: sorted[0].date,
        latest_date: sorted[sorted.length - 1].date,
      };
    }

    // Extract charity context
    const charityContext = charity
      ? {
          name: charity.name,
          ein: charity.ein,
          mission: charity.mission,
          website: charity.website,
          location: [charity.city, charity.state, charity.country]
            .filter(Boolean)
            .join(', '),
          annual_revenue: charity.total_revenue,
          annual_expenses: charity.total_expenses,
          net_assets: charity.net_assets,
          charity_navigator_rating: charity.charity_navigator_rating,
          charity_navigator_score: charity.charity_navigator_score,
        }
      : null;

    // Add overview section
    if (includeSections.includes('overview')) {
      contentBlocks.push({
        type: 'text',
        content: `## Overview\n\n**${holdingData.name}** is a ${holdingData.status || 'Active'} holding in the ${holdingData.sector || 'General'} sector${holdingData.country ? `, based in ${holdingData.country}` : ''}.${charityContext?.mission ? `\n\n**Mission:** ${charityContext.mission}` : ''}`,
      });
    }

    // Add financials section
    if (
      includeSections.includes('financials') &&
      (holdingData.funds_allocated || charityContext?.annual_revenue)
    ) {
      let financialText = '## Financial Overview\n\n';
      if (holdingData.funds_allocated) {
        financialText += `- **Funds Allocated:** $${holdingData.funds_allocated.toLocaleString()}\n`;
      }
      if (holdingData.current_value) {
        financialText += `- **Current Value:** $${holdingData.current_value.toLocaleString()}\n`;
      }
      if (charityContext?.annual_revenue) {
        financialText += `- **Annual Revenue:** $${charityContext.annual_revenue.toLocaleString()}\n`;
      }
      if (charityContext?.charity_navigator_rating) {
        financialText += `- **Charity Navigator Rating:** ${charityContext.charity_navigator_rating}/4 stars\n`;
      }
      if (charityContext?.charity_navigator_score) {
        financialText += `- **Charity Navigator Score:** ${charityContext.charity_navigator_score}\n`;
      }
      contentBlocks.push({ type: 'text', content: financialText });
    }

    // Add impact/trends section with charts
    if (
      includeSections.includes('impact') ||
      includeSections.includes('trends')
    ) {
      const metricsToChart = Object.keys(metricGroups);

      if (metricsToChart.length > 0) {
        contentBlocks.push({
          type: 'text',
          content:
            '## Impact Metrics\n\nThe following charts show key performance indicators over time:',
        });

        for (const metricCode of metricsToChart) {
          const series = metricGroups[metricCode];
          if (series.length >= 2) {
            const chartType = getChartType(metricCode);
            const chartData = series.map((s) => ({
              date: s.date,
              value: s.value,
            }));
            const unit = series[0]?.unit || '';
            const chartTitle = `${metricCode}${unit ? ` (${unit})` : ''}`;

            const d3Config = {
              d3: {
                kind: chartType,
                data: chartData,
                encoding: { x: 'date', y: 'value' },
                options: {
                  xType: 'time',
                  xAxisLabel: 'Date',
                  yAxisLabel: unit || 'Value',
                  colors: [palette[chartIndex % palette.length]],
                },
              },
            };

            const widgetPreview = {
              id: crypto.randomUUID(),
              portfolio_id: portfolioId,
              holding_id: args.holding_id,
              type: 'd3_json',
              title: chartTitle,
              config: d3Config,
              position: chartIndex,
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
              ai_reasoning: `Auto-generated ${chartType} chart for ${metricCode} in holding report`,
              user_prompt: userPrompt,
              status: 'preview',
              batch_id: batchId,
              sequence_order: sequenceOrder + chartIndex + 1,
            };

            additionalActions.push(previewAction);
            contentBlocks.push({
              type: 'chart',
              widget: widgetPreview,
            });

            // Add metric summary text after chart
            const summary = metricSummaries[metricCode];
            contentBlocks.push({
              type: 'text',
              content: `**${metricCode}**: Latest value of ${summary.latest.toLocaleString()}${unit ? ' ' + unit : ''} (${summary.count} data points from ${summary.earliest} to ${summary.latest_date}).\n`,
            });

            chartIndex++;
          }
        }
      } else {
        contentBlocks.push({
          type: 'text',
          content:
            '## Impact Metrics\n\nNo metric data available for this holding in the selected time range.',
        });
      }
    }

    return {
      action: null,
      additionalActions,
      output: {
        content_blocks: contentBlocks,
        holding: {
          id: holdingData.id,
          name: holdingData.name,
          sector: holdingData.sector,
          country: holdingData.country,
          status: holdingData.status,
          funds_allocated: holdingData.funds_allocated,
          current_value: holdingData.current_value,
          asset_type: holdingData.asset_type,
        },
        charity: charityContext,
        metrics: metricSummaries,
        charts_generated: chartIndex,
        time_range: timeRange,
        sections_included: includeSections,
      },
    };
  }
};
