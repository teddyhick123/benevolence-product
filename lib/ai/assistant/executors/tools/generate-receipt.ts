import type { AssistantToolExecutor } from '../../executor-types';
import { InputValidator } from '../../helpers';

export const executeGenerateReceipt: AssistantToolExecutor = async (
  runtime,
) => {
  const { db: supabase, args, userId } = runtime;
  {
    InputValidator.validateUUID(args.contribution_id, 'contribution_id');

    // Get contribution with donor and organization info
    const { data: contribution, error: contribError } = await supabase
      .from('contributions_received')
      .select(
        `
              *,
              donors(first_name, last_name, organization_name, is_organization, email, address_line1, city, state, zip),
              organizations(name, ein, website)
            `,
      )
      .eq('id', args.contribution_id)
      .single();

    if (contribError)
      throw new Error(`Contribution not found: ${contribError.message}`);

    const org = (contribution as any).organizations;
    const donor = (contribution as any).donors;

    // Generate receipt number if not already generated
    let receiptNumber = contribution.receipt_number;
    if (!receiptNumber) {
      const { data: newReceiptNum } = await supabase.rpc(
        'generate_receipt_number',
        {
          p_org_id: contribution.org_id,
        },
      );
      receiptNumber = newReceiptNum;
    }

    // Build goods/services statement
    const goodsServicesStatement =
      contribution.quid_pro_quo_value > 0
        ? `The estimated value of goods and services provided in exchange for this contribution was $${contribution.quid_pro_quo_value.toLocaleString()}. The tax-deductible portion is $${contribution.tax_deductible_amount.toLocaleString()}.`
        : 'No goods or services were provided in exchange for this contribution.';

    // Update contribution with receipt info
    const { error: updateError } = await supabase
      .from('contributions_received')
      .update({
        receipt_number: receiptNumber,
        receipt_status: 'generated',
        receipt_generated_at: new Date().toISOString(),
      })
      .eq('id', args.contribution_id);

    if (updateError)
      throw new Error(`Error updating contribution: ${updateError.message}`);

    // Create acknowledgment letter record for the receipt
    const donorName = donor
      ? !donor.is_organization
        ? `${donor.first_name || ''} ${donor.last_name || ''}`.trim()
        : donor.organization_name
      : 'Donor';

    const receiptBody = `Dear ${donorName},
  
  Thank you for your generous contribution to ${org?.name || 'our organization'}.
  
  This letter serves as your official receipt for tax purposes.
  
  Contribution Details:
  - Date: ${new Date(contribution.contribution_date).toLocaleDateString()}
  - Amount: $${contribution.amount.toLocaleString()}
  - Receipt Number: ${receiptNumber}
  
  ${goodsServicesStatement}
  
  ${org?.ein ? `Organization EIN: ${org.ein}` : ''}
  
  Thank you for your support!
  
  Sincerely,
  ${org?.name || 'The Organization'}`;

    const { data: letter } = await supabase
      .from('acknowledgment_letters')
      .insert({
        org_id: contribution.org_id,
        donor_id: contribution.donor_id,
        contribution_ids: [contribution.id],
        letter_type: 'receipt',
        subject: `Tax Receipt - ${receiptNumber}`,
        body: receiptBody,
        status: 'draft',
        delivery_method: 'email',
        sent_by: userId,
        notes: `Generated tax receipt. ${goodsServicesStatement}`,
      })
      .select()
      .single();

    // Send immediately if requested
    if (args.send_immediately && donor?.email) {
      await supabase
        .from('acknowledgment_letters')
        .update({
          status: 'sent',
          delivery_method: 'email',
          sent_at: new Date().toISOString(),
          sent_by: userId,
        })
        .eq('id', letter?.id);

      await supabase
        .from('contributions_received')
        .update({
          receipt_status: 'sent',
          receipt_sent_at: new Date().toISOString(),
          acknowledgment_sent: true,
          acknowledged_at: new Date().toISOString(),
        })
        .eq('id', args.contribution_id);
    }

    return {
      action: null,
      output: {
        success: true,
        receipt_number: receiptNumber,
        letter_id: letter?.id,
        amount: contribution.amount,
        tax_deductible_amount: contribution.tax_deductible_amount,
        donor_name: donorName,
        sent: args.send_immediately && donor?.email ? true : false,
        message: `Tax receipt ${receiptNumber} generated for $${contribution.amount.toLocaleString()}${args.send_immediately && donor?.email ? ' and sent to ' + donor.email : ''}`,
      },
    };
  }
};
