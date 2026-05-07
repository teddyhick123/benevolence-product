import dynamic from 'next/dynamic';

export const widgetRegistry: Record<string, any> = {
  kpi_trend: dynamic(() => import('./KpiTrend')),
  radial_progress: dynamic(() => import('./RadialProgress')),
  emissions_bar: dynamic(() => import('./SectorEmissionsBar')),
  d3_json: dynamic(() => import('./D3JsonWidget'), { ssr: false }),
  holdings_pie_auto: dynamic(() => import('./HoldingsPieWidget'), { ssr: false }),
  people_grid_auto: dynamic(() => import('./PeopleGridWidget'), { ssr: false }),
  small_multiples: dynamic(() => import('./SmallMultiples')),
  performance_heat_map: dynamic(() => import('./PerformanceHeatMap')),
  holdings_comparison_table: dynamic(() => import('./HoldingsComparisonTable')),
  impact_timeline: dynamic(() => import('./ImpactTimeline')),
  waterfall_chart: dynamic(() => import('./WaterfallChart')),
  impact_bubble_chart: dynamic(() => import('./ImpactBubbleChart')),
};
