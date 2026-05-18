import { NextResponse } from 'next/server';

/**
 * /api/portfolio/[id]/donor-profile — REMOVED
 *
 * The legacy personal tax profile table that backed this route has been
 * removed from the schema. Personal tax data (AGI, filing status) now lives
 * in tax_years.adjusted_gross_income and tax_profiles — see migration
 * 0013_tax_contributions.sql.
 *
 * TODO(Task 6): if date_of_birth or other personal fields are needed for QCD
 * eligibility calculations, add them to tax_profiles and wire a new route.
 */
export const runtime = 'nodejs';

const GONE_BODY = {
  error: 'This endpoint has been removed.',
  detail:
    'Personal tax profile data (AGI, filing status) is now managed through ' +
    '/api/portfolio/[id]/tax/years. See tax_years.adjusted_gross_income for the canonical AGI source.',
};

export async function GET() {
  return NextResponse.json(GONE_BODY, { status: 410 });
}

export async function POST() {
  return NextResponse.json(GONE_BODY, { status: 410 });
}

export async function PUT() {
  return NextResponse.json(GONE_BODY, { status: 410 });
}
