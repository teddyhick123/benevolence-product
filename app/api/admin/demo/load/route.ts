// POST /api/admin/demo/load
// Requires app-admin auth and uses a fixed typed fixture. No SQL text is accepted
// or executed by this endpoint.

import { NextResponse } from 'next/server';
import { isAccessDenied, requireAppAdmin } from '@/lib/api/access';
import { createDemoSeedingRepository } from '@/lib/api/repositories/demo-seeding';

export async function POST() {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEMO_DATA_API !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const access = await requireAppAdmin();
  if (isAccessDenied(access)) return access.response;
  try {
    const result = await createDemoSeedingRepository(access.context).seed();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Demo seed failed' },
      { status: 500 }
    );
  }
}
