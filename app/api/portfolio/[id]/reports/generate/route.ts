// app/api/portfolio/[id]/reports/generate/route.ts
// Generates a report from a template or ad-hoc configuration
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

const createSb = createSupabaseServerClient;

// Helper to calculate time range start
function getTimeRangeStart(range: string): string {
  const now = new Date();
  switch (range) {
    case '3m': return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    case '6m': return new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();
    case '12m': return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
    case 'ytd': return new Date(now.getFullYear(), 0, 1).toISOString();
    default: return new Date(now.getTime() - 3650 * 24 * 60 * 60 * 1000).toISOString();
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const sb = await createSb();

  // Permission check
  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolio_id });
  if (canEditErr) return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canEdit) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  const { data: { user } } = await sb.auth.getUser();

  const body = await req.json();
  const {
    template_id,
    scope,
    holding_id,
    sector,
    title,
    metric_codes,
    chart_preferences,
    include_sections,
    time_range,
    save_document,
  } = body;

  // Get template config if using a template
  let config: any = {};
  let templateName = null;

  if (template_id) {
    const { data: template, error: templateErr } = await sb
      .from('report_templates')
      .select('*')
      .eq('id', template_id)
      .eq('portfolio_id', portfolio_id)
      .single();

    if (templateErr) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404, headers: cacheHeaders() });
    }

    config = template.config || {};
    templateName = template.name;
  }

  // Override with provided values
  const reportScope = scope || config.scope || 'portfolio';
  const reportMetrics = metric_codes || config.metric_codes || [];
  const reportChartPrefs = chart_preferences || config.chart_preferences || [];
  const reportSections = include_sections || config.include_sections || ['overview', 'financials', 'impact', 'trends'];
  const reportTimeRange = time_range || config.time_range || '12m';
  const timeRangeStart = getTimeRangeStart(reportTimeRange);

  const contentBlocks: Array<{ type: 'text' | 'chart'; content?: string; widget?: any }> = [];
  const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];
  let chartIndex = 0;

  // Generate report based on scope
  if (reportScope === 'holding') {
    if (!holding_id) {
      return NextResponse.json({ error: 'holding_id is required for holding scope' }, { status: 400, headers: cacheHeaders() });
    }

    // Get holding data
    const { data: holding, error: holdingErr } = await sb
      .from('holdings')
      .select('*, investees(charities(*))')
      .eq('id', holding_id)
      .eq('portfolio_id', portfolio_id)
      .single();

    if (holdingErr || !holding) {
      return NextResponse.json({ error: 'Holding not found' }, { status: 404, headers: cacheHeaders() });
    }

    // Get metrics
    let metricsQuery = sb
      .from('metric_facts')
      .select('metric_code, value, unit, period_end')
      .eq('holding_id', holding_id)
      .gte('period_end', timeRangeStart)
      .order('period_end', { ascending: true });

    if (reportMetrics.length > 0) {
      metricsQuery = metricsQuery.in('metric_code', reportMetrics.map((m: string) => m.toUpperCase()));
    }

    const { data: metricFacts } = await metricsQuery;
    const facts = metricFacts || [];

    // Group metrics
    const metricGroups: Record<string, Array<{ date: string; value: number; unit: string | null }>> = {};
    facts.forEach((f: any) => {
      if (!metricGroups[f.metric_code]) metricGroups[f.metric_code] = [];
      metricGroups[f.metric_code].push({
        date: f.period_end || 'unknown',
        value: Number(f.value || 0),
        unit: f.unit,
      });
    });

    const investee = Array.isArray(holding.investees) ? holding.investees[0] : holding.investees;
    const charity = Array.isArray(investee?.charities) ? investee.charities[0] : investee?.charities;

    // Build content blocks
    if (reportSections.includes('overview')) {
      contentBlocks.push({
        type: 'text',
        content: `# ${title || holding.name + ' Report'}\n\n## Overview\n\n**${holding.name}** is a ${holding.status || 'Active'} holding in the ${holding.sector || 'General'} sector${holding.country ? `, based in ${holding.country}` : ''}.${charity?.mission ? `\n\n**Mission:** ${charity.mission}` : ''}`,
      });
    }

    if (reportSections.includes('financials') && (holding.funds_allocated || charity?.total_revenue)) {
      let financialText = '## Financial Overview\n\n';
      if (holding.funds_allocated) financialText += `- **Funds Allocated:** $${holding.funds_allocated.toLocaleString()}\n`;
      if (holding.current_value) financialText += `- **Current Value:** $${holding.current_value.toLocaleString()}\n`;
      if (charity?.total_revenue) financialText += `- **Annual Revenue:** $${charity.total_revenue.toLocaleString()}\n`;
      contentBlocks.push({ type: 'text', content: financialText });
    }

    if ((reportSections.includes('impact') || reportSections.includes('trends')) && Object.keys(metricGroups).length > 0) {
      contentBlocks.push({
        type: 'text',
        content: '## Impact Metrics\n\nThe following charts show key performance indicators over time:',
      });

      for (const [metricCode, series] of Object.entries(metricGroups)) {
        if (series.length >= 2) {
          const chartPref = reportChartPrefs.find((p: any) => p.metric_code?.toUpperCase() === metricCode.toUpperCase());
          const chartType = chartPref?.chart_type || 'line';
          const chartData = series.map(s => ({ date: s.date, value: s.value }));
          const unit = series[0]?.unit || '';

          const widgetConfig = {
            id: crypto.randomUUID(),
            type: 'd3_json',
            title: `${metricCode}${unit ? ` (${unit})` : ''}`,
            config: {
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
            },
          };

          contentBlocks.push({ type: 'chart', widget: widgetConfig });

          const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
          const latest = sorted[sorted.length - 1];
          contentBlocks.push({
            type: 'text',
            content: `**${metricCode}**: Latest value of ${latest.value.toLocaleString()}${unit ? ' ' + unit : ''} (${series.length} data points).\n`,
          });

          chartIndex++;
        }
      }
    }

  } else if (reportScope === 'portfolio') {
    // Portfolio-wide report
    const { data: holdings } = await sb
      .from('holdings')
      .select('id, name, sector, status, funds_allocated')
      .eq('portfolio_id', portfolio_id);

    const holdingsList = holdings || [];
    const totalAllocated = holdingsList.reduce((s, h: any) => s + (h.funds_allocated || 0), 0);
    const sectorBreakdown: Record<string, number> = {};
    holdingsList.forEach((h: any) => {
      const sec = h.sector || 'Other';
      sectorBreakdown[sec] = (sectorBreakdown[sec] || 0) + (h.funds_allocated || 0);
    });

    contentBlocks.push({
      type: 'text',
      content: `# ${title || 'Portfolio Report'}\n\n## Overview\n\nThis portfolio contains **${holdingsList.length} holdings** with a total allocation of **$${totalAllocated.toLocaleString()}**.`,
    });

    // Sector breakdown chart
    if (Object.keys(sectorBreakdown).length > 1) {
      const sectorData = Object.entries(sectorBreakdown).map(([sector, amount]) => ({ sector, amount }));
      contentBlocks.push({
        type: 'chart',
        widget: {
          id: crypto.randomUUID(),
          type: 'd3_json',
          title: 'Allocation by Sector',
          config: {
            d3: {
              kind: 'pie',
              data: sectorData,
              encoding: { category: 'sector', value: 'amount' },
              options: { colors: palette },
            },
          },
        },
      });
    }

    // Get aggregate metrics
    const holdingIds = holdingsList.map((h: any) => h.id);
    if (holdingIds.length > 0) {
      let metricsQuery = sb
        .from('metric_facts')
        .select('metric_code, value, unit, period_end')
        .in('holding_id', holdingIds)
        .gte('period_end', timeRangeStart)
        .order('period_end', { ascending: true });

      if (reportMetrics.length > 0) {
        metricsQuery = metricsQuery.in('metric_code', reportMetrics.map((m: string) => m.toUpperCase()));
      }

      const { data: metricFacts } = await metricsQuery;

      // Aggregate by metric and period
      const aggregated: Record<string, Record<string, number>> = {};
      (metricFacts || []).forEach((f: any) => {
        if (!aggregated[f.metric_code]) aggregated[f.metric_code] = {};
        const period = f.period_end?.slice(0, 7) || 'unknown';
        aggregated[f.metric_code][period] = (aggregated[f.metric_code][period] || 0) + Number(f.value || 0);
      });

      if (Object.keys(aggregated).length > 0) {
        contentBlocks.push({
          type: 'text',
          content: '## Portfolio Impact Metrics\n\nAggregate metrics across all holdings:',
        });

        for (const [metricCode, periodData] of Object.entries(aggregated)) {
          const chartData = Object.entries(periodData)
            .map(([period, value]) => ({ date: period, value }))
            .sort((a, b) => a.date.localeCompare(b.date));

          if (chartData.length >= 2) {
            contentBlocks.push({
              type: 'chart',
              widget: {
                id: crypto.randomUUID(),
                type: 'd3_json',
                title: metricCode,
                config: {
                  d3: {
                    kind: 'bar',
                    data: chartData,
                    encoding: { x: 'date', y: 'value' },
                    options: {
                      xAxisLabel: 'Period',
                      yAxisLabel: 'Value',
                      colors: [palette[chartIndex % palette.length]],
                    },
                  },
                },
              },
            });
            chartIndex++;
          }
        }
      }
    }

  } else if (reportScope === 'sector') {
    if (!sector) {
      return NextResponse.json({ error: 'sector is required for sector scope' }, { status: 400, headers: cacheHeaders() });
    }

    const { data: holdings } = await sb
      .from('holdings')
      .select('id, name, status, funds_allocated')
      .eq('portfolio_id', portfolio_id)
      .ilike('sector', `%${sector}%`);

    const holdingsList = holdings || [];

    if (holdingsList.length === 0) {
      contentBlocks.push({
        type: 'text',
        content: `# ${title || sector + ' Sector Report'}\n\nNo holdings found in the ${sector} sector.`,
      });
    } else {
      const totalAllocated = holdingsList.reduce((s, h: any) => s + (h.funds_allocated || 0), 0);

      contentBlocks.push({
        type: 'text',
        content: `# ${title || sector + ' Sector Report'}\n\n## Overview\n\n**${holdingsList.length} holdings** in the ${sector} sector, with total allocation of **$${totalAllocated.toLocaleString()}**.`,
      });
    }
  }

  // Optionally save the document
  let savedDocument = null;
  if (save_document) {
    const reportTitle = title || templateName || `${reportScope.charAt(0).toUpperCase() + reportScope.slice(1)} Report`;

    const { data: doc, error: docErr } = await sb
      .from('generated_documents')
      .insert({
        portfolio_id,
        template_id: template_id || null,
        title: reportTitle,
        document_type: 'report',
        format: 'html',
        scope: reportScope,
        content: { content_blocks: contentBlocks },
        config: {
          metric_codes: reportMetrics,
          chart_preferences: reportChartPrefs,
          include_sections: reportSections,
          time_range: reportTimeRange,
        },
        holding_id: holding_id || null,
        sector: sector || null,
        generated_by: user?.id,
        status: 'generated',
      })
      .select()
      .single();

    if (!docErr) {
      savedDocument = doc;
    }
  }

  return NextResponse.json({
    report: {
      title: title || templateName || 'Report',
      scope: reportScope,
      content_blocks: contentBlocks,
      time_range: reportTimeRange,
      generated_at: new Date().toISOString(),
    },
    document: savedDocument,
  }, { headers: cacheHeaders() });
}
