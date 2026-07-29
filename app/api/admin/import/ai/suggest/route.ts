// app/api/admin/import/ai/suggest/route.ts
// POST /api/admin/import/ai/suggest
// Body: { import_job_id, staging_table, staging_row_ids: string[] }
// For each row: fetch raw_data + validation_errors, call AI, store in import_ai_suggestions, return suggestions

import { z } from 'zod';
import { requireAppAdmin } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { suggestRowFixes } from '@/lib/import/ai/validate-row';
import type { AISuggestion } from '@/lib/import/ai/validate-row';
import { aiLimiter } from '@/lib/rate-limit';
import { rateLimitExceeded } from '@/lib/rate-limit-response';

interface StagingRow {
  id: string;
  raw_data: Record<string, string>;
  transformed_data: Record<string, unknown> | null;
  validation_errors: Array<{
    field: string;
    message: string;
    severity: string;
    rule: string;
  }> | null;
}

const ALLOWED_STAGING_TABLES = [
  'staging_import_donors',
  'staging_import_holdings',
  'staging_import_investees',
  'staging_import_contributions',
  'staging_import_metrics',
] as const;

const suggestSchema = z.object({
  import_job_id: z.string().uuid(),
  staging_table: z.enum(ALLOWED_STAGING_TABLES),
  staging_row_ids: z.array(z.string().uuid()).min(1).max(100),
}).strict();

export async function POST(req: Request) {
  try {
    const access = await requireAppAdmin();
    if (!access.ok) return access.response;

    const { success, reset, remaining, limit } = await aiLimiter.limit(access.context.user.id);
    if (!success) return rateLimitExceeded(reset, remaining, limit);

    const parsed = suggestSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return jsonError('Validation failed', 400, { details: parsed.error.format() });
    const { import_job_id, staging_table, staging_row_ids } = parsed.data;
    const { db } = access.context;

    // Fetch the requested rows
    const { data: rows, error: fetchError } = await db
      .from(staging_table)
      .select('id, raw_data, transformed_data, validation_errors')
      .in('id', staging_row_ids)
      .eq('import_job_id', import_job_id);

    if (fetchError) {
      return jsonError(fetchError.message, 500);
    }

    if (!rows || rows.length === 0) {
      return jsonOk({ suggestions: [] });
    }

    // Derive entity type from staging table name
    const entityType = staging_table.replace('staging_import_', '');

    const results: Array<{
      row_id: string;
      suggestions: AISuggestion[];
    }> = [];

    for (const row of rows as StagingRow[]) {
      if (!row.validation_errors?.length) continue;

      let suggestions: AISuggestion[] = [];
      try {
        suggestions = await suggestRowFixes({
          entityType,
          rawData: row.raw_data,
          transformedData: row.transformed_data,
          validationErrors: row.validation_errors,
        });
      } catch (err) {
        console.error(`[ai/suggest] Row ${row.id} AI error:`, err);
        continue;
      }

      // Store in import_ai_suggestions
      for (const s of suggestions) {
        const { error: upsertError } = await db.from('import_ai_suggestions').upsert({
          import_job_id,
          staging_table,
          staging_row_id: row.id,
          field: s.field,
          suggestion_type: s.suggestion_type,
          confidence: s.confidence,
          explanation: s.explanation,
          proposed_value: s.proposed_value,
          auto_fixable: s.auto_fixable,
          bulk_applicable: s.bulk_applicable ?? false,
          bulk_condition: s.bulk_condition ?? null,
          status: 'pending',
        }, {
          onConflict: 'staging_row_id,field',
        });
        if (upsertError) {
          console.error(`[ai/suggest] Failed to save suggestion for row ${row.id} field ${s.field}:`, upsertError);
        }
      }

      results.push({ row_id: row.id, suggestions });
    }

    return jsonOk({ suggestions: results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ai/suggest] Error:', message);
    return jsonError(message, 500);
  }
}
