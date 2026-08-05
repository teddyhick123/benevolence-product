import type { AssistantToolExecutor } from '../../executor-types';
import { InputValidator, donorDisplayName } from '../../helpers';

export const executeSearchDonors: AssistantToolExecutor = async (runtime) => {
  const { db: supabase, args } = runtime;
  {
    InputValidator.validateUUID(args.organization_id, 'organization_id');
    if (args.donor_type) {
      InputValidator.validateEnum(args.donor_type, 'donor_type', [
        'individual',
        'foundation',
        'corporation',
        'government',
        'other',
      ] as const);
    }
    if (args.donor_tier) {
      InputValidator.validateEnum(args.donor_tier, 'donor_tier', [
        'major',
        'mid',
        'recurring',
        'annual',
        'lapsed',
        'prospect',
      ] as const);
    }
    if (args.recency_status) {
      InputValidator.validateEnum(args.recency_status, 'recency_status', [
        'active',
        'lapsed',
        'lost',
      ] as const);
    }
    if (args.min_lifetime_giving) {
      InputValidator.validateNumber(
        args.min_lifetime_giving,
        'min_lifetime_giving',
        { min: 0 },
      );
    }

    const limit = Math.min(args.limit || 50, 100);

    // Use the view for computed fields
    let query = supabase
      .from('v_donor_summary')
      .select('*')
      .eq('org_id', args.organization_id);

    // Apply filters
    if (args.name) {
      query = query.ilike('display_name', `%${args.name}%`);
    }
    if (args.email) {
      query = query.ilike('email', `%${args.email}%`);
    }
    if (args.donor_type) {
      query = query.eq('is_organization', args.donor_type !== 'individual');
    }
    if (args.donor_tier) {
      query = query.eq('computed_tier', args.donor_tier);
    }
    if (args.recency_status) {
      query = query.eq('recency_status', args.recency_status);
    }
    if (args.min_lifetime_giving) {
      query = query.gte('total_lifetime_giving', args.min_lifetime_giving);
    }
    if (args.has_pending_acknowledgments) {
      query = query.eq('has_pending_acknowledgments', true);
    }

    const { data: donorRows, error } = await query
      .order('total_lifetime_giving', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Error searching donors: ${error.message}`);

    let donors = donorRows || [];
    const donorIds = donors.map((d: any) => d.id).filter(Boolean);
    const pendingReceiptIds = new Set<string>();
    if (donorIds.length > 0) {
      const { data: pendingReceiptRows } = await supabase
        .from('contributions_received')
        .select('donor_id')
        .in('donor_id', donorIds)
        .neq('receipt_status', 'sent');
      for (const row of pendingReceiptRows || []) {
        pendingReceiptIds.add(row.donor_id);
      }
    }
    if (args.has_pending_receipts) {
      donors = donors.filter((d: any) => pendingReceiptIds.has(d.id));
    }

    return {
      action: null,
      output: {
        donors: (donors || []).map((d: any) => ({
          donor_id: d.id,
          name: donorDisplayName(d),
          email: d.email,
          type: d.is_organization ? 'organization' : 'individual',
          tier: d.computed_tier ?? d.tier,
          status: d.recency_status,
          total_lifetime_giving: d.total_lifetime_giving,
          total_ytd_giving: null,
          gift_count: d.gift_count,
          last_gift_date: d.last_gift_date,
          has_pending_receipts: pendingReceiptIds.has(d.id),
          has_pending_acknowledgments: d.has_pending_acknowledgments,
        })),
        count: donors?.length || 0,
        filters_applied: Object.keys(args).filter(
          (k) =>
            k !== 'organization_id' && k !== 'limit' && args[k] !== undefined,
        ),
      },
    };
  }
};
