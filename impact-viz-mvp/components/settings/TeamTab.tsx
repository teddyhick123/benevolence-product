// components/settings/TeamTab.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import MemberRow from './MemberRow';
import PendingInviteRow from './PendingInviteRow';
import InviteMemberModal from './InviteMemberModal';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface TeamTabProps {
  orgId: string;
}

export default function TeamTab({ orgId }: TeamTabProps) {
  const [members, setMembers] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<string>('viewer');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [membersRes, invitesRes] = await Promise.all([
      fetch(`/api/org/${orgId}/members`),
      fetch(`/api/org/${orgId}/invitations`),
    ]);
    const [membersData, invitesData] = await Promise.all([membersRes.json(), invitesRes.json()]);
    setMembers(membersData.members || []);
    setCurrentRole(membersData.currentRole || 'viewer');
    setInvitations(invitesData.invitations || []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleRoleChange(userId: string, newRole: string) {
    await fetch(`/api/org/${orgId}/members/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    });
    fetchData();
  }

  async function handleRemove(userId: string) {
    if (!confirm('Remove this member from your organization?')) return;
    await fetch(`/api/org/${orgId}/members/${userId}`, { method: 'DELETE' });
    fetchData();
  }

  async function handleResend(inviteId: string) {
    await fetch(`/api/org/${orgId}/invitations/${inviteId}/resend`, { method: 'POST' });
  }

  async function handleCancel(inviteId: string) {
    if (!confirm('Cancel this invitation?')) return;
    await fetch(`/api/org/${orgId}/invitations/${inviteId}`, { method: 'DELETE' });
    fetchData();
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Team members</h2>
          {(currentRole === 'owner' || currentRole === 'admin') && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="text-sm px-3 py-1.5 rounded bg-azure text-white font-medium hover:opacity-90"
            >
              + Invite member
            </button>
          )}
        </div>
        {loading ? (
          <p className="text-sm text-black/40">Loading…</p>
        ) : (
          <div className="bg-white rounded-lg border border-black/10 px-4">
            {members.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                currentUserId={currentUserId || ''}
                currentRole={currentRole}
                onRoleChange={handleRoleChange}
                onRemove={handleRemove}
              />
            ))}
          </div>
        )}
      </div>

      {invitations.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3">Pending invitations</h2>
          <div className="bg-white rounded-lg border border-black/10 px-4">
            {invitations.map((inv) => (
              <PendingInviteRow
                key={inv.id}
                invite={inv}
                onResend={handleResend}
                onCancel={handleCancel}
              />
            ))}
          </div>
        </div>
      )}

      {showInviteModal && (
        <InviteMemberModal
          orgId={orgId}
          onClose={() => setShowInviteModal(false)}
          onSuccess={fetchData}
        />
      )}
    </div>
  );
}
