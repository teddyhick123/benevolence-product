

// app/api/admin/portfolios/[id]/settings/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { portfolioSettingsSchema } from '@/lib/schemas/admin';

/** Admin-only: upsert settings { show_map?: boolean, widgets?: string[] } */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolioId } = await ctx.params;

  // Accept JSON or form data (validate JSON, fallback to FormData)
  const parsed = await req.json().catch(async () => {
    const fd = await req.formData().catch(() => null);
    if (fd && typeof fd.get === 'function') {
      const showMapRaw = fd.get('show_map');
      const widgetsRaw = fd.get('widgets');
      return {
        show_map: typeof showMapRaw === 'string' ? showMapRaw === 'true' : (showMapRaw as any),
        widgets: typeof widgetsRaw === 'string' ? (widgetsRaw as string).split(',').map(s => s.trim()).filter(Boolean) : undefined,
      };
    }
    return {};
  });

  // Validate parsed data with Zod
  const validation = portfolioSettingsSchema.safeParse(parsed);
  if (!validation.success) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        details: validation.error.format(),
      },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const { name, show_map, widgets } = validation.data;

  const supabase = await createSupabaseServerClient();

  // Admin check
  const { data: isAdmin, error: adminErr } = await supabase.rpc('is_app_admin');
  if (adminErr || !isAdmin) {
    return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }

  // Update portfolio name if provided
  if (name !== undefined) {
    const { error: nameError } = await supabase
      .from('portfolios')
      .update({ name })
      .eq('id', portfolioId);

    if (nameError) {
      return NextResponse.json({ error: nameError.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
    }
  }

  // Build upsert row for settings
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