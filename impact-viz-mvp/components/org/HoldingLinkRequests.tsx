"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface HoldingLink {
  organization_id: string;
  holding_id: string;
  verified_at: string | null;
  verified_by: string | null;
  created_at: string;
  holdings?: {
    id: string;
    name: string | null;
    portfolio_id: string | null;
    portfolios?: { name: string } | null;
  } | null;
}

interface Props {
  orgId: string;
  pendingLinks: HoldingLink[];
  verifiedLinks: HoldingLink[];
  isAdmin: boolean;
}

export default function HoldingLinkRequests({
  orgId,
  pendingLinks,
  verifiedLinks,
  isAdmin,
}: Props) {
  const router = useRouter();
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [holdingId, setHoldingId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    if (!holdingId.trim()) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/org/${orgId}/holdings/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holding_id: holdingId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to request link");
      }

      setSuccess("Link request submitted! The portfolio owner will need to verify it.");
      setHoldingId("");
      setShowRequestForm(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function removeLink(holdingId: string) {
    if (!confirm("Are you sure you want to remove this holding link?")) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/org/${orgId}/holdings/${holdingId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove link");
      }

      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          {success}
        </div>
      )}

      {/* Verified Links */}
      {verifiedLinks.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-neutral-700 mb-2">Verified Holdings</h3>
          <div className="space-y-2">
            {verifiedLinks.map((link) => (
              <div
                key={link.holding_id}
                className="flex items-center justify-between p-3 border border-green-200 bg-green-50/50 rounded-lg"
              >
                <div>
                  <div className="font-medium text-sm">{link.holdings?.name || link.holding_id}</div>
                  <div className="text-xs text-neutral-500">
                    {link.holdings?.portfolios?.name || "Portfolio"} • Verified{" "}
                    {link.verified_at && new Date(link.verified_at).toLocaleDateString()}
                  </div>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => removeLink(link.holding_id)}
                    className="text-xs text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Links */}
      {pendingLinks.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-neutral-700 mb-2">Pending Verification</h3>
          <div className="space-y-2">
            {pendingLinks.map((link) => (
              <div
                key={link.holding_id}
                className="flex items-center justify-between p-3 border border-amber-200 bg-amber-50/50 rounded-lg"
              >
                <div>
                  <div className="font-medium text-sm">{link.holdings?.name || link.holding_id}</div>
                  <div className="text-xs text-neutral-500">
                    {link.holdings?.portfolios?.name || "Portfolio"} • Requested{" "}
                    {new Date(link.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full">
                    Pending
                  </span>
                  {isAdmin && (
                    <button
                      onClick={() => removeLink(link.holding_id)}
                      className="text-xs text-red-600 hover:text-red-700"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-neutral-500 mt-2">
            The portfolio owner needs to verify these links before you can submit data.
          </p>
        </div>
      )}

      {/* Request new link */}
      {isAdmin && (
        <div className="pt-4 border-t border-black/5">
          {!showRequestForm ? (
            <button
              onClick={() => setShowRequestForm(true)}
              className="text-sm text-azure hover:underline"
            >
              + Request new holding link
            </button>
          ) : (
            <form onSubmit={requestLink} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Holding ID</label>
                <input
                  type="text"
                  value={holdingId}
                  onChange={(e) => setHoldingId(e.target.value)}
                  placeholder="UUID of the holding to link"
                  required
                  className="w-full px-3 py-2 border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50 font-mono text-sm"
                />
                <p className="text-xs text-neutral-500 mt-1">
                  Ask the portfolio owner for the holding ID. They can find it in the holding details page.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-azure text-white text-sm hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? "Requesting..." : "Request Link"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowRequestForm(false);
                    setHoldingId("");
                  }}
                  className="px-4 py-2 rounded-lg border border-black/10 text-sm hover:bg-white"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {verifiedLinks.length === 0 && pendingLinks.length === 0 && !isAdmin && (
        <p className="text-sm text-neutral-500">
          No holdings linked yet. Ask an admin to request a holding link.
        </p>
      )}
    </div>
  );
}
