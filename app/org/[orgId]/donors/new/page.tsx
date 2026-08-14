import { redirect } from 'next/navigation';

export default async function OrgNewDonorPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  redirect(`/dashboard/donors/new?org=${encodeURIComponent(orgId)}`);
}
