import type { AssistantToolExecutor } from '../../executor-types';
import { InputValidator, daysSince, donorDisplayName } from '../../helpers';

export const executeGetDonorSummary: AssistantToolExecutor = async (
  runtime,
) => {
  const { db: supabase, args } = runtime;
  {
    InputValidator.validateUUID(args.donor_id, 'donor_id');

    // Get donor details
    const { data: donor, error: donorError } = await supabase
      .from('v_donor_summary')
      .select('*')
      .eq('id', args.donor_id)
      .single();

    if (donorError) throw new Error(`Donor not found: ${donorError.message}`);

    const { data: donorContributions } = await supabase
      .from('contributions_received')
      .select(
        'id, contribution_date, amount, gift_type, fund_designation, receipt_status, acknowledgment_sent, tax_deductible_amount',
      )
      .eq('donor_id', args.donor_id)
      .order('contribution_date', { ascending: false });

    const contributionsForStats = donorContributions || [];
    const currentYear = new Date().getFullYear();
    const ytdStart = `${currentYear}-01-01`;
    const ytdContributions = contributionsForStats.filter(
      (c: any) => c.contribution_date >= ytdStart,
    );
    const totalYtdGiving = ytdContributions.reduce(
      (sum: number, c: any) => sum + Number(c.amount || 0),
      0,
    );
    const giftCount = donor.gift_count ?? contributionsForStats.length;
    const averageGift =
      giftCount > 0 ? Number(donor.lifetime_giving || 0) / giftCount : 0;
    const hasPendingReceipts = contributionsForStats.some(
      (c: any) => (c.receipt_status || 'pending') !== 'sent',
    );
    const hasPendingAcknowledgments =
      donor.has_pending_acknowledgments ??
      contributionsForStats.some((c: any) => c.acknowledgment_sent === false);

    const result: any = {
      donor: {
        id: donor.id,
        name: donorDisplayName(donor),
        email: donor.email,
        type: donor.is_organization ? 'organization' : 'individual',
        tier: donor.computed_tier ?? donor.tier,
        status: donor.recency_status,
      },
      giving_stats: {
        total_lifetime: donor.total_lifetime_giving ?? donor.lifetime_giving,
        total_ytd: totalYtdGiving,
        gift_count: giftCount,
        largest_gift: donor.largest_gift,
        average_gift: averageGift,
        first_gift_date: donor.first_gift_date,
        last_gift_date: donor.last_gift_date,
        days_since_last_gift: daysSince(donor.last_gift_date),
      },
      pending_items: {
        has_pending_receipts: hasPendingReceipts,
        has_pending_acknowledgments: hasPendingAcknowledgments,
      },
    };

    // Include contributions if requested
    if (args.include_contributions !== false) {
      const contributions = args.year
        ? contributionsForStats.filter(
            (c: any) =>
              c.contribution_date >= `${args.year}-01-01` &&
              c.contribution_date <= `${args.year}-12-31`,
          )
        : contributionsForStats;
      result.contributions = contributions.slice(0, 50).map((c: any) => ({
        id: c.id,
        contribution_date: c.contribution_date,
        amount: c.amount,
        gift_type: c.gift_type,
        fund_designation: c.fund_designation,
        receipt_status: c.receipt_status,
        acknowledgment_sent: c.acknowledgment_sent,
      }));
    }

    return {
      action: null,
      output: result,
    };
  }
};
