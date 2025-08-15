import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = supabaseServer();
  // TODO: compute KPIs from metric_facts; for now return stub
  return NextResponse.json({
    portfolioId: params.id,
    kpis: [
      { title: 'Impact Coverage', value: 0.78, delta: 0.031 },
      { title: 'WACI', value: 92, delta: -5.5 }
    ],
    as_of: new Date().toISOString().slice(0,10)
  });
}
