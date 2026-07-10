import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Retired (audit Phase 0, item 5): delivery status must come from verified
// GitHub merge and deployment facts, not a reviewer assertion. Proposals now
// stop at pr_opened until verified delivery records ship (audit Phase 6).
export async function POST() {
  return NextResponse.json(
    {
      error:
        'Manual ship confirmation has been retired. A proposal stops at pr_opened; merge and deployment status will come from verified provider events.',
    },
    { status: 410, headers: { 'Cache-Control': 'no-store' } }
  );
}
