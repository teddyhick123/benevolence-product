// app/api/portfolio/[id]/summary/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';
import { aiLimiter } from '@/lib/rate-limit';
import { aiAuthRequired, rateLimitExceeded } from '@/lib/rate-limit-response';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;

  const supabase = await createSupabaseServerClient();

  // Auth check — no anonymous access to AI features
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return aiAuthRequired();

  // Per-user rate limit
  const { success, reset, remaining, limit } = await aiLimiter.limit(authUser.id);
  if (!success) return rateLimitExceeded(reset, remaining, limit);

  // Get latest KPI values with targets from v_portfolio_kpi_latest
  const { data: metrics } = await supabase
    .from('v_portfolio_kpi_latest')
    .select('metric_code, metric_name, display_name, value, unit, period_end, target_value, target_date')
    .eq('portfolio_id', portfolio_id)
    .order('metric_code', { ascending: true });

  // Build a concise prompt
  const lines: string[] = [];
  lines.push(`Portfolio ID: ${portfolio_id}`);

  if (metrics && metrics.length) {
    const withTargets = metrics.filter(m => m.target_value != null);
    const withoutTargets = metrics.filter(m => m.target_value == null);

    if (withTargets.length > 0) {
      lines.push('Targets & Progress:');
      for (const m of withTargets) {
        const name = (m as any).display_name || m.metric_name || m.metric_code;
        const current = m.value != null ? `${m.value}${m.unit ? ' ' + m.unit : ''}` : '—';
        lines.push(`- ${name}: ${current} / ${(m as any).target_value ?? '—'} by ${(m as any).target_date ?? '—'}`);
      }
    }

    if (withoutTargets.length > 0) {
      lines.push('Latest KPI readings (no targets set):');
      for (const m of withoutTargets) {
        const name = (m as any).display_name || m.metric_name || m.metric_code;
        lines.push(`- ${name}: ${m.value ?? '—'}${m.unit ? ' ' + m.unit : ''} (as of ${m.period_end ?? '—'})`);
      }
    }
  }

  const systemPrompt = `You are a concise portfolio analyst. Produce a short, plain-English summary (<120 words) of this portfolio's recent activity and progress vs. targets. Be specific but neutral, and include 1–2 concrete highlights and any material gaps vs. goals.`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: systemPrompt,
      messages: [{ role: 'user', content: lines.join('\n') }],
    });
    const content = (msg.content[0] as { type: string; text: string })?.text || 'No summary available.';
    return NextResponse.json({ summary: content });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ summary: `AI summary unavailable: ${msg}` }, { status: 200 });
  }
}
