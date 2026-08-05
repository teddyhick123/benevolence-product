import type { AssistantToolExecutor } from '../../executor-types';
import { InputValidator } from '../../helpers';

export const executeTrackFilingDeadline: AssistantToolExecutor = async (
  runtime,
) => {
  const {
    db: supabase,
    args,
    portfolioId,
    userId,
    sessionId,
    batchId,
    sequenceOrder,
    userPrompt,
  } = runtime;
  {
    InputValidator.validateUUID(args.organization_id, 'organization_id');
    if (args.filing_id)
      InputValidator.validateUUID(args.filing_id, 'filing_id');
    if (args.due_date)
      InputValidator.validateDateString(args.due_date, 'due_date');
    if (args.extension_due_date)
      InputValidator.validateDateString(
        args.extension_due_date,
        'extension_due_date',
      );
    if (args.status) {
      InputValidator.validateEnum(args.status, 'status', [
        'upcoming',
        'in_progress',
        'filed',
        'extended',
        'overdue',
        'waived',
        'not_applicable',
      ] as const);
    }

    if (args.filing_id) {
      // Update existing
      const updateData: any = {};
      const fields = [
        'status',
        'filing_reference',
        'extension_due_date',
        'notes',
        'description',
        'completed_at',
      ];
      for (const f of fields) {
        if (args[f] !== undefined) updateData[f] = args[f];
      }
      if (args.status === 'filed') {
        updateData.completed_by = userId;
        if (!updateData.completed_at)
          updateData.completed_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('filing_calendar')
        .update(updateData)
        .eq('id', args.filing_id)
        .eq('org_id', args.organization_id)
        .select()
        .single();

      if (error) throw new Error(`Error updating filing: ${error.message}`);

      return {
        action: null,
        output: { success: true, action: 'updated', filing: data },
      };
    } else {
      // Create new
      if (!args.filing_type || !args.title || !args.due_date) {
        throw new Error(
          'filing_type, title, and due_date are required to create a new filing',
        );
      }

      const { data, error } = await supabase
        .from('filing_calendar')
        .insert({
          org_id: args.organization_id,
          filing_type: args.filing_type,
          title: args.title || args.filing_type,
          jurisdiction: args.jurisdiction || 'federal',
          description: args.description || null,
          due_date: args.due_date,
          extension_due_date: args.extension_due_date || null,
          status: args.status || 'upcoming',
        })
        .select()
        .single();

      if (error) throw new Error(`Error creating filing: ${error.message}`);

      return {
        action: {
          id: crypto.randomUUID(),
          sessionId,
          portfolioId,
          userId,
          actionType: 'create',
          entityType: 'compliance_filing' as any,
          entityId: data.id,
          operationData: { table: 'filing_calendar', after: data },
          aiReasoning: `Created ${data.filing_type} deadline for ${data.tax_year} due ${data.due_date}`,
          userPrompt,
          status: 'applied',
          batchId,
          sequenceOrder,
        },
        output: {
          success: true,
          action: 'created',
          filing: data,
          message: `${data.filing_type.replace(/_/g, '-').toUpperCase()} deadline added for tax year ${data.tax_year}, due ${data.due_date}`,
        },
      };
    }
  }
};
