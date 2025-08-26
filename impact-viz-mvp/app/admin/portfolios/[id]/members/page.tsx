// app/admin/portfolios/[id]/members/page.tsx
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import AdminRoleSelect from '@/components/admin/AdminRoleSelect'
import EmailLookupAdd from '@/components/admin/EmailLookupAdd';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type MemberRow = {
  user_id: string;
  role: 'owner' | 'editor' | 'viewer' | string;
  added_at: string | null;
  profiles?: { display_name?: string | null } | null;
};

async function loadMembers(portfolioId: string) {
  const c = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => c.get(n)?.value,
        set: (n, v, o) => c.set({ name: n, value: v, ...o }),
        remove: (n, o) => c.set({ name: n, value: '', ...o }),
      },
    }
  );

  // Ensure admin
  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) return { error: 'Not authorized', members: [] as MemberRow[] };

  // Pull members + display name if present
  const { data, error } = await supabase
    .from('portfolio_members')
    .select(`
      user_id,
      role,
      added_at,
      profiles:profiles(display_name)
    `)
    .eq('portfolio_id', portfolioId)
    .order('role', { ascending: true });

  return { error: error?.message ?? null, members: (data ?? []) as MemberRow[] };
}

export default async function MembersPage(ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolioId } = await ctx.params;
  const { error, members } = await loadMembers(portfolioId);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Members</h1>
        <a
          href={`/dashboard?portfolio_id=${encodeURIComponent(portfolioId)}`}
          className="px-4 py-2 rounded-2xl bg-azure text-white shadow-soft hover:opacity-90 transition"
        >
          View Dashboard
        </a>
      </div>

      {error && (
        <div className="card p-4 text-sm text-red-700 bg-red-50 border border-red-200">
          {error}
        </div>
      )}

      {/* Add member by email (admin lookup) */}
      <div className="card p-4 space-y-3">
        <h2 className="text-lg font-medium">Add member by email</h2>
        <EmailLookupAdd portfolioId={portfolioId} />
        <div className="text-xs text-neutral-500">
          Uses admin lookup to resolve email → user_id, then adds with selected role.
        </div>
      </div>

      {/* Add member form (by user_id for v1; we can add email search later) */}
      <form
        action={`/api/admin/portfolios/${encodeURIComponent(portfolioId)}/members`}
        method="post"
        className="card p-4 space-y-3"
      >
        <div className="text-sm text-neutral-600">
          Add a member by <code>user_id</code> and role. (Email lookup coming next.)
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            name="user_id"
            placeholder="user_id (UUID)"
            required
            className="border rounded-2xl px-3 py-2"
          />
          <select name="role" className="border rounded-2xl px-3 py-2">
            <option value="viewer">viewer</option>
            <option value="editor">editor</option>
            <option value="owner">owner</option>
          </select>
          <button
            className="px-4 py-2 rounded-2xl bg-azure text-white shadow-soft hover:opacity-90 transition"
            type="submit"
          >
            Add member
          </button>
        </div>
        <input type="hidden" name="__from" value="ui" />
      </form>

      {/* Members list */}
      <div className="card p-4">
        {members.length === 0 ? (
          <div className="text-sm text-neutral-600">No members yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5">
                <th className="text-left px-3 py-2 font-medium text-neutral-700">User</th>
                <th className="text-left px-3 py-2 font-medium text-neutral-700">Role</th>
                <th className="text-left px-3 py-2 font-medium text-neutral-700">Added</th>
                <th className="text-right px-3 py-2 font-medium text-neutral-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id} className="border-b border-black/5">
                  <td className="px-3 py-2">
                    <div className="font-medium">{m.profiles?.display_name ?? '—'}</div>
                    <div className="text-xs text-neutral-500 font-mono">{m.user_id}</div>
                  </td>
                  <td className="px-3 py-2">
                    <AdminRoleSelect
                      portfolioId={portfolioId}
                      userId={m.user_id}
                      initialRole={(m.role as any) || 'viewer'}
                    />
                  </td>
                  <td className="px-3 py-2">{m.added_at ? new Date(m.added_at).toLocaleString() : '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <form
                      action={`/api/admin/portfolios/${encodeURIComponent(portfolioId)}/members/${encodeURIComponent(m.user_id)}`}
                      method="post"
                      onSubmit={(e) => {
                        if (!confirm('Remove this member?')) e.preventDefault();
                      }}
                    >
                      <input type="hidden" name="_method" value="DELETE" />
                      <button className="px-3 py-1.5 rounded-2xl border border-black/10 hover:bg-white shadow-sm hover:shadow transition">
                        Remove
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}