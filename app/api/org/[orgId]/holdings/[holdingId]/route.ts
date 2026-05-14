import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// DELETE /api/org/[orgId]/holdings/[holdingId]
// Legacy unlink endpoint retained so older clients receive a clear product response.
export async function DELETE() {
  return NextResponse.json(
    {
      error:
        "Holding links have been retired. Manage holdings from the portfolio holdings screen.",
    },
    { status: 410 }
  );
}
