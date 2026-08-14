import { redirect } from 'next/navigation';

export default async function OrgDonorsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  redirect(`/dashboard/donors?org=${encodeURIComponent(orgId)}`);
}
