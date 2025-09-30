import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function supabaseService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!,             // service key: server-only
    { auth: { persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  try {
    // --- 0) env checks ---
    const {
      NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE,
      N8N_WEBHOOK_URL,
      N8N_HMAC_SECRET,
    } = process.env as Record<string, string | undefined>;

    if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE || !N8N_WEBHOOK_URL || !N8N_HMAC_SECRET) {
      return NextResponse.json({ error: 'Missing required env vars' }, { status: 500 });
    }

    // --- 1) read multipart form ---
    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

    const portfolio_id = (form.get('portfolio_id') as string) || null;
    const holding_id = (form.get('holding_id') as string) || null;
    const ai_mode = ((form.get('ai_mode') as string) ?? 'true') === 'true';
    const selected_metrics_raw = (form.get('selected_metrics') as string) || '';
    const selected_metrics = selected_metrics_raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const autoApprove = ((form.get('autoApprove') as string) ?? 'true') === 'true';

    if (!portfolio_id) return NextResponse.json({ error: 'portfolio_id required' }, { status: 400 });
    if (!holding_id) return NextResponse.json({ error: 'holding_id required' }, { status: 400 });

    const fileName = file.name;
    const ext = fileName.split('.').pop() || '';

    const sb = supabaseService();

    // --- 2) create uploads row ---
    const { data: upload, error: upErr } = await sb
      .from('uploads')
      .insert({ file_name: fileName, file_ext: ext, status: 'queued' })
      .select()
      .single();

    if (upErr || !upload) {
      return NextResponse.json({ error: upErr ?? 'Failed to create upload' }, { status: 500 });
    }

    // --- 3) archive raw file in private bucket "reports" ---
    let storagePath: string | null = null;
    let storageDebug: Record<string, any> | undefined;
    try {
      const arrayBuf = await file.arrayBuffer();
      const objectKey = `${upload.id}/${fileName}`; // object key within the 'reports' bucket
      const contentType = file.type || 'application/octet-stream';

      const { error: putErr } = await sb.storage
        .from('reports') // bucket must exist
        .upload(objectKey, arrayBuf, {
          contentType,
          upsert: true,
        });

      if (putErr) {
        storageDebug = { stage: 'upload', message: putErr.message, name: putErr.name };
        console.warn('Storage upload failed:', putErr.message);
      } else {
        storagePath = `reports/${objectKey}`; // full path used later by n8n to sign
      }
    } catch (e) {
      const msg = (e as Error).message;
      storageDebug = { stage: 'exception', message: msg };
      console.warn('Storage upload threw:', msg);
      storagePath = null;
    }

    // --- 4) call n8n webhook with HMAC signature ---
    const payload = {
      uploadId: upload.id as string,
      fileName,
      supabaseUrl: NEXT_PUBLIC_SUPABASE_URL,
      serviceRole: SUPABASE_SERVICE_ROLE,
      portfolio_id,
      holding_id,
      ai_mode,
      selected_metrics,
      kpi_mode: ai_mode ? 'auto' : 'restricted',
      autoApprove,
      storagePath, // e.g. "reports/<uploadId>/<fileName>" or null
    };

    const body = JSON.stringify(payload);
    const sig = crypto.createHmac('sha256', N8N_HMAC_SECRET!).update(body).digest('hex');

    const res = await fetch(N8N_WEBHOOK_URL!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-signature': `sha256=${sig}`,
      },
      body,
    });

    if (!res.ok) {
      await sb.from('uploads').update({ status: 'error' }).eq('id', upload.id);
      const detail = await res.text().catch(() => '');
      return NextResponse.json({ error: 'n8n failed', detail }, { status: 502 });
    }

    // --- 5) optimistic status flip ---
    await sb.from('uploads').update({ status: 'processing' }).eq('id', upload.id);

    return NextResponse.json({
      uploadId: upload.id,
      portfolio_id,
      holding_id,
      ai_mode,
      selected_metrics,
      autoApprove,
      storagePath,
      ...(storageDebug ? { storageDebug } : {})
    }, { status: 200 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}