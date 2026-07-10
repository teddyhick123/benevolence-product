import { redirect } from 'next/navigation';

interface ModuleSettingsPageProps {
  params: Promise<{ orgId: string }>;
}

export default async function ModuleSettingsPage({ params }: ModuleSettingsPageProps) {
  const { orgId } = await params;
  redirect(`/builder-studio?org_id=${encodeURIComponent(orgId)}#modules`);
}
