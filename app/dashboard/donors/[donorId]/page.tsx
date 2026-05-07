'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

const LETTER_TYPE_LABELS: Record<string, string> = {
  year_end: 'Year-End',
  receipt: 'Receipt',
  qcd: 'QCD',
  non_cash: 'Non-Cash',
  general: 'General',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-green-100 text-green-800',
  archived: 'bg-gray-100 text-gray-500',
};

export default function DonorProfilePage() {
  const { donorId } = useParams<{ donorId: string }>();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [donor, setDonor] = useState<any>(null);
  const [contributions, setContributions] = useState<any[]>([]);
  const [letters, setLetters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOrg() {
      const res = await fetch('/api/org');
      if (res.ok) {
        const data = await res.json();
        setOrgId(data.organizations?.[0]?.id || null);
      }
    }
    fetchOrg();
  }, []);

  useEffect(() => {
    if (!orgId || !donorId) return;

    async function fetchDonor() {
      setLoading(true);
      try {
        const res = await fetch(`/api/org/${orgId}/donors/${donorId}`);
        if (!res.ok) throw new Error('Donor not found');
        const data = await res.json();
        setDonor(data.donor);
        setContributions(data.contributions || []);
        setLetters(data.letters || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchDonor();
  }, [orgId, donorId]);

  async function handleGeneratePdf(letterId: string) {
    if (!orgId) return;
    setGeneratingPdf(letterId);
    try {
      const res = await fetch(`/api/org/${orgId}/acknowledgments/${letterId}/generate-pdf`, { method: 'POST' });
      const data = await res.json();
      if (data.pdf_url) {
        setLetters(prev => prev.map(l => l.id === letterId ? { ...l, pdf_url: data.pdf_url } : l));
        window.open(data.pdf_url, '_blank');
      }
    } catch {
      // silently fail
    } finally {
      setGeneratingPdf(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Loading donor profile…</p>
      </div>
    );
  }

  if (error || !donor) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error || 'Donor not found'}</p>
          <Link href="/dashboard/donors" className="text-indigo-600 hover:underline">← Back to Donors</Link>
        </div>
      </div>
    );
  }

  const displayName = donor.is_anonymous
    ? 'Anonymous'
    : donor.display_name || [donor.first_name, donor.last_name].filter(Boolean).join(' ') || donor.organization_name || '—';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back */}
        <Link href="/dashboard/donors" className="text-sm text-indigo-600 hover:underline mb-6 block">
          ← Back to Donors
        </Link>

        {/* Donor Header */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{displayName}</h1>
              <p className="text-sm text-gray-500 mt-1 capitalize">{donor.donor_type}</p>
              {donor.email && <p className="text-sm text-gray-600 mt-1">{donor.email}</p>}
              {donor.phone && <p className="text-sm text-gray-600">{donor.phone}</p>}
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-indigo-600">
                ${Number(donor.total_lifetime_giving || 0).toLocaleString()}
              </div>
              <div className="text-xs text-gray-500">Lifetime Giving</div>
              <div className="text-sm text-gray-600 mt-1">{donor.total_gift_count || 0} gifts</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-gray-100">
            <div>
              <div className="text-xs text-gray-500">Tier</div>
              <div className="text-sm font-medium text-gray-800 capitalize">{donor.computed_tier || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Recency</div>
              <div className="text-sm font-medium text-gray-800 capitalize">{donor.recency_status || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">First Gift</div>
              <div className="text-sm text-gray-700">
                {donor.first_gift_date ? new Date(donor.first_gift_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Last Gift</div>
              <div className="text-sm text-gray-700">
                {donor.last_gift_date ? new Date(donor.last_gift_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Contribution History */}
        <div className="bg-white rounded-lg border border-gray-200 mb-6">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Contribution History</h2>
          </div>
          {contributions.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-400 text-sm">No contributions recorded.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-6 py-3 font-medium text-gray-600">Date</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-600">Type</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-600">Amount</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-600">Acknowledgment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {contributions.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-700">
                      {new Date(c.contribution_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-6 py-3 text-gray-600 capitalize">{c.contribution_type}</td>
                    <td className="px-6 py-3 text-right font-medium text-gray-900">
                      ${Number(c.amount).toLocaleString()}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${
                        c.acknowledgment_status === 'sent' ? 'bg-green-100 text-green-800' :
                        c.acknowledgment_status === 'draft' ? 'bg-blue-100 text-blue-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {c.acknowledgment_status || 'pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Acknowledgment Letters */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Acknowledgment Letters</h2>
          </div>
          {letters.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-400 text-sm">No letters generated yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-6 py-3 font-medium text-gray-600">Type</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-600">Subject</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-600">Created</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {letters.map(letter => (
                  <tr key={letter.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-700">
                      {LETTER_TYPE_LABELS[letter.letter_type] || letter.letter_type}
                    </td>
                    <td className="px-6 py-3 text-gray-600 max-w-xs truncate">{letter.subject || '—'}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[letter.status] || STATUS_COLORS.draft}`}>
                        {letter.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-500">
                      {new Date(letter.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {letter.pdf_url ? (
                        <a href={letter.pdf_url} target="_blank" rel="noopener noreferrer"
                          className="text-indigo-600 hover:underline text-xs">
                          View PDF
                        </a>
                      ) : (
                        <button
                          onClick={() => handleGeneratePdf(letter.id)}
                          disabled={generatingPdf === letter.id}
                          className="text-indigo-600 hover:underline text-xs disabled:opacity-50"
                        >
                          {generatingPdf === letter.id ? 'Generating…' : 'Generate PDF'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
