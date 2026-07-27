import { checkRateLimit, cpaPortalLimiter, getIP } from '@/lib/rate-limit';
import { rateLimitExceeded } from '@/lib/rate-limit-response';
import { requireCpaToken } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';

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
  const yearParam = url.searchParams.get('year');
  const year = yearParam ? Number(yearParam) : undefined;

  const result = await access.context.repository.getPortalPayload({
    year: Number.isFinite(year) ? year : undefined,
    ip,
    userAgent: req.headers.get('user-agent') ?? undefined,
  });

  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonOk({ data: result.payload });
}
