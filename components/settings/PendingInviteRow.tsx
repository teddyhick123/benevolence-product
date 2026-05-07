// components/settings/PendingInviteRow.tsx
'use client';

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  created_at: string;
  expires_at: string;
}

interface PendingInviteRowProps {
  invite: PendingInvite;
  onResend: (inviteId: string) => void;
  onCancel: (inviteId: string) => void;
}

export default function PendingInviteRow({ invite, onResend, onCancel }: PendingInviteRowProps) {
  const expiresDate = new Date(invite.expires_at).toLocaleDateString();

  return (
    <div className="flex items-center justify-between py-3 border-b border-black/5 last:border-0">
      <div>
        <p className="text-sm">{invite.email}</p>
        <p className="text-xs text-black/40">Invited as <span className="font-medium">{invite.role}</span> · expires {expiresDate}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onResend(invite.id)}
          className="text-xs text-azure hover:underline"
        >
          Resend
        </button>
        <button
          onClick={() => onCancel(invite.id)}
          className="text-xs text-black/40 hover:text-red-500"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
