/**
 * {ModuleName} Dashboard Page
 *
 * Main page for the {module_name} module.
 * Place at: /app/dashboard/{module_name}/page.tsx
 */

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {ModuleName}PageContent from './{ModuleName}PageContent';
import { getPageTitle } from '@/lib/config';

export const metadata = {
  title: getPageTitle('{ModuleName}'),
  description: 'Manage your {module_name} items',
};

export default async function {ModuleName}Page() {
  const supabase = createServerComponentClient({ cookies });

  // Verify authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login?redirect=/dashboard/{module_name}');
  }

  // Get user's organization
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    redirect('/onboarding');
  }

  // Check if module is enabled for this org
  const { data: moduleEnabled } = await supabase
    .from('organization_modules')
    .select('module_id')
    .eq('organization_id', membership.organization_id)
    .eq('module_id', '{module_name}')
    .maybeSingle();

  if (!moduleEnabled) {
    // Module not enabled - show upsell or redirect
    redirect('/dashboard?module_required={module_name}');
  }

  return (
    <{ModuleName}PageContent
      orgId={membership.organization_id}
      userRole={membership.role}
    />
  );
}
