// app/settings/layout.tsx
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import SettingsTabs from '@/components/settings/SettingsTabs';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient();
  const cookieStore = await cookies();
  const orgId = cookieStore.get('x-org-id')?.value;

  if (!orgId) redirect('/onboarding');

  const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
  if (!isAdmin) redirect('/dashboard');

  return (
    <div className="min-h-screen bg-creme">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="font-serif text-3xl mb-6">Settings</h1>
        <SettingsTabs />
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
