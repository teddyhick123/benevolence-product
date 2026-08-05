import { executeAddMetricFact } from '../tools/add-metric-fact';
import { executeCreateWidget } from '../tools/create-widget';
import { executeAddLocation } from '../tools/add-location';
import { executeGetMetricTrend } from '../tools/get-metric-trend';
import { executeCompareHoldings } from '../tools/compare-holdings';
import { executeListWidgets } from '../tools/list-widgets';
import { executeDisplayWidget } from '../tools/display-widget';
import { executeCreatePortfolioWidget } from '../tools/create-portfolio-widget';
import { executeGetChartData } from '../tools/get-chart-data';
import { executeGenerateD3Chart } from '../tools/generate-d3-chart';
import type { AssistantToolExecutorRegistry } from '../../executor-types';

export const IMPACT_EXECUTORS = {
  add_metric_fact: executeAddMetricFact,
  create_widget: executeCreateWidget,
  add_location: executeAddLocation,
  get_metric_trend: executeGetMetricTrend,
  compare_holdings: executeCompareHoldings,
  list_widgets: executeListWidgets,
  display_widget: executeDisplayWidget,
  create_portfolio_widget: executeCreatePortfolioWidget,
  get_chart_data: executeGetChartData,
  generate_d3_chart: executeGenerateD3Chart,
} satisfies AssistantToolExecutorRegistry;
