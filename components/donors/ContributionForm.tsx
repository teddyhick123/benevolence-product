'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';

type Donor = {
  id: string;
  is_organization: boolean;
  first_name: string | null;
  last_name: string | null;
  organization_name: string | null;
  email: string | null;
};

interface Props {
  organizationId: string;
  preselectedDonorId?: string;
  onSuccess?: (contribution: any) => void;
  onCancel?: () => void;
}

export default function ContributionForm({ organizationId, preselectedDonorId, onSuccess, onCancel }: Props) {
  const [loading, setLoading] = useState(false);
  const [donors, setDonors] = useState<Donor[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDonorDropdown, setShowDonorDropdown] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [donorId, setDonorId] = useState(preselectedDonorId || '');
  const [selectedDonorName, setSelectedDonorName] = useState('');
  const [amount, setAmount] = useState('');
  const [contributionDate, setContributionDate] = useState(new Date().toISOString().split('T')[0]);
  const [contributionType, setContributionType] = useState('cash');
  const [designation, setDesignation] = useState('');
  const [isRestricted, setIsRestricted] = useState(false);
  const [quidProQuo, setQuidProQuo] = useState('');
  const [campaign, setCampaign] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [notes, setNotes] = useState('');
  const [autoGenerateReceipt, setAutoGenerateReceipt] = useState(true);

  // New donor fields
  const [createNewDonor, setCreateNewDonor] = useState(false);
  const [newDonorType, setNewDonorType] = useState('individual');
  const [newDonorFirstName, setNewDonorFirstName] = useState('');
  const [newDonorLastName, setNewDonorLastName] = useState('');
  const [newDonorOrgName, setNewDonorOrgName] = useState('');
  const [newDonorEmail, setNewDonorEmail] = useState('');

  // Fetch donors for dropdown
  useEffect(() => {
    async function fetchDonors() {
      const supabase = createClient();
      const { data } = await supabase
        .from('donors')
        .select('id, is_organization, first_name, last_name, organization_name, email')
        .eq('org_id', organizationId)
        .order('last_name', { ascending: true });

      setDonors(data || []);

      // Set selected donor name if preselected
      if (preselectedDonorId && data) {
        const selected = data.find(d => d.id === preselectedDonorId);
        if (selected) {
          setSelectedDonorName(getDonorDisplayName(selected));
        }
      }
    }
    fetchDonors();
  }, [organizationId, preselectedDonorId]);

  const getDonorDisplayName = (donor: Donor) => {
    if (!donor.is_organization) {
      return `${donor.first_name || ''} ${donor.last_name || ''}`.trim() || 'Unknown';
    }
    return donor.organization_name || 'Unknown';
  };

  const filteredDonors = donors.filter(d => {
    const name = getDonorDisplayName(d).toLowerCase();
    const email = (d.email || '').toLowerCase();
    const query = searchQuery.toLowerCase();
    return name.includes(query) || email.includes(query);
  });

  const handleDonorSelect = (donor: Donor) => {
    setDonorId(donor.id);
    setSelectedDonorName(getDonorDisplayName(donor));
    setSearchQuery('');
    setShowDonorDropdown(false);
    setCreateNewDonor(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      let finalDonorId = donorId;

      // Create new donor if needed
      if (createNewDonor) {
        const isOrg = newDonorType !== 'individual';

        const { data: newDonor, error: donorError } = await supabase
          .from('donors')
          .insert({
            org_id: organizationId,
            is_organization: isOrg,
            first_name: isOrg ? null : newDonorFirstName || null,
            last_name: isOrg ? null : newDonorLastName || null,
            organization_name: isOrg ? newDonorOrgName || null : null,
            email: newDonorEmail || null,
          })
          .select('id')
          .single();

        if (donorError) throw new Error(`Failed to create donor: ${donorError.message}`);
        finalDonorId = newDonor.id;
      }

      // Create contribution
      const { data: contribution, error: contribError } = await supabase
        .from('contributions_received')
        .insert({
          org_id: organizationId,
          donor_id: finalDonorId || null,
          amount: parseFloat(amount),
          contribution_date: contributionDate,
          gift_type: contributionType,
          designation: designation || null,
          is_restricted: isRestricted,
          quid_pro_quo_value: quidProQuo ? parseFloat(quidProQuo) : 0,
          campaign: campaign || null,
          payment_reference: paymentReference || null,
          notes: notes || null,
        })
        .select()
        .single();

      if (contribError) throw new Error(`Failed to create contribution: ${contribError.message}`);

      // Auto-generate receipt if requested and amount >= $250
      if (autoGenerateReceipt && parseFloat(amount) >= 250) {
        const { data: receiptNumber } = await supabase.rpc('generate_receipt_number', {
          p_org_id: organizationId,
        });

        if (receiptNumber) {
          await supabase
            .from('contributions_received')
            .update({
              receipt_number: receiptNumber,
              receipt_status: 'generated',
              receipt_generated_at: new Date().toISOString(),
            })
            .eq('id', contribution.id);
        }
      }

      onSuccess?.(contribution);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Donor Selection */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={!createNewDonor}
              onChange={() => setCreateNewDonor(false)}
              className="text-azure"
            />
            <span className="text-sm">Existing Donor</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={createNewDonor}
              onChange={() => setCreateNewDonor(true)}
              className="text-azure"
            />
            <span className="text-sm">New Donor</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={!donorId && !createNewDonor}
              onChange={() => { setDonorId(''); setCreateNewDonor(false); setSelectedDonorName(''); }}
              className="text-azure"
            />
            <span className="text-sm">Anonymous</span>
          </label>
        </div>

        {!createNewDonor && donorId !== '' && (
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Donor</label>
            <div
              className="w-full px-4 py-2 border border-gray-300 rounded-lg cursor-pointer flex justify-between items-center"
              onClick={() => setShowDonorDropdown(!showDonorDropdown)}
            >
              <span>{selectedDonorName || 'Select a donor...'}</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            {showDonorDropdown && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                <div className="p-2">
                  <input
                    type="text"
                    placeholder="Search donors..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-azure"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                {filteredDonors.length === 0 ? (
                  <div className="p-3 text-sm text-gray-500">No donors found</div>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {filteredDonors.slice(0, 20).map((donor) => (
                      <li
                        key={donor.id}
                        className="px-4 py-2 hover:bg-gray-50 cursor-pointer"
                        onClick={() => handleDonorSelect(donor)}
                      >
                        <div className="text-sm font-medium">{getDonorDisplayName(donor)}</div>
                        {donor.email && (
                          <div className="text-xs text-gray-500">{donor.email}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {createNewDonor && (
          <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Donor Type</label>
              <select
                value={newDonorType}
                onChange={(e) => setNewDonorType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="individual">Individual</option>
                <option value="foundation">Foundation</option>
                <option value="corporation">Corporation</option>
                <option value="government">Government</option>
              </select>
            </div>

            {newDonorType === 'individual' ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input
                    type="text"
                    value={newDonorFirstName}
                    onChange={(e) => setNewDonorFirstName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={newDonorLastName}
                    onChange={(e) => setNewDonorLastName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Organization Name</label>
                <input
                  type="text"
                  value={newDonorOrgName}
                  onChange={(e) => setNewDonorOrgName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={newDonorEmail}
                onChange={(e) => setNewDonorEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
        )}
      </div>

      {/* Amount and Date */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
          <div className="relative">
            <span className="absolute left-3 top-2 text-gray-500">$</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg"
              placeholder="0.00"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
          <input
            type="date"
            value={contributionDate}
            onChange={(e) => setContributionDate(e.target.value)}
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
          />
        </div>
      </div>

      {/* Contribution Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
        <select
          value={contributionType}
          onChange={(e) => setContributionType(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
        >
          <option value="cash">Cash</option>
          <option value="check">Check</option>
          <option value="credit_card">Credit Card</option>
          <option value="wire">Wire Transfer</option>
          <option value="ach">ACH</option>
          <option value="stock">Stock</option>
          <option value="crypto">Cryptocurrency</option>
          <option value="real_estate">Real Estate</option>
          <option value="in_kind">In-Kind</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* Designation */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
          <input
            type="text"
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            placeholder="e.g., General Fund"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Campaign</label>
          <input
            type="text"
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            placeholder="e.g., Annual Appeal 2025"
          />
        </div>
      </div>

      {/* Restricted */}
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={isRestricted}
          onChange={(e) => setIsRestricted(e.target.checked)}
          className="rounded text-azure"
        />
        <span className="text-sm text-gray-700">This is a restricted gift</span>
      </label>

      {/* Quid Pro Quo */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Quid Pro Quo Value (if any)
        </label>
        <div className="relative">
          <span className="absolute left-3 top-2 text-gray-500">$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={quidProQuo}
            onChange={(e) => setQuidProQuo(e.target.value)}
            className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg"
            placeholder="0.00"
          />
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Value of goods or services provided in exchange (reduces tax-deductible amount)
        </p>
      </div>

      {/* Payment Reference */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Payment Reference</label>
        <input
          type="text"
          value={paymentReference}
          onChange={(e) => setPaymentReference(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
          placeholder="Check number, transaction ID, etc."
        />
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
        />
      </div>

      {/* Auto-generate receipt */}
      {parseFloat(amount || '0') >= 250 && (
        <label className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
          <input
            type="checkbox"
            checked={autoGenerateReceipt}
            onChange={(e) => setAutoGenerateReceipt(e.target.checked)}
            className="rounded text-azure"
          />
          <span className="text-sm text-blue-800">
            Automatically generate tax receipt (IRS requires for donations $250 and above)
          </span>
        </label>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={loading || !amount}
          className="px-6 py-2 bg-azure text-white rounded-lg hover:bg-azure/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Saving...' : 'Log Contribution'}
        </button>
      </div>
    </form>
  );
}
