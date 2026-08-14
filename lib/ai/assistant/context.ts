import type { SupabaseClient } from '@/lib/database-client';
import { loadOrgAiContext } from '@/lib/organizations/ai-context';
import { loadEntityVocabulary } from '@/lib/organizations/view-config';


export async function getPortfolioContext(supabase: SupabaseClient, portfolioId: string) {
    // Pre-fetch org_id so kpi_definitions can be fetched in the main parallel block
    const { data: portfolioMeta } = await supabase
      .from('portfolios')
      .select('org_id')
      .eq('id', portfolioId)
      .single();
    const contextOrgId = (portfolioMeta as { org_id?: string } | null)?.org_id ?? null;

    const [
      portfolio,
      holdings,
      kpiDefs,
      portfolioWidgets,
      metricFacts,
      recentActions
    ] = await Promise.all([
      supabase
        .from('portfolios')
        .select('id, name, description, org_id')
        .eq('id', portfolioId)
        .single(),
      supabase
        .from('holdings')
        .select('id, name, sector, country, status, funds_allocated, current_value, asset_type, description')
        .eq('portfolio_id', portfolioId)
        .order('funds_allocated', { ascending: false, nullsFirst: false }),
      contextOrgId
        ? supabase
            .from('kpi_definitions')
            .select('slug, name, unit, target_value')
            .eq('org_id', contextOrgId)
            .eq('is_active', true)
            .order('display_order', { ascending: true })
        : Promise.resolve({ data: [] as any[] }),
      supabase
        .from('widgets')
        .select('id, type, title, config')
        .eq('portfolio_id', portfolioId)
        .order('position', { ascending: true }),
      supabase
        .from('metric_facts')
        .select('metric_code, value, unit, period_end, holdings!inner(portfolio_id)')
        .eq('holdings.portfolio_id', portfolioId)
        .order('period_end', { ascending: false }),
      supabase
        .from('ai_actions')
        .select('action_type, entity_type, ai_reasoning, created_at')
        .eq('portfolio_id', portfolioId)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const holdingsData = holdings.data || [];
    const factsData = metricFacts.data || [];
    const kpiDefsData = (kpiDefs as any).data || [];

    const totalAUM = holdingsData.reduce((sum: number, h: any) => sum + (h.funds_allocated || 0), 0);
    const totalNAV = holdingsData.reduce((sum: number, h: any) => sum + (h.current_value || 0), 0);

    const sectorBreakdown: Record<string, { count: number; funds: number }> = {};
    holdingsData.forEach((h: any) => {
      const sector: string = h.sector || 'Unspecified';
      if (!sectorBreakdown[sector]) {
        sectorBreakdown[sector] = { count: 0, funds: 0 };
      }
      sectorBreakdown[sector].count++;
      sectorBreakdown[sector].funds += h.funds_allocated || 0;
    });

    const statusBreakdown: Record<string, number> = {};
    holdingsData.forEach((h: any) => {
      const status: string = h.status || 'Unknown';
      statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;
    });

    const kpiSnapshot: Array<{
      metricCode: string;
      displayName: string;
      latestValue: number | null;
      target: number | null;
      unit: string | null;
      percentComplete: number | null;
    }> = [];

    const latestByMetric: Record<string, { value: number; unit: string | null; period: string | null }> = {};
    const byMetricAndPeriod: Record<string, Record<string, { value: number; unit: string | null }>> = {};

    factsData.forEach((fact: any) => {
      const metricCode: string = fact.metric_code;
      const period: string = fact.period_end || 'unknown';

      if (!byMetricAndPeriod[metricCode]) {
        byMetricAndPeriod[metricCode] = {};
      }
      if (!byMetricAndPeriod[metricCode][period]) {
        byMetricAndPeriod[metricCode][period] = { value: 0, unit: fact.unit };
      }
      byMetricAndPeriod[metricCode][period].value += fact.value || 0;
    });

    Object.keys(byMetricAndPeriod).forEach((metricCode) => {
      const periods = Object.keys(byMetricAndPeriod[metricCode]).sort().reverse();
      const latestPeriod = periods[0];
      const latestData = byMetricAndPeriod[metricCode][latestPeriod];
      latestByMetric[metricCode] = {
        value: latestData.value,
        unit: latestData.unit,
        period: latestPeriod !== 'unknown' ? latestPeriod : null,
      };
    });

    kpiDefsData.forEach((kpi: any) => {
      const metricCode: string = kpi.slug;
      const latest = latestByMetric[metricCode];
      const latestValue = latest?.value ?? null;
      const target = kpi.target_value ?? null;

      kpiSnapshot.push({
        metricCode,
        displayName: kpi.name || metricCode,
        latestValue,
        target,
        unit: latest?.unit ?? kpi.unit ?? null,
        percentComplete: target && latestValue != null ? Math.round((latestValue / target) * 100) : null,
      });
    });

    Object.keys(latestByMetric).forEach((code: string) => {
      if (!kpiDefsData.some((kpi: any) => kpi.slug === code)) {
        kpiSnapshot.push({
          metricCode: code,
          displayName: code,
          latestValue: latestByMetric[code].value,
          target: null,
          unit: latestByMetric[code].unit,
          percentComplete: null,
        });
      }
    });

    const metricsWithData: Array<{
      code: string;
      displayName: string;
      latestValue: number;
      unit: string | null;
      dataPoints: number;
      latestPeriod: string | null;
      earliestPeriod: string | null;
    }> = [];

    const metricStats: Record<string, { count: number; periods: string[] }> = {};
    factsData.forEach((fact: any) => {
      const code = fact.metric_code;
      if (!metricStats[code]) {
        metricStats[code] = { count: 0, periods: [] };
      }
      metricStats[code].count++;
      if (fact.period_end && !metricStats[code].periods.includes(fact.period_end)) {
        metricStats[code].periods.push(fact.period_end);
      }
    });

    Object.keys(latestByMetric).forEach((code) => {
      const stats = metricStats[code] || { count: 0, periods: [] };
      const sortedPeriods = stats.periods.sort();
      const metricDef = kpiDefsData.find((k: any) => k.slug === code);

      metricsWithData.push({
        code,
        displayName: metricDef?.name || code,
        latestValue: latestByMetric[code].value,
        unit: latestByMetric[code].unit || metricDef?.unit || null,
        dataPoints: stats.count,
        latestPeriod: sortedPeriods.length > 0 ? sortedPeriods[sortedPeriods.length - 1] : null,
        earliestPeriod: sortedPeriods.length > 0 ? sortedPeriods[0] : null,
      });
    });

    metricsWithData.sort((a, b) => b.dataPoints - a.dataPoints);

    // Fetch org-level context if this portfolio belongs to an org
    let orgContext: {
      name: string;
      org_type: string;
      modules: Record<string, boolean>;
      otherPortfolioCount: number;
      otherPortfolioValue: number;
      donorCount: number | null;
      donorGivingThisYear: number | null;
      nextFiling: { description: string; due_date: string } | null;
      aiContext: any[];
      entityVocabulary: Record<string, { singular: string; plural: string }>;
    } | null = null;

    const orgId = (portfolio.data as any)?.org_id;
    if (orgId) {
      const currentYear = new Date().getFullYear();
      const [orgRow, otherPortfolios, donorStats, nextFiling, aiContext, entityVocabulary] = await Promise.all([
        supabase
          .from('organizations')
          .select('name, org_type, modules')
          .eq('id', orgId)
          .single(),
        supabase
          .from('portfolios')
          .select('id, name')
          .eq('org_id', orgId)
          .neq('id', portfolioId),
        supabase
          .from('donors')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId),
        supabase
          .from('filing_calendar')
          .select('description, due_date, filing_type')
          .eq('org_id', orgId)
          .eq('status', 'pending')
          .gte('due_date', new Date().toISOString().slice(0, 10))
          .order('due_date', { ascending: true })
          .limit(1),
        loadOrgAiContext(supabase, orgId, { activeOnly: true }).catch(() => []),
        loadEntityVocabulary(supabase, orgId).catch(() => ({})),
      ]);

      const modules: Record<string, boolean> = (orgRow.data as any)?.modules ?? {};

      // Sum AUM across other portfolios
      let otherPortfolioValue = 0;
      if (otherPortfolios.data && otherPortfolios.data.length > 0) {
        const otherIds = otherPortfolios.data.map((p: any) => p.id);
        const { data: otherHoldings } = await supabase
          .from('holdings')
          .select('funds_allocated')
          .in('portfolio_id', otherIds);
        otherPortfolioValue = (otherHoldings || []).reduce(
          (sum: number, h: any) => sum + (h.funds_allocated || 0), 0
        );
      }

      // Donor giving this year (from donor CRM contributions)
      let donorGivingThisYear: number | null = null;
      if (modules.donors) {
        const { data: givingData } = await supabase
          .from('contributions_received')
          .select('amount')
          .eq('org_id', orgId)
          .gte('contribution_date', `${currentYear}-01-01`)
          .lte('contribution_date', `${currentYear}-12-31`)
          .eq('is_pledge', false);
        if (givingData) {
          donorGivingThisYear = givingData.reduce((sum: number, r: any) => sum + (r.amount || 0), 0);
        }
      }

      orgContext = {
        name: (orgRow.data as any)?.name ?? 'Unknown Org',
        org_type: (orgRow.data as any)?.org_type ?? '',
        modules,
        otherPortfolioCount: otherPortfolios.data?.length ?? 0,
        otherPortfolioValue,
        donorCount: modules.donors ? (donorStats.count ?? 0) : null,
        donorGivingThisYear: modules.donors ? donorGivingThisYear : null,
        nextFiling: modules.compliance && nextFiling.data?.[0]
          ? {
              description: (nextFiling.data[0] as any).description
                || (nextFiling.data[0] as any).filing_type,
              due_date: (nextFiling.data[0] as any).due_date,
            }
          : null,
        aiContext,
        entityVocabulary,
      };
    }

    return {
      portfolio: portfolio.data,
      holdings: holdingsData,
      availableMetrics: kpiDefsData,
      metricsWithData,
      widgets: portfolioWidgets.data || [],
      summary: {
        totalHoldings: holdingsData.length,
        activeHoldings: statusBreakdown['Active'] || 0,
        totalAUM,
        totalNAV,
        sectorBreakdown,
        statusBreakdown,
      },
      kpiSnapshot,
      recentActions: recentActions.data || [],
      orgContext,
    };
  }
