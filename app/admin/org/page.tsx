'use client';

import { apiRequest, readJson } from "@/lib/api/client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Organization } from '@/lib/types/org';

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-coral/10 text-coral',
  admin: 'bg-azure/10 text-azure',
  member: 'bg-green-100 text-green-700',
  viewer: 'bg-neutral-100 text-neutral-600',
};

export default function OrgListPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest('/api/org', { cache: 'no-store' })
      .then(r => readJson(r))
      .then(d => {
        if (d.error) throw new Error(d.error);
        setOrgs(d.organizations || []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Organizations</h1>
        <Link
          href="/admin/org/new"
          className="px-4 py-2 rounded-2xl bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white shadow-soft hover:opacity-90 transition text-sm"
        >
          Create New
        </Link>
      </div>

      {error && (
        <div className="card p-4 text-sm text-red-700 bg-red-50 border border-red-200">{error}</div>
      )}

      {loading ? (
        <div className="card p-8 text-center text-neutral-500 text-sm">Loading…</div>
      ) : orgs.length === 0 ? (
        <div className="card p-8 text-center text-neutral-500 text-sm">
          No organizations yet.{' '}
          <Link href="/admin/org/new" className="text-azure hover:underline">Create one</Link>.
        </div>
      ) : (
        <div className="space-y-3">
          {orgs.map(org => (
            <Link
              key={org.id}
              href={`/admin/org/${org.id}`}
              className="card p-4 flex items-center justify-between hover:shadow-md transition group"
            >
              <div>
                <div className="font-medium group-hover:text-azure transition">{org.name}</div>
                {org.ein && <div className="text-xs text-neutral-500 mt-0.5">EIN {org.ein}</div>}
                {org.org_type && (
                  <div className="text-xs text-neutral-400 mt-0.5 capitalize">
                    {org.org_type.replace(/_/g, ' ')}
                  </div>
                )}
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${ROLE_COLORS[org.role || 'viewer'] || ROLE_COLORS.viewer}`}>
                {org.role}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
