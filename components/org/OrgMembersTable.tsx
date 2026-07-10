"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OrgRole } from "@/lib/roles";

interface Member {
  user_id: string;
  organization_id: string;
  role: OrgRole;
  added_at: string;
  profiles?: { display_name?: string | null } | null;
}

interface Props {
  orgId: string;
  members: Member[];
  isAdmin: boolean;
  currentRole: OrgRole;
}

export default function OrgMembersTable({ orgId, members, isAdmin, currentRole }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<OrgRole>("viewer");
  const [addLoading, setAddLoading] = useState(false);

  async function updateRole(userId: string, newRole: OrgRole) {
    setLoading(userId);
    setError(null);

    try {
      const res = await fetch(`/api/org/${orgId}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, role: newRole }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update role");
      }

      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  }

  async function removeMember(userId: string) {
    if (!confirm("Are you sure you want to remove this member?")) return;

    setLoading(userId);
    setError(null);

    try {
      const res = await fetch(`/api/org/${orgId}/members/${userId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove member");
      }

      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setAddLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/org/${orgId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addEmail, role: addRole }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to add member");
      }

      setAddEmail("");
      setAddRole("viewer");
      setShowAddForm(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAddLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Add member form */}
      {isAdmin && (
        <div className="card p-4">
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              className="text-sm text-azure hover:underline"
            >
              + Add member
            </button>
          ) : (
            <form onSubmit={addMember} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="Email address"
                  required
                  className="px-3 py-2 border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50"
                />
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as OrgRole)}
                  className="px-3 py-2 border border-black/10 rounded-lg"
                >
                  <option value="viewer">Viewer</option>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  {currentRole === 'owner' ? <option value="owner">Owner</option> : null}
                </select>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={addLoading}
                    className="px-4 py-2 rounded-lg bg-azure text-white text-sm hover:opacity-90 disabled:opacity-50"
                  >
                    {addLoading ? "Adding..." : "Add"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-4 py-2 rounded-lg border border-black/10 text-sm hover:bg-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              <p className="text-xs text-neutral-500">
                The user must have an existing account. They will be added to the organization
                with the selected role.
              </p>
            </form>
          )}
        </div>
      )}

      {/* Members table */}
      <div className="card p-4">
        {members.length === 0 ? (
          <p className="text-sm text-neutral-500">No members yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5">
                <th className="text-left px-3 py-2 font-medium text-neutral-700">User</th>
                <th className="text-left px-3 py-2 font-medium text-neutral-700">Role</th>
                <th className="text-left px-3 py-2 font-medium text-neutral-700">Added</th>
                {isAdmin && (
                  <th className="text-right px-3 py-2 font-medium text-neutral-700">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id} className="border-b border-black/5">
                  <td className="px-3 py-2">
                    <div className="font-medium">
                      {m.profiles?.display_name || "—"}
                    </div>
                    <div className="text-xs text-neutral-500 font-mono">
                      {m.user_id.slice(0, 8)}...
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {isAdmin && m.role !== "owner" ? (
                      <select
                        value={m.role}
                        onChange={(e) => updateRole(m.user_id, e.target.value as OrgRole)}
                        disabled={loading === m.user_id}
                        className="px-2 py-1 border border-black/10 rounded text-sm"
                      >
                        <option value="viewer">Viewer</option>
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                        {currentRole === 'owner' ? <option value="owner">Owner</option> : null}
                      </select>
                    ) : (
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          m.role === "owner"
                            ? "bg-purple-100 text-purple-700"
                            : m.role === "admin"
                            ? "bg-blue-100 text-blue-700"
                            : m.role === "member"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-neutral-100 text-neutral-700"
                        }`}
                      >
                        {m.role}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-neutral-500">
                    {m.added_at ? new Date(m.added_at).toLocaleDateString() : "—"}
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-2 text-right">
                      {m.role !== "owner" && (
                        <button
                          onClick={() => removeMember(m.user_id)}
                          disabled={loading === m.user_id}
                          className="text-red-600 hover:text-red-700 text-sm disabled:opacity-50"
                        >
                          {loading === m.user_id ? "..." : "Remove"}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
