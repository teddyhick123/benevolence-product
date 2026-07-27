import { requirePortfolioAccess, isAccessDenied } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  generateShareToken,
  hashShareToken,
  generateCPAShareURL,
  createDefaultPermissions,
  createExpirationDate,
  formatCPAEmailInvite,
} from '@/lib/tax/cpa-collaboration';

/**
 * GET /api/portfolio/[id]/tax/cpa-share
 * List all CPA share links for a portfolio
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: portfolio_id } = await ctx.params;
  const access = await requirePortfolioAccess(portfolio_id, 'member');
  if (isAccessDenied(access)) {
    return access.reason === 'unauthenticated'
      ? access.response
      : jsonError('Not authorized', 403);
  }
  const sb = access.context.db;

  try {
    const { data: shareLinks, error } = await sb
      .from('cpa_share_links')
      .select(`
        id,
        portfolio_id,
        org_id,
        cpa_name,
        cpa_email,
        cpa_firm,
        tax_years,
        permissions,
        expires_at,
        max_accesses,
        access_count,
        revoked_at,
        created_by,
        notes,
        created_at,
        updated_at
      `)
      .eq('portfolio_id', portfolio_id)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return jsonOk({ data: shareLinks || [] });
  } catch (error) {
    console.error('Error fetching share links:', error);
    return jsonError('Failed to fetch share links', 500);
  }
}

/**
 * POST /api/portfolio/[id]/tax/cpa-share
 * Create a new CPA share link
 *
 * Body:
 * {
 *   cpa_name?: string,
 *   cpa_email?: string,
 *   cpa_firm?: string,
 *   tax_years: number[],
 *   expiration: '7days' | '30days' | '90days' | '1year' | 'never',
 *   max_accesses?: number,
 *   permissions?: {...},
 *   notes?: string,
 *   send_email?: boolean
 * }
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: portfolio_id } = await ctx.params;
  const access = await requirePortfolioAccess(portfolio_id, 'member');
  if (isAccessDenied(access)) {
    return access.reason === 'unauthenticated'
      ? access.response
      : jsonError('Not authorized', 403);
  }
  const sb = access.context.db;

  try {
    const body = await req.json();
    const {
      cpa_name,
      cpa_email,
      cpa_firm,
      tax_years,
      expiration = '30days',
      max_accesses,
      permissions,
      notes,
      send_email = false,
    } = body;

    if (!tax_years || tax_years.length === 0) {
      return jsonError('At least one tax year must be specified', 400);
    }

    // Generate secure token
    const shareToken = generateShareToken();
    const tokenHash = hashShareToken(shareToken);
    const expiresAt = createExpirationDate(expiration);
    const finalPermissions = permissions || createDefaultPermissions();

    // Look up org_id from portfolio
    const { data: portfolioRow, error: portfolioErr } = await sb
      .from('portfolios')
      .select('org_id')
      .eq('id', portfolio_id)
      .eq('org_id', access.context.orgId)
      .single();

    if (portfolioErr || !portfolioRow) {
      return jsonError('Portfolio not found', 404);
    }

    // Create share link
    const { data: shareLink, error: insertError } = await sb
      .from('cpa_share_links')
      .insert({
        portfolio_id,
        org_id: portfolioRow.org_id,
        share_token: tokenHash,
        cpa_name,
        cpa_email,
        cpa_firm,
        tax_years,
        expires_at: expiresAt,
        max_accesses,
        permissions: finalPermissions,
        notes,
      })
      .select(`
        id,
        portfolio_id,
        org_id,
        cpa_name,
        cpa_email,
        cpa_firm,
        tax_years,
        permissions,
        expires_at,
        max_accesses,
        access_count,
        revoked_at,
        created_by,
        notes,
        created_at,
        updated_at
      `)
      .single();

    if (insertError) {
      throw insertError;
    }

    // Generate share URL
    const shareURL = generateCPAShareURL(shareToken);

    // Optionally send email (would integrate with email service)
    let emailData = null;
    if (send_email && cpa_email) {
      emailData = formatCPAEmailInvite(shareLink, shareURL);
    }

    return jsonOk({
      data: {
        ...shareLink,
        share_url: shareURL,
        email_preview: emailData,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating share link:', error);
    return jsonError('Failed to create share link', 500);
  }
}

/**
 * PATCH /api/portfolio/[id]/tax/cpa-share?share_link_id=uuid
 * Revoke a CPA share link
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: portfolio_id } = await ctx.params;
  const url = new URL(req.url);
  const shareLinkId = url.searchParams.get('share_link_id');

  if (!shareLinkId) {
    return jsonError('share_link_id required', 400);
  }

  const access = await requirePortfolioAccess(portfolio_id, 'member');
  if (isAccessDenied(access)) {
    return access.reason === 'unauthenticated'
      ? access.response
      : jsonError('Not authorized', 403);
  }
  const sb = access.context.db;

  try {
    // Revoke the share link
    const { error: revokeError } = await sb.rpc('revoke_share_link', {
      p_share_link_id: shareLinkId,
    });

    if (revokeError) {
      throw revokeError;
    }

    return jsonOk({ success: true });
  } catch (error) {
    console.error('Error revoking share link:', error);
    return jsonError('Failed to revoke share link', 500);
  }
}

/**
 * DELETE is kept as a compatibility alias for existing callers.
 */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  return PATCH(req, ctx);
}
