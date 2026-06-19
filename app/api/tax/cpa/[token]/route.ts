import { NextResponse } from 'next/server';
import { checkRateLimit, cpaPortalLimiter, getIP } from '@/lib/rate-limit';
import { rateLimitExceeded } from '@/lib/rate-limit-response';
import { getCPAPortalPayload } from '@/lib/tax/cpa-public-access';

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
  const yearParam = url.searchParams.get('year');
  const year = yearParam ? Number(yearParam) : undefined;

  const result = await getCPAPortalPayload(token, {
    year: Number.isFinite(year) ? year : undefined,
    ip,
    userAgent: req.headers.get('user-agent') ?? undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    { data: result.payload },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
