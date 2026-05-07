// app/admin/imports/page.tsx
// Import dashboard — server component

import Link from 'next/link';
import { createServerClient } from '@/lib/supabase';
import { ImportStatusBadge } from '@/components/admin/ImportStatusBadge';
import { ImportDashboardClient } from './ImportDashboardClient';
import type { ImportJob } from '@/lib/import/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ImportsPage() {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="card p-6 text-sm text-neutral-600">
          You&apos;re not signed in.{' '}
          <Link href="/login" className="text-azure underline">
            Sign in
          </Link>{' '}
          to continue.
        </div>
      </div>
    );
  }

  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="card p-6 text-sm text-neutral-600">
          You don&apos;t have access to this area.
        </div>
      </div>
    );
  }

  const [{ data: jobs }, { data: portfolios }] = await Promise.all([
    supabase.from('import_jobs').select('*').order('created_at', { ascending: false }),
    supabase.from('portfolios').select('id, name').order('name'),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <ImportDashboardClient
        initialJobs={(jobs as ImportJob[]) ?? []}
        portfolios={(portfolios as { id: string; name: string }[]) ?? []}
      />
    </div>
  );
}
