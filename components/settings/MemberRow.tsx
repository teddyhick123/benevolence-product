// components/settings/MemberRow.tsx
'use client';

import { ORG_ROLES, isOrgOwner, isWorkspaceManager } from '@/lib/organizations/roles';

interface Member {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  created_at: string;
}

interface MemberRowProps {
  member: Member;
  currentUserId: string;
  currentRole: string;
  onRoleChange: (_userId: string, _newRole: string) => void;
  onRemove: (_userId: string) => void;
}

const ROLE_OPTIONS = [...ORG_ROLES].reverse();

export default function MemberRow({ member, currentUserId, currentRole, onRoleChange, onRemove }: MemberRowProps) {
  const isSelf = member.user_id === currentUserId;
  const canEdit = isOrgOwner(currentRole) || (isWorkspaceManager(currentRole) && member.role !== 'owner' && member.role !== 'admin');
  const canRemove = canEdit && !isSelf;
  const displayName = member.full_name || member.email || member.user_id.slice(0, 8);

  return (
    <div className="flex items-center justify-between py-3 border-b border-black/5 last:border-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-azure/10 flex items-center justify-center text-azure text-xs font-medium">
          {displayName[0]?.toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-medium">{displayName}</p>
          {member.full_name && member.email && (
            <p className="text-xs text-black/40">{member.email}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {canEdit ? (
          <select
            value={member.role}
            onChange={(e) => onRoleChange(member.user_id, e.target.value)}
            className="text-xs border border-black/10 rounded px-2 py-1 bg-white"
            aria-label={`Role for ${displayName}`}
          >
            {ROLE_OPTIONS.filter(r => isOrgOwner(currentRole) || r !== 'owner').map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        ) : (
          <span className="text-xs px-2 py-1 rounded bg-black/5 text-black/60">{member.role}</span>
        )}
        {canRemove && (
          <button
            onClick={() => onRemove(member.user_id)}
            className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
            aria-label={`Remove ${displayName}`}
          >
            Remove
          </button>
        )}
        {isSelf && <span className="text-xs text-black/30">(you)</span>}
      </div>
    </div>
  );
}
