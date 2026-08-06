// app/api/admin/imports/[id]/bulk-fix/route.ts
// POST /api/admin/imports/:id/bulk-fix
// Applies a named fix to all staging rows with that field error

import { z } from 'zod';
import { requireAppAdmin } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { parseFlexibleDate } from '@/lib/import/utils/date-parser';
import { fromImportRelation } from '@/lib/import/database';

type FixType = 'normalize_ein' | 'parse_date' | 'strip_currency' | 'map_gift_type';

const GIFT_TYPE_MAP: Record<string, string> = {
  paypal: 'cash',
  venmo: 'cash',
  online: 'cash',
  'online donation': 'cash',
  'credit card': 'cash',
  daf: 'other_property',
  'donor advised fund': 'other_property',
  'donor-advised fund': 'other_property',
  stock: 'publicly_traded_securities',
  stocks: 'publicly_traded_securities',
  securities: 'publicly_traded_securities',
  crypto: 'other_property',
  cryptocurrency: 'other_property',
  check: 'cash',
  wire: 'cash',
  'wire transfer': 'cash',
  ach: 'cash',
};

const STAGING_TABLE_MAP: Record<string, string> = {
  donors: 'staging_import_donors',
  holdings: 'staging_import_holdings',
  investees: 'staging_import_investees',
  contributions: 'staging_import_contributions',
  metrics: 'staging_import_metrics',
};

const bulkFixSchema = z.object({
  entity: z.enum(['donors', 'holdings', 'investees', 'contributions', 'metrics']),
  field: z.string().trim().min(1).max(200),
  fix: z.enum(['normalize_ein', 'parse_date', 'strip_currency', 'map_gift_type']),
}).strict();

function normalizeEIN(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 9) return null;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

function stripCurrency(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function mapGiftType(raw: string): string | null {
  const normalized = raw.trim().toLowerCase();
  return GIFT_TYPE_MAP[normalized] ?? null;
}

function applyFix(fix: FixType, field: string, row: Record<string, unknown>): unknown {
  const raw = String(row[field] ?? '');
  switch (fix) {
    case 'normalize_ein':
      return normalizeEIN(raw);
    case 'parse_date':
      return parseFlexibleDate(raw);
    case 'strip_currency':
      return stripCurrency(raw);
    case 'map_gift_type':
      return mapGiftType(raw);
    default:
      return null;
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireAppAdmin();
  if (!access.ok) return access.response;

  const { id: importJobId } = await params;
  const parsed = bulkFixSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('Validation failed', 400, { details: parsed.error.format() });
  const { entity, field, fix } = parsed.data;

  const stagingTable = STAGING_TABLE_MAP[entity];
  const { db } = access.context;

  // Fetch all invalid rows for this job+entity (no hard cap)
  const { data: rows, error: fetchError } = await fromImportRelation(db, stagingTable)
    .select('id, transformed_data, validation_errors, validation_status')
    .eq('import_job_id', importJobId)
    .in('validation_status', ['invalid', 'warning']);

  if (fetchError) {
    return jsonError(fetchError.message, 500);
  }

  const total = (rows ?? []).length;
  let fixed = 0;
  let still_failing = 0;
  const now = new Date().toISOString();
  const updates: Array<{
    id: string;
    transformed_data: Record<string, unknown>;
    validation_errors: Array<{ field: string }>;
    validation_status: string;
    updated_at: string;
  }> = [];

  for (const row of rows ?? []) {
    const errors = (row.validation_errors as Array<{ field: string }> | null) ?? [];
    const hasFieldError = errors.some((e) => e.field === field);
    if (!hasFieldError) continue;

    const transformed = (row.transformed_data as Record<string, unknown>) ?? {};
    const fixedValue = applyFix(fix, field, transformed);

    if (fixedValue === null) {
      still_failing++;
      continue;
    }

    const updatedTransformed = { ...transformed, [field]: fixedValue };
    const remainingErrors = errors.filter((e) => e.field !== field);
    const newStatus = remainingErrors.length === 0 ? 'valid' : row.validation_status;

    updates.push({
      id: row.id,
      transformed_data: updatedTransformed,
      validation_errors: remainingErrors,
      validation_status: newStatus,
      updated_at: now,
    });
    fixed++;
  }

  // Bulk upsert in chunks of 500
  const chunkSize = 500;
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    const { error: upsertError } = await fromImportRelation(db, stagingTable)
      .upsert(chunk, { onConflict: 'id' });
    if (upsertError) {
      return jsonError(upsertError.message, 500);
    }
  }

  return jsonOk({ total, fixed, still_failing });
}
