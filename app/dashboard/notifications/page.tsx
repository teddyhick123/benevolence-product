// app/dashboard/notifications/page.tsx
'use client';

import { apiRequest, readJson } from "@/lib/api/client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface NotificationItem {
  id: string;
  event_type: string;
  priority: string;
  task_id: string | null;
  title: string;
  body: string;
  href: string;
  read_at: string | null;
  created_at: string;
}

const PRIORITY_LABEL: Record<string, string> = {
  urgent: 'Urgent',
  high: 'High',
  normal: 'Normal',
  low: 'Low',
};

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'text-red-600 bg-red-50',
  high: 'text-amber-700 bg-amber-50',
  normal: 'text-blue-700 bg-blue-50',
  low: 'text-gray-500 bg-gray-100',
};

export default function NotificationsPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'unread' | 'all'>('unread');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const nextCursorRef = useRef<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)x-org-id=([^;]+)/);
    if (match) {
      setOrgId(decodeURIComponent(match[1]));
    } else {
      setLoading(false);
    }
  }, []);

  const fetchNotifications = useCallback(async (reset = false) => {
    if (!orgId) return;
    setLoading(true);
    const cursorParam = !reset && nextCursorRef.current ? `&cursor=${nextCursorRef.current}` : '';
    try {
      const res = await apiRequest(`/api/org/${orgId}/notifications?status=${statusFilter}&limit=30${cursorParam}`);
      if (!res.ok) return;
      const data = await readJson(res);
      setNotifications(prev => reset ? data.data : [...prev, ...data.data]);
      setUnreadCount(data.unread_count ?? 0);
      setHasMore(!!data.next_cursor);
      const cursor = data.next_cursor ?? null;
      setNextCursor(cursor);
      nextCursorRef.current = cursor;
    } finally {
      setLoading(false);
    }
  }, [orgId, statusFilter]);

  useEffect(() => {
    if (orgId) fetchNotifications(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, statusFilter]);

  async function markRead(n: NotificationItem) {
    if (n.read_at || !orgId) return;
    await apiRequest(`/api/org/${orgId}/notifications/${n.id}/read`, { method: 'PATCH' });
    setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }

  async function handleClick(n: NotificationItem) {
    await markRead(n);
    router.push(n.href || '/dashboard');
  }

  async function handleMarkAll() {
    if (!orgId) return;
    await apiRequest(`/api/org/${orgId}/notifications/mark-all-read`, { method: 'POST' });
    setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    setUnreadCount(0);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-black/80">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-black/50 mt-0.5">{unreadCount} unread</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-black/5 rounded-lg p-1">
            {(['unread', 'all'] as const).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${statusFilter === f ? 'bg-white shadow-sm font-medium text-black/80' : 'text-black/50 hover:text-black/70'}`}
              >
                {f === 'unread' ? 'Unread' : 'All'}
              </button>
            ))}
          </div>
          {unreadCount > 0 && (
            <button onClick={handleMarkAll} className="text-sm text-azure hover:underline">
              Mark all read
            </button>
          )}
        </div>
      </div>

      <div className="space-y-1">
        {loading && notifications.length === 0 && (
          <div className="text-center py-12 text-black/40">Loading...</div>
        )}
        {!loading && notifications.length === 0 && (
          <div className="text-center py-12 text-black/40">
            {statusFilter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          </div>
        )}
        {notifications.map(n => (
          <button
            key={n.id}
            onClick={() => handleClick(n)}
            className={`w-full text-left p-4 rounded-xl border transition-colors flex gap-4 ${n.read_at ? 'border-black/6 bg-white hover:bg-black/2' : 'border-azure/20 bg-azure/3 hover:bg-azure/5'}`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {!n.read_at && <span className="w-2 h-2 rounded-full bg-azure flex-shrink-0" />}
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${PRIORITY_COLOR[n.priority] ?? 'text-gray-500 bg-gray-100'}`}>
                  {PRIORITY_LABEL[n.priority] ?? n.priority}
                </span>
              </div>
              <p className={`text-sm leading-snug ${n.read_at ? 'text-black/60 font-normal' : 'text-black/80 font-medium'}`}>{n.title}</p>
              <p className="text-xs text-black/50 mt-1 line-clamp-2">{n.body}</p>
              <p className="text-xs text-black/30 mt-1">{new Date(n.created_at).toLocaleString()}</p>
            </div>
          </button>
        ))}
      </div>

      {hasMore && (
        <div className="mt-4 text-center">
          <button
            onClick={() => fetchNotifications(false)}
            className="text-sm text-azure hover:underline"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
