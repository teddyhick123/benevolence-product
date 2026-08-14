import { redirect } from 'next/navigation';

export default async function OrgDonorDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; donorId: string }>;
}) {
  const { orgId, donorId } = await params;
  redirect(`/dashboard/donors/${encodeURIComponent(donorId)}?org=${encodeURIComponent(orgId)}`);
}
