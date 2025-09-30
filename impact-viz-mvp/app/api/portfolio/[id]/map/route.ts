import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params; // <- await the params
  const url = new URL(_req.url);
  const debug = url.searchParams.get('debug') === '1';

  // Bind Supabase to the user's auth cookies so RLS can verify portfolio membership
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: userData } = await supabase.auth.getUser();
  const authUserId = userData?.user?.id ?? null;

  const { data, error } = await supabase
    .from('holding_locations')
    .select('id, holding_id, name, tags, status, as_of, amount_usd, lon, lat')
    .eq('portfolio_id', portfolio_id)
    .order('name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const points = (data ?? []).map((d) => ({
    id: d.id,
    holdingId: d.holding_id,
    name: d.name,
    tags: d.tags ?? [],
    status: d.status ?? null,
    asOf: d.as_of ?? null,
    amountUSD: d.amount_usd ?? null,
    coords: [d.lon, d.lat] as [number, number],
  }));

  const base = {
    points,
    count: points.length,
    portfolio_id_echo: portfolio_id,
    auth_user_id: authUserId,
  } as any;

  if (debug) {
    try {
      const sr = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      );
      const { data: srData } = await sr
        .from('holding_locations')
        .select('id')
        .eq('portfolio_id', portfolio_id);
      base.service_role_count = srData?.length ?? 0;
    } catch (e) {
      base.service_role_error = (e as Error)?.message ?? 'service role check failed';
    }
  }

  return NextResponse.json(base);
}