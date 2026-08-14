import { redirect } from 'next/navigation';

interface OrgSettingsPageProps {
  params: Promise<{ orgId: string }>;
}

export default async function OrgSettingsPage({ params }: OrgSettingsPageProps) {
  const { orgId } = await params;
  redirect(`/settings/organization?org=${encodeURIComponent(orgId)}`);
}
