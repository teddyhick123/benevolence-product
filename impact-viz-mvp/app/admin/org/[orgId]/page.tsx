'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Organization, OrgType, OrgRole } from '@/lib/types/org';

const ORG_TYPES: { value: OrgType; label: string }[] = [
  { value: 'private_foundation', label: 'Private Foundation' },
  { value: 'daf', label: 'Donor-Advised Fund' },
  { value: 'community_foundation', label: 'Community Foundation' },
  { value: 'family_office', label: 'Family Office' },
  { value: 'operating_nonprofit', label: 'Operating Nonprofit' },
  { value: 'other', label: 'Other' },
];

const ROLES: OrgRole[] = ['owner', 'admin', 'member', 'viewer'];

type Tab = 'overview' | 'members' | 'portfolios' | 'modules' | 'branding';

interface Member {
  id: string;
  org_id: string;
  user_id: string;
  role: OrgRole;
  created_at: string;
}

interface Portfolio {
  id: string;
  name: string;
  org_id: string | null;
}

export default function OrgSettingsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const [tab, setTab] = useState<Tab>('overview');

  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // overview fields
  const [name, setName] = useState('');
  const [ein, setEin] = useState('');
  const [orgType, setOrgType] = useState<OrgType | ''>('');
  const [fiscalYearEnd, setFiscalYearEnd] = useState('');
  const [stateOfInc, setStateOfInc] = useState('');

  // members
  const [members, setMembers] = useState<Member[]>([]);
  const [newUserId, setNewUserId] = useState('');
  const [newRole, setNewRole] = useState<OrgRole>('member');

  // portfolios
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);

  // modules
  const [modules, setModules] = useState<Organization['modules']>({
    portfolio: true, tax: true, grants: true, compliance: false, donors: false, quickbooks: false,
  });

  // branding
  const [logoUrl, setLogoUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/org/${orgId}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setOrg(d);
        setName(d.name || '');
        setEin(d.ein || '');
        setOrgType(d.org_type || '');
        setFiscalYearEnd(d.fiscal_year_end ? d.fiscal_year_end.slice(0, 10) : '');
        setStateOfInc(d.state_of_incorporation || '');
        if (d.modules) setModules(d.modules);
        if (d.branding) {
          setLogoUrl(d.branding.logo_url || '');
          setPrimaryColor(d.branding.primary_color || '');
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => {
    if (tab === 'members') loadMembers();
    if (tab === 'portfolios') loadPortfolios();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function loadMembers() {
    fetch(`/api/org/${orgId}/members`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setMembers(d.members || []))
      .catch(() => {});
  }

  function loadPortfolios() {
    fetch(`/api/portfolio?org_id=${orgId}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setPortfolios(Array.isArray(d) ? d : (d.portfolios || [])))
      .catch(() => {});
  }

  function flash(msg: string) {
    setOk(msg);
    setTimeout(() => setOk(null), 3000);
  }

  async function saveOverview(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/org/${orgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, ein: ein || null, org_type: orgType || null, fiscal_year_end: fiscalYearEnd || null, state_of_incorporation: stateOfInc || null }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Failed to save');
      flash('Saved');
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function saveModules(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/org/${orgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modules }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Failed to save');
      flash('Modules saved');
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function saveBranding(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/org/${orgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branding: { logo_url: logoUrl || undefined, primary_color: primaryColor || undefined } }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Failed to save');
      flash('Branding saved');
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    if (!newUserId.trim()) return;
    try {
      const res = await fetch(`/api/org/${orgId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: newUserId.trim(), role: newRole }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Failed to add member');
      setNewUserId('');
      loadMembers();
    } catch (e: any) { setError(e.message); }
  }

  async function removeMember(userId: string) {
    if (!confirm('Remove this member?')) return;
    try {
      await fetch(`/api/org/${orgId}/members/${userId}`, { method: 'DELETE' });
      loadMembers();
    } catch {}
  }

  async function updateMemberRole(userId: string, role: OrgRole) {
    try {
      await fetch(`/api/org/${orgId}/members/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      loadMembers();
    } catch {}
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'members', label: 'Members' },
    { id: 'portfolios', label: 'Portfolios' },
    { id: 'modules', label: 'Modules' },
    { id: 'branding', label: 'Branding' },
  ];

  const isAdmin = org?.role === 'owner' || org?.role === 'admin';

  if (loading) {
    return <div className="mx-auto max-w-3xl card p-8 text-center text-neutral-500 text-sm">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{org?.name || 'Organization'}</h1>
          <div className="text-sm text-neutral-500 mt-0.5">Organization Settings</div>
        </div>
        <Link href="/admin/org" className="text-sm text-neutral-500 hover:text-neutral-700">← All orgs</Link>
      </div>

      {error && (
        <div className="card p-4 text-sm text-rose-700 bg-rose-50 border border-rose-200">{error}</div>
      )}
      {ok && (
        <div className="card p-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200">{ok}</div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-neutral-200">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition -mb-px ${
              tab === t.id
                ? 'border-azure text-azure'
                : 'border-transparent text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        <form onSubmit={saveOverview} className="card p-4 space-y-4">
          <div className="grid gap-3">
            <label className="text-sm">
              <div className="text-neutral-600 mb-1">Name <span className="text-rose-500">*</span></div>
              <input value={name} onChange={e => setName(e.target.value)} required disabled={!isAdmin}
                className="border rounded-2xl px-3 py-2 w-full disabled:bg-neutral-50" />
            </label>
            <label className="text-sm">
              <div className="text-neutral-600 mb-1">EIN</div>
              <input value={ein} onChange={e => setEin(e.target.value)} placeholder="XX-XXXXXXX" disabled={!isAdmin}
                className="border rounded-2xl px-3 py-2 w-full disabled:bg-neutral-50" />
            </label>
            <label className="text-sm">
              <div className="text-neutral-600 mb-1">Organization type</div>
              <select value={orgType} onChange={e => setOrgType(e.target.value as OrgType | '')} disabled={!isAdmin}
                className="border rounded-2xl px-3 py-2 w-full bg-white disabled:bg-neutral-50">
                <option value="">— Select type —</option>
                {ORG_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <div className="text-neutral-600 mb-1">Fiscal year end</div>
              <input type="date" value={fiscalYearEnd} onChange={e => setFiscalYearEnd(e.target.value)} disabled={!isAdmin}
                className="border rounded-2xl px-3 py-2 w-full disabled:bg-neutral-50" />
            </label>
            <label className="text-sm">
              <div className="text-neutral-600 mb-1">State of incorporation</div>
              <input value={stateOfInc} onChange={e => setStateOfInc(e.target.value)} placeholder="e.g., Delaware" disabled={!isAdmin}
                className="border rounded-2xl px-3 py-2 w-full disabled:bg-neutral-50" />
            </label>
          </div>
          {isAdmin && (
            <button type="submit" disabled={saving}
              className="px-4 py-2 rounded-2xl bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white shadow-soft hover:opacity-90 transition disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </form>
      )}

      {/* Members tab */}
      {tab === 'members' && (
        <div className="space-y-4">
          {isAdmin && (
            <form onSubmit={addMember} className="card p-4 flex gap-2 items-end">
              <div className="flex-1 text-sm">
                <div className="text-neutral-600 mb-1">User ID</div>
                <input value={newUserId} onChange={e => setNewUserId(e.target.value)} placeholder="UUID of user"
                  className="border rounded-2xl px-3 py-2 w-full" />
              </div>
              <div className="text-sm">
                <div className="text-neutral-600 mb-1">Role</div>
                <select value={newRole} onChange={e => setNewRole(e.target.value as OrgRole)}
                  className="border rounded-2xl px-3 py-2 bg-white">
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <button type="submit"
                className="px-4 py-2 rounded-2xl bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white shadow-soft hover:opacity-90 transition text-sm">
                Add
              </button>
            </form>
          )}
          <div className="card divide-y divide-neutral-100">
            {members.length === 0 ? (
              <div className="p-4 text-sm text-neutral-500 text-center">No members</div>
            ) : members.map(m => (
              <div key={m.id} className="flex items-center justify-between p-3">
                <div>
                  <div className="text-sm font-mono text-neutral-600">{m.user_id}</div>
                  <div className="text-xs text-neutral-400">{new Date(m.created_at).toLocaleDateString()}</div>
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin ? (
                    <select value={m.role} onChange={e => updateMemberRole(m.user_id, e.target.value as OrgRole)}
                      className="text-xs border rounded-lg px-2 py-1 bg-white">
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded-full bg-neutral-100 text-neutral-600">{m.role}</span>
                  )}
                  {isAdmin && (
                    <button onClick={() => removeMember(m.user_id)}
                      className="text-xs text-rose-500 hover:text-rose-700 transition">
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Portfolios tab */}
      {tab === 'portfolios' && (
        <div className="card divide-y divide-neutral-100">
          {portfolios.length === 0 ? (
            <div className="p-4 text-sm text-neutral-500 text-center">No portfolios in this organization</div>
          ) : portfolios.map(p => (
            <div key={p.id} className="flex items-center justify-between p-3">
              <div className="text-sm font-medium">{p.name}</div>
              <a href={`/admin/portfolios/${p.id}/settings`}
                className="text-xs text-azure hover:underline">Settings</a>
            </div>
          ))}
        </div>
      )}

      {/* Modules tab */}
      {tab === 'modules' && (
        <form onSubmit={saveModules} className="space-y-4">
          <div className="card p-4 space-y-3">
            {(Object.keys(modules) as Array<keyof typeof modules>).map(key => (
              <div key={key} className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium capitalize">{key}</div>
                  <div className="text-xs text-neutral-500">
                    {key === 'compliance' && 'Compliance tracking and reporting'}
                    {key === 'donors' && 'Donor management and CRM'}
                    {key === 'quickbooks' && 'QuickBooks Online integration'}
                    {key === 'portfolio' && 'Investment portfolio management'}
                    {key === 'tax' && 'Tax contribution tracking'}
                    {key === 'grants' && 'Grant management'}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => isAdmin && setModules(m => ({ ...m, [key]: !m[key] }))}
                  className={`px-3 py-1.5 rounded-2xl border transition text-sm ${
                    modules[key]
                      ? 'bg-azure/10 text-azure border-azure/20'
                      : 'border-black/10 text-neutral-500 hover:bg-white'
                  } disabled:opacity-50`}
                >
                  {modules[key] ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            ))}
          </div>
          {isAdmin && (
            <button type="submit" disabled={saving}
              className="px-4 py-2 rounded-2xl bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white shadow-soft hover:opacity-90 transition disabled:opacity-50">
              {saving ? 'Saving…' : 'Save modules'}
            </button>
          )}
        </form>
      )}

      {/* Branding tab */}
      {tab === 'branding' && (
        <form onSubmit={saveBranding} className="card p-4 space-y-4">
          <div className="grid gap-3">
            <label className="text-sm">
              <div className="text-neutral-600 mb-1">Logo URL</div>
              <input value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://…" disabled={!isAdmin}
                className="border rounded-2xl px-3 py-2 w-full disabled:bg-neutral-50" />
            </label>
            <label className="text-sm">
              <div className="text-neutral-600 mb-1">Primary color</div>
              <div className="flex items-center gap-2">
                <input type="color" value={primaryColor || '#0066cc'} onChange={e => setPrimaryColor(e.target.value)} disabled={!isAdmin}
                  className="w-10 h-10 rounded border cursor-pointer" />
                <input value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} placeholder="#0066cc" disabled={!isAdmin}
                  className="border rounded-2xl px-3 py-2 flex-1 disabled:bg-neutral-50" />
              </div>
            </label>
          </div>
          {isAdmin && (
            <button type="submit" disabled={saving}
              className="px-4 py-2 rounded-2xl bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white shadow-soft hover:opacity-90 transition disabled:opacity-50">
              {saving ? 'Saving…' : 'Save branding'}
            </button>
          )}
        </form>
      )}
    </div>
  );
}
