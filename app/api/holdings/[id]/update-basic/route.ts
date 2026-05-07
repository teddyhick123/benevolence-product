import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

function getValue(formData: FormData, key: string) {
  const val = formData.get(key);
  if (val === null || val === undefined) return undefined;
  const str = String(val).trim();
  return str === '' ? null : str;
}

function numOrNull(v: FormDataEntryValue | null) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: holdingId } = await ctx.params;
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: holding } = await supabase
    .from('holdings')
    .select('id, portfolio_id')
    .eq('id', holdingId)
    .single();

  if (!holding) {
    return NextResponse.json({ error: 'Holding not found' }, { status: 404 });
  }

  const { data: membership } = await supabase
    .from('portfolio_members')
    .select('role')
    .eq('portfolio_id', holding.portfolio_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const formData = await req.formData();
  const updates: any = {};

  const name = getValue(formData, 'name');
  if (name !== undefined) updates.name = name;

  const asset_type = getValue(formData, 'asset_type');
  if (asset_type !== undefined) updates.asset_type = asset_type;

  const sector = getValue(formData, 'sector');
  if (sector !== undefined) updates.sector = sector;

  const description = getValue(formData, 'description');
  if (description !== undefined) updates.description = description;

  const status = getValue(formData, 'status');
  if (status !== undefined) updates.status = status;

  const as_of = getValue(formData, 'as_of');
  if (as_of !== undefined) updates.as_of = as_of;

  const theory_of_action = getValue(formData, 'theory_of_action');
  if (theory_of_action !== undefined) updates.theory_of_action = theory_of_action;

  const funds_allocated = formData.has('funds_allocated')
    ? numOrNull(formData.get('funds_allocated'))
    : undefined;
  if (funds_allocated !== undefined) updates.funds_allocated = funds_allocated;

  const { error, data } = await supabase
    .from('holdings')
    .update(updates)
    .eq('id', holdingId)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath(`/dashboard/holdings/${holdingId}`);
  revalidatePath(`/dashboard`);

  return NextResponse.json({ success: true, data });
}
