// lib/import/csv-extractor.ts
// Streaming CSV parser that extracts rows into staging tables

import Papa from 'papaparse';
import type { DynamicImportClient as SupabaseClient } from '@/lib/database-client';
import type { EntityType } from './types';
import { STAGING_TABLE_MAP } from './types';
import { fromImportRelation } from './database';

export interface ExtractResult {
  rowsInserted: number;
  entityType: EntityType;
  errors: string[];
}

export async function extractCSVToStaging(
  supabase: SupabaseClient,
  importJobId: string,
  storagePath: string,
  entityType: EntityType,
  options?: { batchSize?: number }
): Promise<ExtractResult> {
  const batchSize = options?.batchSize ?? 100;
  const errors: string[] = [];
  let rowsInserted = 0;
  const stagingTable = STAGING_TABLE_MAP[entityType];

  const { data: job, error: jobError } = await supabase
    .from('import_jobs')
    .select('org_id')
    .eq('id', importJobId)
    .single();

  if (jobError || !job?.org_id) {
    throw new Error(`Cannot extract import ${importJobId}: missing org_id`);
  }
  const orgId = job.org_id as string;

  // Download file from Supabase Storage
  const { data: fileData, error: downloadError } = await supabase.storage
    .from('imports')
    .download(storagePath);

  if (downloadError || !fileData) {
    throw new Error(
      `Failed to download file from storage: ${downloadError?.message ?? 'unknown error'}`
    );
  }

  // Enforce 50MB file size limit
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  if (fileData.size > MAX_FILE_SIZE) {
    throw new Error(
      `File too large: ${(fileData.size / (1024 * 1024)).toFixed(1)}MB exceeds the 50MB limit. Please split your file into smaller batches.`
    );
  }

  const csvText = await fileData.text();

  // Parse CSV — keep all values as strings for validation later
  const parseResult = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  if (parseResult.errors.length > 0) {
    for (const e of parseResult.errors) {
      errors.push(`CSV parse error at row ${e.row ?? '?'}: ${e.message}`);
    }
  }

  const rows = parseResult.data;
  const totalRows = rows.length;

  // Insert rows in batches
  for (let i = 0; i < totalRows; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);

    const records = batch.map((row, idx) => ({
      import_job_id: importJobId,
      org_id: orgId,
      row_number: i + idx + 1,
      raw_data: row,
      validation_status: 'pending' as const,
    }));

    const { error: insertError } = await fromImportRelation(supabase, stagingTable).insert(records);

    if (insertError) {
      errors.push(
        `Batch insert error (rows ${i + 1}-${i + batch.length}): ${insertError.message}`
      );
    } else {
      rowsInserted += batch.length;
    }
  }

  // Update total_records_extracted by reading current and adding our contribution
  const { data: currentJob } = await supabase
    .from('import_jobs')
    .select('total_records_extracted')
    .eq('id', importJobId)
    .single();

  const currentTotal = (currentJob?.total_records_extracted as number) ?? 0;
  await supabase
    .from('import_jobs')
    .update({ total_records_extracted: currentTotal + rowsInserted })
    .eq('id', importJobId);

  return { rowsInserted, entityType, errors };
}
