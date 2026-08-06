import type { AssistantToolExecutor } from '../../executor-types';
import { InputValidator, ValidationError } from '../../helpers';
import { executeAssistantTool } from '../../executor';

export const executeGenerateCustomReport: AssistantToolExecutor = async (
  runtime,
) => {
  const {
    db: supabase,
    args,
    portfolioId,
    orgId,
    userId,
    sessionId,
    batchId,
    sequenceOrder,
    userPrompt,
    capabilities,
    memberRole,
  } = runtime;
  {
    const scope = args.scope;
    const requestedMetrics = args.metric_codes || [];
    const chartPrefs = args.chart_preferences || [];
    const includeSections = args.include_sections || [
      'overview',
      'impact',
      'trends',
    ];
    const timeRange = args.time_range || '12m';
    const customTitle = args.title;

    // Calculate date filter
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

    if (scope === 'holding') {
      if (!args.holding_id) {
        throw new ValidationError(
          'holding_id is required when scope is "holding"',
        );
      }
      InputValidator.validateUUID(args.holding_id, 'holding_id');

      // Delegate to generate_holding_report logic
      return executeAssistantTool({
        db: supabase,
        functionName: 'generate_holding_report',
        args: {
          holding_id: args.holding_id,
          metric_codes: requestedMetrics,
          chart_preferences: chartPrefs,
          include_sections: includeSections,
          time_range: timeRange,
        },
        portfolioId,
        orgId,
        userId,
        sessionId,
        batchId,
        sequenceOrder,
        userPrompt,
        capabilities,
        memberRole,
      });
    }

    if (scope === 'sector') {
      if (!args.sector) {
        throw new ValidationError('sector is required when scope is "sector"');
      }

      // Get holdings in sector
      const { data: holdings } = await supabase
        .from('holdings')
        .select('id, name, sector, funds_allocated, status')
        .eq('portfolio_id', portfolioId)
        .ilike('sector', `%${args.sector}%`);

      if (!holdings || holdings.length === 0) {
        return {
          action: null,
          output: {
            content_blocks: [
              {
                type: 'text',
                content: `## Sector Report: ${args.sector}\n\nNo holdings found in the ${args.sector} sector.`,
              },
            ],
            error: `No holdings found in sector "${args.sector}"`,
          },
        };
      }

      const holdingIds = holdings.map((h: any) => h.id);
      const reportTitle = customTitle || `${args.sector} Sector Report`;

      contentBlocks.push({
        type: 'text',
        content: `# ${reportTitle}\n\n**${holdings.length} holdings** in the ${args.sector} sector, with total allocation of $${holdings.reduce((s: number, h: any) => s + (h.funds_allocated || 0), 0).toLocaleString()}.`,
      });

      // Get metrics for these holdings
      let metricQuery = supabase
        .from('metric_facts')
        .select('metric_code, value, unit, period_end, holding_id')
        .in('holding_id', holdingIds)
        .gte('period_end', timeRangeStart)
        .order('period_end', { ascending: true });

      if (requestedMetrics.length > 0) {
        metricQuery = metricQuery.in(
          'metric_code',
          requestedMetrics.map((m: string) => m.toUpperCase()),
        );
      }

      const { data: metricFacts } = await metricQuery;
      const facts = metricFacts || [];

      // Aggregate by metric and period
      const metricGroups: Record<string, Record<string, number>> = {};
      facts.forEach((f: any) => {
        const code = f.metric_code;
        const period = f.period_end;
        if (!metricGroups[code]) metricGroups[code] = {};
        metricGroups[code][period] =
          (metricGroups[code][period] || 0) + Number(f.value || 0);
      });

      // Generate charts for each metric
      for (const [metricCode, periodData] of Object.entries(metricGroups)) {
        const chartData = Object.entries(periodData)
          .map(([date, value]) => ({ date, value }))
          .sort((a, b) => a.date.localeCompare(b.date));

        if (chartData.length >= 2) {
          const chartType = getChartType(metricCode);
          const chartTitle = `${args.sector} — ${metricCode} Trend`;

          const d3Config = {
            d3: {
              kind: chartType,
              data: chartData,
              encoding: { x: 'date', y: 'value' },
              options: {
                xType: 'time',
                colors: [palette[chartIndex % palette.length]],
              },
            },
          };

          const widgetPreview = {
            id: crypto.randomUUID(),
            portfolio_id: portfolioId,
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
            ai_reasoning: `Sector report chart for ${metricCode}`,
            user_prompt: userPrompt,
            status: 'preview',
            batch_id: batchId,
            sequence_order: sequenceOrder + chartIndex + 1,
          };

          additionalActions.push(previewAction);
          contentBlocks.push({ type: 'chart', widget: widgetPreview });
          chartIndex++;
        }
      }

      return {
        action: null,
        additionalActions,
        output: {
          content_blocks: contentBlocks,
          scope: 'sector',
          sector: args.sector,
          holdings_count: holdings.length,
          charts_generated: chartIndex,
          time_range: timeRange,
        },
      };
    }

    // Portfolio-level report
    const { data: holdings } = await supabase
      .from('holdings')
      .select('id, name, sector, funds_allocated, current_value, status')
      .eq('portfolio_id', portfolioId)
      .order('funds_allocated', { ascending: false });

    const holdingsData = holdings || [];
    const holdingIds = holdingsData.map((h: any) => h.id);
    const reportTitle = customTitle || 'Portfolio Report';

    const totalAUM = holdingsData.reduce(
      (s: number, h: any) => s + (h.funds_allocated || 0),
      0,
    );
    const totalNAV = holdingsData.reduce(
      (s: number, h: any) => s + (h.current_value || 0),
      0,
    );

    contentBlocks.push({
      type: 'text',
      content: `# ${reportTitle}\n\n**Portfolio Overview**\n- ${holdingsData.length} holdings\n- Total AUM: $${totalAUM.toLocaleString()}\n${totalNAV > 0 ? `- Total NAV: $${totalNAV.toLocaleString()}` : ''}`,
    });

    // Sector breakdown chart
    if (includeSections.includes('overview')) {
      const sectorBreakdown: Record<string, number> = {};
      holdingsData.forEach((h: any) => {
        const sector = h.sector || 'Unspecified';
        sectorBreakdown[sector] =
          (sectorBreakdown[sector] || 0) + (h.funds_allocated || 0);
      });

      const sectorData = Object.entries(sectorBreakdown)
        .map(([sector, funds]) => ({ sector, funds }))
        .sort((a, b) => b.funds - a.funds);

      if (sectorData.length > 1) {
        const d3Config = {
          d3: {
            kind: sectorData.length <= 6 ? 'pie' : 'bar',
            data: sectorData,
            encoding: {
              x: 'sector',
              y: 'funds',
              label: 'sector',
              value: 'funds',
            },
            options: { colors: palette },
          },
        };

        const widgetPreview = {
          id: crypto.randomUUID(),
          portfolio_id: portfolioId,
          type: 'd3_json',
          title: 'Portfolio Allocation by Sector',
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
          ai_reasoning: 'Portfolio sector allocation chart',
          user_prompt: userPrompt,
          status: 'preview',
          batch_id: batchId,
          sequence_order: sequenceOrder + chartIndex + 1,
        };

        additionalActions.push(previewAction);
        contentBlocks.push({ type: 'chart', widget: widgetPreview });
        chartIndex++;
      }
    }

    // Get metrics for all holdings
    if (
      includeSections.includes('impact') ||
      includeSections.includes('trends')
    ) {
      let metricQuery = supabase
        .from('metric_facts')
        .select('metric_code, value, unit, period_end')
        .in('holding_id', holdingIds)
        .gte('period_end', timeRangeStart)
        .order('period_end', { ascending: true });

      if (requestedMetrics.length > 0) {
        metricQuery = metricQuery.in(
          'metric_code',
          requestedMetrics.map((m: string) => m.toUpperCase()),
        );
      }

      const { data: metricFacts } = await metricQuery;
      const facts = metricFacts || [];

      // Aggregate by metric and period
      const metricGroups: Record<string, Record<string, number>> = {};
      facts.forEach((f: any) => {
        const code = f.metric_code;
        const period = f.period_end;
        if (!metricGroups[code]) metricGroups[code] = {};
        metricGroups[code][period] =
          (metricGroups[code][period] || 0) + Number(f.value || 0);
      });

      if (Object.keys(metricGroups).length > 0) {
        contentBlocks.push({
          type: 'text',
          content: '## Impact Metrics',
        });

        for (const [metricCode, periodData] of Object.entries(metricGroups)) {
          const chartData = Object.entries(periodData)
            .map(([date, value]) => ({ date, value }))
            .sort((a, b) => a.date.localeCompare(b.date));

          if (chartData.length >= 2) {
            const chartType = getChartType(metricCode);
            const chartTitle = `${metricCode} Trend`;

            const d3Config = {
              d3: {
                kind: chartType,
                data: chartData,
                encoding: { x: 'date', y: 'value' },
                options: {
                  xType: 'time',
                  colors: [palette[chartIndex % palette.length]],
                },
              },
            };

            const widgetPreview = {
              id: crypto.randomUUID(),
              portfolio_id: portfolioId,
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
              ai_reasoning: `Portfolio report chart for ${metricCode}`,
              user_prompt: userPrompt,
              status: 'preview',
              batch_id: batchId,
              sequence_order: sequenceOrder + chartIndex + 1,
            };

            additionalActions.push(previewAction);
            contentBlocks.push({ type: 'chart', widget: widgetPreview });
            chartIndex++;
          }
        }
      }
    }

    return {
      action: null,
      additionalActions,
      output: {
        content_blocks: contentBlocks,
        scope: 'portfolio',
        holdings_count: holdingsData.length,
        total_aum: totalAUM,
        total_nav: totalNAV,
        charts_generated: chartIndex,
        time_range: timeRange,
        sections_included: includeSections,
      },
    };
  }
};
