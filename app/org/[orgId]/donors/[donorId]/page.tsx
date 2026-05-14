'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import DonorDetail from '@/components/donors/DonorDetail';
import ContributionForm from '@/components/donors/ContributionForm';
import ReceiptGenerator from '@/components/donors/ReceiptGenerator';
import AcknowledgmentLetter from '@/components/donors/AcknowledgmentLetter';

type Donor = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  organization_name: string | null;
  donor_type: string;
  email: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
};

type Organization = {
  id: string;
  name: string;
  ein: string | null;
};

type Contribution = {
  id: string;
  amount: number;
  contribution_date: string;
  contribution_type: string;
  quid_pro_quo_value: number;
  tax_deductible_amount: number;
  receipt_number: string | null;
  receipt_status: string;
  designation: string | null;
  donors?: Donor;
};

export default function DonorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const organizationId = params.orgId as string;
  const donorId = params.donorId as string;

  const [donor, setDonor] = useState<Donor | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [showContributionForm, setShowContributionForm] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showAckModal, setShowAckModal] = useState(false);
  const [selectedContribution, setSelectedContribution] = useState<Contribution | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFields, setEditFields] = useState<Partial<Donor>>({});
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const supabase = createClient();

        const [donorRes, orgRes] = await Promise.all([
          supabase
            .from('donors')
            .select('*')
            .eq('id', donorId)
            .eq('org_id', organizationId)
            .single(),
          supabase
            .from('organizations')
            .select('id, name, ein')
            .eq('id', organizationId)
            .single(),
        ]);

        if (donorRes.error) throw donorRes.error;
        if (orgRes.error) throw orgRes.error;

        setDonor(donorRes.data);
        setOrganization(orgRes.data);
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [organizationId, donorId]);

  const handleGenerateReceipt = (contribution: Contribution) => {
    setSelectedContribution({ ...contribution, donors: donor as Donor });
    setShowReceiptModal(true);
  };

  const handleSendAcknowledgment = () => {
    setShowAckModal(true);
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-gray-200 rounded"></div>
          <div className="h-64 bg-gray-200 rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (!donor || !organization) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <h1 className="text-xl font-semibold text-gray-900">Donor not found</h1>
        <p className="text-gray-500 mt-2">The requested donor does not exist.</p>
        <button
          onClick={() => router.push(`/org/${organizationId}/donors`)}
          className="mt-4 text-azure hover:underline"
        >
          Back to donors
        </button>
      </div>
    );
  }

  const displayName = donor.donor_type === 'individual'
    ? `${donor.first_name || ''} ${donor.last_name || ''}`.trim() || 'Unknown'
    : donor.organization_name || 'Unknown';

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6">
        <ol className="flex items-center gap-2 text-sm">
          <li>
            <a href={`/org/${organizationId}/donors`} className="text-gray-500 hover:text-gray-700">
              Donors
            </a>
          </li>
          <li className="text-gray-400">/</li>
          <li className="text-gray-900 font-medium">{displayName}</li>
        </ol>
      </nav>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 mb-6">
        <button
          onClick={handleSendAcknowledgment}
          className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Send Acknowledgment
        </button>
        <button
          onClick={() => setShowContributionForm(true)}
          className="px-4 py-2 bg-azure text-white rounded-lg hover:bg-azure/90"
        >
          Log Contribution
        </button>
      </div>

      {/* Donor Detail Component */}
      <DonorDetail
        organizationId={organizationId}
        donorId={donorId}
        onEdit={() => { setEditFields({ ...donor }); setShowEditModal(true); }}
      />

      {/* Contribution Form Modal */}
      {showContributionForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">Log Contribution for {displayName}</h2>
            </div>
            <div className="p-6">
              <ContributionForm
                organizationId={organizationId}
                preselectedDonorId={donorId}
                onSuccess={() => {
                  setShowContributionForm(false);
                  window.location.reload();
                }}
                onCancel={() => setShowContributionForm(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Receipt Generator Modal */}
      {showReceiptModal && selectedContribution && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">Generate Tax Receipt</h2>
            </div>
            <div className="p-6">
              <ReceiptGenerator
                organizationId={organizationId}
                contribution={selectedContribution}
                organization={organization}
                onSuccess={() => {
                  setShowReceiptModal(false);
                  setSelectedContribution(null);
                  window.location.reload();
                }}
                onCancel={() => {
                  setShowReceiptModal(false);
                  setSelectedContribution(null);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Acknowledgment Letter Modal */}
      {showAckModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">Send Acknowledgment Letter</h2>
            </div>
            <div className="p-6">
              <AcknowledgmentLetter
                organizationId={organizationId}
                donor={donor}
                organization={organization}
                onSuccess={() => {
                  setShowAckModal(false);
                  window.location.reload();
                }}
                onCancel={() => setShowAckModal(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Edit Donor Modal */}
      {showEditModal && donor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-xl font-semibold">Edit Donor</h2>
              <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form
              className="p-6 space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setEditSaving(true);
                try {
                  const res = await fetch(`/api/org/${organizationId}/donors/${donorId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(editFields),
                  });
                  if (res.ok) { setShowEditModal(false); window.location.reload(); }
                } finally { setEditSaving(false); }
              }}
            >
              {donor.donor_type === 'individual' ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">First Name</label>
                    <input type="text" value={editFields.first_name ?? ''} onChange={e => setEditFields(p => ({ ...p, first_name: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-azure focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Last Name</label>
                    <input type="text" value={editFields.last_name ?? ''} onChange={e => setEditFields(p => ({ ...p, last_name: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-azure focus:border-transparent" />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Organization Name</label>
                  <input type="text" value={editFields.organization_name ?? ''} onChange={e => setEditFields(p => ({ ...p, organization_name: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-azure focus:border-transparent" />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={editFields.email ?? ''} onChange={e => setEditFields(p => ({ ...p, email: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-azure focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Address</label>
                <input type="text" value={editFields.address_line1 ?? ''} onChange={e => setEditFields(p => ({ ...p, address_line1: e.target.value }))} placeholder="Street address" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-azure focus:border-transparent" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">City</label>
                  <input type="text" value={editFields.city ?? ''} onChange={e => setEditFields(p => ({ ...p, city: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-azure focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">State</label>
                  <input type="text" value={editFields.state ?? ''} onChange={e => setEditFields(p => ({ ...p, state: e.target.value }))} maxLength={2} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-azure focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">ZIP</label>
                  <input type="text" value={editFields.postal_code ?? ''} onChange={e => setEditFields(p => ({ ...p, postal_code: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-azure focus:border-transparent" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowEditModal(false)} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={editSaving} className="px-4 py-2 text-sm bg-azure text-white rounded-lg hover:bg-azure/90 disabled:opacity-50 font-medium">{editSaving ? 'Saving…' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
