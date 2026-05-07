// components/settings/AuditLogTab.tsx
'use client';

import { useState, useEffect } from 'react';

const ACTION_LABELS: Record<string, string> = {
  invite_sent:      'Invitation sent',
  invite_accepted:  'Invitation accepted',
  invite_cancelled: 'Invitation cancelled',
  member_removed:   'Member removed',
  role_changed:     'Role changed',
  module_toggled:   'Module toggled',
  org_updated:      'Organization updated',
};

interface AuditLogTabProps {
  orgId: string;
}

export default function AuditLogTab({ orgId }: AuditLogTabProps) {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/org/${orgId}/audit?limit=50`)
      .then((r) => r.json())
      .then((d) => { setEntries(d.entries || []); setLoading(false); });
  }, [orgId]);

  if (loading) return <p className="text-sm text-black/40">Loading…</p>;
  if (!entries.length) return <p className="text-sm text-black/40">No activity recorded yet.</p>;

  return (
    <div className="bg-white rounded-lg border border-black/10 divide-y divide-black/5">
      {entries.map((entry) => {
        const actor = entry.actor_name || entry.actor_email || 'Unknown';
        const label = ACTION_LABELS[entry.action] || entry.action;
        const date = new Date(entry.created_at).toLocaleString();
        const meta = entry.metadata;

        let detail = '';
        if (meta?.email) detail += ` · ${meta.email}`;
        if (meta?.role) detail += ` · ${meta.role}`;
        if (meta?.module) detail += ` · ${meta.module}`;
        if (meta?.old_value !== undefined && meta?.new_value !== undefined) {
          detail += ` · ${meta.old_value} → ${meta.new_value}`;
        }

        return (
          <div key={entry.id} className="px-4 py-3 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm"><span className="font-medium">{actor}</span> · {label}{detail}</p>
            </div>
            <p className="text-xs text-black/40 whitespace-nowrap shrink-0">{date}</p>
          </div>
        );
      })}
    </div>
  );
}
