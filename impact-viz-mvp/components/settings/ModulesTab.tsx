// components/settings/ModulesTab.tsx
'use client';

import { useState } from 'react';

const MODULE_DEFS = [
  { key: 'tax',        label: 'Tax Center',  description: 'Contribution tracking, carryforward schedule, Form 8283, and TurboTax export.' },
  { key: 'donors',     label: 'Donor CRM',   description: 'Donor profiles, giving history, and acknowledgment letter generation.' },
  { key: 'compliance', label: 'Compliance',  description: 'Filing calendar, state registrations, and deadline tracking.' },
  { key: 'quickbooks', label: 'QuickBooks',  description: 'Sync chart of accounts and generate journal entries for your accounting team.' },
];

interface ModulesTabProps {
  orgId: string;
  initialModules: Record<string, boolean>;
}

export default function ModulesTab({ orgId, initialModules }: ModulesTabProps) {
  const [modules, setModules] = useState<Record<string, boolean>>(initialModules);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle(key: string) {
    const newValue = !modules[key];
    setModules((prev) => ({ ...prev, [key]: newValue }));
    setSaving(key);
    setError(null);

    const res = await fetch(`/api/org/${orgId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modules: { ...modules, [key]: newValue } }),
    });

    setSaving(null);
    if (!res.ok) {
      setModules((prev) => ({ ...prev, [key]: !newValue }));
      setError('Failed to save. Please try again.');
    }
  }

  return (
    <div>
      <p className="text-sm text-black/50 mb-6">
        Enable or disable modules for your organization. Changes take effect immediately.
      </p>
      <div className="space-y-3">
        {MODULE_DEFS.map(({ key, label, description }) => (
          <div key={key} className="flex items-start gap-4 bg-white rounded-lg border border-black/10 p-4">
            <button
              role="switch"
              aria-checked={!!modules[key]}
              aria-label={`Toggle ${label}`}
              onClick={() => handleToggle(key)}
              disabled={saving === key}
              className={`relative inline-flex h-6 w-11 shrink-0 mt-0.5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-azure focus:ring-offset-1 ${
                modules[key] ? 'bg-azure' : 'bg-black/20'
              } ${saving === key ? 'opacity-50' : ''}`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform mt-0.5 ${
                  modules[key] ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
            <div>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-black/50 mt-0.5">{description}</p>
            </div>
          </div>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
