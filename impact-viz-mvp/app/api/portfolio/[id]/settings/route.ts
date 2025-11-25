

// app/api/portfolio/[id]/settings/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

/** Returns settings for a portfolio: { show_map: boolean, widgets: string[] }
 * Defaults: show_map=true, widgets=['kpi_waci','sector_emissions']
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;

  // SSR-bound Supabase client (reads auth cookies)
  const c = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return c.get(name)?.value; },
        set(name: string, value: string, options: any) { c.set({ name, value, ...options }); },
        remove(name: string) { c.delete(name); },
      },
    }
  );

  const DEFAULTS = { show_map: true, widgets: [] as string[] };

  try {
    const { data, error } = await supabase
      .from('portfolio_settings')
      .select('show_map, widgets')
      .eq('portfolio_id', portfolio_id)
      .single();

    const cacheHeaders = { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=300' };

    // If table missing or no row, fall back to defaults
    if (error) {
      // PGRST116 = 0 rows; 42P01 = relation does not exist
      if (error.code === 'PGRST116' || error.code === '42P01') {
        return NextResponse.json(DEFAULTS, { headers: cacheHeaders });
      }
      // Any other error: still return defaults but include hint
      return NextResponse.json({ ...DEFAULTS, _hint: 'settings_error', _detail: error.message }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const show_map = typeof data?.show_map === 'boolean' ? data.show_map : DEFAULTS.show_map;
    const widgets = Array.isArray(data?.widgets) && (data.widgets as any[]).length
      ? (data.widgets as string[])
      : DEFAULTS.widgets;

    return NextResponse.json({ show_map, widgets }, { headers: cacheHeaders });
  } catch (e: any) {
    // Network/other failure: return defaults
    return NextResponse.json({ ...DEFAULTS, _hint: 'settings_exception', _detail: e?.message || '' }, { headers: { 'Cache-Control': 'no-store' } });
  }
}