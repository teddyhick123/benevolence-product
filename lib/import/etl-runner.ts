// lib/import/etl-runner.ts
// Orchestrates the transform + validate phase for an import job

import type { DynamicImportClient as SupabaseClient } from '@/lib/database-client';
import type { MappingProfile, EntityType } from './types';
import { STAGING_TABLE_MAP } from './types';
import { applyFieldMapping, enrichTransformedRow, applyEnrichment } from './transformer';
import { validateTransformedRow } from './validator';
import type { EntityMappingConfig } from './validator';
import { ImportProgressEmitter } from './progress-emitter';
import { fromImportStagingRelation } from './database';

interface ETLRunResult {
  processed: number;
  valid: number;
  invalid: number;
  warnings: number;
}

export async function runTransformValidate(
  supabase: SupabaseClient,
  importJobId: string,
  mappingProfile: MappingProfile,
  options?: { entityTypes?: string[]; portfolioId?: string }
): Promise<ETLRunResult> {
  const BATCH_SIZE = 200;
  const result: ETLRunResult = { processed: 0, valid: 0, invalid: 0, warnings: 0 };

  const entityTypes = (options?.entityTypes ?? Object.keys(mappingProfile.entity_mappings)) as EntityType[];

  for (const entityType of entityTypes) {
    const stagingTable = STAGING_TABLE_MAP[entityType];
    if (!stagingTable) continue;

    const entityConfig = mappingProfile.entity_mappings[entityType];
    if (!entityConfig) continue;

    let lastId: string | null = null;
    let hasMore = true;
    let totalRows = 0;

    // Get total count for progress calculation
    const { count } = await fromImportStagingRelation(supabase, stagingTable)
      .select('*', { count: 'exact', head: true })
      .eq('import_job_id', importJobId)
      .eq('validation_status', 'pending');
    totalRows = count ?? 0;

    while (hasMore) {
      // Keyset pagination — avoids slow OFFSET on large tables
      let query = fromImportStagingRelation(supabase, stagingTable)
        .select('id, raw_data')
        .eq('import_job_id', importJobId)
        .eq('validation_status', 'pending')
        .order('id', { ascending: true })
        .limit(BATCH_SIZE);

      if (lastId !== null) {
        query = query.gt('id', lastId);
      }

      const { data: rows, error: fetchError } = await query;

      if (fetchError) {
        console.error(`[etl-runner] Error fetching ${stagingTable} rows:`, fetchError.message);
        break;
      }

      if (!rows || rows.length === 0) {
        hasMore = false;
        break;
      }

      // Process each row
      for (const row of rows) {
        try {
          const rawData = row.raw_data as Record<string, string>;
          const { transformed, warnings: transformWarnings } = applyFieldMapping(rawData, entityConfig);

          // Enrichment step (best-effort, non-blocking)
          let enrichedData = transformed;
          try {
            const enrichment = await enrichTransformedRow(supabase, entityType, transformed);
            enrichedData = applyEnrichment(transformed, enrichment);
          } catch {
            // enrichment failure is non-critical
          }

          const validationErrors = validateTransformedRow(
            enrichedData,
            entityType,
            entityConfig as unknown as EntityMappingConfig,
            { portfolioId: options?.portfolioId }
          );

          // Determine status
          const hasErrors = validationErrors.some((e) => e.severity === 'error');
          const hasWarnings =
            validationErrors.some((e) => e.severity === 'warning') || transformWarnings.length > 0;

          let validationStatus: 'valid' | 'invalid' | 'warning';
          if (hasErrors) {
            validationStatus = 'invalid';
            result.invalid++;
          } else if (hasWarnings) {
            validationStatus = 'warning';
            result.warnings++;
          } else {
            validationStatus = 'valid';
            result.valid++;
          }
          result.processed++;

          // Combine all errors/warnings for storage
          const allErrors = [
            ...validationErrors,
            ...transformWarnings.map((w) => ({
              field: w.field,
              message: w.message,
              severity: 'warning' as const,
              rule: 'transform_warning',
            })),
          ];

          await fromImportStagingRelation(supabase, stagingTable)
            .update({
              transformed_data: enrichedData,
              validation_status: validationStatus,
              validation_errors: allErrors.length > 0 ? allErrors : null,
            })
            .eq('id', row.id);
        } catch (err) {
          console.error(`[etl-runner] Row-level error for ${row.id}:`, err);
          // Mark as invalid so it surfaces in error browser
          await fromImportStagingRelation(supabase, stagingTable)
            .update({
              validation_status: 'invalid',
              validation_errors: [
                {
                  field: '_row',
                  message: `Processing error: ${err instanceof Error ? err.message : String(err)}`,
                  severity: 'error',
                  rule: 'internal_error',
                },
              ],
            })
            .eq('id', row.id);
          result.invalid++;
          result.processed++;
        }
      }

      // Update records_validated counter
      await supabase
        .from('import_jobs')
        .update({ records_validated: result.processed })
        .eq('id', importJobId);

      // Emit progress event
      ImportProgressEmitter.emit(importJobId, {
        type: 'validation',
        entity: entityType,
        processed: result.processed,
        percent: totalRows > 0 ? Math.round((result.processed / totalRows) * 100) : 0,
        message: `Validated ${result.processed} rows`,
      });

      // Advance keyset cursor
      if (rows.length > 0) {
        lastId = rows[rows.length - 1].id as string;
      }
      hasMore = rows.length === BATCH_SIZE;
    }
  }

  return result;
}
