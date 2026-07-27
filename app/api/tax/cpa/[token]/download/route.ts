import { NextResponse } from 'next/server';
import { checkRateLimit, cpaPortalLimiter, getIP } from '@/lib/rate-limit';
import { rateLimitExceeded } from '@/lib/rate-limit-response';
import { requireCpaToken } from '@/lib/api/access';
import { jsonError } from '@/lib/api/responses';

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

  const access = await requireCpaToken(token);
  if (!access.ok) return access.response;

  const url = new URL(req.url);
  const format = url.searchParams.get('format') ?? 'csv';
  const yearParam = url.searchParams.get('year');
  const documentId = url.searchParams.get('documentId');

  const result = await access.context.repository.createDownload({
    format,
    year: yearParam ? Number(yearParam) : undefined,
    documentId,
    ip,
    userAgent: req.headers.get('user-agent') ?? undefined,
  });

  if (!result.ok) {
    return jsonError(result.error, result.status);
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
