import type { AssistantToolExecutor } from '../../executor-types';
import { InputValidator } from '../../helpers';

export const executeSearchSimilarCharities: AssistantToolExecutor = async (
  runtime,
) => {
  const { db: supabase, args, portfolioId } = runtime;
  {
    InputValidator.validateUUID(args.holding_id, 'holding_id');

    const { data: holding, error: holdingError } = await supabase
      .from('holdings')
      .select('name, sector, country, funds_allocated')
      .eq('id', args.holding_id)
      .eq('portfolio_id', portfolioId)
      .single();

    if (holdingError)
      throw new Error(`Holding not found: ${holdingError.message}`);

    const sector = args.sector || holding?.sector;
    const limit = args.limit || 5;

    // Search for similar charities in the charities table
    let query = supabase
      .from('charities')
      .select(
        'ein, name, city, state, ntee_code, total_revenue, charity_navigator_rating',
      )
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
};
