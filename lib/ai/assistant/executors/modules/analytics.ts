import { executeProjectMetricTrend } from '../tools/project-metric-trend';
import { executeBenchmarkHolding } from '../tools/benchmark-holding';
import { executeAnalyzePortfolioRisk } from '../tools/analyze-portfolio-risk';
import type { AssistantToolExecutorRegistry } from '../../executor-types';

export const ANALYTICS_EXECUTORS = {
  project_metric_trend: executeProjectMetricTrend,
  benchmark_holding: executeBenchmarkHolding,
  analyze_portfolio_risk: executeAnalyzePortfolioRisk,
} satisfies AssistantToolExecutorRegistry;
