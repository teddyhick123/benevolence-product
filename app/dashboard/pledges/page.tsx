import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import PledgePipelineDashboard from '@/components/pledges/PledgePipelineDashboard';

export const dynamic = 'force-dynamic';

async function getOrgId(cookieHeader: string, base: string): Promise<{ orgId: string | null; hasPledges: boolean }> {
  try {
    const res = await fetch(`${base}/api/org`, { cache: 'no-store', headers: { cookie: cookieHeader } });
    if (!res.ok) return { orgId: null, hasPledges: false };
    const data = await res.json();
    const org = data.organizations?.[0];
    return { orgId: org?.id ?? null, hasPledges: !!(org?.modules?.pledges) };
  } catch { return { orgId: null, hasPledges: false }; }
}

export default async function PledgesPage() {
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host  = h.get('host') ?? 'localhost:3000';
  const base  = `${proto}://${host}`;
  const cookie = h.get('cookie') ?? '';

  const { orgId, hasPledges } = await getOrgId(cookie, base);

  if (!orgId) redirect('/');
  if (!hasPledges) redirect('/dashboard/donors');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif">Pledge Pipeline</h1>
        <p className="text-sm text-neutral-500 mt-1">Committed gifts, installment schedules, and fulfillment tracking</p>
      </div>
      <PledgePipelineDashboard orgId={orgId} />
    </div>
  );
}
