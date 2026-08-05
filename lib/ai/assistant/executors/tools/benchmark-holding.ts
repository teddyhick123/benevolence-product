import type { AssistantToolExecutor } from '../../executor-types';
import { InputValidator } from '../../helpers';

export const executeBenchmarkHolding: AssistantToolExecutor = async (
  runtime,
) => {
  const { db: supabase, args, portfolioId } = runtime;
  {
    InputValidator.validateUUID(args.holding_id, 'holding_id');

    const { data: holding, error } = await supabase
      .from('holdings')
      .select('name, sector, country, funds_allocated')
      .eq('id', args.holding_id)
      .eq('portfolio_id', portfolioId)
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

    const percentile =
      allValues.length > 1
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
            peer_average:
              peerValues.length > 0
                ? peerValues.reduce((a: number, b: number) => a + b, 0) /
                  peerValues.length
                : null,
            peer_median:
              peerValues.length > 0
                ? peerValues[Math.floor(peerValues.length / 2)]
                : null,
          },
        },
      },
    };
  }
};
