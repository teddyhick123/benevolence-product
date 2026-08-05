import type { AssistantToolExecutor } from '../../executor-types';
import { InputValidator } from '../../helpers';

export const executeGetStateRegistrationStatus: AssistantToolExecutor = async (
  runtime,
) => {
  const { db: supabase, args } = runtime;
  {
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
    if (error)
      throw new Error(`Error fetching state registrations: ${error.message}`);

    const registrations = data || [];
    const summary = {
      total: registrations.length,
      active: registrations.filter((r: any) => r.status === 'active').length,
      renewal_due: registrations.filter((r: any) => r.status === 'renewal_due')
        .length,
      expired: registrations.filter((r: any) => r.status === 'expired').length,
      exempt: registrations.filter((r: any) => r.status === 'exempt').length,
      not_registered: registrations.filter(
        (r: any) => r.status === 'not_registered',
      ).length,
    };

    return {
      action: null,
      output: { registrations, summary },
    };
  }
};
