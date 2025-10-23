'use client';

import { useState, useEffect } from 'react';
import CharitySearchWidget from './CharitySearchWidget';

type Recommendation = {
  id?: string;
  organization_name: string;
  website: string | null;
  sector: string | null;
  ein: string | null;
  location: string | null;
  description: string | null;
  impact_focus: string[] | null;
  accreditation: any;
  contact_info: any;
  min_investment: number | null;
  max_investment: number | null;
};

type Props = {
  portfolioId: string;
  recommendation?: Recommendation | null;
  onClose: () => void;
  onSaved: () => void;
};

export default function AddRecommendationModal({ portfolioId, recommendation, onClose, onSaved }: Props) {
  const [activeTab, setActiveTab] = useState<'manual' | 'search'>('manual');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [organizationName, setOrganizationName] = useState('');
  const [website, setWebsite] = useState('');
  const [sector, setSector] = useState('');
  const [ein, setEin] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [impactFocus, setImpactFocus] = useState<string[]>([]);
  const [impactFocusInput, setImpactFocusInput] = useState('');
  const [minInvestment, setMinInvestment] = useState('');
  const [maxInvestment, setMaxInvestment] = useState('');

  // Contact info
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactName, setContactName] = useState('');

  // Load existing recommendation data if editing
  useEffect(() => {
    if (recommendation) {
      setOrganizationName(recommendation.organization_name || '');
      setWebsite(recommendation.website || '');
      setSector(recommendation.sector || '');
      setEin(recommendation.ein || '');
      setLocation(recommendation.location || '');
      setDescription(recommendation.description || '');
      setImpactFocus(recommendation.impact_focus || []);
      setMinInvestment(recommendation.min_investment?.toString() || '');
      setMaxInvestment(recommendation.max_investment?.toString() || '');

      if (recommendation.contact_info) {
        setContactEmail(recommendation.contact_info.email || '');
        setContactPhone(recommendation.contact_info.phone || '');
        setContactName(recommendation.contact_info.contact_name || '');
      }
    }
  }, [recommendation]);

  const handleAddImpactFocus = () => {
    if (impactFocusInput.trim() && !impactFocus.includes(impactFocusInput.trim())) {
      setImpactFocus([...impactFocus, impactFocusInput.trim()]);
      setImpactFocusInput('');
    }
  };

  const handleRemoveImpactFocus = (focus: string) => {
    setImpactFocus(impactFocus.filter(f => f !== focus));
  };

  const handleAutofill = (data: any) => {
    setOrganizationName(data.name || '');
    setEin(data.ein || '');
    setLocation(data.location || '');
    setWebsite(data.website || '');
    setSector(data.sector || '');
    setDescription(data.mission || '');
    setActiveTab('manual'); // Switch to manual tab to review/edit
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const payload = {
        organization_name: organizationName,
        website: website || null,
        sector: sector || null,
        ein: ein || null,
        location: location || null,
        description: description || null,
        impact_focus: impactFocus.length > 0 ? impactFocus : null,
        min_investment: minInvestment ? parseFloat(minInvestment) : null,
        max_investment: maxInvestment ? parseFloat(maxInvestment) : null,
        contact_info: (contactEmail || contactPhone || contactName) ? {
          email: contactEmail || null,
          phone: contactPhone || null,
          contact_name: contactName || null,
        } : null,
      };

      const url = recommendation?.id
        ? `/api/recommendations/${recommendation.id}`
        : `/api/portfolio/${portfolioId}/recommendations`;

      const method = recommendation?.id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save recommendation');
      }

      onSaved();
    } catch (err: any) {
      setError(err.message || 'Failed to save recommendation');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-creme rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-neutral-900">
            {recommendation ? 'Edit Recommendation' : 'Add Recommendation'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-neutral-100 transition-colors text-neutral-600 hover:text-neutral-900"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-4 flex gap-2 border-b border-neutral-200">
          <button
            onClick={() => setActiveTab('manual')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === 'manual'
                ? 'bg-creme text-azure border-b-2 border-azure'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Manual Entry
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === 'search'
                ? 'bg-creme text-azure border-b-2 border-azure'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Search Organizations
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {activeTab === 'search' ? (
            <CharitySearchWidget onSelect={handleAutofill} />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Organization Name */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Organization Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure"
                  placeholder="e.g., Tahirih Justice Center"
                />
              </div>

              {/* Website and EIN */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Website
                  </label>
                  <input
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure"
                    placeholder="https://example.org"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    EIN (Tax ID)
                  </label>
                  <input
                    type="text"
                    value={ein}
                    onChange={(e) => setEin(e.target.value)}
                    className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure"
                    placeholder="12-3456789"
                  />
                </div>
              </div>

              {/* Sector and Location */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Sector
                  </label>
                  <input
                    type="text"
                    value={sector}
                    onChange={(e) => setSector(e.target.value)}
                    className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure"
                    placeholder="e.g., Immigration Justice"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Location
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure"
                    placeholder="e.g., San Francisco, CA"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure resize-none"
                  placeholder="Brief description of the organization's mission and impact..."
                />
              </div>

              {/* Impact Focus Areas */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Impact Focus Areas
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={impactFocusInput}
                    onChange={(e) => setImpactFocusInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddImpactFocus();
                      }
                    }}
                    className="flex-1 px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure"
                    placeholder="Add focus area (e.g., Legal Aid)"
                  />
                  <button
                    type="button"
                    onClick={handleAddImpactFocus}
                    className="px-4 py-2 rounded-lg border border-neutral-300 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
                  >
                    Add
                  </button>
                </div>
                {impactFocus.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {impactFocus.map((focus, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-azure/10 text-azure border border-azure/20"
                      >
                        {focus}
                        <button
                          type="button"
                          onClick={() => handleRemoveImpactFocus(focus)}
                          className="hover:text-azure/70"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Investment Range */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Min Investment ($)
                  </label>
                  <input
                    type="number"
                    value={minInvestment}
                    onChange={(e) => setMinInvestment(e.target.value)}
                    className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure"
                    placeholder="50000"
                    min="0"
                    step="1000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Max Investment ($)
                  </label>
                  <input
                    type="number"
                    value={maxInvestment}
                    onChange={(e) => setMaxInvestment(e.target.value)}
                    className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure"
                    placeholder="250000"
                    min="0"
                    step="1000"
                  />
                </div>
              </div>

              {/* Contact Information */}
              <div className="border-t border-neutral-200 pt-6">
                <h3 className="text-lg font-semibold text-neutral-900 mb-4">Contact Information</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Contact Name
                    </label>
                    <input
                      type="text"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure"
                      placeholder="Jane Doe"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Email
                      </label>
                      <input
                        type="email"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure"
                        placeholder="contact@example.org"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Phone
                      </label>
                      <input
                        type="tel"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                        className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure"
                        placeholder="(555) 123-4567"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex items-center justify-end gap-3 pt-6 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2 text-sm font-medium text-neutral-700 hover:text-neutral-900 transition-colors"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !organizationName}
                  className="px-6 py-2 bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white rounded-lg hover:opacity-90 transition-opacity font-medium shadow-soft disabled:opacity-50"
                >
                  {saving ? 'Saving...' : recommendation ? 'Update' : 'Add Recommendation'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
