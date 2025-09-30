import dynamic from 'next/dynamic';

export const widgetRegistry: Record<string, any> = {
  kpi_trend: dynamic(() => import('./KpiTrend')),
  emissions_bar: dynamic(() => import('./SectorEmissionsBar')),
  d3_json: dynamic(() => import('./D3JsonWidget'), { ssr: false }),
};