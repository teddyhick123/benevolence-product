"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { OrgRole } from "@/lib/roles";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface UserOrg {
  id: string;
  name: string;
  role: OrgRole;
}

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  const [orgs, setOrgs] = useState<UserOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pathname = usePathname();

  // Extract orgId from pathname
  const pathParts = pathname.split("/");
  const orgIdIndex = pathParts.indexOf("org") + 1;
  const currentOrgId = pathParts[orgIdIndex] || null;

  useEffect(() => {
    async function fetchOrgs() {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from("organization_members")
        .select(`
          role,
          organizations (id, name)
        `)
        .eq("user_id", user.id);

      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      const userOrgs = (data || []).map((row: any) => ({
        id: row.organizations.id,
        name: row.organizations.name,
        role: row.role as OrgRole,
      }));

      setOrgs(userOrgs);
      setLoading(false);
    }

    fetchOrgs();
  }, []);

  const currentOrg = orgs.find((o) => o.id === currentOrgId);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-azure"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="card p-6 text-center">
          <h2 className="text-xl font-semibold text-red-600 mb-2">Error</h2>
          <p className="text-neutral-600">{error}</p>
          <Link href="/login" className="mt-4 inline-block text-azure hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (orgs.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="card p-6 text-center">
          <h2 className="text-xl font-semibold mb-2">No Organizations</h2>
          <p className="text-neutral-600 mb-4">
            You are not a member of any organization yet.
          </p>
          <Link
            href="/org/new"
            className="inline-block px-4 py-2 rounded-2xl bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white shadow-soft hover:opacity-90 transition"
          >
            Create Organization
          </Link>
        </div>
      </div>
    );
  }

  // If no org selected and user has orgs, show org selector
  if (!currentOrgId) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="card p-6">
          <h2 className="text-xl font-semibold mb-4">Select Organization</h2>
          <div className="space-y-3">
            {orgs.map((org) => (
              <Link
                key={org.id}
                href={`/org/${org.id}`}
                className="block p-4 border border-black/10 rounded-xl hover:bg-white hover:shadow-sm transition"
              >
                <div className="font-medium">{org.name}</div>
                <div className="text-sm text-neutral-500 capitalize">{org.role}</div>
              </Link>
            ))}
          </div>
          <div className="mt-6 pt-4 border-t border-black/5">
            <Link
              href="/org/new"
              className="text-azure hover:underline text-sm"
            >
              + Create new organization
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const navItems = [
    { href: `/org/${currentOrgId}`, label: "Dashboard", icon: "chart" },
    { href: `/org/${currentOrgId}/tasks`, label: "Tasks", icon: "tasks" },
    { href: `/org/${currentOrgId}/data`, label: "Data", icon: "data" },
    { href: `/org/${currentOrgId}/members`, label: "Team", icon: "users" },
    { href: `/org/${currentOrgId}/settings`, label: "Settings", icon: "settings" },
  ];

  return (
    <div className="flex flex-col md:flex-row gap-6">
      {/* Sidebar */}
      <aside className="w-full md:w-56 flex-shrink-0">
        <div className="card p-4 space-y-4">
          {/* Org Selector */}
          {orgs.length > 1 ? (
            <select
              value={currentOrgId}
              onChange={(e) => {
                window.location.href = `/org/${e.target.value}`;
              }}
              className="w-full px-3 py-2 border border-black/10 rounded-lg text-sm"
            >
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="font-medium text-lg">{currentOrg?.name}</div>
          )}

          {/* Navigation */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href ||
                (item.href !== `/org/${currentOrgId}` && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block px-3 py-2 rounded-lg text-sm transition ${
                    isActive
                      ? "bg-azure/10 text-azure font-medium"
                      : "hover:bg-black/5"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Role badge */}
          {currentOrg && (
            <div className="pt-3 border-t border-black/5">
              <div className="text-xs text-neutral-500">Your role</div>
              <div className="text-sm font-medium capitalize">{currentOrg.role}</div>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
