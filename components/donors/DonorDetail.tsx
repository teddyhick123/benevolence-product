'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';

type Donor = {
  id: string;
  is_organization: boolean;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  organization_name: string | null;
  contact_name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  is_anonymous: boolean;
  communication_preference: string;
  do_not_contact: boolean;
  total_lifetime_giving: number;
  total_ytd_giving: number;
  first_gift_date: string | null;
  last_gift_date: string | null;
  gift_count: number;
  largest_gift: number;
  average_gift: number;
  notes: string | null;
  tags: string[];
};

type Contribution = {
  id: string;
  contribution_date: string;
  amount: number;
  gift_type: string;
  designation: string | null;
  receipt_status: string;
  receipt_number: string | null;
  acknowledgment_status: string;
};

type Communication = {
  id: string;
  direction: string;
  comm_type: string;
  subject: string | null;
  summary: string;
  occurred_at: string;
  follow_up_required: boolean;
  follow_up_date: string | null;
};

interface Props {
  organizationId: string;
  donorId: string;
  onEdit?: () => void;
}

export default function DonorDetail({ organizationId, donorId, onEdit }: Props) {
  const [loading, setLoading] = useState(true);
  const [donor, setDonor] = useState<Donor | null>(null);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [activeTab, setActiveTab] = useState<'contributions' | 'communications'>('contributions');

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const supabase = createClient();

        // Fetch donor details
        const { data: donorData, error: donorError } = await supabase
          .from('donors')
          .select('*')
          .eq('id', donorId)
          .eq('org_id', organizationId)
          .single();

        if (donorError) throw donorError;
        setDonor(donorData);

        // Fetch contributions
        const { data: contribData } = await supabase
          .from('contributions_received')
          .select('*')
          .eq('donor_id', donorId)
          .order('contribution_date', { ascending: false });

        setContributions(contribData || []);

        // Fetch communications
        const { data: commData } = await supabase
          .from('donor_communications')
          .select('*')
          .eq('donor_id', donorId)
          .order('occurred_at', { ascending: false });

        setCommunications(commData || []);
      } catch (err) {
        console.error('Error fetching donor details:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [organizationId, donorId]);

  const formatCurrency = (amount: number | null) => {
    if (!amount) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getDonorTier = () => {
    if (!donor) return 'supporter';
    if (donor.total_lifetime_giving >= 100000) return 'major';
    if (donor.total_lifetime_giving >= 10000) return 'leadership';
    if (donor.gift_count >= 12) return 'sustainer';
    return 'supporter';
  };

  const getRecencyStatus = () => {
    if (!donor?.last_gift_date) return 'inactive';
    const lastGift = new Date(donor.last_gift_date);
    const monthsAgo = (new Date().getTime() - lastGift.getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (monthsAgo <= 12) return 'active';
    if (monthsAgo <= 24) return 'lapsed';
    return 'inactive';
  };

  const getTierBadge = (tier: string) => {
    const colors: Record<string, string> = {
      major: 'bg-purple-100 text-purple-800',
      leadership: 'bg-blue-100 text-blue-800',
      sustainer: 'bg-green-100 text-green-800',
      supporter: 'bg-gray-100 text-gray-800',
    };
    return colors[tier] || 'bg-gray-100 text-gray-800';
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      lapsed: 'bg-amber-100 text-amber-800',
      inactive: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-32 bg-gray-200 rounded-lg"></div>
        <div className="h-64 bg-gray-200 rounded-lg"></div>
      </div>
    );
  }

  if (!donor) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Donor not found</p>
      </div>
    );
  }

  const displayName = !donor.is_organization
    ? `${donor.first_name || ''} ${donor.last_name || ''}`.trim() || 'Unknown'
    : donor.organization_name || 'Unknown';

  const tier = getDonorTier();
  const recencyStatus = getRecencyStatus();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {donor.is_anonymous ? 'Anonymous Donor' : displayName}
            </h1>
            <div className="flex items-center gap-2 mt-2">
              <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${getTierBadge(tier)}`}>
                {tier}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${getStatusBadge(recencyStatus)}`}>
                {recencyStatus}
              </span>
              <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700 capitalize">
                {donor.is_organization ? 'Organization' : 'Individual'}
              </span>
            </div>
          </div>
          {onEdit && (
            <button
              onClick={onEdit}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Edit
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(donor.total_lifetime_giving)}</p>
            <p className="text-xs text-gray-500">Lifetime Giving</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(donor.total_ytd_giving)}</p>
            <p className="text-xs text-gray-500">YTD Giving</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">{donor.gift_count}</p>
            <p className="text-xs text-gray-500">Total Gifts</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(donor.average_gift)}</p>
            <p className="text-xs text-gray-500">Average Gift</p>
          </div>
        </div>

        {/* Contact Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 pt-6 border-t">
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">Contact Information</h3>
            <div className="space-y-2 text-sm">
              {donor.email && (
                <p><span className="text-gray-500">Email:</span> {donor.email}</p>
              )}
              {donor.phone && (
                <p><span className="text-gray-500">Phone:</span> {donor.phone}</p>
              )}
              {donor.contact_name && (
                <p><span className="text-gray-500">Contact:</span> {donor.contact_name}</p>
              )}
              <p><span className="text-gray-500">Preference:</span> {donor.communication_preference}</p>
              {donor.do_not_contact && (
                <p className="text-red-600">Do Not Contact</p>
              )}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">Address</h3>
            {donor.address_line1 ? (
              <div className="text-sm text-gray-600">
                <p>{donor.address_line1}</p>
                {donor.address_line2 && <p>{donor.address_line2}</p>}
                <p>
                  {[donor.city, donor.state, donor.postal_code].filter(Boolean).join(', ')}
                </p>
                {donor.country && <p>{donor.country}</p>}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No address on file</p>
            )}
          </div>
        </div>

        {/* Notes */}
        {donor.notes && (
          <div className="mt-6 pt-6 border-t">
            <h3 className="text-sm font-medium text-gray-900 mb-2">Notes</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{donor.notes}</p>
          </div>
        )}

        {/* Tags */}
        {donor.tags && donor.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {donor.tags.map((tag, i) => (
              <span key={i} className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-600">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="flex border-b">
          <button
            className={`px-6 py-3 text-sm font-medium ${activeTab === 'contributions' ? 'text-azure border-b-2 border-azure' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('contributions')}
          >
            Contributions ({contributions.length})
          </button>
          <button
            className={`px-6 py-3 text-sm font-medium ${activeTab === 'communications' ? 'text-azure border-b-2 border-azure' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('communications')}
          >
            Communications ({communications.length})
          </button>
        </div>

        {activeTab === 'contributions' && (
          <div className="p-4">
            {contributions.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No contributions recorded</p>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Date</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Amount</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Designation</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {contributions.map((contrib) => (
                    <tr key={contrib.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">{formatDate(contrib.contribution_date)}</td>
                      <td className="px-4 py-3 text-sm text-right font-medium">{formatCurrency(contrib.amount)}</td>
                      <td className="px-4 py-3 text-sm capitalize">{contrib.gift_type.replace('_', ' ')}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{contrib.designation || '-'}</td>
                      <td className="px-4 py-3 text-sm">
                        {contrib.receipt_number ? (
                          <span className="text-green-600">{contrib.receipt_number}</span>
                        ) : (
                          <span className="text-amber-600">{contrib.receipt_status}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'communications' && (
          <div className="p-4">
            {communications.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No communications logged</p>
            ) : (
              <ul className="space-y-4">
                {communications.map((comm) => (
                  <li key={comm.id} className="border-b pb-4 last:border-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-xs ${comm.direction === 'inbound' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                            {comm.direction}
                          </span>
                          <span className="text-xs text-gray-500 capitalize">{comm.comm_type}</span>
                        </div>
                        {comm.subject && (
                          <p className="font-medium mt-1">{comm.subject}</p>
                        )}
                        <p className="text-sm text-gray-600 mt-1">{comm.summary}</p>
                        {comm.follow_up_required && (
                          <p className="text-xs text-amber-600 mt-2">
                            Follow-up: {comm.follow_up_date ? formatDate(comm.follow_up_date) : 'Required'}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">{formatDate(comm.occurred_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
