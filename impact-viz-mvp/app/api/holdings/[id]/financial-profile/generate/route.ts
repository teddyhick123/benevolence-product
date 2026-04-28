// app/api/holdings/[id]/financial-profile/generate/route.ts
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getOrganization } from '@/lib/services/propublica';
import OpenAI from 'openai';
import { aiAuthRequired } from '@/lib/rate-limit-response';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * GET /api/holdings/[id]/financial-profile/generate
 * Fetch cached financial analysis (no regeneration)
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: holdingId } = await ctx.params;
  const sb = await createServerClient();

  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      return aiAuthRequired();
    }

    const { data: cached, error } = await sb
      .from('generated_financial_analyses')
      .select('*')
      .eq('holding_id', holdingId)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (error || !cached) {
      return NextResponse.json(
        { error: 'No cached analysis found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      analysis_content: cached.analysis_content,
      financial_snapshot: cached.financial_snapshot,
      generated_at: cached.generated_at,
      version: cached.version,
      cached: true,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch analysis' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/holdings/[id]/financial-profile/generate
 * Generate AI financial analysis for a holding's linked charity.
 * Use ?force=true to regenerate even if cached.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: holdingId } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const forceRegenerate = searchParams.get('force') === 'true';
  const sb = await createServerClient();

  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      return aiAuthRequired();
    }

    // Check for cached analysis (unless force)
    if (!forceRegenerate) {
      const { data: cached } = await sb
        .from('generated_financial_analyses')
        .select('*')
        .eq('holding_id', holdingId)
        .order('version', { ascending: false })
        .limit(1)
        .single();

      if (cached) {
        return NextResponse.json({
          analysis_content: cached.analysis_content,
          financial_snapshot: cached.financial_snapshot,
          generated_at: cached.generated_at,
          version: cached.version,
          cached: true,
        });
      }
    }

    // Fetch holding with charity link
    const { data: holding, error: holdingError } = await sb
      .from('holdings')
      .select('id, name, charity_id')
      .eq('id', holdingId)
      .single();

    if (holdingError) throw holdingError;
    if (!holding?.charity_id) {
      return NextResponse.json(
        { error: 'No charity linked to this holding' },
        { status: 400 }
      );
    }

    // Fetch charity data
    const { data: charity, error: charityError } = await sb
      .from('charities')
      .select('*')
      .eq('id', holding.charity_id)
      .single();

    if (charityError) throw charityError;

    // Fetch ProPublica filings for trend data
    let filings: any[] = [];
    if (charity.ein) {
      try {
        const org = await getOrganization(charity.ein);
        filings = (org?.filings_with_data || []).map((f: any) => ({
          tax_year: f.tax_prd_yr,
          total_revenue: f.totrevenue,
          total_expenses: f.totfuncexpns,
          total_assets: f.totassetsend,
          total_liabilities: f.totliabend,
        }));
      } catch {
        // ProPublica fetch failed — continue with charity table data only
      }
    }

    // Build context for OpenAI
    const financialContext = buildFinancialContext(charity, filings);

    // Generate analysis
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: FINANCIAL_ANALYSIS_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: `Analyze the financial health of the following nonprofit organization:\n\n${financialContext}`,
        },
      ],
      temperature: 0.5,
      max_tokens: 1500,
    });

    const analysisContent = completion.choices[0]?.message?.content || '';
    const generatedAt = new Date().toISOString();

    // Get current max version
    const { data: existingVersions } = await sb
      .from('generated_financial_analyses')
      .select('version')
      .eq('holding_id', holdingId)
      .order('version', { ascending: false })
      .limit(1);

    const newVersion = existingVersions && existingVersions.length > 0
      ? existingVersions[0].version + 1
      : 1;

    // Save to DB
    const financialSnapshot = {
      charity: {
        ein: charity.ein,
        name: charity.name,
        sector: charity.sector,
        annual_revenue: charity.annual_revenue,
        annual_expenses: charity.annual_expenses,
        assets: charity.assets,
        program_expense_ratio: charity.program_expense_ratio,
      },
      filings,
    };

    const { error: insertError } = await sb
      .from('generated_financial_analyses')
      .insert({
        holding_id: holdingId,
        charity_id: holding.charity_id,
        analysis_content: analysisContent,
        financial_snapshot: financialSnapshot,
        generated_at: generatedAt,
        generated_by: user.id,
        version: newVersion,
      });

    if (insertError) {
      console.error('Failed to cache financial analysis:', insertError);
      return NextResponse.json(
        { error: 'Analysis generated but could not be saved. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      analysis_content: analysisContent,
      financial_snapshot: financialSnapshot,
      generated_at: generatedAt,
      version: newVersion,
      cached: false,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to generate analysis' },
      { status: 500 }
    );
  }
}

function buildFinancialContext(charity: any, filings: any[]): string {
  const sections: string[] = [];

  sections.push(`Organization: ${charity.name}${charity.legal_name ? ` (${charity.legal_name})` : ''}`);
  sections.push(`EIN: ${charity.ein || 'Unknown'}`);
  if (charity.sector) sections.push(`Sector: ${charity.sector}`);
  if (charity.ntee_code) sections.push(`NTEE Code: ${charity.ntee_code}`);
  if (charity.city && charity.state) sections.push(`Location: ${charity.city}, ${charity.state}`);
  if (charity.mission_statement) sections.push(`Mission: ${charity.mission_statement}`);

  sections.push('');
  sections.push('--- Current Financial Snapshot ---');
  if (charity.annual_revenue != null) {
    sections.push(`Annual Revenue: $${Number(charity.annual_revenue).toLocaleString()}`);
  }
  if (charity.annual_expenses != null) {
    sections.push(`Annual Expenses: $${Number(charity.annual_expenses).toLocaleString()}`);
  }
  if (charity.assets != null) {
    sections.push(`Total Assets: $${Number(charity.assets).toLocaleString()}`);
  }
  if (charity.program_expense_ratio != null) {
    sections.push(`Program Expense Ratio: ${(Number(charity.program_expense_ratio) * 100).toFixed(1)}%`);
  }

  if (filings.length > 0) {
    sections.push('');
    sections.push('--- Form 990 Filing History ---');
    for (const f of filings.slice(0, 8)) {
      sections.push(
        `Year ${f.tax_year}: Revenue $${(f.total_revenue || 0).toLocaleString()} | ` +
        `Expenses $${(f.total_expenses || 0).toLocaleString()} | ` +
        `Assets $${(f.total_assets || 0).toLocaleString()}` +
        (f.total_liabilities ? ` | Liabilities $${f.total_liabilities.toLocaleString()}` : '')
      );
    }
  }

  return sections.join('\n');
}

const FINANCIAL_ANALYSIS_SYSTEM_PROMPT = `You are a nonprofit financial analyst writing a concise, insightful assessment of a nonprofit's financial health for a philanthropic investor.

ANALYSIS FRAMEWORK:
1. Revenue Health: Is revenue growing, stable, or declining? What's the trend over available years?
2. Program Efficiency: What percentage of expenses goes to program services vs overhead? How does this compare to sector benchmarks (generally 75%+ is strong)?
3. Financial Reserves: Based on assets relative to annual expenses, how many months of reserves does the organization have? (3-6 months is adequate, 6+ is strong)
4. Sustainability Signals: Are there signs of financial stress (expenses exceeding revenue, declining assets) or strength (growing reserves, revenue diversification)?

WRITING STYLE:
- Write in clear, direct prose paragraphs — no bullet points, no markdown headers, no bold/italic formatting
- Lead with the most important finding
- Use specific numbers from the data, formatted naturally in sentences
- Provide context (e.g., "This 82% program expense ratio places the organization in the top quartile of similar nonprofits")
- Be balanced — note both strengths and areas of concern
- Keep it to 3-4 paragraphs maximum
- Do not speculate beyond what the data shows
- If data is limited (few filings), acknowledge this and note what additional data would help

AUDIENCE: Philanthropic investors evaluating whether to support this organization.`;
