import { z } from 'zod';

const toCents = (amount: number) => Math.round(amount * 100);

export const InstallmentInputSchema = z.object({
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'due_date must be YYYY-MM-DD'),
  amount: z.number().positive('amount must be positive'),
  notes: z.string().optional(),
});

export const CreatePledgeSchema = z.object({
  donor_id: z.string().uuid('donor_id must be a UUID'),
  total_amount: z.number().positive('total_amount must be positive'),
  currency: z.string().length(3).default('USD'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  frequency: z.enum(['one_time','monthly','quarterly','annually','custom']),
  commitment_type: z.enum(['verbal','written','online','imported']).default('written'),
  campaign: z.string().optional(),
  fund_designation: z.string().optional(),
  restriction_purpose: z.string().optional(),
  relationship_manager: z.string().uuid().optional(),
  signed_at: z.string().datetime().optional(),
  notes: z.string().optional(),
  installments: z.array(InstallmentInputSchema).min(1, 'at least one installment required'),
}).refine(
  data => data.installments.reduce((s, i) => s + toCents(i.amount), 0) === toCents(data.total_amount),
  { message: 'Installment amounts must sum to total_amount', path: ['installments'] }
);

export const PatchPledgeSchema = z.object({
  campaign: z.string().optional(),
  fund_designation: z.string().optional(),
  restriction_purpose: z.string().optional(),
  relationship_manager: z.string().uuid().optional(),
  commitment_type: z.enum(['verbal','written','online','imported']).optional(),
  signed_at: z.string().datetime().optional(),
  notes: z.string().optional(),
  custom_fields: z.record(z.unknown()).optional(),
});

export const CancelPledgeSchema = z.object({
  cancellation_reason: z.string().optional(),
  waive_pending: z.boolean().default(false),
});

export const PatchInstallmentSchema = z.object({
  action: z.enum(['mark_paid','waive','write_off','reopen']),
  paid_at: z.string().datetime().optional(),
  payment_ref: z.string().optional(),
  contribution_id: z.string().uuid().optional(),
  create_contribution: z.boolean().optional(),
  notes: z.string().optional(),
});

export type CreatePledgeInput   = z.infer<typeof CreatePledgeSchema>;
export type PatchPledgeInput    = z.infer<typeof PatchPledgeSchema>;
export type CancelPledgeInput   = z.infer<typeof CancelPledgeSchema>;
export type PatchInstallmentInput = z.infer<typeof PatchInstallmentSchema>;
