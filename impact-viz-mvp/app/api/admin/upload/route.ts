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
    const autoApprove = ((form.get('autoApprove') as string) ?? 'true') === 'true';

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

    // --- 3) (optional) archive raw file in private bucket "reports" ---
    let storagePath: string | null = null;
    try {
      const arrayBuf = await file.arrayBuffer();
      storagePath = `reports/${upload.id}/${fileName}`; // REST-friendly path
      const { error: putErr } = await sb.storage
        .from('reports') // make sure this bucket exists and is private
        .upload(`${upload.id}/${fileName}`, new Uint8Array(arrayBuf), {
          contentType: file.type || 'application/octet-stream',
          upsert: true,
        });
      if (putErr) {
        console.warn('Storage upload failed:', putErr.message);
        storagePath = null; // not fatal
      }
    } catch (e) {
      console.warn('Storage upload threw:', (e as Error).message);
      storagePath = null;
    }

    // --- 4) call n8n webhook with HMAC signature ---
    const payload = {
      uploadId: upload.id as string,
      fileName,
      supabaseUrl: NEXT_PUBLIC_SUPABASE_URL,
      serviceRole: SUPABASE_SERVICE_ROLE,
      portfolio_id,
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

    return NextResponse.json({ uploadId: upload.id, portfolio_id, autoApprove, storagePath }, { status: 200 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}