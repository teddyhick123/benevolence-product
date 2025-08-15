import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const fileId = `${Date.now()}_${file.name}`.replace(/\s+/g,'_');
  const fs = await import('fs/promises');
  await fs.writeFile(`/tmp/${fileId}`, buffer);
  return NextResponse.json({ fileId });
}
