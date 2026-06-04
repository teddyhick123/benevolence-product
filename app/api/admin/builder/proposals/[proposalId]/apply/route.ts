import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// This endpoint has been retired. Use the org-scoped GitHub PR apply route instead:
//   POST /api/org/:orgId/builder/proposals/:proposalId/apply
export async function POST(_req: NextRequest): Promise<NextResponse> {
  return NextResponse.json(
    {
      error: 'This endpoint has been retired.',
      use: 'POST /api/org/{orgId}/builder/proposals/{proposalId}/apply',
    },
    { status: 410 }
  );
}
