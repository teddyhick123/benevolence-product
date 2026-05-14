"use client";

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
  orgId: _orgId,
  pendingLinks,
  verifiedLinks,
  isAdmin: _isAdmin,
}: Props) {
  return (
    <div className="space-y-4">
      {verifiedLinks.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-neutral-700 mb-2">Portfolio Holdings</h3>
          <div className="space-y-2">
            {verifiedLinks.map((link) => (
              <div
                key={link.holding_id}
                className="flex items-center justify-between p-3 border border-black/10 bg-white rounded-lg"
              >
                <div>
                  <div className="font-medium text-sm">{link.holdings?.name || link.holding_id}</div>
                  <div className="text-xs text-neutral-500">
                    {link.holdings?.portfolios?.name || "Portfolio"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pendingLinks.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-neutral-700 mb-2">Legacy Pending Links</h3>
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
                <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full">
                  Pending
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-neutral-500 mt-2">
            New holdings are owned directly by organization portfolios.
          </p>
        </div>
      )}

      {verifiedLinks.length === 0 && pendingLinks.length === 0 && (
        <p className="text-sm text-neutral-500">
          No holdings yet. Holdings appear here after they are added to an organization portfolio.
        </p>
      )}
    </div>
  );
}
