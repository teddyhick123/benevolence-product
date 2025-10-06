import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest, ctx: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const payload = {
    fileId,
    // include signedUrl if you returned one from upload:
    signedUrl: body.signedUrl,
  };

  const res = await fetch(process.env.N8N_WEBHOOK_URL!, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const txt = await res.text();
  return NextResponse.json({ jobId: `job_${params.fileId}`, n8n: txt });
}

