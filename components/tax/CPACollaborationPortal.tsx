'use client';

import * as React from 'react';
import { CPAShareLink, getExpirationDisplay } from '@/lib/tax/cpa-collaboration';

// Phase B not yet implemented — hide until public portal, token hashing, and access logging are complete
const cpaCollaborationEnabled = false;

export interface CPACollaborationPortalProps {
  portfolioId: string;
}

export default function CPACollaborationPortal({ portfolioId }: CPACollaborationPortalProps) {
  const [shareLinks, setShareLinks] = React.useState<CPAShareLink[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = React.useState(false);
  const [expandedLinkId, setExpandedLinkId] = React.useState<string | null>(null);

  // Load share links on mount
  React.useEffect(() => {
    if (!cpaCollaborationEnabled) return;
    loadShareLinks();
  }, [portfolioId]);

  if (!cpaCollaborationEnabled) {
    return null;
  }

  async function loadShareLinks() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/portfolio/${portfolioId}/tax/cpa-share`);
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to load share links');
      }

      setShareLinks(json.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function revokeShareLink(shareLinkId: string) {
    if (!confirm('Are you sure you want to revoke this share link? The CPA will no longer be able to access your data.')) {
      return;
    }

    try {
      const res = await fetch(`/api/portfolio/${portfolioId}/tax/cpa-share?share_link_id=${shareLinkId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to revoke share link');
      }

      // Reload share links
      await loadShareLinks();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  }

  function getStatusBadge(link: CPAShareLink) {
    if (link.revoked_at) {
      return <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">Revoked</span>;
    }

    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-700">Expired</span>;
    }

    if (link.max_accesses && link.access_count >= link.max_accesses) {
      return <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-700">Max Access Reached</span>;
    }

    return <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">Active</span>;
  }

  const activeLinks = shareLinks.filter(l => !l.revoked_at && (!l.expires_at || new Date(l.expires_at) > new Date()));
  const inactiveLinks = shareLinks.filter(l => l.revoked_at || (l.expires_at && new Date(l.expires_at) <= new Date()));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-soft">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-serif text-2xl font-medium text-ink">CPA Collaboration Portal</h2>
            <p className="text-sm text-neutral-600 mt-1">
              Securely share tax data with your CPA or tax professional
            </p>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="rounded-2xl bg-azure px-4 py-2 font-medium text-white shadow-soft transition-opacity hover:opacity-90"
          >
            {showCreateForm ? 'Cancel' : '+ New Share Link'}
          </button>
        </div>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <CreateShareLinkForm
          portfolioId={portfolioId}
          onSuccess={() => {
            setShowCreateForm(false);
            loadShareLinks();
          }}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="bg-white rounded-2xl border border-neutral-200 p-12 text-center">
          <div className="text-neutral-500">Loading share links...</div>
        </div>
      )}

      {/* Share Links List */}
      {!loading && (
        <>
          {/* Active Links */}
          {activeLinks.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-neutral-900">Active Share Links</h3>
              {activeLinks.map((link) => (
                <ShareLinkCard
                  key={link.id}
                  link={link}
                  expanded={expandedLinkId === link.id}
                  onToggleExpand={() => setExpandedLinkId(expandedLinkId === link.id ? null : link.id)}
                  onRevoke={() => revokeShareLink(link.id)}
                />
              ))}
            </div>
          )}

          {/* Inactive Links */}
          {inactiveLinks.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-neutral-500">Inactive Share Links</h3>
              {inactiveLinks.map((link) => (
                <ShareLinkCard
                  key={link.id}
                  link={link}
                  expanded={expandedLinkId === link.id}
                  onToggleExpand={() => setExpandedLinkId(expandedLinkId === link.id ? null : link.id)}
                  onRevoke={() => revokeShareLink(link.id)}
                />
              ))}
            </div>
          )}

          {/* Empty State */}
          {shareLinks.length === 0 && (
            <div className="rounded-2xl border border-black/5 bg-white p-12 text-center shadow-soft">
              <h3 className="mb-2 font-serif text-lg font-medium text-ink">No Share Links Yet</h3>
              <p className="text-neutral-600 mb-6">
                Create a secure share link to give your CPA access to your tax data
              </p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="rounded-2xl bg-azure px-6 py-3 font-medium text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-azure/90"
              >
                Create First Share Link
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Share Link Card Component
interface ShareLinkCardProps {
  link: CPAShareLink;
  expanded: boolean;
  onToggleExpand: () => void;
  onRevoke: () => void;
}

function ShareLinkCard({ link, expanded, onToggleExpand, onRevoke }: ShareLinkCardProps) {
  const [copied, setCopied] = React.useState(false);

  const shareURL = link.share_token ? `${window.location.origin}/tax/cpa/${link.share_token}` : null;
  const isActive = !link.revoked_at && (!link.expires_at || new Date(link.expires_at) > new Date());

  async function copyToClipboard() {
    if (!shareURL) return;

    try {
      await navigator.clipboard.writeText(shareURL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      alert('Failed to copy to clipboard');
    }
  }

  function getStatusBadge() {
    if (link.revoked_at) {
      return <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">Revoked</span>;
    }

    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-700">Expired</span>;
    }

    if (link.max_accesses && link.access_count >= link.max_accesses) {
      return <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-700">Max Access Reached</span>;
    }

    return <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">Active</span>;
  }

  return (
    <div className={`rounded-2xl border bg-white shadow-soft transition-colors ${isActive ? 'border-black/5 hover:border-azure/30' : 'border-black/5'}`}>
      <button
        onClick={onToggleExpand}
        className="w-full p-6 text-left"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h4 className="text-lg font-semibold text-ink">
                {link.cpa_name || 'Unnamed CPA'}
              </h4>
              {getStatusBadge()}
            </div>
            <div className="space-y-1 text-sm text-neutral-600">
              {link.cpa_email && <p>Email: {link.cpa_email}</p>}
              {link.cpa_firm && <p>Firm: {link.cpa_firm}</p>}
              <p>Tax Years: {link.tax_years.join(', ')}</p>
              <p>Expiration: {getExpirationDisplay(link.expires_at)}</p>
              <p>Access Count: {link.access_count}{link.max_accesses ? ` / ${link.max_accesses}` : ''}</p>
            </div>
          </div>
          <div className="ml-4 text-sm text-azure">
            {expanded ? '▼ Hide Details' : '▶ Show Details'}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-black/5 px-6 pb-6 pt-4">
          {/* Share URL */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">Share URL</label>
            {shareURL ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={shareURL}
                  readOnly
                  className="flex-1 rounded-2xl border border-black/10 bg-neutral-50 px-3 py-2 font-mono text-sm"
                />
                <button
                  onClick={copyToClipboard}
                  className="rounded-2xl bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-200"
                >
                  {copied ? '✓ Copied!' : 'Copy'}
                </button>
              </div>
            ) : (
              <p className="text-sm text-neutral-600">Available only immediately after creation.</p>
            )}
          </div>

          {/* Permissions */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">Permissions</label>
            <div className="grid grid-cols-2 gap-2">
              {link.permissions.view_contributions && (
                <div className="flex items-center gap-2 text-sm text-neutral-700">
                  <span className="text-green-600">✓</span>
                  <span>View Contributions</span>
                </div>
              )}
              {link.permissions.view_carryforwards && (
                <div className="flex items-center gap-2 text-sm text-neutral-700">
                  <span className="text-green-600">✓</span>
                  <span>View Carryforwards</span>
                </div>
              )}
              {link.permissions.view_donor_profile && (
                <div className="flex items-center gap-2 text-sm text-neutral-700">
                  <span className="text-green-600">✓</span>
                  <span>View Donor Profile</span>
                </div>
              )}
              {link.permissions.view_tax_summary && (
                <div className="flex items-center gap-2 text-sm text-neutral-700">
                  <span className="text-green-600">✓</span>
                  <span>View Tax Summary</span>
                </div>
              )}
              {link.permissions.download_form8283 && (
                <div className="flex items-center gap-2 text-sm text-neutral-700">
                  <span className="text-green-600">✓</span>
                  <span>Download Form 8283</span>
                </div>
              )}
              {link.permissions.download_turbotax && (
                <div className="flex items-center gap-2 text-sm text-neutral-700">
                  <span className="text-green-600">✓</span>
                  <span>Download TurboTax (TXF)</span>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          {link.notes && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">Notes</label>
              <p className="rounded-2xl bg-neutral-50 p-3 text-sm text-neutral-600">{link.notes}</p>
            </div>
          )}

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4 border-t border-black/5 pt-4">
            <div>
              <p className="text-xs text-neutral-600">Created</p>
              <p className="text-sm text-neutral-900">{new Date(link.created_at).toLocaleDateString()}</p>
            </div>
            {link.last_accessed_at && (
              <div>
                <p className="text-xs text-neutral-600">Last Accessed</p>
                <p className="text-sm text-neutral-900">{new Date(link.last_accessed_at).toLocaleDateString()}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          {isActive && (
            <div className="border-t border-black/5 pt-4">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRevoke();
                }}
                className="rounded-2xl bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
              >
                Revoke Access
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Create Share Link Form Component
interface CreateShareLinkFormProps {
  portfolioId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

function CreateShareLinkForm({ portfolioId, onSuccess, onCancel }: CreateShareLinkFormProps) {
  const currentYear = new Date().getFullYear();

  const [formData, setFormData] = React.useState({
    cpa_name: '',
    cpa_email: '',
    cpa_firm: '',
    tax_years: [currentYear],
    expiration: '30days' as '7days' | '30days' | '90days' | '1year' | 'never',
    max_accesses: undefined as number | undefined,
    permissions: {
      view_contributions: true,
      view_carryforwards: true,
      view_donor_profile: false,
      view_tax_summary: true,
      download_form8283: true,
      download_turbotax: true,
    },
    notes: '',
    send_email: false,
  });

  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [createdLink, setCreatedLink] = React.useState<any>(null);

  function updateFormData(updates: Partial<typeof formData>) {
    setFormData({ ...formData, ...updates });
  }

  function toggleTaxYear(year: number) {
    const years = formData.tax_years.includes(year)
      ? formData.tax_years.filter(y => y !== year)
      : [...formData.tax_years, year];
    updateFormData({ tax_years: years.sort((a, b) => b - a) });
  }

  function togglePermission(key: keyof typeof formData.permissions) {
    updateFormData({
      permissions: {
        ...formData.permissions,
        [key]: !formData.permissions[key],
      },
    });
  }

  async function createShareLink() {
    if (formData.tax_years.length === 0) {
      setError('Please select at least one tax year');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const res = await fetch(`/api/portfolio/${portfolioId}/tax/cpa-share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to create share link');
      }

      setCreatedLink(json.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  // If link created, show success screen
  if (createdLink) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
          </div>
          <div className="flex-1">
            <h3 className="mb-2 text-lg font-semibold text-green-900">Share Link Created!</h3>
            <p className="text-sm text-green-800 mb-4">
              Send this link to {createdLink.cpa_name || 'your CPA'} to grant access to your tax data.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-green-900 mb-2">Share URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={createdLink.share_url}
                  readOnly
                  className="flex-1 rounded-2xl border border-green-300 bg-white px-3 py-2 font-mono text-sm"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(createdLink.share_url);
                    alert('Copied to clipboard!');
                  }}
                  className="rounded-2xl bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
                >
                  Copy
                </button>
              </div>
            </div>

            {createdLink.email_preview && (
              <div className="mb-4 rounded-2xl border border-green-200 bg-white p-4">
                <p className="text-xs text-green-700 font-medium mb-2">EMAIL PREVIEW</p>
                <p className="text-sm font-semibold text-neutral-900 mb-2">
                  Subject: {createdLink.email_preview.subject}
                </p>
                <pre className="text-xs text-neutral-700 whitespace-pre-wrap font-sans">
                  {createdLink.email_preview.body}
                </pre>
              </div>
            )}

            <button
              onClick={onSuccess}
              className="rounded-2xl bg-green-600 px-6 py-2 font-medium text-white transition-colors hover:bg-green-700"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-soft">
      <h3 className="mb-4 font-serif text-lg font-medium text-ink">Create New Share Link</h3>

      <div className="space-y-4">
        {/* CPA Details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">CPA Name</label>
            <input
              type="text"
              value={formData.cpa_name}
              onChange={(e) => updateFormData({ cpa_name: e.target.value })}
              placeholder="John Smith"
              className="w-full rounded-2xl border border-black/10 px-3 py-2 focus:border-azure focus:ring-2 focus:ring-azure/30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">CPA Email</label>
            <input
              type="email"
              value={formData.cpa_email}
              onChange={(e) => updateFormData({ cpa_email: e.target.value })}
              placeholder="john@cpafirm.com"
              className="w-full rounded-2xl border border-black/10 px-3 py-2 focus:border-azure focus:ring-2 focus:ring-azure/30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">Firm Name</label>
            <input
              type="text"
              value={formData.cpa_firm}
              onChange={(e) => updateFormData({ cpa_firm: e.target.value })}
              placeholder="Smith & Associates"
              className="w-full rounded-2xl border border-black/10 px-3 py-2 focus:border-azure focus:ring-2 focus:ring-azure/30"
            />
          </div>
        </div>

        {/* Tax Years */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Tax Years <span className="text-red-500">*</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {[currentYear, currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4].map((year) => (
              <button
                key={year}
                onClick={() => toggleTaxYear(year)}
                className={`rounded-2xl px-4 py-2 text-sm font-medium transition-colors ${
                  formData.tax_years.includes(year)
                    ? 'bg-azure text-white shadow-soft'
                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                }`}
              >
                {year}
              </button>
            ))}
          </div>
        </div>

        {/* Expiration & Access Limit */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">Expiration</label>
            <select
              value={formData.expiration}
              onChange={(e) => updateFormData({ expiration: e.target.value as any })}
              className="w-full rounded-2xl border border-black/10 px-3 py-2 focus:border-azure focus:ring-2 focus:ring-azure/30"
            >
              <option value="7days">7 days</option>
              <option value="30days">30 days</option>
              <option value="90days">90 days</option>
              <option value="1year">1 year</option>
              <option value="never">Never expires</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Max Accesses (Optional)
            </label>
            <input
              type="number"
              value={formData.max_accesses || ''}
              onChange={(e) => updateFormData({ max_accesses: e.target.value ? parseInt(e.target.value) : undefined })}
              placeholder="Unlimited"
              min="1"
              className="w-full rounded-2xl border border-black/10 px-3 py-2 focus:border-azure focus:ring-2 focus:ring-azure/30"
            />
          </div>
        </div>

        {/* Permissions */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">Permissions</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(formData.permissions).map(([key, value]) => (
              <label key={key} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={() => togglePermission(key as any)}
                  className="h-4 w-4 rounded border-black/10 text-azure focus:ring-2 focus:ring-azure/30"
                />
                <span className="text-sm text-neutral-700">
                  {key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">Notes (Optional)</label>
          <textarea
            value={formData.notes}
            onChange={(e) => updateFormData({ notes: e.target.value })}
            placeholder="Internal notes about this share link..."
            rows={3}
            className="w-full rounded-2xl border border-black/10 px-3 py-2 focus:border-azure focus:ring-2 focus:ring-azure/30"
          />
        </div>

        {/* Error Display */}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 border-t border-black/5 pt-4">
          <button
            onClick={createShareLink}
            disabled={creating}
            className="rounded-2xl bg-azure px-6 py-2 font-medium text-white shadow-soft transition hover:bg-azure/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create Share Link'}
          </button>
          <button
            onClick={onCancel}
            disabled={creating}
            className="rounded-2xl bg-neutral-100 px-6 py-2 font-medium text-neutral-700 transition-colors hover:bg-neutral-200"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
