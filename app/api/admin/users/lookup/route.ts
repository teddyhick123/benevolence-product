// app/api/admin/users/lookup/route.ts
import { NextResponse } from 'next/server';
import { isAccessDenied, requireAppAdmin } from '@/lib/api/access';
import { createAppAdminDirectoryRepository } from '@/lib/api/repositories/admin-directory';

function noStore(json: any, status = 200) {
  return NextResponse.json(json, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get('email') || '';
  const email = raw.trim().toLowerCase();

  if (!email) return noStore({ error: 'email is required' }, 400);
  // light format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return noStore({ error: 'invalid email' }, 422);

  const access = await requireAppAdmin();
  if (isAccessDenied(access)) return access.response;

  try {
    const user = await createAppAdminDirectoryRepository(access.context)
      .findUserByEmail(email);
    return noStore({ data: user });
  } catch (error) {
    return noStore({ error: error instanceof Error ? error.message : 'User lookup failed' }, 500);
  }
}
