import { redirect } from 'next/navigation';

export default async function LegacyDashboardIntegrationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries((await searchParams) ?? {})) {
    if (value) params.set(key, value);
  }
  redirect(`/settings/integrations${params.size ? `?${params}` : ''}`);
}
