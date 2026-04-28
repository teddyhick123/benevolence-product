// app/api/admin/import/ai/suggest/route.ts
// POST /api/admin/import/ai/suggest
// Body: { import_job_id, staging_table, staging_row_ids: string[] }
// For each row: fetch raw_data + validation_errors, call AI, store in import_ai_suggestions, return suggestions

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { suggestRowFixes } from '@/lib/import/ai/validate-row';
import type { AISuggestion } from '@/lib/import/ai/validate-row';

interface SuggestRequestBody {
  import_job_id?: string;
  staging_table?: string;
  staging_row_ids?: string[];
}

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

export async function POST(req: Request) {
  try {
    const body = await req.json() as SuggestRequestBody;
    const { import_job_id, staging_table, staging_row_ids } = body;

    if (!import_job_id || !staging_table || !staging_row_ids?.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = await createServerClient();

    // Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch the requested rows
    const { data: rows, error: fetchError } = await supabase
      .from(staging_table)
      .select('id, raw_data, transformed_data, validation_errors')
      .in('id', staging_row_ids)
      .eq('import_job_id', import_job_id);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({ suggestions: [] });
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
        const { error: upsertError } = await supabase.from('import_ai_suggestions').upsert({
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

    return NextResponse.json({ suggestions: results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ai/suggest] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
