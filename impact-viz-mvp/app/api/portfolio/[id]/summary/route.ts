// app/api/portfolio/[id]/summary/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolioId } = await ctx.params;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ summary: 'AI summary disabled: OPENAI_API_KEY not set.' });
  }

  const c = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => c.get(n)?.value,
        set: (n, v, o) => c.set({ name: n, value: v, ...o }),
        remove: (n, o) => c.set({ name, value: '', ...o }),
      },
    }
  );

  // Pull latest KPI definitions (names/targets) and compute latest KPI values from v_portfolio_latest
  const [{ data: kpis }, { data: latest }] = await Promise.all([
    supabase
      .from('kpi_definitions')
      .select('metric_code, display_name, target_value, target_date')
      .eq('portfolio_id', portfolioId)
      .order('order_index', { ascending: true }),
    supabase
      .from('v_portfolio_latest')
      .select('metric_name, metric_value, as_of_date')
      .eq('portfolio_id', portfolioId)
  ]);

  // Build a concise prompt
  const lines: string[] = [];
  lines.push(`Portfolio ID: ${portfolioId}`);
  if (kpis && kpis.length) {
    lines.push('Targets:');
    for (const k of kpis) {
      const name = k.display_name || k.metric_code;
      lines.push(`- ${name}: target ${k.target_value ?? '—'} by ${k.target_date ?? '—'}`);
    }
  }
  if (latest && latest.length) {
    lines.push('Latest KPI readings:');
    for (const r of latest) {
      lines.push(`- ${r.metric_name}: ${r.metric_value ?? '—'} (as of ${r.as_of_date ?? '—'})`);
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

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || 'No summary available.';
  return NextResponse.json({ summary: content });
}