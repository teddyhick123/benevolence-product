

// app/api/admin/portfolios/[id]/settings/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

/** Admin-only: upsert settings { show_map?: boolean, widgets?: string[] } */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolioId } = await ctx.params;

  // Accept JSON or form data
  const parsed = await req.json().catch(async () => {
    const fd = await req.formData().catch(() => null);
    if (fd && typeof fd.get === 'function') {
      const showMapRaw = fd.get('show_map');
      const widgetsRaw = fd.get('widgets'); // expecting comma-separated list if provided
      return {
        show_map: typeof showMapRaw === 'string' ? showMapRaw === 'true' : (showMapRaw as any),
        widgets: typeof widgetsRaw === 'string' ? (widgetsRaw as string).split(',').map(s => s.trim()).filter(Boolean) : undefined,
      };
    }
    return {} as any;
  });

  const show_map = typeof parsed?.show_map === 'boolean' ? parsed.show_map : undefined;
  const widgets  = Array.isArray(parsed?.widgets) ? parsed.widgets as string[] : undefined;

  const supabase = await createSupabaseServerClient();

  // Admin check
  const { data: isAdmin, error: adminErr } = await supabase.rpc('is_admin');
  if (adminErr || !isAdmin) {
    return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }

  // Build upsert row
  const row: any = { portfolio_id: portfolioId };
  if (show_map !== undefined) row.show_map = show_map;
  if (widgets) row.widgets = widgets;

  // Upsert to portfolio_settings (create the table if you haven't already)
  const { error } = await supabase
    .from('portfolio_settings')
    .upsert(row, { onConflict: 'portfolio_id' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}