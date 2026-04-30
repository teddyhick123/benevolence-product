import { NextResponse } from 'next/server';
import { supabasePublic } from '@/lib/supabase';
import { generateForm8283PDF, type Form8283Contribution } from '@/lib/tax/form8283-generator';
import { requirePortfolioAccess, isAccessDenied } from '@/lib/portfolio-auth';

/**
 * GET /api/portfolio/[id]/tax/form8283?year=2024
 * Generate IRS Form 8283 PDF for noncash contributions
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: portfolio_id } = await ctx.params;
  const access = await requirePortfolioAccess(portfolio_id);
  if (isAccessDenied(access)) return access.error;
  const url = new URL(req.url);
  const year = Number(url.searchParams.get('year') || new Date().getFullYear());

  const sb = await supabasePublic();

  try {
    // Fetch portfolio for donor name
    const { data: portfolio, error: portfolioError } = await sb
      .from('portfolios')
      .select('name')
      .eq('id', portfolio_id)
      .single();

    if (portfolioError || !portfolio) {
      return NextResponse.json(
        { error: 'Portfolio not found or access denied' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Fetch donor profile
    const { data: donorProfile } = await sb
      .from('owner_tax_profiles')
      .select('*')
      .eq('portfolio_id', portfolio_id)
      .maybeSingle();

    // Fetch noncash contributions from Phase 1 views
    const { data: contributions, error: contribError } = await sb
      .from('v_tax_contributions_with_limits')
      .select('*')
      .eq('portfolio_id', portfolio_id)
      .eq('tax_year', year)
      .neq('contribution_type', 'cash')
      .neq('contribution_type', 'check')
      .neq('contribution_type', 'wire')
      .gte('amount_usd', 500) // Form 8283 required for noncash > $500
      .order('contribution_date', { ascending: true });

    if (contribError) {
      console.error('Error fetching contributions:', contribError);
      return NextResponse.json(
        { error: 'Failed to fetch contributions' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (!contributions || contributions.length === 0) {
      return NextResponse.json(
        {
          error: 'No qualifying contributions',
          message: `No noncash contributions over $500 found for ${year}.`,
        },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Fetch enhanced tax contribution details
    const contributionIds = contributions.map(c => c.id);
    const { data: enhancedContribs } = await sb
      .from('tax_contributions')
      .select('*')
      .in('id', contributionIds);

    // Map to Form8283Contribution format
    const form8283Contributions: Form8283Contribution[] = contributions.map((c: any) => {
      const enhanced = enhancedContribs?.find((e: any) => e.id === c.id);

      return {
        donor_name: portfolio.name,
        contribution_date: c.contribution_date,
        property_description: enhanced?.property_description || c.notes || c.contribution_type,
        recipient_name: c.recipient_name,
        recipient_ein: c.recipient_ein || undefined,
        fmv_at_donation: c.fmv_at_donation || c.amount_usd,
        cost_basis: c.cost_basis || undefined,
        date_acquired: enhanced?.date_acquired || undefined,
        how_acquired: enhanced?.how_acquired || 'Purchase',
        requires_appraisal: c.amount_usd > 5000 || enhanced?.requires_qualified_appraisal,
        appraisal_date: enhanced?.appraisal_date || undefined,
        appraisal_value: enhanced?.appraisal_value || undefined,
        appraiser_name: enhanced?.appraiser_name || undefined,
        appraiser_tin: enhanced?.appraiser_tin || undefined,
      };
    });

    // Generate PDF
    const pdfBuffer = generateForm8283PDF({
      tax_year: year,
      contributions: form8283Contributions,
      donor_name: portfolio.name,
    });

    // Return PDF
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Form-8283-${year}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Form 8283 generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate Form 8283' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
