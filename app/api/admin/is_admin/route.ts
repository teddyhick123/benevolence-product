// app/api/admin/is_admin/route.ts
import { NextResponse } from 'next/server';
import { isAccessDenied, requireUserAccess } from '@/lib/api/access';

export async function GET() {
  const access = await requireUserAccess();
  if (isAccessDenied(access)) {
    return NextResponse.json({ is_admin: false }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const { data: isAdmin } = await access.context.db.rpc('is_app_admin');
  return NextResponse.json({ is_admin: !!isAdmin }, { headers: { 'Cache-Control': 'no-store' } });
}
