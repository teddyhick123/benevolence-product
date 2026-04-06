// app/api/portfolio/[id]/summary/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ summary: 'AI summary disabled: OPENAI_API_KEY not set.' });
  }

  const supabase = await createSupabaseServerClient();

  // Get latest KPI values with targets from v_portfolio_kpi_latest
  // This view now includes target_value, target_date, and display_name from portfolio_metric_targets
  const { data: metrics } = await supabase
    .from('v_portfolio_kpi_latest')
    .select('metric_code, metric_name, display_name, value, unit, period_end, target_value, target_date')
    .eq('portfolio_id', portfolio_id)
    .order('metric_code', { ascending: true });

  // Build a concise prompt
  const lines: string[] = [];
  lines.push(`Portfolio ID: ${portfolio_id}`);

  if (metrics && metrics.length) {
    // Separate metrics with targets from those without
    const withTargets = metrics.filter(m => m.target_value != null);
    const withoutTargets = metrics.filter(m => m.target_value == null);

    if (withTargets.length > 0) {
      lines.push('Targets & Progress:');
      for (const m of withTargets) {
        const name = m.display_name || m.metric_name || m.metric_code;
        const current = m.value != null ? `${m.value}${m.unit ? ' ' + m.unit : ''}` : '—';
        lines.push(`- ${name}: ${current} / ${m.target_value ?? '—'} by ${m.target_date ?? '—'}`);
      }
    }

    if (withoutTargets.length > 0) {
      lines.push('Latest KPI readings (no targets set):');
      for (const m of withoutTargets) {
        const name = m.display_name || m.metric_name || m.metric_code;
        lines.push(`- ${name}: ${m.value ?? '—'}${m.unit ? ' ' + m.unit : ''} (as of ${m.period_end ?? '—'})`);
      }
    }
  }

  const system = `You are a concise portfolio analyst. Produce a short, plain-English summary (<120 words) of this portfolio's recent activity and progress vs. targets. Be specific but neutral, and include 1–2 concrete highlights and any material gaps vs. goals.`;
  const user = lines.join('\n');

  // Call OpenAI (chat completions, JSON not needed)
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    return NextResponse.json({ summary: `AI service error: ${txt || res.statusText}` }, { status: 200 });
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    return NextResponse.json({ summary: 'AI service returned an unreadable response.' });
  }
  const content = data?.choices?.[0]?.message?.content || 'No summary available.';
  return NextResponse.json({ summary: content });
}