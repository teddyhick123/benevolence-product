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
            .eq('organization_id', organizationId)
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
        onEdit={() => router.push(`/org/${organizationId}/donors/${donorId}/edit`)}
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
    </div>
  );
}
