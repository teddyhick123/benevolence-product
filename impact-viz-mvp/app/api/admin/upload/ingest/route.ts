import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseDocument } from '@/lib/document-parser';
import { extractFactsFromText, getUniqueMetricCodes } from '@/lib/openai-extractor';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for long-running extractions

function supabaseService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!,
    { auth: { persistSession: false } }
  );
}

/**
 * Process a single upload: parse document, extract facts, and store in database
 * This replaces the n8n workflow entirely
 */
export async function POST(req: NextRequest) {
  const sb = supabaseService();

  try {
    // Parse request body
    const body = await req.json();
    const { uploadId } = body;

    if (!uploadId) {
      return NextResponse.json({ error: 'uploadId required' }, { status: 400 });
    }

    // 1. Fetch upload record
    const { data: upload, error: uploadErr } = await sb
      .from('uploads')
      .select('*')
      .eq('id', uploadId)
      .single();

    if (uploadErr || !upload) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
    }

    // 2. Update status to processing
    await sb.from('uploads').update({ status: 'processing' }).eq('id', uploadId);

    // 3. Download file from storage
    if (!upload.storage_path) {
      throw new Error('No storage path found for upload');
    }

    const pathParts = upload.storage_path.split('/');
    const bucket = pathParts[0];
    const objectPath = pathParts.slice(1).join('/');

    const { data: fileData, error: downloadErr } = await sb.storage
      .from(bucket)
      .download(objectPath);

    if (downloadErr || !fileData) {
      throw new Error(`Failed to download file: ${downloadErr?.message}`);
    }

    // 4. Parse document to extract text
    const buffer = Buffer.from(await fileData.arrayBuffer());
    const parsed = await parseDocument(buffer, upload.file_name || 'document');

    if (!parsed.text || parsed.text.trim().length === 0) {
      throw new Error('No text content extracted from document');
    }

    // 5. Extract facts using OpenAI
    const extractionOptions = {
      restrictedMetrics: upload.ai_mode ? undefined : upload.selected_metrics,
      holdingId: upload.holding_id,
    };

    const extraction = await extractFactsFromText(parsed.text, extractionOptions);

    if (extraction.facts.length === 0) {
      // No facts found - still mark as done but note it
      await sb.from('uploads').update({
        status: 'done',
        updated_at: new Date().toISOString(),
      }).eq('id', uploadId);

      return NextResponse.json({
        success: true,
        uploadId,
        factsExtracted: 0,
        message: 'No facts extracted from document',
      });
    }

    // 6. Upsert metric definitions
    const uniqueMetricCodes = getUniqueMetricCodes(extraction.facts);
    if (uniqueMetricCodes.length > 0) {
      const metricRows = uniqueMetricCodes.map((code) => ({
        code,
        name: code,
        unit: null,
        directionality: null,
        aggregation_function: null,
      }));

      await sb.from('metrics').upsert(metricRows, {
        onConflict: 'code',
        ignoreDuplicates: true,
      });
    }

    // 7. Insert facts into staging_metric_facts
    // This mirrors the metric_facts structure but adds staging-specific fields
    const now = new Date().toISOString();
    const stagingRows = extraction.facts.map((fact) => ({
      upload_id: uploadId,

      // Core metric_facts fields
      investee_id: null, // Could be populated if we have investee mapping
      holding_id: upload.holding_id,
      metric_code: fact.metric_code,
      period_start: fact.period_start || null,
      period_end: fact.period_end || now.slice(0, 10),
      value: fact.value,
      source: fact.source || 'AI Extraction',
      verification_level: fact.verification_level || 'Unverified',
      data_quality_score: fact.data_quality_score || 0.6,
      unit: fact.unit || null,

      // Staging-specific fields
      approved: false, // Requires admin review

      // Raw extraction data for reference
      raw: {
        holding_name: fact.holding_name,
        sector: fact.sector,
        country: fact.country,
        original_extraction: fact,
      },
    }));

    console.log('Inserting staging rows:', JSON.stringify(stagingRows, null, 2));

    const { data: stagingData, error: stagingErr } = await sb
      .from('staging_metric_facts')
      .insert(stagingRows)
      .select();

    if (stagingErr) {
      console.error('Staging insert error:', stagingErr);
      throw new Error(`Failed to insert staging facts: ${stagingErr.message} (code: ${stagingErr.code}, details: ${JSON.stringify(stagingErr.details)})`);
    }

    console.log('Successfully inserted staging rows:', stagingData?.length);

    // 8. Upsert holding locations if extracted
    let locationsUpserted = 0;
    if (extraction.locations && extraction.locations.length > 0 && upload.holding_id) {
      const locationRows = extraction.locations
        .filter(loc => loc.lon != null && loc.lat != null) // Only insert locations with coordinates
        .map(loc => ({
          portfolio_id: upload.portfolio_id,
          holding_id: upload.holding_id,
          name: loc.name,
          tags: loc.tags || [],
          status: loc.status || 'Active',
          as_of: now.slice(0, 10),
          amount_usd: null,
          lon: loc.lon!,
          lat: loc.lat!,
          created_at: now,
          updated_at: now,
        }));

      if (locationRows.length > 0) {
        // First, check for existing locations with same portfolio_id, holding_id, and name
        // If they exist, update them; otherwise insert new ones
        for (const locRow of locationRows) {
          const { data: existing } = await sb
            .from('holding_locations')
            .select('id')
            .eq('portfolio_id', locRow.portfolio_id)
            .eq('holding_id', locRow.holding_id)
            .eq('name', locRow.name)
            .maybeSingle();

          if (existing) {
            // Update existing location
            await sb
              .from('holding_locations')
              .update({
                tags: locRow.tags,
                status: locRow.status,
                as_of: locRow.as_of,
                lon: locRow.lon,
                lat: locRow.lat,
                updated_at: locRow.updated_at,
              })
              .eq('id', existing.id);
            locationsUpserted++;
          } else {
            // Insert new location
            await sb.from('holding_locations').insert(locRow);
            locationsUpserted++;
          }
        }
        console.log('Successfully upserted locations:', locationsUpserted);
      }
    }

    // 9. If auto-approve, also insert into metric_facts
    // Note: The old schema uses staging_metric_facts, but based on n8n workflow
    // it seems to expect metric_facts table for approved data
    // For now, we'll just insert into staging and let admin approve manually
    // unless we detect the auto-approve flag

    // 10. Update upload status to done
    await sb.from('uploads').update({
      status: 'done',
      updated_at: now,
    }).eq('id', uploadId);

    return NextResponse.json({
      success: true,
      uploadId,
      factsExtracted: extraction.facts.length,
      locationsExtracted: extraction.locations?.length || 0,
      locationsUpserted,
      metrics: uniqueMetricCodes,
      documentMetadata: parsed.metadata,
    });

  } catch (error: any) {
    console.error('Ingestion error:', error);

    // Update upload status to error
    const { uploadId } = await req.json().catch(() => ({}));
    if (uploadId) {
      await sb.from('uploads').update({
        status: 'error',
        updated_at: new Date().toISOString(),
      }).eq('id', uploadId);
    }

    return NextResponse.json({
      error: error.message || 'Ingestion failed',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    }, { status: 500 });
  }
}
