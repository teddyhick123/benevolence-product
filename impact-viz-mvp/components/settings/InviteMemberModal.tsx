// components/settings/InviteMemberModal.tsx
'use client';

import { useState } from 'react';

interface InviteMemberModalProps {
  orgId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function InviteMemberModal({ orgId, onClose, onSuccess }: InviteMemberModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    const res = await fetch(`/api/org/${orgId}/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role, message: message || null }),
    });

    const data = await res.json();
    setBusy(false);

    if (!res.ok && res.status !== 200) {
      setError(data.error || 'Failed to send invitation.');
      return;
    }

    if (data.warning) {
      setError(data.warning);
      return;
    }

    onSuccess();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" role="dialog" aria-modal="true" aria-label="Invite team member">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Invite team member</h2>
          <button onClick={onClose} aria-label="Close modal" className="text-black/40 hover:text-black">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="invite-email" className="block text-sm font-medium mb-1">Email address</label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-black/15 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-azure"
              placeholder="colleague@example.com"
            />
          </div>

          <div>
            <label htmlFor="invite-role" className="block text-sm font-medium mb-1">Role</label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full border border-black/15 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-azure"
            >
              <option value="admin">Admin — can manage team and settings</option>
              <option value="member">Member — can view and edit data</option>
              <option value="viewer">Viewer — read-only access</option>
            </select>
          </div>

          <div>
            <label htmlFor="invite-message" className="block text-sm font-medium mb-1">Personal message (optional)</label>
            <textarea
              id="invite-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full border border-black/15 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-azure resize-none"
              placeholder="Add a personal note to the invitation email…"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded border border-black/10 hover:bg-black/5">
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !email}
              className="px-4 py-2 text-sm rounded bg-azure text-white font-medium hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
