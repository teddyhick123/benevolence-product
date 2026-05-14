import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/admin/holdings/[id]/org-link
// Legacy endpoint retained for old clients. Holdings are now org-owned via holdings.org_id.
export async function GET() {
  return NextResponse.json({ links: [] });
}

// POST /api/admin/holdings/[id]/org-link
// Legacy verification flow retired with direct org-owned holdings.
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Holding link verification has been retired. Holdings are owned directly by their portfolio organization.",
    },
    { status: 410 }
  );
}
