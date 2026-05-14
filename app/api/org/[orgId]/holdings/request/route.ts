import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/org/[orgId]/holdings/request
// Legacy endpoint retained so older clients receive a clear product response.
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Holding link requests have been retired. Add holdings directly to an organization portfolio.",
    },
    { status: 410 }
  );
}
