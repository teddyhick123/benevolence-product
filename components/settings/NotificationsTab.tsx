// components/settings/NotificationsTab.tsx
'use client';

import { useState } from 'react';

interface NotificationsTabProps {
  orgId: string;
  userId: string;
  initialPrefs: {
    digest: 'daily' | 'weekly' | 'never';
    alerts: string[];
  };
}

const ALERT_OPTIONS = [
  { key: 'member_joined',  label: 'A new member joins the organization' },
  { key: 'module_changed', label: 'A module is enabled or disabled' },
];

export default function NotificationsTab({ orgId, userId, initialPrefs }: NotificationsTabProps) {
  const [digest, setDigest] = useState<'daily' | 'weekly' | 'never'>(initialPrefs.digest);
  const [alerts, setAlerts] = useState<string[]>(initialPrefs.alerts);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleAlert(key: string) {
    setAlerts((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/org/${orgId}/members/${userId}/notifications`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ digest, alerts }),
    });

    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      const data = await res.json();
      setError(data.error || 'Failed to save preferences.');
    }
  }

  return (
    <form onSubmit={handleSave} className="max-w-lg space-y-6">
      <p className="text-sm text-black/50">
        These preferences control email notifications sent to you. Notification sending beyond invitations is coming soon.
      </p>

      <div>
        <label htmlFor="digest" className="block text-sm font-medium mb-1">Activity digest</label>
        <select
          id="digest"
          value={digest}
          onChange={(e) => setDigest(e.target.value as 'daily' | 'weekly' | 'never')}
          className="border border-black/15 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-azure"
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="never">Never</option>
        </select>
      </div>

      <div>
        <p className="text-sm font-medium mb-2">Instant alerts</p>
        <div className="space-y-2">
          {ALERT_OPTIONS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={alerts.includes(key)}
                onChange={() => toggleAlert(key)}
                className="rounded border-black/20 text-azure focus:ring-azure"
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-600">Preferences saved.</p>}

      <button
        type="submit"
        disabled={saving}
        className="px-5 py-2 rounded bg-azure text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {saving ? 'Saving\u2026' : 'Save preferences'}
      </button>
    </form>
  );
}
