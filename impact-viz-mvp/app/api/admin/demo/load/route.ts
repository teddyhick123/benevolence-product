// POST /api/admin/demo/load
// Requires admin auth. Reads db/demo_data.sql, resolves a portfolio UUID for the
// current user (creates one if none exists), substitutes the placeholder UUID, and
// executes the SQL via Supabase.

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function POST() {
  const supabase = await createSupabaseServerClient();

  // Auth guard
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Admin guard
  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Resolve portfolio for this user — pick first or create one
  const { data: portfolios } = await supabase
    .from('portfolios')
    .select('id')
    .limit(1)
    .single();

  let portfolioId: string;

  if (portfolios?.id) {
    portfolioId = portfolios.id;
  } else {
    // Create a demo portfolio
    const { data: newPortfolio, error: createErr } = await supabase
      .from('portfolios')
      .insert({ name: 'Demo Portfolio', base_currency: 'USD' })
      .select('id')
      .single();
    if (createErr || !newPortfolio) {
      return NextResponse.json({ error: 'Failed to create portfolio: ' + (createErr?.message ?? 'unknown') }, { status: 500 });
    }
    portfolioId = newPortfolio.id;
  }

  // Read demo SQL file
  const sqlPath = path.join(process.cwd(), 'db', 'demo_data.sql');
  let sql: string;
  try {
    sql = await fs.readFile(sqlPath, 'utf-8');
  } catch {
    return NextResponse.json({ error: 'demo_data.sql not found at db/demo_data.sql' }, { status: 500 });
  }

  // Replace the hardcoded placeholder UUID with the real portfolio ID
  const PLACEHOLDER_UUID = 'ee0c5a4f-d5a3-4ae4-bac7-20f056e26dbd';
  sql = sql.replaceAll(PLACEHOLDER_UUID, portfolioId);

  // Execute via Supabase RPC exec_sql (admin-only function expected in DB)
  const { error: execErr } = await supabase.rpc('exec_sql', { sql });
  if (execErr) {
    return NextResponse.json({ error: 'SQL execution failed: ' + execErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, portfolioId });
}
