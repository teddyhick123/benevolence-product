import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase';
import { parseDocumentChunked, DocumentChunk } from '@/lib/document-parser';
import { extractFactsFromText, ExtractedFact, ExtractionResult, getUniqueMetricCodes } from '@/lib/openai-extractor';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for large file processing

async function requireAdmin(): Promise<string | null> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: adminRow } = await supabase
    .from('admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  return adminRow ? user.id : null;
}

function supabaseService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!,
    { auth: { persistSession: false } }
  );
}

// No hard file size limit - we process in chunks
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB soft limit for sanity

/**
 * Deduplicate facts by metric_code + period_end + value
 * Keeps the first occurrence (which comes from earlier chunks)
 */
function deduplicateFacts(facts: ExtractedFact[]): ExtractedFact[] {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = `${fact.metric_code}|${fact.period_end || ''}|${fact.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function POST(req: NextRequest) {
  const userId = await requireAdmin();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = supabaseService();
  let uploadId: string | undefined;

  try {
    // --- 0) env checks ---
    const {
      NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE,
      OPENAI_API_KEY,
    } = process.env as Record<string, string | undefined>;

    if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
      return NextResponse.json({ error: 'Missing required env vars' }, { status: 500 });
    }
    if (!OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    // --- 1) read multipart form ---
    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({
        error: `File too large. Maximum size is 200MB, but your file is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`
      }, { status: 400 });
    }

    const portfolio_id = (form.get('portfolio_id') as string) || null;
    const holding_id = (form.get('holding_id') as string) || null;
    const ai_mode = ((form.get('ai_mode') as string) ?? 'true') === 'true';
    const selected_metrics_raw = (form.get('selected_metrics') as string) || '';
    const selected_metrics = selected_metrics_raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (!portfolio_id) return NextResponse.json({ error: 'portfolio_id required' }, { status: 400 });
    if (!holding_id) return NextResponse.json({ error: 'holding_id required' }, { status: 400 });

    const fileName = file.name;
    const ext = fileName.split('.').pop() || '';

    // --- 2) create uploads row ---
    const { data: upload, error: upErr } = await sb
      .from('uploads')
      .insert({
        file_name: fileName,
        file_ext: ext,
        status: 'processing',
        portfolio_id,
        holding_id,
        ai_mode,
        selected_metrics: !ai_mode ? selected_metrics : null,
      })
      .select()
      .single();

    if (upErr || !upload) {
      console.error('[Upload] Failed to create upload record:', upErr);
      return NextResponse.json({ error: 'Failed to create upload record' }, { status: 500 });
    }

    uploadId = upload.id;

    // --- 3) Parse document into chunks ---
    console.log(`[Upload ${uploadId}] Parsing document: ${fileName} (${(file.size / 1024).toFixed(1)}KB)`);

    const buffer = Buffer.from(await file.arrayBuffer());
    const chunks = await parseDocumentChunked(buffer, fileName);

    console.log(`[Upload ${uploadId}] Document parsed into ${chunks.length} chunks`);

    if (chunks.length === 0 || (chunks.length === 1 && !chunks[0].text.trim())) {
      await sb.from('uploads').update({
        status: 'done',
        updated_at: new Date().toISOString(),
      }).eq('id', uploadId);

      return NextResponse.json({
        uploadId,
        factsExtracted: 0,
        message: 'No text content extracted from document',
      });
    }

    // --- 4) Extract facts from each chunk ---
    const extractionOptions = {
      restrictedMetrics: ai_mode ? undefined : selected_metrics,
      holdingId: holding_id,
    };

    const allFacts: ExtractedFact[] = [];
    const allLocations: ExtractionResult['locations'] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk.text.trim()) continue;

      console.log(`[Upload ${uploadId}] Processing chunk ${i + 1}/${chunks.length} (${chunk.text.length} chars)`);

      try {
        const extraction = await extractFactsFromText(chunk.text, extractionOptions);
        allFacts.push(...extraction.facts);
        if (extraction.locations) {
          allLocations.push(...extraction.locations);
        }
      } catch (extractErr: any) {
        console.error(`[Upload ${uploadId}] Chunk ${i + 1} extraction failed:`, extractErr.message);
        // Continue with other chunks even if one fails
      }
    }

    // --- 5) Deduplicate facts ---
    const uniqueFacts = deduplicateFacts(allFacts);
    console.log(`[Upload ${uploadId}] Extracted ${allFacts.length} facts, ${uniqueFacts.length} unique`);

    if (uniqueFacts.length === 0) {
      await sb.from('uploads').update({
        status: 'done',
        updated_at: new Date().toISOString(),
      }).eq('id', uploadId);

      return NextResponse.json({
        uploadId,
        factsExtracted: 0,
        chunksProcessed: chunks.length,
        message: 'No facts extracted from document',
      });
    }

    // --- 6) Upsert metric definitions ---
    const uniqueMetricCodes = getUniqueMetricCodes(uniqueFacts);
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

    // --- 7) Insert facts into staging_metric_facts ---
    const now = new Date().toISOString();
    const stagingRows = uniqueFacts.map((fact) => ({
      upload_id: uploadId,
      holding_id: holding_id,
      metric_code: fact.metric_code,
      period_start: fact.period_start || null,
      period_end: fact.period_end || now.slice(0, 10),
      value: fact.value,
      source: fact.source || 'AI Extraction',
      verification_level: fact.verification_level || 'Unverified',
      data_quality_score: fact.data_quality_score || 0.6,
      unit: fact.unit || null,
      approved: false,
      raw: {
        holding_name: fact.holding_name,
        sector: fact.sector,
        country: fact.country,
        original_extraction: fact,
      },
    }));

    const { error: stagingErr } = await sb
      .from('staging_metric_facts')
      .insert(stagingRows);

    if (stagingErr) {
      throw new Error(`Failed to insert staging facts: ${stagingErr.message}`);
    }

    // --- 8) Upsert holding locations if extracted ---
    let locationsUpserted = 0;
    if (allLocations && allLocations.length > 0) {
      const locationRows = allLocations
        .filter(loc => loc.lon != null && loc.lat != null)
        .map(loc => ({
          portfolio_id,
          holding_id,
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

      for (const locRow of locationRows) {
        const { data: existing } = await sb
          .from('holding_locations')
          .select('id')
          .eq('portfolio_id', locRow.portfolio_id)
          .eq('holding_id', locRow.holding_id)
          .eq('name', locRow.name)
          .maybeSingle();

        if (existing) {
          await sb.from('holding_locations')
            .update({
              tags: locRow.tags,
              status: locRow.status,
              as_of: locRow.as_of,
              lon: locRow.lon,
              lat: locRow.lat,
              updated_at: locRow.updated_at,
            })
            .eq('id', existing.id);
        } else {
          await sb.from('holding_locations').insert(locRow);
        }
        locationsUpserted++;
      }
    }

    // --- 9) Update upload status to done ---
    await sb.from('uploads').update({
      status: 'done',
      updated_at: now,
    }).eq('id', uploadId);

    console.log(`[Upload ${uploadId}] Complete: ${uniqueFacts.length} facts, ${locationsUpserted} locations`);

    return NextResponse.json({
      uploadId,
      portfolio_id,
      holding_id,
      factsExtracted: uniqueFacts.length,
      locationsExtracted: locationsUpserted,
      chunksProcessed: chunks.length,
      metrics: uniqueMetricCodes,
    });

  } catch (err: any) {
    console.error('[Upload] Error:', err);

    // Update upload status to error
    if (uploadId) {
      try {
        await sb.from('uploads').update({
          status: 'error',
          updated_at: new Date().toISOString(),
        }).eq('id', uploadId);
      } catch {}
    }

    return NextResponse.json({
      error: err.message || 'Unexpected error',
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    }, { status: 500 });
  }
}
