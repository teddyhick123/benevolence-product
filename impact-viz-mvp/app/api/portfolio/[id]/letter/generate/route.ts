// app/api/portfolio/[id]/letter/generate/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import OpenAI from 'openai';
import { aiAuthRequired } from '@/lib/rate-limit-response';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

/**
 * POST /api/portfolio/[id]/letter/generate
 * Generate AI letter for portfolio
 * REQUIRES AUTHENTICATION - No anonymous AI access allowed
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const sb = await createSupabaseServerClient();

  try {
    // Verify user is authenticated
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      return aiAuthRequired();
    }
    // 1. Fetch portfolio data from the letter endpoint logic
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

    // 4. Fetch holdings summary
    const { data: holdings, error: holdingsError } = await sb
      .from('holdings')
      .select('id, name, status, sector, funds_allocated')
      .eq('portfolio_id', portfolio_id)
      .order('name', { ascending: true });

    if (holdingsError) throw holdingsError;

    // 5. Calculate portfolio summary stats
    const totalHoldings = (holdings || []).length;
    const totalFundsAllocated = (holdings || []).reduce((sum: number, h: any) => sum + (h.funds_allocated || 0), 0);
    const totalNAV = totalFundsAllocated; // Use funds_allocated as NAV

    // 6. Build context for OpenAI
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

    // 7. Generate letter content using OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a portfolio manager who crafts compelling letters on the state of impact investments and charitable contributions from portfolio data.

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
- Suggest that stakeholders "review the visualization tools to track progress over time"
`,
        },
        {
          role: 'user',
          content: `Generate a portfolio letter based on the following data:\n\n${portfolioContext}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const generatedLetter = completion.choices[0]?.message?.content || '';

    // 8. Return generated letter along with structured data
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
        generated_at: new Date().toISOString(),
      },
      kpis: kpisWithValues,
      holdings: holdings || [],
    }, { headers: cacheHeaders() });

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to generate letter' },
      { status: 500, headers: cacheHeaders() }
    );
  }
}
