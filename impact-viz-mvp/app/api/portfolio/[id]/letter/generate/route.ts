// app/api/portfolio/[id]/letter/generate/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const sb = await createSupabaseServerClient();

  try {
    // 1. Fetch portfolio data from the letter endpoint logic
    const { data: portfolio, error: portfolioError } = await sb
      .from('portfolios')
      .select('id, name')
      .eq('id', portfolio_id)
      .single();

    if (portfolioError) throw portfolioError;

    // 2. Fetch KPI definitions and latest values
    const { data: kpis, error: kpisError } = await sb
      .from('kpi_definitions')
      .select('id, metric_code, display_name, target_value, target_date, calculation')
      .eq('portfolio_id', portfolio_id)
      .order('order_index', { ascending: true });

    if (kpisError) throw kpisError;

    // 3. Fetch latest KPI values
    const kpiIds = (kpis || []).map((k: any) => k.id);
    let latestValues: any[] = [];

    if (kpiIds.length > 0) {
      const { data: latest, error: latestError } = await sb
        .from('v_portfolio_kpi_latest')
        .select('kpi_def_id, value, unit, period_start, period_end')
        .eq('portfolio_id', portfolio_id)
        .in('kpi_def_id', kpiIds);

      if (!latestError) latestValues = latest || [];
    }

    const kpisWithValues = (kpis || []).map((kpi: any) => {
      const latest = latestValues.find((l: any) => l.kpi_def_id === kpi.id);
      return {
        ...kpi,
        latest_value: latest?.value ?? null,
        unit: latest?.unit ?? null,
        period_start: latest?.period_start ?? null,
        period_end: latest?.period_end ?? null,
      };
    });

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
          content: `You are an eloquent impact investment letter writer who crafts compelling narratives from portfolio data.

WRITING STYLE:
- Write in flowing, beautifully crafted paragraphs (no bullet points, no section headers with asterisks or markdown formatting)
- Start with a powerful opening that highlights the most compelling impact metric
- Use an impact-first, personal, and warm tone that celebrates the human stories behind the numbers
- Weave data naturally into narrative sentences rather than listing it
- NO placeholder fields like [Your Name] or [Date] - the page handles those
- NO markdown formatting (**, ##, etc.) - just clean prose paragraphs
- Write as if you are the portfolio manager speaking directly to the stakeholder

STRUCTURE (without headers):
1. Opening: Lead with the most powerful impact statistic and what it means for real people
2. Portfolio narrative: Describe the holdings and their work in prose form, naturally integrating allocation amounts and sector information
3. Impact story: Weave together the KPI metrics to tell a cohesive story of change and progress, mentioning specific numbers but in narrative form
4. Forward momentum: Discuss what this impact enables and the path ahead
5. Closing: Express gratitude and invite continued partnership

INTEGRATION OF VISUALIZATIONS:
- Reference that "the dashboard shows" or "as illustrated in the portfolio overview" when mentioning data trends
- Mention that specific metrics "can be explored in detail on the holdings pages"
- Suggest that stakeholders "review the visualization tools to track progress over time"

Remember: Write beautiful, inspiring prose that makes stakeholders feel the impact of their investment. No formatting markers, no placeholders.`,
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
    console.error('Letter generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate letter' },
      { status: 500, headers: cacheHeaders() }
    );
  }
}
