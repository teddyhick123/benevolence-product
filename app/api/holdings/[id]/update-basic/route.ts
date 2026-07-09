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

function json(body: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...init?.headers,
      'Cache-Control': 'no-store',
    },
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: holdingId } = await ctx.params;
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: holding, error: holdingError } = await supabase
    .from('holdings')
    .select('id, portfolio_id')
    .eq('id', holdingId)
    .single();

  if (holdingError || !holding) {
    return json({ error: 'Holding not found' }, { status: 404 });
  }

  // can_edit_portfolio verifies this portfolio_id against the current user.
  const { data: canEdit, error: canEditErr } = await supabase.rpc('can_edit_portfolio', {
    p_portfolio_id: holding.portfolio_id,
  });
  if (canEditErr) return json({ error: canEditErr.message }, { status: 500 });

  if (!canEdit) {
    return json({ error: 'Forbidden' }, { status: 403 });
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

  if (Object.keys(updates).length === 0) {
    return json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { error, data } = await supabase
    .from('holdings')
    .update(updates)
    .eq('id', holdingId)
    .select();

  if (error) {
    return json({ error: error.message }, { status: 500 });
  }

  revalidatePath(`/dashboard/holdings/${holdingId}`);
  revalidatePath(`/dashboard`);

  return json({ success: true, data });
}
