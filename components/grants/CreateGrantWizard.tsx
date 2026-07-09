'use client';

import { useState } from 'react';
import { useEntityVocabulary } from '@/lib/hooks/use-entity-vocabulary';

interface NewGrantee {
  display_name: string;
  ein?: string;
  sector?: string;
  country?: string;
  city?: string;
}

interface WizardState {
  // Step 1: Grantee
  granteeMode: 'existing' | 'new';
  investeeId: string;
  newGrantee: NewGrantee;
  // Step 2: Grant details
  purpose: string;
  requestedAmount: string;
  currency: string;
  grantType: string;
  grantPeriodStart: string;
  grantPeriodEnd: string;
  lifecycleStage: string;
  riskLevel: string;
}

const INITIAL_STATE: WizardState = {
  granteeMode: 'new',
  investeeId: '',
  newGrantee: { display_name: '', ein: '', sector: '', country: '', city: '' },
  purpose: '',
  requestedAmount: '',
  currency: 'USD',
  grantType: '',
  grantPeriodStart: '',
  grantPeriodEnd: '',
  lifecycleStage: 'draft',
  riskLevel: '',
};

const LIFECYCLE_STAGES = [
  { value: 'draft', label: 'Draft' },
  { value: 'prospect', label: 'Prospect' },
  { value: 'invited', label: 'Invited' },
  { value: 'application_received', label: 'Application Received' },
  { value: 'due_diligence', label: 'Due Diligence' },
  { value: 'recommended', label: 'Recommended' },
  { value: 'approved', label: 'Approved' },
];

interface Props {
  orgId: string;
  portfolioId: string;
  onSuccess: (grantId: string) => void;
  onClose: () => void;
}

export default function CreateGrantWizard({ orgId, portfolioId, onSuccess, onClose }: Props) {
  const vocabulary = useEntityVocabulary(orgId);
  const grantLabel = vocabulary.grant.singular;
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<WizardState>(INITIAL_STATE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(updates: Partial<WizardState>) {
    setForm(prev => ({ ...prev, ...updates }));
  }

  function patchGrantee(updates: Partial<NewGrantee>) {
    setForm(prev => ({ ...prev, newGrantee: { ...prev.newGrantee, ...updates } }));
  }

  function canProceedStep1(): boolean {
    if (form.granteeMode === 'existing') return form.investeeId.trim().length > 0;
    return form.newGrantee.display_name.trim().length > 0;
  }

  function canProceedStep2(): boolean {
    return form.purpose.trim().length > 0 && parseFloat(form.requestedAmount) > 0;
  }

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        portfolio_id: portfolioId,
        purpose: form.purpose,
        requested_amount: parseFloat(form.requestedAmount),
        currency: form.currency,
        lifecycle_stage: form.lifecycleStage || 'draft',
        ...(form.grantType ? { grant_type: form.grantType } : {}),
        ...(form.grantPeriodStart ? { grant_period_start: form.grantPeriodStart } : {}),
        ...(form.grantPeriodEnd ? { grant_period_end: form.grantPeriodEnd } : {}),
        ...(form.riskLevel ? { risk_level: form.riskLevel } : {}),
      };

      if (form.granteeMode === 'existing') {
        body.investee_id = form.investeeId.trim();
      } else {
        body.new_grantee = {
          display_name: form.newGrantee.display_name.trim(),
          ...(form.newGrantee.ein ? { ein: form.newGrantee.ein } : {}),
          ...(form.newGrantee.sector ? { sector: form.newGrantee.sector } : {}),
          ...(form.newGrantee.country ? { country: form.newGrantee.country } : {}),
          ...(form.newGrantee.city ? { city: form.newGrantee.city } : {}),
        };
      }

      const res = await fetch(`/api/org/${orgId}/grants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `Request failed (${res.status})`);
      }

      const json = await res.json();
      onSuccess(json.grant.id);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create grant');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-black/5">
          <div>
            <h2 className="text-lg font-semibold text-ink">New {grantLabel}</h2>
            <p className="text-sm text-neutral-500 mt-0.5">Step {step} of 3</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-2xl hover:bg-neutral-100 transition-colors">
            <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex gap-2 px-6 py-3 border-b border-black/5">
          {['Grantee', 'Details', 'Review'].map((label, i) => (
            <div key={i} className="flex items-center gap-2 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${i + 1 < step ? 'bg-azure text-white' : i + 1 === step ? 'bg-azure/10 text-azure border border-azure' : 'bg-neutral-100 text-neutral-400'}`}>
                {i + 1 < step ? '✓' : i + 1}
              </div>
              <span className={`text-xs ${i + 1 === step ? 'text-azure font-medium' : 'text-neutral-400'}`}>{label}</span>
              {i < 2 && <div className="flex-1 h-px bg-neutral-200" />}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="px-6 py-5 space-y-4">

          {/* STEP 1: Grantee */}
          {step === 1 && (
            <>
              <div className="flex gap-2">
                <button
                  onClick={() => patch({ granteeMode: 'new' })}
                  className={`flex-1 py-2 px-3 rounded-2xl text-sm font-medium border transition-colors ${form.granteeMode === 'new' ? 'bg-azure text-white border-azure' : 'bg-white text-neutral-600 border-black/5 hover:border-azure'}`}
                >
                  New Organization
                </button>
                <button
                  onClick={() => patch({ granteeMode: 'existing' })}
                  className={`flex-1 py-2 px-3 rounded-2xl text-sm font-medium border transition-colors ${form.granteeMode === 'existing' ? 'bg-azure text-white border-azure' : 'bg-white text-neutral-600 border-black/5 hover:border-azure'}`}
                >
                  Existing Investee
                </button>
              </div>

              {form.granteeMode === 'new' ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Organization Name <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={form.newGrantee.display_name}
                      onChange={e => patchGrantee({ display_name: e.target.value })}
                      placeholder="e.g. Community Health Foundation"
                      className="w-full px-3 py-2 border border-black/5 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">EIN</label>
                      <input type="text" value={form.newGrantee.ein} onChange={e => patchGrantee({ ein: e.target.value })} placeholder="12-3456789" className="w-full px-3 py-2 border border-black/5 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">Sector</label>
                      <input type="text" value={form.newGrantee.sector} onChange={e => patchGrantee({ sector: e.target.value })} placeholder="e.g. Health" className="w-full px-3 py-2 border border-black/5 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">City</label>
                      <input type="text" value={form.newGrantee.city} onChange={e => patchGrantee({ city: e.target.value })} placeholder="e.g. San Francisco" className="w-full px-3 py-2 border border-black/5 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">Country</label>
                      <input type="text" value={form.newGrantee.country} onChange={e => patchGrantee({ country: e.target.value })} placeholder="US" className="w-full px-3 py-2 border border-black/5 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure" />
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Investee ID <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={form.investeeId}
                    onChange={e => patch({ investeeId: e.target.value })}
                    placeholder="UUID of existing investee record"
                    className="w-full px-3 py-2 border border-black/5 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure font-mono"
                  />
                  <p className="text-xs text-neutral-400 mt-1">Paste the investee UUID from the Holdings or Donors list.</p>
                </div>
              )}
            </>
          )}

          {/* STEP 2: Grant details */}
          {step === 2 && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Purpose <span className="text-red-500">*</span></label>
                <textarea
                  value={form.purpose}
                  onChange={e => patch({ purpose: e.target.value })}
                  rows={3}
                  placeholder="Describe the grant's purpose and intended impact"
                  className="w-full px-3 py-2 border border-black/5 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Requested Amount <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    value={form.requestedAmount}
                    onChange={e => patch({ requestedAmount: e.target.value })}
                    placeholder="100000"
                    min="0"
                    className="w-full px-3 py-2 border border-black/5 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Currency</label>
                  <select value={form.currency} onChange={e => patch({ currency: e.target.value })} className="w-full px-3 py-2 border border-black/5 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure bg-white">
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="CAD">CAD</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">{grantLabel} Type</label>
                  <input type="text" value={form.grantType} onChange={e => patch({ grantType: e.target.value })} placeholder="e.g. Program, Capital" className="w-full px-3 py-2 border border-black/5 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Risk Level</label>
                  <select value={form.riskLevel} onChange={e => patch({ riskLevel: e.target.value })} className="w-full px-3 py-2 border border-black/5 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure bg-white">
                    <option value="">Not set</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Period Start</label>
                  <input type="date" value={form.grantPeriodStart} onChange={e => patch({ grantPeriodStart: e.target.value })} className="w-full px-3 py-2 border border-black/5 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Period End</label>
                  <input type="date" value={form.grantPeriodEnd} onChange={e => patch({ grantPeriodEnd: e.target.value })} className="w-full px-3 py-2 border border-black/5 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Initial Stage</label>
                <select value={form.lifecycleStage} onChange={e => patch({ lifecycleStage: e.target.value })} className="w-full px-3 py-2 border border-black/5 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure bg-white">
                  {LIFECYCLE_STAGES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* STEP 3: Review */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-neutral-50 p-4 space-y-2 text-sm">
                <h3 className="font-semibold text-ink mb-3">Review {grantLabel} Details</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  <div className="text-neutral-500">Grantee</div>
                  <div className="text-ink font-medium truncate">
                    {form.granteeMode === 'new' ? form.newGrantee.display_name : form.investeeId}
                  </div>
                  <div className="text-neutral-500">Purpose</div>
                  <div className="text-ink truncate">{form.purpose}</div>
                  <div className="text-neutral-500">Amount</div>
                  <div className="text-ink font-medium">
                    {parseFloat(form.requestedAmount || '0').toLocaleString('en-US')} {form.currency}
                  </div>
                  {form.grantType && (
                    <>
                      <div className="text-neutral-500">Type</div>
                      <div className="text-ink">{form.grantType}</div>
                    </>
                  )}
                  {form.lifecycleStage && (
                    <>
                      <div className="text-neutral-500">Initial Stage</div>
                      <div className="text-ink capitalize">{form.lifecycleStage.replace(/_/g, ' ')}</div>
                    </>
                  )}
                  {form.grantPeriodStart && (
                    <>
                      <div className="text-neutral-500">Period</div>
                      <div className="text-ink">{form.grantPeriodStart} → {form.grantPeriodEnd || 'TBD'}</div>
                    </>
                  )}
                  {form.riskLevel && (
                    <>
                      <div className="text-neutral-500">Risk Level</div>
                      <div className="text-ink capitalize">{form.riskLevel}</div>
                    </>
                  )}
                </div>
              </div>

              {error && (
                <div className="rounded-2xl bg-red-50 border border-red-200 text-red-700 p-3 text-sm">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-black/5">
          <button
            onClick={step === 1 ? onClose : () => setStep(s => s - 1)}
            className="px-4 py-2 text-sm text-neutral-600 hover:text-ink transition-colors"
          >
            {step === 1 ? 'Cancel' : '← Back'}
          </button>
          {step < 3 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 1 ? !canProceedStep1() : !canProceedStep2()}
              className="px-5 py-2 bg-azure text-white rounded-2xl text-sm font-medium hover:bg-azure/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="px-5 py-2 bg-azure text-white rounded-2xl text-sm font-medium hover:bg-azure/90 transition-colors disabled:opacity-50"
            >
              {saving ? 'Creating…' : `Create ${grantLabel}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
