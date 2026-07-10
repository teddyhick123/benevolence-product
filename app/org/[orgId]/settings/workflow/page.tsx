import { redirect } from 'next/navigation';

interface WorkflowSettingsPageProps {
  params: Promise<{ orgId: string }>;
}

export default async function WorkflowSettingsPage({ params }: WorkflowSettingsPageProps) {
  const { orgId } = await params;
  redirect(`/builder-studio?org_id=${encodeURIComponent(orgId)}#workflows`);
}
