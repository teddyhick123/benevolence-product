import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest, { params }: { params: { fileId: string } }) {
  // In production, POST to your n8n webhook URL with fileId
  // const res = await fetch(process.env.N8N_WEBHOOK_URL!, { method:'POST', body: JSON.stringify({ fileId: params.fileId }) });
  const jobId = `job_${params.fileId}`;
  return NextResponse.json({ jobId });
}
