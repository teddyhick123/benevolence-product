// app/admin/imports/[id]/mapping/page.tsx
// Mapping review page — server component

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAccessDenied, requireAppAdmin } from '@/lib/api/access';
import { createAppAdminImportReviewRepository } from '@/lib/api/repositories/imports';
import { branding } from '@/lib/config';
import { MappingPageClient } from './MappingPageClient';

export const dynamic = 'force-dynamic';

export default async function MappingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await requireAppAdmin();
  if (isAccessDenied(access)) redirect('/dashboard');
  const review = await createAppAdminImportReviewRepository({
    isAppAdmin: access.context.isAppAdmin,
    actorId: access.context.principal.userId,
  }).loadMappingReview(id);
  if (!review) {
    return <div className="card p-6 text-sm text-red-600">Import job not found.</div>;
  }
  const { importJob, mappingProfile, stagingPreviews } = review;

  if (!mappingProfile) {
    return (
      <div className="card p-6 text-sm text-red-600">
        No mapping profile found. Please create one first.
      </div>
    );
  }

  const activePreviews = stagingPreviews.filter((p) => p.rowCount > 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Link href={`/admin/imports/${id}`} className="text-neutral-400 hover:text-neutral-600 text-sm">
            ← {importJob.name}
          </Link>
        </div>
        <h1 className="text-2xl font-semibold">Field Mapping</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Map source CSV columns to {branding.appName} fields. Save & Validate to check data quality.
        </p>
      </div>

      <MappingPageClient
        job={importJob}
        mappingProfile={mappingProfile}
        stagingPreviews={activePreviews.length > 0 ? activePreviews : stagingPreviews}
      />
    </div>
  );
}
