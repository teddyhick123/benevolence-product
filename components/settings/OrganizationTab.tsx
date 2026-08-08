'use client';

import { apiRequest, readJson } from "@/lib/api/client";

import { useState } from 'react';

interface OrganizationTabProps {
  orgId: string;
  initialName: string;
  initialEin: string | null;
  orgType: string;
}

const ORG_TYPE_LABELS: Record<string, string> = {
  private_foundation:   'Family Foundation',
  family_office:        'Family Office',
  daf_sponsor:          'Donor-Advised Fund',
  community_foundation: 'Community Foundation',
  nonprofit:            'Nonprofit',
  corporation:          'Corporation',
  individual:           'Individual',
};

export default function OrganizationTab({ orgId, initialName, initialEin, orgType }: OrganizationTabProps) {
  const [name, setName] = useState(initialName);
  const [ein, setEin] = useState(initialEin || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    const res = await apiRequest(`/api/org/${orgId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), ein: ein.trim() || null }),
    });

    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      const data = await readJson(res);
      setError(data.error || 'Failed to save changes.');
    }
  }

  return (
    <form onSubmit={handleSave} className="max-w-lg space-y-6">
      <div>
        <label htmlFor="org-name" className="block text-sm font-medium mb-1">Organization name</label>
        <input
          id="org-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={255}
          className="w-full border border-black/15 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-azure"
        />
      </div>

      <div>
        <label htmlFor="org-ein" className="block text-sm font-medium mb-1">EIN (optional)</label>
        <input
          id="org-ein"
          type="text"
          value={ein}
          onChange={(e) => setEin(e.target.value)}
          placeholder="XX-XXXXXXX"
          className="w-full border border-black/15 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-azure"
        />
      </div>

      <div>
        <p className="text-sm font-medium mb-1">Organization type</p>
        <p className="text-sm text-black/60 bg-black/5 rounded px-3 py-2">
          {ORG_TYPE_LABELS[orgType] || orgType}
        </p>
        <p className="text-xs text-black/40 mt-1">Organization type is set at onboarding and cannot be changed here.</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-600">Changes saved.</p>}

      <button
        type="submit"
        disabled={saving || !name.trim()}
        className="px-5 py-2 rounded bg-azure text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  );
}
