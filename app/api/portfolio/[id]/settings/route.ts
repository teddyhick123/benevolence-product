

// app/api/portfolio/[id]/settings/route.ts
import { NextResponse } from 'next/server';
import { requirePortfolioAccess, isAccessDenied } from '@/lib/api/access';

/** Returns settings for a portfolio: { show_map: boolean, widgets: string[] }
 * Defaults: show_map=true, widgets=['kpi_waci','sector_emissions']
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const access = await requirePortfolioAccess(portfolio_id);
  if (isAccessDenied(access)) return access.response;

  const DEFAULTS = { show_map: true, widgets: [] as string[] };

  try {
    const { data, error } = await access.context.db
      .from('portfolio_settings')
      .select('key, value')
      .eq('portfolio_id', portfolio_id)
      .in('key', ['show_map', 'widgets']);

    const cacheHeaders = { 'Cache-Control': 'no-store' };

    // If table missing or no row, fall back to defaults
    if (error) {
      // PGRST116 = 0 rows; 42P01 = relation does not exist
      if (error.code === 'PGRST116' || error.code === '42P01') {
        return NextResponse.json(DEFAULTS, { headers: cacheHeaders });
      }
      // Any other error: still return defaults but include hint
      return NextResponse.json({ ...DEFAULTS, _hint: 'settings_error', _detail: error.message }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const settings = new Map((data ?? []).map(row => [row.key, row.value]));
    const showMapValue = settings.get('show_map');
    const widgetsValue = settings.get('widgets');
    const show_map = typeof showMapValue === 'boolean' ? showMapValue : DEFAULTS.show_map;
    const widgets = Array.isArray(widgetsValue) && widgetsValue.length
      ? widgetsValue.filter((value): value is string => typeof value === 'string')
      : DEFAULTS.widgets;

    return NextResponse.json({ show_map, widgets }, { headers: cacheHeaders });
  } catch (e: any) {
    // Network/other failure: return defaults
    return NextResponse.json({ ...DEFAULTS, _hint: 'settings_exception', _detail: e?.message || '' }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
