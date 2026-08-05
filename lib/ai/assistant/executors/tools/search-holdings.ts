import type { AssistantToolExecutor } from '../../executor-types';
import { InputValidator, ValidationError } from '../../helpers';

export const executeSearchHoldings: AssistantToolExecutor = async (runtime) => {
  const { db: supabase, args, portfolioId } = runtime;
  {
    InputValidator.validateString(args.sector, 'sector', { maxLength: 200 });
    InputValidator.validateString(args.country, 'country', { maxLength: 100 });
    InputValidator.validateEnum(args.status, 'status', [
      'Active',
      'Exited',
      'Pipeline',
    ] as const);
    InputValidator.validateNumber(args.min_allocation, 'min_allocation', {
      min: 0,
      max: 1e12,
    });
    InputValidator.validateNumber(args.max_allocation, 'max_allocation', {
      min: 0,
      max: 1e12,
    });
    InputValidator.validateString(args.name_contains, 'name_contains', {
      maxLength: 200,
    });

    if (
      args.min_allocation !== undefined &&
      args.max_allocation !== undefined &&
      args.min_allocation > args.max_allocation
    ) {
      throw new ValidationError(
        'min_allocation cannot be greater than max_allocation',
      );
    }

    let query = supabase
      .from('holdings')
      .select('id, name, sector, country, status, funds_allocated, description')
      .eq('portfolio_id', portfolioId);

    if (args.sector) query = query.ilike('sector', `%${args.sector}%`);
    if (args.country) query = query.ilike('country', `%${args.country}%`);
    if (args.status) query = query.eq('status', args.status);
    if (args.min_allocation)
      query = query.gte('funds_allocated', args.min_allocation);
    if (args.max_allocation)
      query = query.lte('funds_allocated', args.max_allocation);
    if (args.name_contains)
      query = query.ilike('name', `%${args.name_contains}%`);

    const { data } = await query.order('funds_allocated', { ascending: false });

    return {
      action: null,
      output: {
        holdings: data || [],
        count: data?.length || 0,
        filters_applied: Object.keys(args).filter((k) => args[k] !== undefined),
      },
    };
  }
};
