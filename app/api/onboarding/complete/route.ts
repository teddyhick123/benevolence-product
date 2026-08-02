import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * The original onboarding completion endpoint created organizations directly
 * and assigned the first user the admin role. Provisioning now has one
 * owner-safe implementation at /api/onboarding/provision. This public
 * tombstone performs no authentication, data access, or mutation.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'This onboarding endpoint has been retired.',
      canonical_endpoint: '/api/onboarding/provision',
    },
    {
      status: 410,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
