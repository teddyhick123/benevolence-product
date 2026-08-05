import type { AssistantToolExecutor } from '../../executor-types';
import {
  CANONICAL_GIFT_TYPES,
  InputValidator,
  ValidationError,
  normalizeGiftType,
} from '../../helpers';

export const executeLogContributionReceived: AssistantToolExecutor = async (
  runtime,
) => {
  const { db: supabase, args } = runtime;
  {
    InputValidator.validateUUID(args.organization_id, 'organization_id');
    InputValidator.validateNumber(args.amount, 'amount', { min: 0.01 });
    if (args.donor_id) InputValidator.validateUUID(args.donor_id, 'donor_id');
    if (args.contribution_date)
      InputValidator.validateDateString(
        args.contribution_date,
        'contribution_date',
      );
    if (args.gift_type) {
      InputValidator.validateEnum(
        args.gift_type,
        'gift_type',
        CANONICAL_GIFT_TYPES,
      );
    }
    if (args.contribution_type) {
      InputValidator.validateEnum(args.contribution_type, 'contribution_type', [
        'cash',
        'check',
        'credit_card',
        'wire',
        'ach',
        'stock',
        'crypto',
        'real_estate',
        'in_kind',
        'other',
      ] as const);
    }
    if (args.donor_type) {
      InputValidator.validateEnum(args.donor_type, 'donor_type', [
        'individual',
        'foundation',
        'corporation',
        'government',
        'other',
      ] as const);
    }

    let donorId = args.donor_id;

    // Auto-create donor if not provided but name given
    if (!donorId && args.donor_name) {
      const donorType = args.donor_type || 'individual';
      const isOrg = ['foundation', 'corporation', 'government'].includes(
        donorType,
      );

      // Parse name for individuals
      let firstName = null;
      let lastName = null;
      let orgName = null;

      if (isOrg) {
        orgName = args.donor_name;
      } else {
        const nameParts = args.donor_name.trim().split(/\s+/);
        if (nameParts.length >= 2) {
          firstName = nameParts.slice(0, -1).join(' ');
          lastName = nameParts[nameParts.length - 1];
        } else {
          firstName = args.donor_name;
        }
      }

      // Check for existing donor by email or name
      let existingDonor = null;
      if (args.donor_email) {
        const { data } = await supabase
          .from('donors')
          .select('id')
          .eq('org_id', args.organization_id)
          .eq('email', args.donor_email)
          .maybeSingle();
        existingDonor = data;
      }

      if (!existingDonor && !isOrg && lastName) {
        const { data } = await supabase
          .from('donors')
          .select('id')
          .eq('org_id', args.organization_id)
          .eq('first_name', firstName)
          .eq('last_name', lastName)
          .maybeSingle();
        existingDonor = data;
      }

      if (!existingDonor && isOrg && orgName) {
        const { data } = await supabase
          .from('donors')
          .select('id')
          .eq('org_id', args.organization_id)
          .eq('organization_name', orgName)
          .maybeSingle();
        existingDonor = data;
      }

      if (existingDonor) {
        donorId = existingDonor.id;
      } else {
        // Create new donor
        const { data: newDonor, error: donorError } = await supabase
          .from('donors')
          .insert({
            org_id: args.organization_id,
            is_organization: isOrg,
            first_name: firstName,
            last_name: lastName,
            organization_name: orgName,
            email: args.donor_email || null,
          })
          .select('id')
          .single();

        if (donorError)
          throw new Error(`Error creating donor: ${donorError.message}`);
        donorId = newDonor.id;
      }
    }

    if (!donorId) {
      throw new ValidationError(
        'Either donor_id or donor_name is required to log a contribution',
      );
    }

    const giftType = normalizeGiftType(
      args.gift_type || args.contribution_type,
    );

    // Create the contribution
    const { data: contribution, error: contribError } = await supabase
      .from('contributions_received')
      .insert({
        org_id: args.organization_id,
        donor_id: donorId,
        amount: args.amount,
        contribution_date:
          args.contribution_date || new Date().toISOString().split('T')[0],
        gift_type: giftType,
        fund_designation: args.designation || null,
        is_restricted: args.is_restricted || false,
        quid_pro_quo_value: args.quid_pro_quo_value || 0,
        campaign: args.campaign || null,
        notes: args.notes || null,
      })
      .select(
        '*, donors(first_name, last_name, organization_name, is_organization)',
      )
      .single();

    if (contribError)
      throw new Error(`Error creating contribution: ${contribError.message}`);

    // Auto-generate receipt for contributions >= $250
    let receiptGenerated = false;
    if (args.auto_generate_receipt && args.amount >= 250) {
      const receiptNumber = await supabase.rpc('generate_receipt_number', {
        p_org_id: args.organization_id,
      });

      if (receiptNumber.data) {
        await supabase
          .from('contributions_received')
          .update({
            receipt_number: receiptNumber.data,
            receipt_status: 'generated',
            receipt_generated_at: new Date().toISOString(),
          })
          .eq('id', contribution.id);
        receiptGenerated = true;
      }
    }

    // Build donor display name
    const donor = contribution.donors;
    const donorName = donor
      ? !donor.is_organization
        ? `${donor.first_name || ''} ${donor.last_name || ''}`.trim()
        : donor.organization_name
      : 'Anonymous';

    return {
      action: null,
      output: {
        success: true,
        contribution_id: contribution.id,
        amount: args.amount,
        donor_id: donorId,
        donor_name: donorName,
        donor_created: !args.donor_id && donorId ? true : false,
        receipt_generated: receiptGenerated,
        message: `Logged $${args.amount.toLocaleString()} contribution from ${donorName}${receiptGenerated ? ' (receipt generated)' : ''}`,
      },
    };
  }
};
