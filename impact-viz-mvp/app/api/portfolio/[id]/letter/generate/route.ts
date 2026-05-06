// app/api/portfolio/[id]/letter/generate/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';
import { aiAuthRequired } from '@/lib/rate-limit-response';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * GET /api/portfolio/[id]/letter/generate
 * Fetch existing cached letter (no regeneration)
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const sb = await createSupabaseServerClient();

  try {
    // Verify user is authenticated
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      return aiAuthRequired();
    }

    // Fetch the latest cached letter for this portfolio
    const { data: cachedLetter, error } = await sb
      .from('generated_letters')
      .select('*')
      .eq('portfolio_id', portfolio_id)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (error || !cachedLetter) {
      return NextResponse.json(
        { error: 'No cached letter found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Return cached letter with summary data
    const summaryData = cachedLetter.summary_data as {
      portfolio: any;
      summary: any;
      kpis: any[];
      holdings: any[];
    };

    return NextResponse.json({
      letter_content: cachedLetter.letter_content,
      portfolio: summaryData.portfolio,
      summary: {
        ...summaryData.summary,
        generated_at: cachedLetter.generated_at,
      },
      kpis: summaryData.kpis,
      holdings: summaryData.holdings,
      cached: true,
      version: cachedLetter.version,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch letter' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/portfolio/[id]/letter/generate
 * Generate AI letter for portfolio (with caching)
 * Use ?force=true to regenerate even if cached version exists
 * REQUIRES AUTHENTICATION - No anonymous AI access allowed
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const forceRegenerate = searchParams.get('force') === 'true';

  const sb = await createSupabaseServerClient();

  try {
    // Verify user is authenticated
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      return aiAuthRequired();
    }

    // Check for existing cached letter (unless force regenerate)
    if (!forceRegenerate) {
      const { data: cachedLetter } = await sb
        .from('generated_letters')
        .select('*')
        .eq('portfolio_id', portfolio_id)
        .order('version', { ascending: false })
        .limit(1)
        .single();

      if (cachedLetter) {
        // Return cached letter
        const summaryData = cachedLetter.summary_data as {
          portfolio: any;
          summary: any;
          kpis: any[];
          holdings: any[];
        };

        return NextResponse.json({
          letter_content: cachedLetter.letter_content,
          portfolio: summaryData.portfolio,
          summary: {
            ...summaryData.summary,
            generated_at: cachedLetter.generated_at,
          },
          kpis: summaryData.kpis,
          holdings: summaryData.holdings,
          cached: true,
          version: cachedLetter.version,
        });
      }
    }

    // 1. Fetch portfolio data
    const { data: portfolio, error: portfolioError } = await sb
      .from('portfolios')
      .select('id, name')
      .eq('id', portfolio_id)
      .single();

    if (portfolioError) throw portfolioError;

    // 2. Fetch latest KPI values with targets from v_portfolio_kpi_latest
    const { data: kpis, error: kpisError } = await sb
      .from('v_portfolio_kpi_latest')
      .select('metric_code, metric_name, display_name, value, unit, period_end, target_value, target_date, progress_percentage')
      .eq('portfolio_id', portfolio_id)
      .order('metric_code', { ascending: true });

    if (kpisError) throw kpisError;

    // Map to consistent structure for letter template
    const kpisWithValues = (kpis || []).map((kpi: any) => ({
      metric_code: kpi.metric_code,
      display_name: kpi.display_name || kpi.metric_name,
      target_value: kpi.target_value,
      target_date: kpi.target_date,
      latest_value: kpi.value,
      unit: kpi.unit,
      period_end: kpi.period_end,
      progress_percentage: kpi.progress_percentage,
    }));

    // 3. Fetch holdings summary
    const { data: holdings, error: holdingsError } = await sb
      .from('holdings')
      .select('id, name, status, sector, funds_allocated')
      .eq('portfolio_id', portfolio_id)
      .order('name', { ascending: true });

    if (holdingsError) throw holdingsError;

    // 4. Calculate portfolio summary stats
    const totalHoldings = (holdings || []).length;
    const totalFundsAllocated = (holdings || []).reduce((sum: number, h: any) => sum + (h.funds_allocated || 0), 0);
    const totalNAV = totalFundsAllocated;

    // 5. Build context for OpenAI
    const portfolioContext = `
Portfolio: ${portfolio.name}

Summary Statistics:
- Total Holdings: ${totalHoldings}
- Total Funds Allocated: $${(totalFundsAllocated / 1000000).toFixed(1)}M
- Portfolio NAV: $${(totalNAV / 1000000).toFixed(1)}M

Key Performance Indicators:
${kpisWithValues.map((kpi: any) => {
  const value = kpi.latest_value !== null ? `${kpi.latest_value}${kpi.unit || ''}` : 'Not yet recorded';
  const target = kpi.target_value !== null ? `Target: ${kpi.target_value}${kpi.unit || ''}` : '';
  return `- ${kpi.display_name}: ${value} ${target}`;
}).join('\n')}

Holdings:
${(holdings || []).slice(0, 10).map((h: any) => {
  const amount = h.funds_allocated || 0;
  return `- ${h.name} (${h.sector || 'N/A'}): $${(amount / 1000000).toFixed(2)}M allocated`;
}).join('\n')}
${totalHoldings > 10 ? `... and ${totalHoldings - 10} more holdings` : ''}
`;

    // 6. Generate letter content using Claude
    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: `You are a portfolio manager who crafts compelling letters on the state of impact investments and charitable contributions from portfolio data.

WRITING STYLE:
- Balance clear communication of information with a compelling style
- Avoid the overuse of antithesis and other AI-giveaway phrases. You can use them, but do not overdo it
- Write in flowing, beautifully crafted paragraphs (no bullet points, no section headers with asterisks or markdown formatting)
- Start with a powerful opening that highlights the most compelling impact metric
- Weave data naturally into narrative sentences rather than listing it
- NO placeholder fields like [Your Name] or [Date] - the page handles those
- NO markdown formatting (**, ##, etc.) - just clean prose paragraphs
- Write as if you are the portfolio manager speaking directly to the stakeholder, but do not refer to yourself in the first person

STRUCTURE (without headers):
1. Opening: Lead with the most powerful impact statistic
2. Portfolio narrative: Describe the holdings and their work in prose form, naturally integrating allocation amounts and sector information
3. Impact story: Weave together the KPI metrics to tell a cohesive story of change and progress, mentioning specific numbers but in narrative form
4. Forward momentum: Discuss what this impact enables and the path ahead, concluding with an expression of gratitude for their generous intent.

INTEGRATION OF VISUALIZATIONS:
- Reference that "the dashboard shows" or "as illustrated in the portfolio overview" when mentioning data trends
- Mention that specific metrics "can be explored in detail on the holdings pages"
- Suggest that stakeholders "review the visualization tools to track progress over time"`,
      messages: [
        {
          role: 'user',
          content: `Generate a portfolio letter based on the following data:\n\n${portfolioContext}`,
        },
      ],
    });

    const generatedLetter = (completion.content[0] as { type: string; text: string })?.text || '';
    const generatedAt = new Date().toISOString();

    // 7. Get current max version for this portfolio
    const { data: existingVersions } = await sb
      .from('generated_letters')
      .select('version')
      .eq('portfolio_id', portfolio_id)
      .order('version', { ascending: false })
      .limit(1);

    const newVersion = existingVersions && existingVersions.length > 0
      ? existingVersions[0].version + 1
      : 1;

    // 8. Save generated letter to database
    const summaryData = {
      portfolio: {
        id: portfolio.id,
        name: portfolio.name,
      },
      summary: {
        total_holdings: totalHoldings,
        total_funds_allocated: totalFundsAllocated,
        total_nav: totalNAV,
      },
      kpis: kpisWithValues,
      holdings: holdings || [],
    };

    const { error: insertError } = await sb
      .from('generated_letters')
      .insert({
        portfolio_id: portfolio_id,
        letter_content: generatedLetter,
        summary_data: summaryData,
        generated_at: generatedAt,
        generated_by: user.id,
        version: newVersion,
      });

    if (insertError) {
      console.error('Failed to cache letter:', insertError);
      // Don't fail the request, just log the error
    }

    // 9. Return generated letter along with structured data
    return NextResponse.json({
      letter_content: generatedLetter,
      portfolio: {
        id: portfolio.id,
        name: portfolio.name,
      },
      summary: {
        total_holdings: totalHoldings,
        total_funds_allocated: totalFundsAllocated,
        total_nav: totalNAV,
        generated_at: generatedAt,
      },
      kpis: kpisWithValues,
      holdings: holdings || [],
      cached: false,
      version: newVersion,
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to generate letter' },
      { status: 500 }
    );
  }
}
