'use client';
import { useState, useEffect } from 'react';

interface Props {
  orgId: string;
  pledgeId: string;
  onClose: () => void;
  onChanged: () => void;
}

const INST_BADGE: Record<string, string> = {
  pending:    'bg-neutral-100 text-neutral-600',
  paid:       'bg-green-100 text-green-800',
  waived:     'bg-amber-100 text-amber-700',
  written_off:'bg-gray-100 text-gray-500',
};

function fmt(n: number) {
  return '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PledgeDetailPanel({ orgId, pledgeId, onClose, onChanged }: Props) {
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [acting, setActing]   = useState<string | null>(null);
  const [payForm, setPayForm] = useState<{ id: string; paidAt: string; payRef: string } | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; action: string; label: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/org/${orgId}/pledges/${pledgeId}`);
      if (!res.ok) throw new Error('Not found');
      setData(await res.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [pledgeId]);

  async function doAction(installmentId: string, action: string, extra: Record<string, any> = {}) {
    setActing(installmentId + action);
    try {
      const res = await fetch(`/api/org/${orgId}/pledges/${pledgeId}/installments/${installmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      await load();
      onChanged();
    } catch (e: any) { alert(e.message); }
    finally { setActing(null); setPayForm(null); setConfirm(null); }
  }

  const pledge       = data?.pledge;
  const installments: any[] = data?.installments ?? [];
  const events: any[]       = data?.events ?? [];

  const today = new Date().toISOString().slice(0, 10);
  const effectiveStatus = (inst: any) =>
    inst.status === 'pending' && inst.due_date < today ? 'overdue' : inst.status;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" aria-modal="true" role="dialog">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white h-full flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-neutral-100">
          <div>
            <div className="font-semibold text-neutral-900 text-base">{pledge?.donor_name ?? '…'}</div>
            {pledge && (
              <div className="text-xs text-neutral-500 mt-0.5">
                {pledge.frequency?.replace('_',' ')} · {pledge.campaign ?? 'No campaign'}
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-xl leading-none ml-3" aria-label="Close">×</button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-neutral-400 text-sm">Loading…</div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center text-red-500 text-sm">{error}</div>
        ) : (
          <div className="flex-1 overflow-y-auto divide-y divide-neutral-100">
            {/* Summary */}
            <div className="px-5 py-4 grid grid-cols-3 gap-3 text-sm">
              {[
                { label: 'Pledged',     value: fmt(pledge.total_amount), color: 'text-neutral-900' },
                { label: 'Received',    value: fmt(pledge.received),     color: 'text-green-700' },
                { label: 'Outstanding', value: fmt(pledge.outstanding),  color: pledge.overdue > 0 ? 'text-red-700' : 'text-neutral-900' },
              ].map(k => (
                <div key={k.label} className="bg-neutral-50 rounded-lg px-3 py-2">
                  <div className="text-xs text-neutral-500">{k.label}</div>
                  <div className={`font-semibold mt-0.5 ${k.color}`}>{k.value}</div>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div className="px-5 py-3">
              <div className="flex justify-between text-xs text-neutral-500 mb-1">
                <span>Progress</span>
                <span>{pledge.paid_count}/{pledge.installment_count} installments</span>
              </div>
              <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
                <div className="h-full bg-azure rounded-full transition-all"
                  style={{ width: `${pledge.installment_count > 0 ? (pledge.resolved_count / pledge.installment_count) * 100 : 0}%` }} />
              </div>
            </div>

            {/* Installments */}
            <div className="px-5 py-4">
              <div className="text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-3">Installments</div>
              <div className="space-y-2">
                {installments.map((inst: any) => {
                  const eff = effectiveStatus(inst);
                  const isActing = acting?.startsWith(inst.id);
                  return (
                    <div key={inst.id} className="border border-neutral-200 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-neutral-900">{fmt(inst.amount)}</div>
                          <div className="text-xs text-neutral-500">Due {inst.due_date}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${eff === 'overdue' ? 'bg-red-100 text-red-700' : INST_BADGE[inst.status] ?? ''}`}>
                            {eff === 'overdue' ? 'Overdue' : inst.status.replace('_',' ')}
                          </span>
                          {inst.status === 'pending' && (
                            <button onClick={() => setPayForm({ id: inst.id, paidAt: new Date().toISOString().slice(0,10), payRef: '' })}
                              disabled={!!isActing}
                              className="text-xs px-2 py-1 border border-azure text-azure rounded hover:bg-azure/5 disabled:opacity-50">
                              Record Payment
                            </button>
                          )}
                          {inst.status === 'pending' && (
                            <button onClick={() => setConfirm({ id: inst.id, action: 'waive', label: 'Waive this installment?' })}
                              disabled={!!isActing}
                              className="text-xs px-2 py-1 border border-neutral-300 text-neutral-600 rounded hover:bg-neutral-50 disabled:opacity-50">
                              Waive
                            </button>
                          )}
                          {inst.status !== 'pending' && inst.status !== 'written_off' && (
                            <button onClick={() => setConfirm({ id: inst.id, action: 'reopen', label: 'Reopen this installment? This will reverse the recorded payment.' })}
                              disabled={!!isActing}
                              className="text-xs text-neutral-500 hover:text-neutral-700 underline disabled:opacity-50">
                              Reopen
                            </button>
                          )}
                        </div>
                      </div>
                      {inst.payment_ref && <div className="text-xs text-neutral-400 mt-1">Ref: {inst.payment_ref}</div>}

                      {/* Payment form */}
                      {payForm?.id === inst.id && (
                        <div className="mt-3 pt-3 border-t border-neutral-100 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs text-neutral-500 mb-1 block">Paid date</label>
                              <input type="date" value={payForm.paidAt}
                                onChange={e => setPayForm(f => f ? { ...f, paidAt: e.target.value } : f)}
                                className="w-full px-2 py-1.5 text-xs border border-neutral-300 rounded focus:ring-1 focus:ring-azure focus:outline-none" />
                            </div>
                            <div>
                              <label className="text-xs text-neutral-500 mb-1 block">Reference (optional)</label>
                              <input value={payForm.payRef}
                                onChange={e => setPayForm(f => f ? { ...f, payRef: e.target.value } : f)}
                                className="w-full px-2 py-1.5 text-xs border border-neutral-300 rounded focus:ring-1 focus:ring-azure focus:outline-none" />
                            </div>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => setPayForm(null)} className="text-xs text-neutral-500 hover:text-neutral-700">Cancel</button>
                            <button
                              onClick={() => doAction(inst.id, 'mark_paid', { paid_at: payForm.paidAt ? new Date(payForm.paidAt).toISOString() : undefined, payment_ref: payForm.payRef || undefined, create_contribution: true })}
                              disabled={!!isActing}
                              className="px-3 py-1 text-xs font-medium bg-azure text-white rounded hover:bg-azure/90 disabled:opacity-50">
                              {isActing ? 'Saving…' : 'Confirm Payment'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Event history */}
            {events.length > 0 && (
              <div className="px-5 py-4">
                <div className="text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-3">History</div>
                <div className="space-y-1.5">
                  {events.slice(0, 10).map((e: any) => (
                    <div key={e.id} className="text-xs text-neutral-500">
                      <span className="font-medium text-neutral-700">{e.event_type.replace(/_/g,' ')}</span>
                      {' · '}{new Date(e.created_at).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Confirm dialog */}
        {confirm && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="bg-white rounded-xl shadow-xl p-5 mx-4 max-w-sm w-full">
              <p className="text-sm text-neutral-800 mb-4">{confirm.label}</p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setConfirm(null)} className="px-3 py-1.5 text-sm border border-neutral-300 rounded hover:bg-neutral-50">Cancel</button>
                <button onClick={() => doAction(confirm.id, confirm.action)}
                  className="px-3 py-1.5 text-sm font-medium bg-neutral-800 text-white rounded hover:bg-neutral-700">
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
