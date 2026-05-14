'use client';
import { useState, useEffect } from 'react';
import { generateSchedule, type Frequency, type ScheduledInstallment } from '@/lib/pledges/schedule';

interface Props {
  orgId: string;
  prefillDonorId?: string;
  prefillDonorName?: string;
  onClose: () => void;
  onCreated: () => void;
}

interface DonorOption { id: string; display_name: string; }

export default function PledgeCreateModal({ orgId, prefillDonorId, prefillDonorName, onClose, onCreated }: Props) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 fields
  const [donorQuery, setDonorQuery]     = useState(prefillDonorName ?? '');
  const [donorOptions, setDonorOptions] = useState<DonorOption[]>([]);
  const [donorId, setDonorId]           = useState(prefillDonorId ?? '');
  const [totalAmount, setTotalAmount]   = useState('');
  const [currency, setCurrency]         = useState('USD');
  const [commitmentType, setCommitmentType] = useState<string>('written');
  const [campaign, setCampaign]         = useState('');
  const [fundDesignation, setFundDesig] = useState('');
  const [notes, setNotes]               = useState('');

  // Step 2 fields
  const [startDate, setStartDate]   = useState('');
  const [endDate, setEndDate]       = useState('');
  const [frequency, setFrequency]   = useState<Frequency>('one_time');
  const [instCount, setInstCount]   = useState('');

  // Step 3: editable installments
  const [installments, setInstallments] = useState<ScheduledInstallment[]>([]);

  // Donor search
  useEffect(() => {
    if (prefillDonorId) return;
    if (!donorQuery || donorQuery.length < 2) { setDonorOptions([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/org/${orgId}/donors?name=${encodeURIComponent(donorQuery)}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setDonorOptions((data.donors ?? []).map((d: any) => ({
          id: d.id,
          display_name: d.display_name || [d.first_name, d.last_name].filter(Boolean).join(' ') || d.organization_name || d.id,
        })));
      }
    }, 250);
    return () => clearTimeout(t);
  }, [donorQuery, orgId, prefillDonorId]);

  function generatePreview() {
    try {
      const total = parseFloat(totalAmount);
      if (!total || !startDate || !frequency) return;
      const result = generateSchedule({
        totalAmount: total, startDate, endDate: endDate || undefined,
        frequency, installmentCount: instCount ? parseInt(instCount) : undefined,
      });
      setInstallments(result);
    } catch { setInstallments([]); }
  }

  useEffect(() => { if (step === 3) generatePreview(); }, [step]);

  const instSum = installments.reduce((s, i) => s + i.amount, 0);
  const total   = parseFloat(totalAmount) || 0;
  const sumOk   = Math.abs(instSum - total) < 0.02;

  function updateInst(idx: number, field: 'due_date' | 'amount', value: string) {
    setInstallments(prev => prev.map((i, n) => n === idx ? { ...i, [field]: field === 'amount' ? parseFloat(value) || 0 : value } : i));
  }

  function addInst() {
    setInstallments(prev => [...prev, { due_date: startDate, amount: 0 }]);
  }

  function removeInst(idx: number) {
    setInstallments(prev => prev.filter((_, n) => n !== idx));
  }

  async function handleSubmit() {
    if (!donorId || !totalAmount || !startDate || installments.length === 0 || !sumOk) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/org/${orgId}/pledges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          donor_id: donorId, total_amount: parseFloat(totalAmount), currency,
          start_date: startDate, end_date: endDate || undefined,
          frequency, commitment_type: commitmentType,
          campaign: campaign || undefined, fund_designation: fundDesignation || undefined,
          notes: notes || undefined,
          installments,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.[0]?.message ?? data.error ?? 'Failed to create pledge');
      onCreated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const canGoStep2 = !!donorId && !!totalAmount && parseFloat(totalAmount) > 0;
  const canGoStep3 = !!startDate && !!frequency;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
          <h2 className="text-base font-semibold text-neutral-900">New Pledge — Step {step} of 4</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-lg leading-none" aria-label="Close">×</button>
        </div>

        {/* Progress */}
        <div className="flex gap-1 px-6 pt-3">
          {[1,2,3,4].map(s => (
            <div key={s} className={`h-1 flex-1 rounded-full ${s <= step ? 'bg-azure' : 'bg-neutral-200'}`} />
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {step === 1 && (
            <>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Donor *</label>
                {prefillDonorId ? (
                  <div className="px-3 py-2 border border-neutral-300 rounded-md text-sm bg-neutral-50">{prefillDonorName}</div>
                ) : (
                  <div className="relative">
                    <input value={donorQuery} onChange={e => { setDonorQuery(e.target.value); setDonorId(''); }}
                      placeholder="Search donor name…"
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-azure"
                      aria-label="Donor search" />
                    {donorOptions.length > 0 && !donorId && (
                      <ul className="absolute z-10 mt-1 w-full bg-white border border-neutral-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                        {donorOptions.map(d => (
                          <li key={d.id}>
                            <button onClick={() => { setDonorId(d.id); setDonorQuery(d.display_name); setDonorOptions([]); }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50">
                              {d.display_name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Total Amount *</label>
                  <input type="number" min="0.01" step="0.01" value={totalAmount} onChange={e => setTotalAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-azure" />
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Currency</label>
                  <select value={currency} onChange={e => setCurrency(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-azure">
                    <option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Commitment Type</label>
                <select value={commitmentType} onChange={e => setCommitmentType(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-azure">
                  <option value="written">Written</option><option value="verbal">Verbal</option>
                  <option value="online">Online</option><option value="imported">Imported</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Campaign</label>
                  <input value={campaign} onChange={e => setCampaign(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-azure" />
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Fund Designation</label>
                  <input value={fundDesignation} onChange={e => setFundDesig(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-azure" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Notes</label>
                <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-azure resize-none" />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Start Date *</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-azure" />
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">End Date</label>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-azure" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Frequency *</label>
                <select value={frequency} onChange={e => setFrequency(e.target.value as Frequency)}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-azure">
                  <option value="one_time">One-time</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annually">Annually</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              {frequency !== 'one_time' && frequency !== 'custom' && (
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Number of installments (leave blank to derive from end date)</label>
                  <input type="number" min="1" value={instCount} onChange={e => setInstCount(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-azure" />
                </div>
              )}
              {frequency === 'custom' && (
                <p className="text-xs text-neutral-500">You&apos;ll add installments manually in the next step.</p>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-neutral-700">Installment Schedule</span>
                <span className={`text-xs font-semibold ${sumOk ? 'text-green-700' : 'text-red-600'}`}>
                  Sum: ${instSum.toFixed(2)} / ${total.toFixed(2)}
                </span>
              </div>
              {!sumOk && <p className="text-xs text-red-600" role="alert">Installment amounts must equal the total pledge amount.</p>}
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {installments.map((inst, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_100px_28px] gap-2 items-center">
                    <input type="date" value={inst.due_date} onChange={e => updateInst(idx, 'due_date', e.target.value)}
                      className="px-2 py-1.5 text-xs border border-neutral-300 rounded focus:outline-none focus:ring-1 focus:ring-azure" />
                    <input type="number" step="0.01" value={inst.amount} onChange={e => updateInst(idx, 'amount', e.target.value)}
                      className="px-2 py-1.5 text-xs border border-neutral-300 rounded focus:outline-none focus:ring-1 focus:ring-azure" />
                    <button onClick={() => removeInst(idx)} className="text-neutral-400 hover:text-red-500 text-sm" aria-label="Remove">×</button>
                  </div>
                ))}
              </div>
              <button onClick={addInst} className="text-xs text-azure hover:underline">+ Add installment</button>
            </>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <div className="bg-neutral-50 rounded-lg p-4 text-sm space-y-2">
                <div className="flex justify-between"><span className="text-neutral-500">Donor</span><span className="font-medium">{donorQuery}</span></div>
                <div className="flex justify-between"><span className="text-neutral-500">Total</span><span className="font-semibold text-neutral-900">${parseFloat(totalAmount).toLocaleString()} {currency}</span></div>
                <div className="flex justify-between"><span className="text-neutral-500">Frequency</span><span className="capitalize">{frequency.replace('_',' ')}</span></div>
                <div className="flex justify-between"><span className="text-neutral-500">Installments</span><span>{installments.length}</span></div>
                {installments.length > 0 && (
                  <div className="flex justify-between"><span className="text-neutral-500">First due</span><span>{installments[0].due_date}</span></div>
                )}
                {installments.length > 1 && (
                  <div className="flex justify-between"><span className="text-neutral-500">Final due</span><span>{installments[installments.length - 1].due_date}</span></div>
                )}
                {campaign && <div className="flex justify-between"><span className="text-neutral-500">Campaign</span><span>{campaign}</span></div>}
              </div>
              {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between px-6 py-4 border-t border-neutral-100 gap-2">
          <button onClick={step === 1 ? onClose : () => setStep(s => s - 1)}
            className="px-4 py-2 text-sm text-neutral-600 border border-neutral-300 rounded-md hover:bg-neutral-50">
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          {step < 4 ? (
            <button
              onClick={() => { if (step === 2) generatePreview(); setStep(s => s + 1); }}
              disabled={
                (step === 1 && !canGoStep2) ||
                (step === 2 && !canGoStep3) ||
                (step === 3 && !sumOk)
              }
              className="px-4 py-2 text-sm font-medium bg-azure text-white rounded-md hover:bg-azure/90 disabled:opacity-50 disabled:cursor-not-allowed">
              Continue
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={saving || !sumOk}
              className="px-4 py-2 text-sm font-medium bg-azure text-white rounded-md hover:bg-azure/90 disabled:opacity-50">
              {saving ? 'Creating…' : 'Create Pledge'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
