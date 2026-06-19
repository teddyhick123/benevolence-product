import { NextResponse } from 'next/server';
import { checkRateLimit, cpaPortalLimiter, getIP } from '@/lib/rate-limit';
import { rateLimitExceeded } from '@/lib/rate-limit-response';
import { createCPADownload } from '@/lib/tax/cpa-public-access';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params;
  const ip = getIP(req);
  const limited = await checkRateLimit(cpaPortalLimiter, ip);
  if (!limited.success) {
    return rateLimitExceeded(limited.reset, limited.remaining, limited.limit);
  }

  const url = new URL(req.url);
  const format = url.searchParams.get('format') ?? 'csv';
  const yearParam = url.searchParams.get('year');
  const documentId = url.searchParams.get('documentId');

  const result = await createCPADownload(token, {
    format,
    year: yearParam ? Number(yearParam) : undefined,
    documentId,
    ip,
    userAgent: req.headers.get('user-agent') ?? undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (result.signedUrl) {
    return NextResponse.redirect(result.signedUrl);
  }

  return new NextResponse(result.body ?? '', {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': result.contentType ?? 'text/plain',
      'Content-Disposition': `attachment; filename="${result.filename ?? 'tax-export.txt'}"`,
    },
  });
}
