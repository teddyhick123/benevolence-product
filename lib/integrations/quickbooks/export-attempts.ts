import type { createElevatedClient } from '@/lib/api/admin-client';

type AdminClient = ReturnType<typeof createElevatedClient>;

export interface QBExportAttemptInput {
  orgId: string;
  exportType: 'contribution' | 'grant';
  sourceTable: string;
  sourceId: string;
  docNumber: string;
  expectedAmount: number;
  debitAccountId: string;
  creditAccountId: string;
}

export type QBExportAttemptClaim =
  | { status: 'claimed'; attemptId: string }
  | { status: 'already_succeeded'; attemptId: string; qbJournalEntryId: string }
  | { status: 'in_flight'; attemptId: string };

function isUniqueViolation(error: any) {
  return error?.code === '23505' || String(error?.message ?? '').toLowerCase().includes('duplicate');
}

export async function claimQBExportAttempt(
  db: AdminClient,
  input: QBExportAttemptInput
): Promise<QBExportAttemptClaim> {
  const { data, error } = await db
    .from('qb_export_attempts')
    .insert({
      org_id: input.orgId,
      export_type: input.exportType,
      source_table: input.sourceTable,
      source_id: input.sourceId,
      doc_number: input.docNumber,
      expected_amount: input.expectedAmount,
      debit_account_id: input.debitAccountId,
      credit_account_id: input.creditAccountId,
      status: 'in_flight',
    })
    .select('id')
    .single();

  if (!error && data?.id) {
    return { status: 'claimed', attemptId: data.id };
  }

  if (!isUniqueViolation(error)) {
    throw error;
  }

  const { data: existing, error: existingError } = await db
    .from('qb_export_attempts')
    .select('id, status, qb_journal_entry_id')
    .eq('org_id', input.orgId)
    .eq('export_type', input.exportType)
    .eq('source_id', input.sourceId)
    .in('status', ['in_flight', 'succeeded'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing?.status === 'succeeded' && existing.qb_journal_entry_id) {
    return {
      status: 'already_succeeded',
      attemptId: existing.id,
      qbJournalEntryId: existing.qb_journal_entry_id,
    };
  }
  if (existing?.id) {
    return { status: 'in_flight', attemptId: existing.id };
  }

  throw error;
}

export async function completeQBExportAttempt(
  db: AdminClient,
  attemptId: string,
  qbJournalEntryId: string
) {
  const { error } = await db
    .from('qb_export_attempts')
    .update({
      status: 'succeeded',
      qb_journal_entry_id: qbJournalEntryId,
      error_msg: null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', attemptId);

  if (error) throw error;
}

export async function failQBExportAttempt(
  db: AdminClient,
  attemptId: string,
  errorMsg: string
) {
  const { error } = await db
    .from('qb_export_attempts')
    .update({
      status: 'failed',
      error_msg: errorMsg,
      completed_at: new Date().toISOString(),
    })
    .eq('id', attemptId);

  if (error) throw error;
}
