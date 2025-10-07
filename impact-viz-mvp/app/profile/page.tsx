import { createSupabaseServerClient } from "@/lib/supabase-server";
import ProfileHeader from "@/components/profile/ProfileHeader";
import AccountSettings from "@/components/profile/AccountSettings";
import PortfolioAccess from "@/components/profile/PortfolioAccess";
import Preferences from "@/components/profile/Preferences";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const getSupabase = createSupabaseServerClient;

export default async function ProfilePage() {
  const supabase = await getSupabase();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch user's portfolios and roles
  const { data: portfolios } = await supabase
    .from('portfolio_members')
    .select(`
      role,
      added_at,
      portfolio:portfolios!inner(id, name, description)
    `)
    .eq('user_id', user.id)
    .order('added_at', { ascending: false });

  // Check if user is admin
  const { data: adminData } = await supabase
    .from('admins')
    .select('user_id')
    .eq('user_id', user.id)
    .single();

  const isAdmin = !!adminData;

  // Fetch user metadata (we'll store display name, etc. in user metadata)
  const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'User';
  const avatarUrl = user.user_metadata?.avatar_url || null;
  const bio = user.user_metadata?.bio || null;
  const organization = user.user_metadata?.organization || null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-serif">Profile</h1>
        {isAdmin && (
          <a
            href="/admin/console"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            Admin Console
          </a>
        )}
      </div>

      {/* Profile Header */}
      <ProfileHeader
        userId={user.id}
        email={user.email!}
        displayName={displayName}
        avatarUrl={avatarUrl}
        bio={bio}
        organization={organization}
      />

      {/* Grid Layout for Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Account Settings */}
        <AccountSettings userId={user.id} email={user.email!} />

        {/* Preferences */}
        <Preferences userId={user.id} />
      </div>

      {/* Portfolio Access (Full Width) */}
      <PortfolioAccess
        portfolios={portfolios || []}
        isAdmin={isAdmin}
      />
    </div>
  );
}
