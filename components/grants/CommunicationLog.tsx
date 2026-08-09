'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient as createClient } from '@/lib/supabase-browser';
import { useEntityVocabulary } from '@/lib/hooks/use-entity-vocabulary';

type Communication = {
  id: string;
  grant_id: string;
  direction: string;
  comm_type: string;
  subject: string | null;
  summary: string;
  full_content: string | null;
  contact_name: string | null;
  contact_email: string | null;
  occurred_at: string;
  follow_up_required: boolean;
  follow_up_date: string | null;
  follow_up_notes: string | null;
  tags: string[];
  grant_name: string;
  holding_id: string;
};

interface Props {
  portfolioId: string;
  orgId?: string | null;
}

export default function CommunicationLog({ portfolioId, orgId }: Props) {
  const vocabulary = useEntityVocabulary(orgId);
  const grantLabel = vocabulary.grant.singular;
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [filter, setFilter] = useState<'all' | 'inbound' | 'outbound' | 'follow_up'>('all');
  const [showAddComm, setShowAddComm] = useState(false);
  const [holdings, setHoldings] = useState<Array<{ id: string; name: string; grant_id?: string }>>([]);
  const [expandedComm, setExpandedComm] = useState<string | null>(null);

  const [newComm, setNewComm] = useState({
    holdingId: '',
    direction: 'outbound',
    commType: 'email',
    subject: '',
    summary: '',
    contactName: '',
    contactEmail: '',
    followUpRequired: false,
    followUpDate: '',
    followUpNotes: '',
  });

  async function fetchData() {
    setLoading(true);
    setFetchError(null);
    try {
      const supabase = createClient();

      const { data: commsData, error } = await supabase
        .from('grant_communications')
        .select(`
          *,
          grants!inner(
            id,
            holding_id,
            holdings!inner(name, portfolio_id)
          )
        `)
        .eq('grants.holdings.portfolio_id', portfolioId)
        .order('occurred_at', { ascending: false });

      if (error) throw error;

      setCommunications((commsData || []).map((c: any) => ({
        ...c,
        grant_name: c.grants?.holdings?.name || `Unknown ${grantLabel}`,
        holding_id: c.grants?.holding_id,
      })));

      const { data: holdingsData } = await supabase
        .from('holdings')
        .select(`id, name, grants(id)`)
        .eq('portfolio_id', portfolioId)
        .in('asset_type', ['foundation_grant', 'daf_grant', 'pri', 'mri'])
        .order('name');

      setHoldings((holdingsData || [])
        .map((h: any) => ({
          id: h.id,
          name: h.name,
          grant_id: h.grants?.[0]?.id,
        }))
        .filter((h: { grant_id?: string }) => Boolean(h.grant_id)));
    } catch (err: any) {
      setFetchError(err?.message ?? 'Failed to load communications.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioId]);

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDateTime = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getCommTypeIcon = (type: string) => {
    const icons: Record<string, React.ReactNode> = {
      email: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      phone: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
      ),
      meeting: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      site_visit: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      letter: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    };
    return icons[type] || icons.email;
  };

  const handleAddComm = async () => {
    if (!newComm.holdingId || !newComm.summary) {
      alert('Please fill in required fields');
      return;
    }

    try {
      const supabase = createClient();
      const holding = holdings.find(h => h.id === newComm.holdingId);
      const grantId = holding?.grant_id;
      if (!grantId) {
        alert('Create the grant through the grant workflow before logging communications.');
        return;
      }

      await supabase
        .from('grant_communications')
        .insert({
          grant_id: grantId,
          direction: newComm.direction,
          comm_type: newComm.commType,
          subject: newComm.subject || null,
          summary: newComm.summary,
          contact_name: newComm.contactName || null,
          contact_email: newComm.contactEmail || null,
          follow_up_required: newComm.followUpRequired,
          follow_up_date: newComm.followUpDate || null,
          follow_up_notes: newComm.followUpNotes || null,
          occurred_at: new Date().toISOString(),
        });

      setShowAddComm(false);
      setNewComm({ holdingId: '', direction: 'outbound', commType: 'email', subject: '', summary: '', contactName: '', contactEmail: '', followUpRequired: false, followUpDate: '', followUpNotes: '' });
      await fetchData();
    } catch (err: any) {
      alert(err?.message ?? 'Failed to add communication');
    }
  };

  const filteredComms = communications.filter(c => {
    if (filter === 'all') return true;
    if (filter === 'inbound') return c.direction === 'inbound';
    if (filter === 'outbound') return c.direction === 'outbound';
    if (filter === 'follow_up') return c.follow_up_required && !c.follow_up_date;
    return true;
  });

  const followUpCount = communications.filter(c => c.follow_up_required && c.follow_up_date && new Date(c.follow_up_date) >= new Date()).length;

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 bg-neutral-200 rounded-2xl"></div>
        ))}
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center">
        <p className="text-sm font-medium text-red-700">Failed to load communications</p>
        <p className="text-xs text-red-500 mt-1">{fetchError}</p>
        <button onClick={fetchData} className="mt-3 text-sm text-azure hover:underline">Try again</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="px-3 py-2 border border-black/10 rounded-2xl text-sm focus:ring-azure/30 focus:border-azure"
          >
            <option value="all">All Communications</option>
            <option value="inbound">Inbound</option>
            <option value="outbound">Outbound</option>
            <option value="follow_up">Needs Follow-up</option>
          </select>
          <span className="text-sm text-neutral-500">{filteredComms.length} entries</span>
          {followUpCount > 0 && (
            <span className="px-2 py-1 bg-sunset/15 text-ink border border-sunset/30 rounded-full text-xs font-medium">
              {followUpCount} follow-ups pending
            </span>
          )}
        </div>
        <button
          onClick={() => setShowAddComm(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-azure text-white rounded-2xl hover:bg-azure/90 text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Log Communication
        </button>
      </div>

      {/* Add Communication Modal */}
      {showAddComm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-ink mb-4">Log Communication</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">{grantLabel} *</label>
                  <select
                    value={newComm.holdingId}
                    onChange={(e) => setNewComm({ ...newComm, holdingId: e.target.value })}
                    className="w-full px-3 py-2 border border-black/10 rounded-2xl focus:ring-azure/30 focus:border-azure"
                  >
                    <option value="">Select a {grantLabel.toLowerCase()}...</option>
                    {holdings.map((h) => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Direction</label>
                  <select
                    value={newComm.direction}
                    onChange={(e) => setNewComm({ ...newComm, direction: e.target.value })}
                    className="w-full px-3 py-2 border border-black/10 rounded-2xl focus:ring-azure/30 focus:border-azure"
                  >
                    <option value="outbound">Outbound (to grantee)</option>
                    <option value="inbound">Inbound (from grantee)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Type</label>
                  <select
                    value={newComm.commType}
                    onChange={(e) => setNewComm({ ...newComm, commType: e.target.value })}
                    className="w-full px-3 py-2 border border-black/10 rounded-2xl focus:ring-azure/30 focus:border-azure"
                  >
                    <option value="email">Email</option>
                    <option value="phone">Phone Call</option>
                    <option value="meeting">Meeting</option>
                    <option value="site_visit">Site Visit</option>
                    <option value="letter">Letter</option>
                    <option value="portal_message">Portal Message</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Contact Name</label>
                  <input
                    type="text"
                    value={newComm.contactName}
                    onChange={(e) => setNewComm({ ...newComm, contactName: e.target.value })}
                    className="w-full px-3 py-2 border border-black/10 rounded-2xl focus:ring-azure/30 focus:border-azure"
                    placeholder="Contact person"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Subject</label>
                <input
                  type="text"
                  value={newComm.subject}
                  onChange={(e) => setNewComm({ ...newComm, subject: e.target.value })}
                  className="w-full px-3 py-2 border border-black/10 rounded-2xl focus:ring-azure/30 focus:border-azure"
                  placeholder="Communication subject"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Summary *</label>
                <textarea
                  value={newComm.summary}
                  onChange={(e) => setNewComm({ ...newComm, summary: e.target.value })}
                  className="w-full px-3 py-2 border border-black/10 rounded-2xl focus:ring-azure/30 focus:border-azure"
                  rows={3}
                  placeholder="Brief summary of the communication..."
                />
              </div>
              <div className="border-t border-black/5 pt-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newComm.followUpRequired}
                    onChange={(e) => setNewComm({ ...newComm, followUpRequired: e.target.checked })}
                    className="rounded border-black/10 text-azure focus:ring-azure/30"
                  />
                  <span className="text-sm font-medium text-neutral-700">Follow-up required</span>
                </label>
                {newComm.followUpRequired && (
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">Follow-up Date</label>
                      <input
                        type="date"
                        value={newComm.followUpDate}
                        onChange={(e) => setNewComm({ ...newComm, followUpDate: e.target.value })}
                        className="w-full px-3 py-2 border border-black/10 rounded-2xl focus:ring-azure/30 focus:border-azure"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">Follow-up Notes</label>
                      <input
                        type="text"
                        value={newComm.followUpNotes}
                        onChange={(e) => setNewComm({ ...newComm, followUpNotes: e.target.value })}
                        className="w-full px-3 py-2 border border-black/10 rounded-2xl focus:ring-azure/30 focus:border-azure"
                        placeholder="Action items..."
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowAddComm(false)}
                className="px-4 py-2 text-sm font-medium text-neutral-700 hover:text-ink"
              >
                Cancel
              </button>
              <button
                onClick={handleAddComm}
                className="px-4 py-2 bg-azure text-white rounded-2xl hover:bg-azure/90 text-sm font-medium"
              >
                Log Communication
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Communication Timeline */}
      {filteredComms.length === 0 ? (
        <div className="rounded-2xl border border-black/5 bg-white shadow-soft p-8 text-center">
          <svg className="mx-auto h-12 w-12 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p className="mt-2 text-neutral-500">No communications logged yet.</p>
          <button
            onClick={() => setShowAddComm(true)}
            className="mt-4 text-azure hover:text-azure/80 text-sm font-medium"
          >
            Log your first communication
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-black/5 bg-white shadow-soft divide-y divide-black/5">
          {filteredComms.map((comm) => (
            <div key={comm.id} className="p-6">
              <div className="flex items-start gap-4">
                {/* Direction Icon */}
                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                  comm.direction === 'inbound' ? 'bg-azure/10 text-azure-deep' : 'bg-green-50 text-green-600'
                }`}>
                  {comm.direction === 'inbound' ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-ink capitalize">
                      {getCommTypeIcon(comm.comm_type)}
                      {comm.comm_type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-sm text-neutral-500">with {comm.grant_name}</span>
                    {comm.contact_name && (
                      <span className="text-sm text-neutral-500">({comm.contact_name})</span>
                    )}
                    {comm.follow_up_required && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-sunset/15 text-ink border border-sunset/30">
                        Follow-up {comm.follow_up_date ? formatDate(comm.follow_up_date) : 'needed'}
                      </span>
                    )}
                  </div>
                  {comm.subject && (
                    <p className="mt-1 text-sm font-medium text-neutral-700">{comm.subject}</p>
                  )}
                  <p className="mt-1 text-sm text-neutral-600">{comm.summary}</p>
                  {expandedComm === comm.id && comm.full_content && (
                    <div className="mt-3 p-3 bg-neutral-50 rounded-2xl">
                      <p className="text-sm text-neutral-600 whitespace-pre-wrap">{comm.full_content}</p>
                    </div>
                  )}
                  {comm.follow_up_notes && (
                    <p className="mt-2 text-xs text-coral italic">Follow-up: {comm.follow_up_notes}</p>
                  )}
                  <div className="mt-2 flex items-center gap-4">
                    <span className="text-xs text-neutral-400">{formatDateTime(comm.occurred_at)}</span>
                    {comm.full_content && (
                      <button
                        onClick={() => setExpandedComm(expandedComm === comm.id ? null : comm.id)}
                        className="text-xs text-azure hover:text-azure/80"
                      >
                        {expandedComm === comm.id ? 'Show less' : 'Show more'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
