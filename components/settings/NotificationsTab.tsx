// components/settings/NotificationsTab.tsx
'use client';

import { useState } from 'react';
import { NOTIFICATION_ALERT_KEYS, NotificationAlertKey, NotificationPrefs, DEFAULT_NOTIFICATION_PREFS } from '@/lib/notifications/types';

const ALERT_LABELS: Record<NotificationAlertKey, string> = {
  'assigned_to_me': 'Assigned to me',
  'due_soon': 'Task due soon (7 days)',
  'overdue': 'Overdue task',
  'approvals': 'Approval requests',
  'comments': 'Comments on my tasks',
  'mentions': 'Mentions',
  'automation_failures': 'Automation failures',
  'digest_summary': 'Digest summary email',
  'org_admin': 'Org-wide admin alerts',
};

function mergeWithDefaults(raw: any): NotificationPrefs {
  return {
    digest: raw?.digest ?? DEFAULT_NOTIFICATION_PREFS.digest,
    channels: {
      in_app: raw?.channels?.in_app ?? DEFAULT_NOTIFICATION_PREFS.channels.in_app,
      email: raw?.channels?.email ?? DEFAULT_NOTIFICATION_PREFS.channels.email,
    },
    alerts: Object.fromEntries(
      NOTIFICATION_ALERT_KEYS.map(k => [k, raw?.alerts?.[k] ?? DEFAULT_NOTIFICATION_PREFS.alerts[k]])
    ) as Record<NotificationAlertKey, boolean>,
  };
}

interface Props {
  orgId: string;
  userId: string;
  initialPrefs: any;
}

export default function NotificationsTab({ orgId, userId, initialPrefs }: Props) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(mergeWithDefaults(initialPrefs));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setDigest(v: 'daily' | 'weekly' | 'never') {
    setPrefs(p => ({ ...p, digest: v }));
  }

  function toggleChannel(channel: 'in_app' | 'email') {
    setPrefs(p => ({ ...p, channels: { ...p.channels, [channel]: !p.channels[channel] } }));
  }

  function toggleAlert(key: NotificationAlertKey) {
    setPrefs(p => ({ ...p, alerts: { ...p.alerts, [key]: !p.alerts[key] } }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/org/${orgId}/members/${userId}/notifications`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
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
    <form onSubmit={handleSave} className="max-w-lg space-y-8">
      {/* Channels */}
      <div>
        <h3 className="text-sm font-semibold text-black/70 mb-3">Channels</h3>
        <div className="space-y-2">
          {(['in_app', 'email'] as const).map(ch => (
            <label key={ch} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.channels[ch]}
                onChange={() => toggleChannel(ch)}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm text-black/70">
                {ch === 'in_app' ? 'In-app notifications' : 'Email notifications'}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Digest frequency */}
      <div>
        <label htmlFor="digest" className="block text-sm font-semibold text-black/70 mb-2">
          Digest frequency
        </label>
        <select
          id="digest"
          value={prefs.digest}
          onChange={e => setDigest(e.target.value as 'daily' | 'weekly' | 'never')}
          className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm text-black/80 bg-white"
        >
          <option value="daily">Daily (8 AM)</option>
          <option value="weekly">Weekly (Monday 8 AM)</option>
          <option value="never">Never</option>
        </select>
      </div>

      {/* Alert categories */}
      <div>
        <h3 className="text-sm font-semibold text-black/70 mb-3">Alert categories</h3>
        <div className="space-y-2">
          {NOTIFICATION_ALERT_KEYS.map(key => (
            <label key={key} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.alerts[key]}
                onChange={() => toggleAlert(key)}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm text-black/70">{ALERT_LABELS[key]}</span>
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="px-4 py-2 bg-azure text-white text-sm rounded-lg hover:bg-azure/90 disabled:opacity-50"
      >
        {saving ? 'Saving…' : saved ? 'Saved' : 'Save preferences'}
      </button>
    </form>
  );
}
