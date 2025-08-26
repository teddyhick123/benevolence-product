import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n: string) => cookieStore.get(n)?.value } }
  );

  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Profile</h1>
      {!user ? (
        <p className="text-sm text-neutral-600">You’re not signed in.</p>
      ) : (
        <div className="rounded-2xl bg-white shadow-soft border border-black/5 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-neutral-500">Email</div>
              <div className="mt-1">{user.email}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-neutral-500">User ID</div>
              <div className="mt-1 font-mono text-xs break-all">{user.id}</div>
            </div>
          </div>
          <p className="mt-6 text-sm text-neutral-600">
            (Planned) Manage your display name, default portfolio, and notification preferences here.
          </p>
        </div>
      )}
    </div>
  );
}