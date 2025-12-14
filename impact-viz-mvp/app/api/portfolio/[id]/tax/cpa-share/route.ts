import { NextResponse } from 'next/server';
import { supabasePublic } from '@/lib/supabase';
import {
  generateShareToken,
  generateCPAShareURL,
  createDefaultPermissions,
  createExpirationDate,
  formatCPAEmailInvite,
  type CPAShareLink,
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
  const sb = await supabasePublic();

  // Check permissions
  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', {
    p_portfolio_id: portfolio_id,
  });

  if (canEditErr || !canEdit) {
    return NextResponse.json(
      { error: 'Not authorized' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const { data: shareLinks, error } = await sb
      .from('cpa_share_links')
      .select('*')
      .eq('portfolio_id', portfolio_id)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json(
      { data: shareLinks || [] },
      { headers: { 'Cache-Control': 'private, s-maxage=60' } }
    );
  } catch (error) {
    console.error('Error fetching share links:', error);
    return NextResponse.json(
      { error: 'Failed to fetch share links' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
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
  const sb = await supabasePublic();

  // Check permissions
  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', {
    p_portfolio_id: portfolio_id,
  });

  if (canEditErr || !canEdit) {
    return NextResponse.json(
      { error: 'Not authorized' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    );
  }

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
      return NextResponse.json(
        { error: 'At least one tax year must be specified' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Generate secure token
    const shareToken = generateShareToken();
    const expiresAt = createExpirationDate(expiration);
    const finalPermissions = permissions || createDefaultPermissions();

    // Create share link
    const { data: shareLink, error: insertError } = await sb
      .from('cpa_share_links')
      .insert({
        portfolio_id,
        share_token: shareToken,
        cpa_name,
        cpa_email,
        cpa_firm,
        tax_years,
        expires_at: expiresAt,
        max_accesses,
        permissions: finalPermissions,
        notes,
      })
      .select()
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
      // TODO: Integrate with email service (SendGrid, AWS SES, etc.)
      // await sendEmail(cpa_email, emailData.subject, emailData.body);
    }

    return NextResponse.json(
      {
        data: {
          ...shareLink,
          share_url: shareURL,
          email_preview: emailData,
        },
      },
      { status: 201, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Error creating share link:', error);
    return NextResponse.json(
      { error: 'Failed to create share link' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

/**
 * DELETE /api/portfolio/[id]/tax/cpa-share?share_link_id=uuid
 * Revoke a CPA share link
 */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: portfolio_id } = await ctx.params;
  const url = new URL(req.url);
  const shareLinkId = url.searchParams.get('share_link_id');

  if (!shareLinkId) {
    return NextResponse.json(
      { error: 'share_link_id required' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const sb = await supabasePublic();

  // Check permissions
  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', {
    p_portfolio_id: portfolio_id,
  });

  if (canEditErr || !canEdit) {
    return NextResponse.json(
      { error: 'Not authorized' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    // Revoke the share link
    const { error: revokeError } = await sb.rpc('revoke_share_link', {
      p_share_link_id: shareLinkId,
    });

    if (revokeError) {
      throw revokeError;
    }

    return NextResponse.json(
      { success: true },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Error revoking share link:', error);
    return NextResponse.json(
      { error: 'Failed to revoke share link' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
