import type { AssistantToolExecutor } from '../../executor-types';
import { InputValidator } from '../../helpers';

export const executeGenerateAcknowledgment: AssistantToolExecutor = async (
  runtime,
) => {
  const { db: supabase, args, userId } = runtime;
  {
    InputValidator.validateUUID(args.organization_id, 'organization_id');
    InputValidator.validateUUID(args.donor_id, 'donor_id');
    if (args.contribution_id)
      InputValidator.validateUUID(args.contribution_id, 'contribution_id');
    if (args.letter_type) {
      InputValidator.validateEnum(args.letter_type, 'letter_type', [
        'thank_you',
        'annual_summary',
        'welcome',
        'custom',
      ] as const);
    }
    if (args.send_via) {
      InputValidator.validateEnum(args.send_via, 'send_via', [
        'email',
        'mail',
        'both',
      ] as const);
    }

    // Get donor info
    const { data: donor, error: donorError } = await supabase
      .from('donors')
      .select('*')
      .eq('id', args.donor_id)
      .single();

    if (donorError) throw new Error(`Donor not found: ${donorError.message}`);

    // Get organization info
    const { data: org } = await supabase
      .from('organizations')
      .select('name, ein')
      .eq('id', args.organization_id)
      .single();

    const donorName = !donor.is_organization
      ? `${donor.first_name || ''} ${donor.last_name || ''}`.trim()
      : donor.organization_name;

    const letterType = args.letter_type || 'thank_you';
    let subject = '';
    let body = '';

    if (letterType === 'thank_you') {
      // Get contribution if specified
      let contributionInfo = '';
      if (args.contribution_id) {
        const { data: contrib } = await supabase
          .from('contributions_received')
          .select('amount, contribution_date')
          .eq('id', args.contribution_id)
          .single();

        if (contrib) {
          contributionInfo = `\n\nYour recent gift of $${contrib.amount.toLocaleString()} on ${new Date(contrib.contribution_date).toLocaleDateString()} will make a real difference in our work.`;
        }
      }

      subject = `Thank You for Your Generous Support`;
      body = `Dear ${donorName},
  
  Thank you so much for your generous support of ${org?.name || 'our organization'}!${contributionInfo}
  
  ${args.custom_message || 'Your contribution helps us continue our important work in the community.'}
  
  We are deeply grateful for donors like you who make our mission possible.
  
  With sincere thanks,
  ${org?.name || 'The Organization'}`;
    } else if (letterType === 'annual_summary') {
      const currentYear = new Date().getFullYear();
      const { data: yearContribs } = await supabase
        .from('contributions_received')
        .select('amount, tax_deductible_amount')
        .eq('donor_id', args.donor_id)
        .gte('contribution_date', `${currentYear}-01-01`)
        .lte('contribution_date', `${currentYear}-12-31`);

      const contribs = yearContribs || [];
      const totalContributions = contribs.reduce(
        (s: number, c: any) => s + (c.amount || 0),
        0,
      );
      const totalTaxDeductible = contribs.reduce(
        (s: number, c: any) => s + (c.tax_deductible_amount ?? c.amount ?? 0),
        0,
      );

      subject = `Your ${currentYear} Giving Summary`;
      body = `Dear ${donorName},
  
  Thank you for your incredible generosity this year!
  
  Your ${currentYear} Giving Summary:
  - Total Contributions: $${totalContributions.toLocaleString()}
  - Number of Gifts: ${contribs.length}
  - Total Tax-Deductible: $${totalTaxDeductible.toLocaleString()}
  
  ${args.custom_message || 'Your support has made a tremendous impact on our mission.'}
  
  ${org?.ein ? `Organization EIN: ${org.ein}` : ''}
  
  With gratitude,
  ${org?.name || 'The Organization'}`;
    } else if (letterType === 'welcome') {
      subject = `Welcome to ${org?.name || 'Our Organization'}`;
      body = `Dear ${donorName},
  
  Welcome to the ${org?.name || 'our organization'} family!
  
  Thank you for your first gift to our organization. We are thrilled to have you as a supporter.
  
  ${args.custom_message || 'Your generosity will help us continue our important work.'}
  
  We look forward to keeping you updated on the impact of your support.
  
  Warmly,
  ${org?.name || 'The Organization'}`;
    } else {
      subject =
        args.custom_message?.substring(0, 50) ||
        'Message from ' + (org?.name || 'Our Organization');
      body = args.custom_message || '';
    }

    // Create the acknowledgment letter
    const { data: letter, error: letterError } = await supabase
      .from('acknowledgment_letters')
      .insert({
        org_id: args.organization_id,
        donor_id: args.donor_id,
        contribution_ids: args.contribution_id ? [args.contribution_id] : [],
        subject,
        body,
        status: 'draft',
        delivery_method: args.send_via || 'email',
        sent_by: userId,
        notes: `type=${letterType}`,
      })
      .select()
      .single();

    if (letterError)
      throw new Error(`Error creating letter: ${letterError.message}`);

    // Update donor acknowledgment status if contribution specified
    if (args.contribution_id) {
      await supabase
        .from('contributions_received')
        .update({ acknowledgment_sent: false })
        .eq('id', args.contribution_id);
    }

    return {
      action: null,
      output: {
        success: true,
        letter_id: letter.id,
        letter_type: letterType,
        donor_name: donorName,
        subject,
        status: 'draft',
        message: `${letterType.replace('_', ' ')} letter created for ${donorName}`,
      },
    };
  }
};
