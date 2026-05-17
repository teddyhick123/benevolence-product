// @ts-nocheck - extracted from legacy assistant while Supabase generated types are incomplete
import { createClient } from '@supabase/supabase-js';
import { AIActionExecutor } from '@/lib/ai-action-executor';
import type { ToolResult } from '@/lib/ai/types';
import {
  CANONICAL_GIFT_TYPES,
  CHART_COLORS,
  InputValidator,
  TimeWindowHelper,
  ValidationError,
  daysSince,
  donorDisplayName,
  normalizeGiftType,
} from './helpers';
import {
  getGrantHealth,
  getUpcomingDeadlines,
  logGrantCommunication,
  recordGrantPayment,
  trackMilestone,
  startDueDiligence,
  getWorkflowStatus,
  completeWorkflowTask,
} from './executors/grants';

export type AssistantToolParams = {
  supabase: ReturnType<typeof createClient>;
  functionName: string;
  args: any;
  portfolioId: string;
  userId: string;
  sessionId: string;
  batchId: string;
  sequenceOrder: number;
  userPrompt: string;
  memberRole?: string;
};


async function verifyPortfolioAccess(supabase: ReturnType<typeof createClient>, portfolioId: string, userId: string): Promise<void> {
    const { data, error } = await supabase
      .from('portfolio_members')
      .select('role')
      .eq('portfolio_id', portfolioId)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      throw new Error('Access denied: You do not have permission to access this portfolio');
    }
  }


export const WRITE_TOOLS = new Set([
    'add_holding', 'update_holding', 'remove_holding',
    'add_metric_fact', 'delete_metric_fact',
    'add_widget', 'remove_widget',
    'log_contribution_received', 'generate_receipt', 'generate_acknowledgment',
    'track_filing_deadline', 'register_disqualified_person',
    'assess_qualifying_distribution', 'log_expenditure_responsibility',
  ]);

export async function executeAssistantTool(params: AssistantToolParams): Promise<ToolResult> {
  const { supabase, functionName, args, portfolioId, userId, sessionId, batchId, sequenceOrder, userPrompt, memberRole } = params;
    if (WRITE_TOOLS.has(functionName) && memberRole === 'viewer') {
      return { error: 'Viewers cannot perform write operations. Request a role upgrade from your org admin.' } as any;
    }

    // Verify user has access to this portfolio
    await verifyPortfolioAccess(supabase, portfolioId, userId);

    const executor = new AIActionExecutor(supabase);

    switch (functionName) {
      case 'add_holding':
        return await executor.createHolding(
          portfolioId,
          userId,
          sessionId,
          batchId,
          sequenceOrder,
          userPrompt,
          args
        );

      case 'update_holding':
        return await executor.updateHolding(
          portfolioId,
          userId,
          sessionId,
          batchId,
          sequenceOrder,
          userPrompt,
          args
        );

      case 'remove_holding':
        return await executor.deleteHolding(
          portfolioId,
          userId,
          sessionId,
          batchId,
          sequenceOrder,
          userPrompt,
          args
        );

      case 'add_metric_fact':
        return await executor.addMetricFact(
          portfolioId,
          userId,
          sessionId,
          batchId,
          sequenceOrder,
          userPrompt,
          args
        );

      case 'create_widget':
        return await executor.createWidget(
          portfolioId,
          userId,
          sessionId,
          batchId,
          sequenceOrder,
          userPrompt,
          args
        );

      case 'add_location':
        return await executor.addLocation(
          portfolioId,
          userId,
          sessionId,
          batchId,
          sequenceOrder,
          userPrompt,
          args
        );

      case 'list_holdings': {
        let holdingsQuery = supabase
          .from('holdings')
          .select('*')
          .eq('portfolio_id', portfolioId);
        if (args.status) {
          holdingsQuery = holdingsQuery.eq('status', args.status);
        }
        const { data } = await holdingsQuery;

        return {
          action: null,
          output: { holdings: data || [] },
        };
      }

      case 'search_holdings': {
        InputValidator.validateString(args.sector, 'sector', { maxLength: 200 });
        InputValidator.validateString(args.country, 'country', { maxLength: 100 });
        InputValidator.validateEnum(args.status, 'status', ['Active', 'Exited', 'Pipeline'] as const);
        InputValidator.validateNumber(args.min_allocation, 'min_allocation', { min: 0, max: 1e12 });
        InputValidator.validateNumber(args.max_allocation, 'max_allocation', { min: 0, max: 1e12 });
        InputValidator.validateString(args.name_contains, 'name_contains', { maxLength: 200 });

        if (args.min_allocation !== undefined && args.max_allocation !== undefined && args.min_allocation > args.max_allocation) {
          throw new ValidationError('min_allocation cannot be greater than max_allocation');
        }

        let query = supabase
          .from('holdings')
          .select('id, name, sector, country, status, funds_allocated, description')
          .eq('portfolio_id', portfolioId);

        if (args.sector) query = query.ilike('sector', `%${args.sector}%`);
        if (args.country) query = query.ilike('country', `%${args.country}%`);
        if (args.status) query = query.eq('status', args.status);
        if (args.min_allocation) query = query.gte('funds_allocated', args.min_allocation);
        if (args.max_allocation) query = query.lte('funds_allocated', args.max_allocation);
        if (args.name_contains) query = query.ilike('name', `%${args.name_contains}%`);

        const { data } = await query.order('funds_allocated', { ascending: false });

        return {
          action: null,
          output: {
            holdings: data || [],
            count: data?.length || 0,
            filters_applied: Object.keys(args).filter(k => args[k] !== undefined),
          },
        };
      }

      case 'get_metric_trend': {
        if (args.metric_code) {
          args.metric_code = String(args.metric_code).toUpperCase();
        }
        InputValidator.validateString(args.metric_code, 'metric_code', { maxLength: 100, pattern: /^[A-Z0-9_]+$/ });
        if (!args.metric_code) {
          throw new ValidationError('metric_code is required');
        }
        if (args.holding_id) {
          InputValidator.validateUUID(args.holding_id, 'holding_id');
        }
        InputValidator.validateEnum(args.window, 'window', ['3m', '6m', '12m', '24m', 'all'] as const);

        const window: TimeWindow = (args.window as TimeWindow) || 'all';
        const startDate = TimeWindowHelper.getStartDate(window);

        let query = supabase
          .from('metric_facts')
          .select('value, unit, period_start, period_end, holdings!inner(id, name, portfolio_id)')
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

          const uniqueMetrics = [...new Set((availableMetrics || []).map((m: any) => m.metric_code))];

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
              suggestion: uniqueMetrics.length > 0
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

      case 'compare_holdings': {
        if (args.metric_code) {
          args.metric_code = String(args.metric_code).toUpperCase();
        }
        InputValidator.validateString(args.metric_code, 'metric_code', { maxLength: 100, pattern: /^[A-Z0-9_]+$/ });
        if (!args.metric_code) {
          throw new ValidationError('metric_code is required');
        }
        InputValidator.validateArray(args.holding_ids, 'holding_ids', { maxLength: 100 });
        if (args.holding_ids) {
          args.holding_ids.forEach((id: string, idx: number) => {
            InputValidator.validateUUID(id, `holding_ids[${idx}]`);
          });
        }
        InputValidator.validateEnum(args.sort_order, 'sort_order', ['asc', 'desc'] as const);
        InputValidator.validateNumber(args.limit, 'limit', { min: 1, max: 100 });

        const { data: holdings } = await supabase
          .from('holdings')
          .select('id, name, sector')
          .eq('portfolio_id', portfolioId);

        const holdingIds = args.holding_ids || holdings?.map((h: any) => h.id) || [];
        const holdingMap = new Map((holdings || []).map((h: any) => [h.id, h]));

        const { data: facts } = await supabase
          .from('metric_facts')
          .select('holding_id, value, unit, period_end')
          .eq('metric_code', args.metric_code)
          .in('holding_id', holdingIds)
          .order('period_end', { ascending: false });

        const latestByHolding: Record<string, { value: number; unit: string | null; date: string }> = {};
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
          .sort((a, b) => args.sort_order === 'asc' ? a.value - b.value : b.value - a.value)
          .slice(0, args.limit || 10);

        if (comparison.length === 0) {
          const { data: availableMetrics } = await supabase
            .from('metric_facts')
            .select('metric_code, holdings!inner(portfolio_id)')
            .eq('holdings.portfolio_id', portfolioId);

          const uniqueMetrics = [...new Set((availableMetrics || []).map((m: any) => m.metric_code))];

          return {
            action: null,
            output: {
              metric_code: args.metric_code,
              comparison: [],
              holdings_with_data: 0,
              no_data: true,
              message: `No data found for metric '${args.metric_code}' in this portfolio.`,
              available_metrics: uniqueMetrics,
              suggestion: uniqueMetrics.length > 0
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

      case 'get_portfolio_summary': {
        const includeKpis = args.include_kpis !== false;
        const includeSectors = args.include_sectors !== false;
        const includeTopHoldings = args.include_top_holdings !== false;

        const { data: holdings } = await supabase
          .from('holdings')
          .select('id, name, sector, status, funds_allocated')
          .eq('portfolio_id', portfolioId)
          .order('funds_allocated', { ascending: false });

        const holdingsData = holdings || [];
        const totalAUM = holdingsData.reduce((sum: number, h: any) => sum + (h.funds_allocated || 0), 0);
        const totalNAV = holdingsData.reduce((sum: number, h: any) => sum + (h.nav || 0), 0);

        const summary: any = {
          total_holdings: holdingsData.length,
          active_holdings: holdingsData.filter(h => h.status === 'Active').length,
          total_aum: totalAUM,
          total_nav: totalNAV,
        };

        if (includeSectors) {
          const sectors: Record<string, { count: number; funds: number }> = {};
          holdingsData.forEach((h: any) => {
            const sector: string = h.sector || 'Unspecified';
            if (!sectors[sector]) sectors[sector] = { count: 0, funds: 0 };
            sectors[sector].count++;
            sectors[sector].funds += h.funds_allocated || 0;
          });
          summary.sector_breakdown = sectors;
        }

        if (includeTopHoldings) {
          summary.top_holdings = holdingsData.slice(0, 5).map(h => ({
            name: h.name,
            funds_allocated: h.funds_allocated,
            sector: h.sector,
          }));
        }

        if (includeKpis) {
          const { data: kpiDefs } = await supabase
            .from('kpi_definitions')
            .select('slug, name, unit, target_value')
            .eq('org_id', orgId)
            .eq('is_active', true)
            .order('display_order', { ascending: true });

          const { data: facts } = await supabase
            .from('metric_facts')
            .select('metric_name, value, unit, holdings!inner(portfolio_id)')
            .eq('holdings.portfolio_id', portfolioId);

          const totals: Record<string, { value: number; unit: string | null }> = {};
          (facts || []).forEach((fact: any) => {
            if (!totals[fact.metric_name]) {
              totals[fact.metric_name] = { value: 0, unit: fact.unit };
            }
            totals[fact.metric_name].value += fact.value || 0;
          });

          const defs = kpiDefs || [];
          const metricCodes = new Set([
            ...Object.keys(totals),
            ...defs.map((kpi: any) => kpi.slug),
          ]);

          summary.kpi_performance = Array.from(metricCodes).map((slug: string) => {
            const kpi = defs.find((k: any) => k.slug === slug);
            const current = totals[slug]?.value || 0;
            const target = kpi?.target_value ?? null;
            return {
              metric: kpi?.name || slug,
              current,
              target,
              percent_complete: target ? Math.round((current / target) * 100) : null,
              unit: totals[slug]?.unit || kpi?.unit || null,
            };
          });
        }

        return {
          action: null,
          output: summary,
        };
      }

      case 'get_holding_details': {
        const { data } = await supabase
          .from('holdings')
          .select('*, metric_facts(*), holding_widgets(*)')
          .eq('id', args.holding_id)
          .single();

        return {
          action: null,
          output: { holding: data },
        };
      }

      case 'list_widgets': {
        const limit = args.limit || 50;
        const { data } = await supabase
          .from('holding_widgets')
          .select('id, widget_type, config, position, is_active, created_at')
          .eq('portfolio_id', portfolioId)
          .eq('is_active', true)
          .order('created_at', { ascending: true })
          .limit(limit);

        return {
          action: null,
          output: {
            widgets: (data || []).map((w: any) => ({
              ...w,
              type: w.widget_type,
              title: w.config?.title || w.widget_type,
            })),
            count: data?.length || 0,
          },
        };
      }

      case 'display_widget': {
        const { data: widget } = await supabase
          .from('holding_widgets')
          .select('id, widget_type, config, position, is_active, portfolio_id')
          .eq('id', args.widget_id)
          .eq('is_active', true)
          .maybeSingle();

        if (!widget) {
          throw new Error(`Widget with ID ${args.widget_id} not found`);
        }

        // display_widget is read-only — no action record needed
        return {
          action: null,
          output: {
            widget: {
              ...widget,
              type: widget.widget_type,
              title: widget.config?.title || widget.widget_type,
            },
            displayed: true,
          },
        };
      }

      case 'create_portfolio_widget': {
        const widgetPreview = {
          id: crypto.randomUUID(),
          portfolio_id: portfolioId,
          type: args.type,
          title: args.title,
          config: args.config || {},
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
          ai_reasoning: `Created preview ${args.type} widget: "${args.title}"`,
          user_prompt: userPrompt,
          status: 'preview',
          batch_id: batchId,
          sequence_order: sequenceOrder,
        };

        return {
          action: previewAction,
          output: widgetPreview,
        };
      }

      case 'get_chart_data': {
        if (args.metric_code) {
          args.metric_code = String(args.metric_code).toUpperCase();
        }
        const validDataTypes = ['holdings_by_sector', 'holdings_by_country', 'metric_trend', 'metric_comparison', 'allocation_breakdown', 'status_breakdown'] as const;
        InputValidator.validateEnum(args.data_type, 'data_type', validDataTypes);
        if (!args.data_type) {
          throw new ValidationError('data_type is required');
        }
        if (args.metric_code) {
          InputValidator.validateString(args.metric_code, 'metric_code', { maxLength: 100, pattern: /^[A-Z0-9_]+$/ });
        }
        if (['metric_trend', 'metric_comparison'].includes(args.data_type) && !args.metric_code) {
          throw new ValidationError(`metric_code is required for data_type '${args.data_type}'`);
        }
        InputValidator.validateEnum(args.window, 'window', ['3m', '6m', '12m', '24m', 'all'] as const);
        InputValidator.validateNumber(args.limit, 'limit', { min: 1, max: 100 });

        const limit = args.limit || 10;

        const createChartPreview = (title: string, chartType: string, data: any[], xField: string, yField: string, colors: string[]) => {
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
            const { previewAction: sectorAction, widgetPreview: sectorWidget } = createChartPreview(
              'Holdings by Sector',
              sectorChartType,
              chartData,
              'sector',
              'funds',
              CHART_COLORS
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
              countries[country] = (countries[country] || 0) + (h.funds_allocated || 0);
            });

            const chartData = Object.entries(countries)
              .map(([country, funds]) => ({ country, funds }))
              .sort((a, b) => b.funds - a.funds)
              .slice(0, limit);

            const countryChartType = chartData.length <= 6 ? 'pie' : 'bar';
            const { previewAction: countryAction, widgetPreview: countryWidget } = createChartPreview(
              'Holdings by Country',
              countryChartType,
              chartData,
              'country',
              'funds',
              CHART_COLORS
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
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            if (chartData.length === 0) {
              const { data: availableMetrics } = await supabase
                .from('metric_facts')
                .select('metric_code, holdings!inner(portfolio_id)')
                .eq('holdings.portfolio_id', portfolioId);

              const uniqueMetrics = [...new Set((availableMetrics || []).map((m: any) => m.metric_code))];

              return {
                action: null,
                output: {
                  data: [],
                  no_data: true,
                  message: `No data found for metric '${args.metric_code}' in this portfolio.`,
                  available_metrics: uniqueMetrics,
                  suggestion: uniqueMetrics.length > 0
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

            const holdingMap = new Map((holdings || []).map((h: any) => [h.id, h.name]));

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

              const uniqueMetrics = [...new Set((availableMetrics || []).map((m: any) => m.metric_code))];

              return {
                action: null,
                output: {
                  data: [],
                  no_data: true,
                  message: `No data found for metric '${args.metric_code}' in this portfolio.`,
                  available_metrics: uniqueMetrics,
                  suggestion: uniqueMetrics.length > 0
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

            const { previewAction: allocAction, widgetPreview: allocWidget } = createChartPreview(
              'Portfolio Allocation',
              'donut',
              chartData,
              'name',
              'funds',
              CHART_COLORS
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

            const chartData = Object.entries(statuses)
              .map(([status, count]) => ({ status, count }));

            const { previewAction: statusAction, widgetPreview: statusWidget } = createChartPreview(
              'Holdings by Status',
              'pie',
              chartData,
              'status',
              'count',
              ['#10b981', '#6b7280', '#f59e0b']
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
      }

      case 'generate_d3_chart': {
        const isPieOrDonut = args.chart_type === 'pie' || args.chart_type === 'donut';

        const d3Config = {
          d3: {
            kind: args.chart_type,
            data: args.data,
            encoding: {
              x: args.x_field,
              y: args.y_field,
              ...(args.series_field && { series: args.series_field }),
              ...(isPieOrDonut && { label: args.x_field, value: args.y_field }),
            },
            options: {
              ...(args.x_type === 'time' && { xType: 'time' }),
              ...(args.x_axis_label && { xAxisLabel: args.x_axis_label }),
              ...(args.y_axis_label && { yAxisLabel: args.y_axis_label }),
              ...(args.show_grid !== undefined && { showGrid: args.show_grid }),
              ...(args.colors && { colors: args.colors }),
            },
          },
        };

        const widgetPreview = {
          id: crypto.randomUUID(),
          portfolio_id: portfolioId,
          type: 'd3_json',
          title: args.title,
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
          ai_reasoning: `Created preview d3_json chart: "${args.title}"`,
          user_prompt: userPrompt,
          status: 'preview',
          batch_id: batchId,
          sequence_order: sequenceOrder,
        };

        return {
          action: previewAction,
          output: widgetPreview,
        };
      }

      case 'generate_holding_report': {
        InputValidator.validateUUID(args.holding_id, 'holding_id');

        // Parse optional parameters
        const requestedMetrics = args.metric_codes || [];
        const chartPrefs = args.chart_preferences || [];
        const includeSections = args.include_sections || ['overview', 'financials', 'impact', 'trends'];
        const timeRange = args.time_range || 'all';

        // Calculate date filter based on time_range
        const getTimeRangeStart = (range: string): string => {
          const now = new Date();
          switch (range) {
            case '3m': return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
            case '6m': return new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();
            case '12m': return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
            case 'ytd': return new Date(now.getFullYear(), 0, 1).toISOString();
            default: return new Date(now.getTime() - 3650 * 24 * 60 * 60 * 1000).toISOString();
          }
        };
        const timeRangeStart = getTimeRangeStart(timeRange);

        const { data: holdingData } = await supabase
          .from('holdings')
          .select('*')
          .eq('id', args.holding_id)
          .single();

        if (!holdingData) {
          throw new Error(`Holding ${args.holding_id} not found`);
        }

        const { data: charity } = holdingData.ein
          ? await supabase
              .from('charities')
              .select('ein, name, mission, website, city, state, country, total_revenue, total_expenses, net_assets, charity_navigator_rating, charity_navigator_score')
              .eq('ein', holdingData.ein)
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
          metricFactsQuery = metricFactsQuery.in('metric_code', requestedMetrics.map((m: string) => m.toUpperCase()));
        }

        const { data: metricFacts } = await metricFactsQuery;
        const facts = metricFacts || [];

        const metricGroups: Record<string, Array<{ date: string; value: number; unit: string | null }>> = {};
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
        const contentBlocks: Array<{ type: 'text' | 'chart'; content?: string; widget?: any }> = [];
        const additionalActions: any[] = [];
        const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];
        let chartIndex = 0;

        // Helper to get chart type preference
        const getChartType = (metricCode: string): string => {
          const pref = chartPrefs.find((p: any) => p.metric_code?.toUpperCase() === metricCode.toUpperCase());
          return pref?.chart_type || 'line';
        };

        // Build metric summaries
        const metricSummaries: Record<string, { latest: number; total: number; count: number; unit: string | null; earliest: string; latest_date: string }> = {};
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
        const charityContext = charity ? {
          name: charity.name,
          ein: charity.ein,
          mission: charity.mission,
          website: charity.website,
          location: [charity.city, charity.state, charity.country].filter(Boolean).join(', '),
          annual_revenue: charity.total_revenue,
          annual_expenses: charity.total_expenses,
          net_assets: charity.net_assets,
          charity_navigator_rating: charity.charity_navigator_rating,
          charity_navigator_score: charity.charity_navigator_score,
        } : null;

        // Add overview section
        if (includeSections.includes('overview')) {
          contentBlocks.push({
            type: 'text',
            content: `## Overview\n\n**${holdingData.name}** is a ${holdingData.status || 'Active'} holding in the ${holdingData.sector || 'General'} sector${holdingData.country ? `, based in ${holdingData.country}` : ''}.${charityContext?.mission ? `\n\n**Mission:** ${charityContext.mission}` : ''}`,
          });
        }

        // Add financials section
        if (includeSections.includes('financials') && (holdingData.funds_allocated || charityContext?.annual_revenue)) {
          let financialText = '## Financial Overview\n\n';
          if (holdingData.funds_allocated) {
            financialText += `- **Funds Allocated:** $${holdingData.funds_allocated.toLocaleString()}\n`;
          }
          if (holdingData.nav) {
            financialText += `- **Current NAV:** $${holdingData.nav.toLocaleString()}\n`;
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
        if (includeSections.includes('impact') || includeSections.includes('trends')) {
          const metricsToChart = Object.keys(metricGroups);

          if (metricsToChart.length > 0) {
            contentBlocks.push({
              type: 'text',
              content: '## Impact Metrics\n\nThe following charts show key performance indicators over time:',
            });

            for (const metricCode of metricsToChart) {
              const series = metricGroups[metricCode];
              if (series.length >= 2) {
                const chartType = getChartType(metricCode);
                const chartData = series.map(s => ({ date: s.date, value: s.value }));
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
              content: '## Impact Metrics\n\nNo metric data available for this holding in the selected time range.',
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
              nav: holdingData.nav,
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

      case 'generate_custom_report': {
        const scope = args.scope;
        const requestedMetrics = args.metric_codes || [];
        const chartPrefs = args.chart_preferences || [];
        const includeSections = args.include_sections || ['overview', 'impact', 'trends'];
        const timeRange = args.time_range || '12m';
        const customTitle = args.title;

        // Calculate date filter
        const getTimeRangeStart = (range: string): string => {
          const now = new Date();
          switch (range) {
            case '3m': return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
            case '6m': return new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();
            case '12m': return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
            case 'ytd': return new Date(now.getFullYear(), 0, 1).toISOString();
            default: return new Date(now.getTime() - 3650 * 24 * 60 * 60 * 1000).toISOString();
          }
        };
        const timeRangeStart = getTimeRangeStart(timeRange);

        const contentBlocks: Array<{ type: 'text' | 'chart'; content?: string; widget?: any }> = [];
        const additionalActions: any[] = [];
        const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];
        let chartIndex = 0;

        // Helper to get chart type preference
        const getChartType = (metricCode: string): string => {
          const pref = chartPrefs.find((p: any) => p.metric_code?.toUpperCase() === metricCode.toUpperCase());
          return pref?.chart_type || 'line';
        };

        if (scope === 'holding') {
          if (!args.holding_id) {
            throw new ValidationError('holding_id is required when scope is "holding"');
          }
          InputValidator.validateUUID(args.holding_id, 'holding_id');

          // Delegate to generate_holding_report logic
          return executeAssistantTool({
            supabase,
            functionName: 'generate_holding_report',
            args: {
              holding_id: args.holding_id,
              metric_codes: requestedMetrics,
              chart_preferences: chartPrefs,
              include_sections: includeSections,
              time_range: timeRange,
            },
            portfolioId,
            userId,
            sessionId,
            batchId,
            sequenceOrder,
            userPrompt,
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
                content_blocks: [{
                  type: 'text',
                  content: `## Sector Report: ${args.sector}\n\nNo holdings found in the ${args.sector} sector.`,
                }],
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
            metricQuery = metricQuery.in('metric_code', requestedMetrics.map((m: string) => m.toUpperCase()));
          }

          const { data: metricFacts } = await metricQuery;
          const facts = metricFacts || [];

          // Aggregate by metric and period
          const metricGroups: Record<string, Record<string, number>> = {};
          facts.forEach((f: any) => {
            const code = f.metric_code;
            const period = f.period_end;
            if (!metricGroups[code]) metricGroups[code] = {};
            metricGroups[code][period] = (metricGroups[code][period] || 0) + Number(f.value || 0);
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
          .select('id, name, sector, funds_allocated, status')
          .eq('portfolio_id', portfolioId)
          .order('funds_allocated', { ascending: false });

        const holdingsData = holdings || [];
        const holdingIds = holdingsData.map((h: any) => h.id);
        const reportTitle = customTitle || 'Portfolio Report';

        const totalAUM = holdingsData.reduce((s: number, h: any) => s + (h.funds_allocated || 0), 0);
        const totalNAV = holdingsData.reduce((s: number, h: any) => s + (h.nav || 0), 0);

        contentBlocks.push({
          type: 'text',
          content: `# ${reportTitle}\n\n**Portfolio Overview**\n- ${holdingsData.length} holdings\n- Total AUM: $${totalAUM.toLocaleString()}\n${totalNAV > 0 ? `- Total NAV: $${totalNAV.toLocaleString()}` : ''}`,
        });

        // Sector breakdown chart
        if (includeSections.includes('overview')) {
          const sectorBreakdown: Record<string, number> = {};
          holdingsData.forEach((h: any) => {
            const sector = h.sector || 'Unspecified';
            sectorBreakdown[sector] = (sectorBreakdown[sector] || 0) + (h.funds_allocated || 0);
          });

          const sectorData = Object.entries(sectorBreakdown)
            .map(([sector, funds]) => ({ sector, funds }))
            .sort((a, b) => b.funds - a.funds);

          if (sectorData.length > 1) {
            const d3Config = {
              d3: {
                kind: sectorData.length <= 6 ? 'pie' : 'bar',
                data: sectorData,
                encoding: { x: 'sector', y: 'funds', label: 'sector', value: 'funds' },
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
        if (includeSections.includes('impact') || includeSections.includes('trends')) {
          let metricQuery = supabase
            .from('metric_facts')
            .select('metric_code, value, unit, period_end')
            .in('holding_id', holdingIds)
            .gte('period_end', timeRangeStart)
            .order('period_end', { ascending: true });

          if (requestedMetrics.length > 0) {
            metricQuery = metricQuery.in('metric_code', requestedMetrics.map((m: string) => m.toUpperCase()));
          }

          const { data: metricFacts } = await metricQuery;
          const facts = metricFacts || [];

          // Aggregate by metric and period
          const metricGroups: Record<string, Record<string, number>> = {};
          facts.forEach((f: any) => {
            const code = f.metric_code;
            const period = f.period_end;
            if (!metricGroups[code]) metricGroups[code] = {};
            metricGroups[code][period] = (metricGroups[code][period] || 0) + Number(f.value || 0);
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

      case 'save_report_template': {
        return {
          action: null,
          output: {
            feature_not_available: true,
            message: 'Report template storage requires a report_templates migration that is not deployed in the active schema.',
          },
        };
      }

      case 'list_report_templates': {
        return {
          action: null,
          output: {
            feature_not_available: true,
            templates: [],
            count: 0,
            message: 'Report template storage requires a report_templates migration that is not deployed in the active schema.',
          },
        };
      }

      // ==================== EXPORT DATA ====================
      case 'export_data': {
        const dataType = args.data_type;
        const format = args.format || 'csv';
        const holdingId = args.holding_id;
        const dateFrom = args.date_from;
        const dateTo = args.date_to;

        let data: any[] = [];
        let filename = '';

        switch (dataType) {
          case 'holdings': {
            let query = supabase
              .from('holdings')
              .select('id, name, sector, country, status, funds_allocated, asset_type, description, created_at')
              .eq('portfolio_id', portfolioId);

            if (holdingId) {
              query = query.eq('id', holdingId);
            }

            const { data: holdings, error } = await query;
            if (error) throw new Error(`Failed to fetch holdings: ${error.message}`);
            data = holdings || [];
            filename = `holdings_export_${new Date().toISOString().split('T')[0]}`;
            break;
          }

          case 'metrics': {
            let query = supabase
              .from('metric_facts')
              .select(`
                id,
                holding_id,
                holdings!inner(name, portfolio_id),
                metric_code,
                value,
                unit,
                period_start,
                period_end,
                created_at
              `)
              .eq('holdings.portfolio_id', portfolioId);

            if (holdingId) {
              query = query.eq('holding_id', holdingId);
            }
            if (dateFrom) {
              query = query.gte('period_start', dateFrom);
            }
            if (dateTo) {
              query = query.lte('period_end', dateTo);
            }

            const { data: metrics, error } = await query.order('period_start', { ascending: false });
            if (error) throw new Error(`Failed to fetch metrics: ${error.message}`);

            // Flatten the data
            data = (metrics || []).map((m: any) => ({
              id: m.id,
              holding_id: m.holding_id,
              holding_name: m.holdings?.name,
              metric_code: m.metric_code,
              value: m.value,
              unit: m.unit,
              period_start: m.period_start,
              period_end: m.period_end,
              created_at: m.created_at,
            }));
            filename = `metrics_export_${new Date().toISOString().split('T')[0]}`;
            break;
          }

          case 'contributions': {
            const { data: contributions, error } = await supabase
              .from('tax_contributions')
              .select('*')
              .eq('portfolio_id', portfolioId)
              .order('contribution_date', { ascending: false });

            if (error) throw new Error(`Failed to fetch contributions: ${error.message}`);
            data = contributions || [];
            filename = `contributions_export_${new Date().toISOString().split('T')[0]}`;
            break;
          }

          default:
            throw new ValidationError(`Unknown data type: ${dataType}`);
        }

        if (data.length === 0) {
          return {
            action: null,
            output: {
              message: `No ${dataType} data found to export`,
              count: 0,
            },
          };
        }

        // Format the data based on requested format
        let exportContent: string;
        let mimeType: string;

        if (format === 'json') {
          exportContent = JSON.stringify(data, null, 2);
          mimeType = 'application/json';
        } else if (format === 'csv') {
          // Convert to CSV
          const headers = Object.keys(data[0]);
          const csvRows = [
            headers.join(','),
            ...data.map(row =>
              headers.map(h => {
                const val = row[h];
                if (val === null || val === undefined) return '';
                if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
                  return `"${val.replace(/"/g, '""')}"`;
                }
                return String(val);
              }).join(',')
            ),
          ];
          exportContent = csvRows.join('\n');
          mimeType = 'text/csv';
        } else {
          // For xlsx, return the data and let frontend handle it
          exportContent = JSON.stringify(data);
          mimeType = 'application/json';
        }

        return {
          action: null,
          output: {
            filename: `${filename}.${format}`,
            format,
            mimeType,
            content: exportContent,
            rowCount: data.length,
            message: `Exported ${data.length} ${dataType} records`,
          },
        };
      }

      // ==================== EXTERNAL DATA MODULE ====================
      case 'refresh_charity_data': {
        const holdingId = args.holding_id;
        const ein = args.ein;

        let targetEin = ein;
        let holdingName = '';

        // If holdingId provided, look up the EIN
        if (holdingId && !ein) {
          const { data: holding, error } = await supabase
            .from('holdings')
            .select('name, ein')
            .eq('id', holdingId)
            .single();

          if (error) throw new Error(`Holding not found: ${error.message}`);
          holdingName = holding?.name || '';
          targetEin = holding?.ein;
        }

        if (!targetEin) {
          return {
            action: null,
            output: {
              error: 'No EIN found for this holding. Link the holding to a charity first.',
              success: false,
            },
          };
        }

        // Fetch from external sources (simplified - actual implementation would use the services)
        const charityData: any = {
          ein: targetEin,
          refreshed_at: new Date().toISOString(),
        };

        const { data: charity } = await supabase
          .from('charities')
          .select('ein, name, charity_navigator_score, charity_navigator_rating, give_well_top_charity, candid_seal, propublica_score, total_revenue, total_expenses, net_assets')
          .eq('ein', targetEin)
          .maybeSingle();

        if (charity) {
          charityData.ratings = {
            charity_navigator_score: charity.charity_navigator_score,
            charity_navigator_rating: charity.charity_navigator_rating,
            give_well_top_charity: charity.give_well_top_charity,
            candid_seal: charity.candid_seal,
            propublica_score: charity.propublica_score,
          };
          charityData.financials = {
            total_revenue: charity.total_revenue,
            total_expenses: charity.total_expenses,
            net_assets: charity.net_assets,
          };
          charityData.source = 'cache';
        } else {
          charityData.message = 'No charity data found for this EIN.';
          charityData.source = 'none';
        }

        return {
          action: null,
          output: {
            success: true,
            holding_name: holdingName,
            ein: targetEin,
            data: charityData,
          },
        };
      }

      case 'search_similar_charities': {
        InputValidator.validateUUID(args.holding_id, 'holding_id');

        const { data: holding, error: holdingError } = await supabase
          .from('holdings')
          .select('name, sector, country, funds_allocated')
          .eq('id', args.holding_id)
          .single();

        if (holdingError) throw new Error(`Holding not found: ${holdingError.message}`);

        const sector = args.sector || holding?.sector;
        const limit = args.limit || 5;

        // Search for similar charities in the charities table
        let query = supabase
          .from('charities')
          .select('ein, name, city, state, ntee_code, total_revenue, charity_navigator_rating')
          .limit(limit);

        if (sector) {
          // Match on NTEE code prefix or search in mission
          query = query.ilike('ntee_code', `${sector.charAt(0)}%`);
        }

        const { data: similar } = await query;

        return {
          action: null,
          output: {
            reference_holding: holding?.name,
            sector: sector,
            similar_charities: similar || [],
            count: similar?.length || 0,
          },
        };
      }

      case 'get_charity_financials': {
        const holdingId = args.holding_id;
        const ein = args.ein;

        let targetEin = ein;

        if (holdingId && !ein) {
          const { data: holding } = await supabase
            .from('holdings')
            .select('ein')
            .eq('id', holdingId)
            .single();

          targetEin = holding?.ein;
        }

        if (targetEin) {
          const { data: charity } = await supabase
            .from('charities')
            .select('*')
            .eq('ein', targetEin)
            .single();

          if (charity) {
            return {
              action: null,
              output: {
                source: 'database',
                financials: {
                  ein: charity.ein,
                  name: charity.name,
                  total_revenue: charity.total_revenue,
                  total_expenses: charity.total_expenses,
                  net_assets: charity.net_assets,
                  charity_navigator_score: charity.charity_navigator_score,
                  charity_navigator_rating: charity.charity_navigator_rating,
                },
              },
            };
          }
        }

        return {
          action: null,
          output: {
            error: 'No financial data found. Try refreshing charity data first.',
          },
        };
      }

      // ==================== TAX OPTIMIZATION MODULE ====================
      case 'run_tax_scenario': {
        const scenarioType = args.scenario_type;
        const donationAmount = args.donation_amount;
        const taxYear = args.tax_year || new Date().getFullYear();

        // Get tax profile for context
        const { data: taxProfile } = await supabase
          .from('owner_tax_profiles')
          .select('agi')
          .eq('portfolio_id', portfolioId)
          .maybeSingle();

        const agi = taxProfile?.agi || 500000; // Default if no profile
        const taxBracket = 0.37;

        let result: any = {
          scenario_type: scenarioType,
          donation_amount: donationAmount,
          tax_year: taxYear,
          agi,
          tax_bracket: taxBracket,
        };

        switch (scenarioType) {
          case 'cash_vs_stock': {
            // Cash donation
            const cashDeductionLimit = agi * 0.6;
            const cashDeduction = Math.min(donationAmount, cashDeductionLimit);
            const cashTaxSavings = cashDeduction * taxBracket;
            const cashCarryforward = Math.max(0, donationAmount - cashDeductionLimit);

            // Stock donation (assuming long-term appreciated)
            const stockDeductionLimit = agi * 0.3;
            const stockDeduction = Math.min(donationAmount, stockDeductionLimit);
            // Stock also avoids capital gains
            const assets = args.assets || [];
            let totalGainAvoided = 0;
            assets.forEach((a: any) => {
              if (a.holding_period === 'long') {
                totalGainAvoided += (a.current_value - a.cost_basis);
              }
            });
            const capGainsTaxAvoided = totalGainAvoided * 0.20; // Assume 20% LTCG rate
            const stockTaxSavings = (stockDeduction * taxBracket) + capGainsTaxAvoided;
            const stockCarryforward = Math.max(0, donationAmount - stockDeductionLimit);

            result.scenarios = {
              cash: {
                deduction: cashDeduction,
                tax_savings: cashTaxSavings,
                carryforward: cashCarryforward,
                effective_cost: donationAmount - cashTaxSavings,
              },
              appreciated_stock: {
                deduction: stockDeduction,
                tax_savings: stockTaxSavings,
                capital_gains_avoided: capGainsTaxAvoided,
                carryforward: stockCarryforward,
                effective_cost: donationAmount - stockTaxSavings,
              },
            };
            result.recommendation = stockTaxSavings > cashTaxSavings
              ? 'Donating appreciated stock saves more in taxes'
              : 'Cash donation provides better tax benefits in this case';
            break;
          }

          case 'bunching': {
            // Compare spreading over 2 years vs bunching in 1
            const standardDeduction = 29200; // 2024 MFJ
            const spreadYearlyDonation = donationAmount / 2;
            const spreadDeduction = Math.max(0, spreadYearlyDonation - standardDeduction) * 2;
            const bunchedDeduction = Math.max(0, donationAmount - standardDeduction);

            result.scenarios = {
              spread_over_2_years: {
                yearly_donation: spreadYearlyDonation,
                total_itemized_benefit: spreadDeduction,
                tax_savings: spreadDeduction * taxBracket,
              },
              bunched_in_1_year: {
                donation: donationAmount,
                itemized_benefit: bunchedDeduction,
                tax_savings: bunchedDeduction * taxBracket,
              },
            };
            result.recommendation = bunchedDeduction > spreadDeduction
              ? 'Bunching donations in one year provides better tax benefits'
              : 'Spreading donations may work better for your situation';
            break;
          }

          default:
            result.message = `Scenario type '${scenarioType}' analysis would be performed here`;
        }

        return { action: null, output: result };
      }

      case 'calculate_deduction': {
        const amount = args.amount;
        const assetType = args.asset_type;
        const recipientType = args.recipient_type;

        // Get AGI from args or tax profile
        let agi = args.agi;
        if (!agi) {
          const { data: taxProfile } = await supabase
            .from('owner_tax_profiles')
            .select('agi')
            .eq('portfolio_id', portfolioId)
            .maybeSingle();
          agi = taxProfile?.agi || 500000;
        }

        // Determine AGI limit based on asset and recipient type
        let agiLimitPercent = 0.6; // Default for cash to public charity

        if (assetType === 'cash' && recipientType === 'public_charity') {
          agiLimitPercent = 0.6;
        } else if (assetType === 'cash' && recipientType === 'private_foundation') {
          agiLimitPercent = 0.3;
        } else if (assetType === 'public_stock' && recipientType === 'public_charity') {
          agiLimitPercent = 0.3;
        } else if (assetType === 'public_stock' && recipientType === 'private_foundation') {
          agiLimitPercent = 0.2;
        } else {
          agiLimitPercent = 0.3; // Default for other assets
        }

        const maxDeduction = agi * agiLimitPercent;
        const allowedDeduction = Math.min(amount, maxDeduction);
        const carryforward = Math.max(0, amount - maxDeduction);

        return {
          action: null,
          output: {
            contribution_amount: amount,
            asset_type: assetType,
            recipient_type: recipientType,
            agi,
            agi_limit_percent: agiLimitPercent * 100,
            max_deduction_this_year: maxDeduction,
            allowed_deduction: allowedDeduction,
            carryforward_amount: carryforward,
            carryforward_years: carryforward > 0 ? 5 : 0,
          },
        };
      }

      case 'get_carryforward': {
        const taxYear = args.tax_year || new Date().getFullYear();

        // Query carryforward data from tax_contributions
        const { data: contributions } = await supabase
          .from('tax_contributions')
          .select('*')
          .eq('portfolio_id', portfolioId)
          .eq('is_carryforward', true);

        const carryforwards = (contributions || [])
          .filter((c: any) => {
            const contribYear = c.carryforward_year || new Date(c.contribution_date).getFullYear();
            const yearsAgo = taxYear - contribYear;
            return yearsAgo > 0 && yearsAgo <= 5; // Within 5-year window
          })
          .map((c: any) => ({
            contribution_date: c.contribution_date,
            original_amount: c.fair_market_value,
            carryforward_amount: c.deductible_amount || c.fair_market_value,
            years_remaining: 5 - (taxYear - (c.carryforward_year || new Date(c.contribution_date).getFullYear())),
          }));

        const totalCarryforward = carryforwards.reduce(
          (sum: number, c: any) => sum + (c.carryforward_amount || 0),
          0
        );

        return {
          action: null,
          output: {
            tax_year: taxYear,
            total_carryforward: totalCarryforward,
            carryforwards,
            message: totalCarryforward > 0
              ? `You have $${totalCarryforward.toLocaleString()} in charitable contribution carryforwards available`
              : 'No carryforward amounts found',
          },
        };
      }

      // ==================== ANALYTICS MODULE ====================
      case 'project_metric_trend': {
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
              error: 'Not enough historical data for projection. Need at least 2 data points.',
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
        const sumXY = values.reduce((sum: number, y: number, x: number) => sum + x * y, 0);
        const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        // Generate projections
        const projections = [];
        const lastPeriod = new Date(historicalData[n - 1].period_end || historicalData[n - 1].period_start);

        for (let i = 1; i <= periodsAhead; i++) {
          const projectedValue = intercept + slope * (n - 1 + i);
          const projectedDate = new Date(lastPeriod);
          projectedDate.setMonth(projectedDate.getMonth() + 3 * i); // Assuming quarterly

          // Simple confidence interval (gets wider further out)
          const stdDev = Math.sqrt(
            values.reduce((sum: number, v: number, idx: number) => {
              const predicted = intercept + slope * idx;
              return sum + Math.pow(v - predicted, 2);
            }, 0) / (n - 2)
          );
          const confidenceMargin = stdDev * 1.96 * Math.sqrt(1 + 1/n + Math.pow(i, 2) / sumX2);

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

      case 'benchmark_holding': {
        InputValidator.validateUUID(args.holding_id, 'holding_id');

        const { data: holding, error } = await supabase
          .from('holdings')
          .select('name, sector, country, funds_allocated')
          .eq('id', args.holding_id)
          .single();

        if (error) throw new Error(`Holding not found: ${error.message}`);

        const benchmarkType = args.benchmark_type || 'sector';
        const requestedMetrics = args.metrics || ['funds_allocated'];

        // Get peer holdings for comparison
        let peerQuery = supabase
          .from('holdings')
          .select('id, name, sector, funds_allocated')
          .eq('portfolio_id', portfolioId)
          .neq('id', args.holding_id);

        if (benchmarkType === 'sector' && holding?.sector) {
          peerQuery = peerQuery.eq('sector', holding.sector);
        }

        const { data: peers } = await peerQuery;

        // Calculate percentiles
        const peerValues = (peers || []).map((p: any) => p.funds_allocated || 0);
        const holdingValue = holding?.funds_allocated || 0;
        const allValues = [...peerValues, holdingValue].sort((a, b) => a - b);

        const percentile = allValues.length > 1
          ? (allValues.indexOf(holdingValue) / (allValues.length - 1)) * 100
          : 50;

        return {
          action: null,
          output: {
            holding: holding?.name,
            benchmark_type: benchmarkType,
            peer_count: peers?.length || 0,
            requested_metrics: requestedMetrics,
            metrics: {
              funds_allocated: {
                value: holdingValue,
                percentile: Math.round(percentile),
                peer_average: peerValues.length > 0
                  ? peerValues.reduce((a: number, b: number) => a + b, 0) / peerValues.length
                  : null,
                peer_median: peerValues.length > 0
                  ? peerValues[Math.floor(peerValues.length / 2)]
                  : null,
              },
            },
          },
        };
      }

      case 'analyze_portfolio_risk': {
        const riskType = args.risk_type || 'all';

        // Get all holdings
        const { data: holdings } = await supabase
          .from('holdings')
          .select('id, name, sector, country, funds_allocated')
          .eq('portfolio_id', portfolioId);

        if (!holdings || holdings.length === 0) {
          return {
            action: null,
            output: { error: 'No holdings found in portfolio' },
          };
        }

        const totalAllocation = holdings.reduce((sum: number, h: any) => sum + (h.funds_allocated || 0), 0);
        const result: any = { total_holdings: holdings.length, total_allocation: totalAllocation };

        // Concentration risk (single holding exposure)
        if (riskType === 'concentration' || riskType === 'all') {
          const sorted = [...holdings].sort((a: any, b: any) =>
            (b.funds_allocated || 0) - (a.funds_allocated || 0)
          );
          const top3 = sorted.slice(0, 3);
          const top3Percent = totalAllocation > 0
            ? (top3.reduce((sum: number, h: any) => sum + (h.funds_allocated || 0), 0) / totalAllocation) * 100
            : 0;

          result.concentration = {
            top_3_holdings: top3.map((h: any) => ({
              name: h.name,
              allocation: h.funds_allocated,
              percent: totalAllocation > 0 ? ((h.funds_allocated || 0) / totalAllocation) * 100 : 0,
            })),
            top_3_percent: top3Percent,
            risk_level: top3Percent > 50 ? 'high' : top3Percent > 30 ? 'medium' : 'low',
          };
        }

        // Sector concentration
        if (riskType === 'sector' || riskType === 'all') {
          const bySector: Record<string, number> = {};
          holdings.forEach((h: any) => {
            const sector = h.sector || 'Unknown';
            bySector[sector] = (bySector[sector] || 0) + (h.funds_allocated || 0);
          });

          const sectorEntries = Object.entries(bySector)
            .map(([sector, amount]) => ({
              sector,
              amount,
              percent: totalAllocation > 0 ? (amount / totalAllocation) * 100 : 0,
            }))
            .sort((a, b) => b.amount - a.amount);

          const topSectorPercent = sectorEntries[0]?.percent || 0;

          result.sector_concentration = {
            sectors: sectorEntries,
            top_sector: sectorEntries[0]?.sector,
            top_sector_percent: topSectorPercent,
            risk_level: topSectorPercent > 40 ? 'high' : topSectorPercent > 25 ? 'medium' : 'low',
          };
        }

        // Geographic concentration
        if (riskType === 'geography' || riskType === 'all') {
          const byCountry: Record<string, number> = {};
          holdings.forEach((h: any) => {
            const country = h.country || 'Unknown';
            byCountry[country] = (byCountry[country] || 0) + (h.funds_allocated || 0);
          });

          const countryEntries = Object.entries(byCountry)
            .map(([country, amount]) => ({
              country,
              amount,
              percent: totalAllocation > 0 ? (amount / totalAllocation) * 100 : 0,
            }))
            .sort((a, b) => b.amount - a.amount);

          result.geographic_concentration = {
            countries: countryEntries,
            country_count: countryEntries.length,
            top_country: countryEntries[0]?.country,
            top_country_percent: countryEntries[0]?.percent || 0,
          };
        }

        return { action: null, output: result };
      }

      // ==================== GRANT MANAGEMENT MODULE ====================
      case 'get_grant_health':
        return await getGrantHealth(supabase, args);

      case 'get_upcoming_deadlines':
        return await getUpcomingDeadlines(supabase, args);

      case 'log_grant_communication':
        return await logGrantCommunication(supabase, args, userId);

      case 'record_grant_payment':
        return await recordGrantPayment(supabase, args);

      case 'track_milestone':
        return await trackMilestone(supabase, args);

      case 'start_due_diligence':
        return await startDueDiligence(supabase, args, portfolioId);

      case 'get_workflow_status':
        return await getWorkflowStatus(supabase, args);

      case 'complete_workflow_task':
        return await completeWorkflowTask(supabase, args);

      case 'schedule_reminder': {
        const { holding_id, reminder_type, remind_at, note } = args;
        const { data, error } = await supabase
          .from('task_reminders')
          .insert({ holding_id, reminder_type, remind_at, note: note ?? null })
          .select()
          .single();
        if (error) throw new Error(error.message);
        return { action: null, output: { success: true, reminder: data } };
      }

      // ==================== DONOR MANAGEMENT MODULE ====================
      case 'log_contribution_received': {
        InputValidator.validateUUID(args.organization_id, 'organization_id');
        InputValidator.validateNumber(args.amount, 'amount', { min: 0.01 });
        if (args.donor_id) InputValidator.validateUUID(args.donor_id, 'donor_id');
        if (args.contribution_date) InputValidator.validateDateString(args.contribution_date, 'contribution_date');
        if (args.gift_type) {
          InputValidator.validateEnum(args.gift_type, 'gift_type', CANONICAL_GIFT_TYPES);
        }
        if (args.contribution_type) {
          InputValidator.validateEnum(args.contribution_type, 'contribution_type', [
            'cash', 'check', 'credit_card', 'wire', 'ach', 'stock', 'crypto', 'real_estate', 'in_kind', 'other'
          ] as const);
        }
        if (args.donor_type) {
          InputValidator.validateEnum(args.donor_type, 'donor_type', [
            'individual', 'foundation', 'corporation', 'government', 'other'
          ] as const);
        }

        let donorId = args.donor_id;

        // Auto-create donor if not provided but name given
        if (!donorId && args.donor_name) {
          const donorType = args.donor_type || 'individual';
          const isOrg = ['foundation', 'corporation', 'government'].includes(donorType);

          // Parse name for individuals
          let firstName = null;
          let lastName = null;
          let orgName = null;

          if (isOrg) {
            orgName = args.donor_name;
          } else {
            const nameParts = args.donor_name.trim().split(/\s+/);
            if (nameParts.length >= 2) {
              firstName = nameParts.slice(0, -1).join(' ');
              lastName = nameParts[nameParts.length - 1];
            } else {
              firstName = args.donor_name;
            }
          }

          // Check for existing donor by email or name
          let existingDonor = null;
          if (args.donor_email) {
            const { data } = await supabase
              .from('donors')
              .select('id')
              .eq('org_id', args.organization_id)
              .eq('email', args.donor_email)
              .maybeSingle();
            existingDonor = data;
          }

          if (!existingDonor && !isOrg && lastName) {
            const { data } = await supabase
              .from('donors')
              .select('id')
              .eq('org_id', args.organization_id)
              .eq('first_name', firstName)
              .eq('last_name', lastName)
              .maybeSingle();
            existingDonor = data;
          }

          if (!existingDonor && isOrg && orgName) {
            const { data } = await supabase
              .from('donors')
              .select('id')
              .eq('org_id', args.organization_id)
              .eq('organization_name', orgName)
              .maybeSingle();
            existingDonor = data;
          }

          if (existingDonor) {
            donorId = existingDonor.id;
          } else {
            // Create new donor
            const { data: newDonor, error: donorError } = await supabase
              .from('donors')
              .insert({
                org_id: args.organization_id,
                is_organization: isOrg,
                first_name: firstName,
                last_name: lastName,
                organization_name: orgName,
                email: args.donor_email || null,
              })
              .select('id')
              .single();

            if (donorError) throw new Error(`Error creating donor: ${donorError.message}`);
            donorId = newDonor.id;
          }
        }

        if (!donorId) {
          throw new ValidationError('Either donor_id or donor_name is required to log a contribution');
        }

        const giftType = normalizeGiftType(args.gift_type || args.contribution_type);

        // Create the contribution
        const { data: contribution, error: contribError } = await supabase
          .from('contributions_received')
          .insert({
            org_id: args.organization_id,
            donor_id: donorId,
            amount: args.amount,
            contribution_date: args.contribution_date || new Date().toISOString().split('T')[0],
            gift_type: giftType,
            fund_designation: args.designation || null,
            is_restricted: args.is_restricted || false,
            quid_pro_quo_value: args.quid_pro_quo_value || 0,
            campaign: args.campaign || null,
            notes: args.notes || null,
          })
          .select('*, donors(first_name, last_name, organization_name, is_organization)')
          .single();

        if (contribError) throw new Error(`Error creating contribution: ${contribError.message}`);

        // Auto-generate receipt for contributions >= $250
        let receiptGenerated = false;
        if (args.auto_generate_receipt && args.amount >= 250) {
          const receiptNumber = await supabase.rpc('generate_receipt_number', {
            p_org_id: args.organization_id,
          });

          if (receiptNumber.data) {
            await supabase
              .from('contributions_received')
              .update({
                receipt_number: receiptNumber.data,
                receipt_status: 'generated',
                receipt_generated_at: new Date().toISOString(),
              })
              .eq('id', contribution.id);
            receiptGenerated = true;
          }
        }

        // Build donor display name
        const donor = contribution.donors;
        const donorName = donor
          ? (!donor.is_organization
              ? `${donor.first_name || ''} ${donor.last_name || ''}`.trim()
              : donor.organization_name)
          : 'Anonymous';

        return {
          action: null,
          output: {
            success: true,
            contribution_id: contribution.id,
            amount: args.amount,
            donor_id: donorId,
            donor_name: donorName,
            donor_created: !args.donor_id && donorId ? true : false,
            receipt_generated: receiptGenerated,
            message: `Logged $${args.amount.toLocaleString()} contribution from ${donorName}${receiptGenerated ? ' (receipt generated)' : ''}`,
          },
        };
      }

      case 'generate_receipt': {
        InputValidator.validateUUID(args.contribution_id, 'contribution_id');

        // Get contribution with donor and organization info
        const { data: contribution, error: contribError } = await supabase
          .from('contributions_received')
          .select(`
            *,
            donors(first_name, last_name, organization_name, is_organization, email, address_line1, city, state, zip),
            organizations(name, ein, website)
          `)
          .eq('id', args.contribution_id)
          .single();

        if (contribError) throw new Error(`Contribution not found: ${contribError.message}`);

        const org = (contribution as any).organizations;
        const donor = (contribution as any).donors;

        // Generate receipt number if not already generated
        let receiptNumber = contribution.receipt_number;
        if (!receiptNumber) {
          const { data: newReceiptNum } = await supabase.rpc('generate_receipt_number', {
            p_org_id: contribution.org_id,
          });
          receiptNumber = newReceiptNum;
        }

        // Build goods/services statement
        const goodsServicesStatement = contribution.quid_pro_quo_value > 0
          ? `The estimated value of goods and services provided in exchange for this contribution was $${contribution.quid_pro_quo_value.toLocaleString()}. The tax-deductible portion is $${contribution.tax_deductible_amount.toLocaleString()}.`
          : 'No goods or services were provided in exchange for this contribution.';

        // Update contribution with receipt info
        const { error: updateError } = await supabase
          .from('contributions_received')
          .update({
            receipt_number: receiptNumber,
            receipt_status: 'generated',
            receipt_generated_at: new Date().toISOString(),
          })
          .eq('id', args.contribution_id);

        if (updateError) throw new Error(`Error updating contribution: ${updateError.message}`);

        // Create acknowledgment letter record for the receipt
        const donorName = donor
          ? (!donor.is_organization
              ? `${donor.first_name || ''} ${donor.last_name || ''}`.trim()
              : donor.organization_name)
          : 'Donor';

        const receiptBody = `Dear ${donorName},

Thank you for your generous contribution to ${org?.name || 'our organization'}.

This letter serves as your official receipt for tax purposes.

Contribution Details:
- Date: ${new Date(contribution.contribution_date).toLocaleDateString()}
- Amount: $${contribution.amount.toLocaleString()}
- Receipt Number: ${receiptNumber}

${goodsServicesStatement}

${org?.ein ? `Organization EIN: ${org.ein}` : ''}

Thank you for your support!

Sincerely,
${org?.name || 'The Organization'}`;

        const { data: letter } = await supabase
          .from('acknowledgment_letters')
          .insert({
            org_id: contribution.org_id,
            donor_id: contribution.donor_id,
            contribution_ids: [contribution.id],
            subject: `Tax Receipt - ${receiptNumber}`,
            body: receiptBody,
            status: 'draft',
            delivery_method: 'email',
            sent_by: userId,
            notes: `Generated tax receipt. ${goodsServicesStatement}`,
          })
          .select()
          .single();

        // Send immediately if requested
        if (args.send_immediately && donor?.email) {
          await supabase
            .from('acknowledgment_letters')
            .update({
              status: 'sent',
              delivery_method: 'email',
              sent_at: new Date().toISOString(),
              sent_by: userId,
            })
            .eq('id', letter?.id);

          await supabase
            .from('contributions_received')
            .update({
              receipt_status: 'sent',
              receipt_sent_at: new Date().toISOString(),
              acknowledgment_sent: true,
              acknowledged_at: new Date().toISOString(),
            })
            .eq('id', args.contribution_id);
        }

        return {
          action: null,
          output: {
            success: true,
            receipt_number: receiptNumber,
            letter_id: letter?.id,
            amount: contribution.amount,
            tax_deductible_amount: contribution.tax_deductible_amount,
            donor_name: donorName,
            sent: args.send_immediately && donor?.email ? true : false,
            message: `Tax receipt ${receiptNumber} generated for $${contribution.amount.toLocaleString()}${args.send_immediately && donor?.email ? ' and sent to ' + donor.email : ''}`,
          },
        };
      }

      case 'generate_acknowledgment': {
        InputValidator.validateUUID(args.organization_id, 'organization_id');
        InputValidator.validateUUID(args.donor_id, 'donor_id');
        if (args.contribution_id) InputValidator.validateUUID(args.contribution_id, 'contribution_id');
        if (args.letter_type) {
          InputValidator.validateEnum(args.letter_type, 'letter_type', [
            'thank_you', 'annual_summary', 'welcome', 'custom'
          ] as const);
        }
        if (args.send_via) {
          InputValidator.validateEnum(args.send_via, 'send_via', ['email', 'mail', 'both'] as const);
        }

        // Get donor info
        const { data: donor, error: donorError } = await supabase
          .from('donors')
          .select('*')
          .eq('id', args.donor_id)
          .single();

        if (donorError) throw new Error(`Donor not found: ${donorError.message}`);

        // Get organization info
        const { data: org } = await supabase
          .from('organizations')
          .select('name, ein')
          .eq('id', args.organization_id)
          .single();

        const donorName = !donor.is_organization
          ? `${donor.first_name || ''} ${donor.last_name || ''}`.trim()
          : donor.organization_name;

        const letterType = args.letter_type || 'thank_you';
        let subject = '';
        let body = '';

        if (letterType === 'thank_you') {
          // Get contribution if specified
          let contributionInfo = '';
          if (args.contribution_id) {
            const { data: contrib } = await supabase
              .from('contributions_received')
              .select('amount, contribution_date')
              .eq('id', args.contribution_id)
              .single();

            if (contrib) {
              contributionInfo = `\n\nYour recent gift of $${contrib.amount.toLocaleString()} on ${new Date(contrib.contribution_date).toLocaleDateString()} will make a real difference in our work.`;
            }
          }

          subject = `Thank You for Your Generous Support`;
          body = `Dear ${donorName},

Thank you so much for your generous support of ${org?.name || 'our organization'}!${contributionInfo}

${args.custom_message || 'Your contribution helps us continue our important work in the community.'}

We are deeply grateful for donors like you who make our mission possible.

With sincere thanks,
${org?.name || 'The Organization'}`;

        } else if (letterType === 'annual_summary') {
          const currentYear = new Date().getFullYear();
          const { data: yearContribs } = await supabase
            .from('contributions_received')
            .select('amount, tax_deductible_amount')
            .eq('donor_id', args.donor_id)
            .gte('contribution_date', `${currentYear}-01-01`)
            .lte('contribution_date', `${currentYear}-12-31`);

          const contribs = yearContribs || [];
          const totalContributions = contribs.reduce((s: number, c: any) => s + (c.amount || 0), 0);
          const totalTaxDeductible = contribs.reduce((s: number, c: any) => s + (c.tax_deductible_amount ?? c.amount ?? 0), 0);

          subject = `Your ${currentYear} Giving Summary`;
          body = `Dear ${donorName},

Thank you for your incredible generosity this year!

Your ${currentYear} Giving Summary:
- Total Contributions: $${totalContributions.toLocaleString()}
- Number of Gifts: ${contribs.length}
- Total Tax-Deductible: $${totalTaxDeductible.toLocaleString()}

${args.custom_message || 'Your support has made a tremendous impact on our mission.'}

${org?.ein ? `Organization EIN: ${org.ein}` : ''}

With gratitude,
${org?.name || 'The Organization'}`;

        } else if (letterType === 'welcome') {
          subject = `Welcome to ${org?.name || 'Our Organization'}`;
          body = `Dear ${donorName},

Welcome to the ${org?.name || 'our organization'} family!

Thank you for your first gift to our organization. We are thrilled to have you as a supporter.

${args.custom_message || 'Your generosity will help us continue our important work.'}

We look forward to keeping you updated on the impact of your support.

Warmly,
${org?.name || 'The Organization'}`;

        } else {
          subject = args.custom_message?.substring(0, 50) || 'Message from ' + (org?.name || 'Our Organization');
          body = args.custom_message || '';
        }

        // Create the acknowledgment letter
        const { data: letter, error: letterError } = await supabase
          .from('acknowledgment_letters')
          .insert({
            org_id: args.organization_id,
            donor_id: args.donor_id,
            contribution_ids: args.contribution_id ? [args.contribution_id] : [],
            subject,
            body,
            status: 'draft',
            delivery_method: args.send_via || 'email',
            sent_by: userId,
            notes: `type=${letterType}`,
          })
          .select()
          .single();

        if (letterError) throw new Error(`Error creating letter: ${letterError.message}`);

        // Update donor acknowledgment status if contribution specified
        if (args.contribution_id) {
          await supabase
            .from('contributions_received')
            .update({ acknowledgment_sent: false })
            .eq('id', args.contribution_id);
        }

        return {
          action: null,
          output: {
            success: true,
            letter_id: letter.id,
            letter_type: letterType,
            donor_name: donorName,
            subject,
            status: 'draft',
            message: `${letterType.replace('_', ' ')} letter created for ${donorName}`,
          },
        };
      }

      case 'get_donor_summary': {
        InputValidator.validateUUID(args.donor_id, 'donor_id');

        // Get donor details
        const { data: donor, error: donorError } = await supabase
          .from('v_donor_summary')
          .select('*')
          .eq('id', args.donor_id)
          .single();

        if (donorError) throw new Error(`Donor not found: ${donorError.message}`);

        const { data: donorContributions } = await supabase
          .from('contributions_received')
          .select('id, contribution_date, amount, gift_type, fund_designation, receipt_status, acknowledgment_sent, tax_deductible_amount')
          .eq('donor_id', args.donor_id)
          .order('contribution_date', { ascending: false });

        const contributionsForStats = donorContributions || [];
        const currentYear = new Date().getFullYear();
        const ytdStart = `${currentYear}-01-01`;
        const ytdContributions = contributionsForStats.filter((c: any) => c.contribution_date >= ytdStart);
        const totalYtdGiving = ytdContributions.reduce((sum: number, c: any) => sum + Number(c.amount || 0), 0);
        const giftCount = donor.gift_count ?? contributionsForStats.length;
        const averageGift = giftCount > 0 ? Number(donor.lifetime_giving || 0) / giftCount : 0;
        const hasPendingReceipts = contributionsForStats.some((c: any) => (c.receipt_status || 'pending') !== 'sent');
        const hasPendingAcknowledgments =
          donor.has_pending_acknowledgments ??
          contributionsForStats.some((c: any) => c.acknowledgment_sent === false);

        const result: any = {
          donor: {
            id: donor.id,
            name: donorDisplayName(donor),
            email: donor.email,
            type: donor.is_organization ? 'organization' : 'individual',
            tier: donor.computed_tier ?? donor.tier,
            status: donor.recency_status,
          },
          giving_stats: {
            total_lifetime: donor.total_lifetime_giving ?? donor.lifetime_giving,
            total_ytd: totalYtdGiving,
            gift_count: giftCount,
            largest_gift: donor.largest_gift,
            average_gift: averageGift,
            first_gift_date: donor.first_gift_date,
            last_gift_date: donor.last_gift_date,
            days_since_last_gift: daysSince(donor.last_gift_date),
          },
          pending_items: {
            has_pending_receipts: hasPendingReceipts,
            has_pending_acknowledgments: hasPendingAcknowledgments,
          },
        };

        // Include contributions if requested
        if (args.include_contributions !== false) {
          const contributions = args.year
            ? contributionsForStats.filter((c: any) => c.contribution_date >= `${args.year}-01-01` && c.contribution_date <= `${args.year}-12-31`)
            : contributionsForStats;
          result.contributions = contributions.slice(0, 50).map((c: any) => ({
            id: c.id,
            contribution_date: c.contribution_date,
            amount: c.amount,
            gift_type: c.gift_type,
            fund_designation: c.fund_designation,
            receipt_status: c.receipt_status,
            acknowledgment_sent: c.acknowledgment_sent,
          }));
        }

        return {
          action: null,
          output: result,
        };
      }

      case 'search_donors': {
        InputValidator.validateUUID(args.organization_id, 'organization_id');
        if (args.donor_type) {
          InputValidator.validateEnum(args.donor_type, 'donor_type', [
            'individual', 'foundation', 'corporation', 'government', 'other'
          ] as const);
        }
        if (args.donor_tier) {
          InputValidator.validateEnum(args.donor_tier, 'donor_tier', [
            'major', 'mid', 'recurring', 'annual', 'lapsed', 'prospect'
          ] as const);
        }
        if (args.recency_status) {
          InputValidator.validateEnum(args.recency_status, 'recency_status', [
            'active', 'lapsed', 'lost'
          ] as const);
        }
        if (args.min_lifetime_giving) {
          InputValidator.validateNumber(args.min_lifetime_giving, 'min_lifetime_giving', { min: 0 });
        }

        const limit = Math.min(args.limit || 50, 100);

        // Use the view for computed fields
        let query = supabase
          .from('v_donor_summary')
          .select('*')
          .eq('org_id', args.organization_id);

        // Apply filters
        if (args.name) {
          query = query.ilike('display_name', `%${args.name}%`);
        }
        if (args.email) {
          query = query.ilike('email', `%${args.email}%`);
        }
        if (args.donor_type) {
          query = query.eq('is_organization', args.donor_type !== 'individual');
        }
        if (args.donor_tier) {
          query = query.eq('computed_tier', args.donor_tier);
        }
        if (args.recency_status) {
          query = query.eq('recency_status', args.recency_status);
        }
        if (args.min_lifetime_giving) {
          query = query.gte('total_lifetime_giving', args.min_lifetime_giving);
        }
        if (args.has_pending_acknowledgments) {
          query = query.eq('has_pending_acknowledgments', true);
        }

        const { data: donorRows, error } = await query
          .order('total_lifetime_giving', { ascending: false })
          .limit(limit);

        if (error) throw new Error(`Error searching donors: ${error.message}`);

        let donors = donorRows || [];
        const donorIds = donors.map((d: any) => d.id).filter(Boolean);
        const pendingReceiptIds = new Set<string>();
        if (donorIds.length > 0) {
          const { data: pendingReceiptRows } = await supabase
            .from('contributions_received')
            .select('donor_id')
            .in('donor_id', donorIds)
            .neq('receipt_status', 'sent');
          for (const row of pendingReceiptRows || []) {
            pendingReceiptIds.add(row.donor_id);
          }
        }
        if (args.has_pending_receipts) {
          donors = donors.filter((d: any) => pendingReceiptIds.has(d.id));
        }

        return {
          action: null,
          output: {
            donors: (donors || []).map((d: any) => ({
              donor_id: d.id,
              name: donorDisplayName(d),
              email: d.email,
              type: d.is_organization ? 'organization' : 'individual',
              tier: d.computed_tier ?? d.tier,
              status: d.recency_status,
              total_lifetime_giving: d.total_lifetime_giving,
              total_ytd_giving: null,
              gift_count: d.gift_count,
              last_gift_date: d.last_gift_date,
              has_pending_receipts: pendingReceiptIds.has(d.id),
              has_pending_acknowledgments: d.has_pending_acknowledgments,
            })),
            count: donors?.length || 0,
            filters_applied: Object.keys(args).filter(k => k !== 'organization_id' && k !== 'limit' && args[k] !== undefined),
          },
        };
      }

      // ==================== COMPLIANCE & REGULATORY MODULE ====================
      case 'get_compliance_status': {
        return {
          action: null,
          output: {
            feature_not_available: true,
            message: 'Advanced compliance dashboard (self-dealing incidents, payout status, upcoming deadlines) requires migrations not yet deployed. Use get_state_registration_status and track_filing_deadline for available compliance data.',
          },
        };
      }

      case 'calculate_payout_requirement': {
        return {
          action: null,
          output: {
            feature_not_available: true,
            message: 'Payout calculation requires payout_history and v_payout_status (not yet deployed in the clean migration set).',
          },
        };
      }

      case 'get_payout_forecast': {
        return {
          action: null,
          output: {
            feature_not_available: true,
            message: 'Payout forecast requires payout_history and qualifying_distributions tables (not yet deployed in the clean migration set).',
          },
        };
      }

      case 'screen_for_self_dealing': {
        return {
          action: null,
          output: {
            feature_not_available: true,
            message: 'Self-dealing screening requires the disqualified_persons and self_dealing_incidents migrations (not yet deployed). Please log incidents manually.',
          },
        };
      }

      case 'register_disqualified_person': {
        return {
          action: null,
          output: {
            feature_not_available: true,
            message: 'Disqualified person registry requires the disqualified_persons migration (not yet deployed). Please track manually.',
          },
        };
      }

      case 'track_filing_deadline': {
        InputValidator.validateUUID(args.organization_id, 'organization_id');
        if (args.filing_id) InputValidator.validateUUID(args.filing_id, 'filing_id');
        if (args.due_date) InputValidator.validateDateString(args.due_date, 'due_date');
        if (args.extension_due_date) InputValidator.validateDateString(args.extension_due_date, 'extension_due_date');
        if (args.status) {
          InputValidator.validateEnum(args.status, 'status', [
            'upcoming', 'in_progress', 'filed', 'extended', 'overdue', 'waived', 'not_applicable',
          ] as const);
        }

        if (args.filing_id) {
          // Update existing
          const updateData: any = {};
          const fields = ['status', 'filing_reference', 'extension_due_date', 'notes', 'description', 'completed_at'];
          for (const f of fields) {
            if (args[f] !== undefined) updateData[f] = args[f];
          }
          if (args.status === 'filed') {
            updateData.completed_by = userId;
            if (!updateData.completed_at) updateData.completed_at = new Date().toISOString();
          }

          const { data, error } = await supabase
            .from('filing_calendar')
            .update(updateData)
            .eq('id', args.filing_id)
            .eq('org_id', args.organization_id)
            .select()
            .single();

          if (error) throw new Error(`Error updating filing: ${error.message}`);

          return {
            action: null,
            output: { success: true, action: 'updated', filing: data },
          };
        } else {
          // Create new
          if (!args.filing_type || !args.title || !args.due_date) {
            throw new Error('filing_type, title, and due_date are required to create a new filing');
          }

          const { data, error } = await supabase
            .from('filing_calendar')
            .insert({
              org_id: args.organization_id,
              filing_type: args.filing_type,
              title: args.title || args.filing_type,
              jurisdiction: args.jurisdiction || 'federal',
              description: args.description || null,
              due_date: args.due_date,
              extension_due_date: args.extension_due_date || null,
              status: args.status || 'upcoming',
            })
            .select()
            .single();

          if (error) throw new Error(`Error creating filing: ${error.message}`);

          return {
            action: {
              id: crypto.randomUUID(),
              sessionId,
              portfolioId,
              userId,
              actionType: 'create',
              entityType: 'compliance_filing' as any,
              entityId: data.id,
              operationData: { table: 'filing_calendar', after: data },
              aiReasoning: `Created ${data.filing_type} deadline for ${data.tax_year} due ${data.due_date}`,
              userPrompt,
              status: 'applied',
              batchId,
              sequenceOrder,
            },
            output: {
              success: true,
              action: 'created',
              filing: data,
              message: `${data.filing_type.replace(/_/g, '-').toUpperCase()} deadline added for tax year ${data.tax_year}, due ${data.due_date}`,
            },
          };
        }
      }

      case 'log_expenditure_responsibility': {
        return {
          action: null,
          output: {
            feature_not_available: true,
            message: 'Expenditure responsibility tracking requires the expenditure_responsibility_grants migration (not yet deployed). Please track grant compliance manually.',
          },
        };
      }

      case 'assess_qualifying_distribution': {
        return {
          action: null,
          output: {
            feature_not_available: true,
            message: 'Qualifying distribution tracking requires the qualifying_distributions and payout_history migrations (not yet deployed). Please track distributions manually.',
          },
        };
      }

      case 'get_990pf_export_data': {
        return {
          action: null,
          output: {
            feature_not_available: true,
            message: '990-PF export requires the payout_history and qualifying_distributions migrations (not yet deployed). Please compile this data manually.',
          },
        };
      }

      case 'get_state_registration_status': {
        InputValidator.validateUUID(args.organization_id, 'organization_id');

        let query = supabase
          .from('state_registrations')
          .select('*')
          .eq('org_id', args.organization_id)
          .order('state');

        if (args.state_code) {
          query = query.eq('state', args.state_code.toUpperCase());
        }
        if (args.status_filter) {
          query = query.eq('status', args.status_filter);
        }

        const { data, error } = await query;
        if (error) throw new Error(`Error fetching state registrations: ${error.message}`);

        const registrations = data || [];
        const summary = {
          total: registrations.length,
          active: registrations.filter((r: any) => r.status === 'active').length,
          renewal_due: registrations.filter((r: any) => r.status === 'renewal_due').length,
          expired: registrations.filter((r: any) => r.status === 'expired').length,
          exempt: registrations.filter((r: any) => r.status === 'exempt').length,
          not_registered: registrations.filter((r: any) => r.status === 'not_registered').length,
        };

        return {
          action: null,
          output: { registrations, summary },
        };
      }

      default:
        throw new Error(`Unknown function: ${functionName}`);
    }
  }
