// components/notifications/NotificationBell.tsx
'use client';

import { apiRequest, readJson } from "@/lib/api/client";

import { useState, useEffect, useRef, useCallback } from 'react';
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

interface Props {
  orgId: string;
}

export default function NotificationBell({ orgId }: Props) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const fetchNotifications = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await apiRequest(`/api/org/${orgId}/notifications?status=unread&limit=10`);
      if (!res.ok) return;
      const data = await readJson(res);
      setNotifications(data.data ?? []);
      setUnreadCount(data.unread_count ?? 0);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  async function handleClick(n: NotificationItem) {
    setOpen(false);
    if (!n.read_at) {
      await apiRequest(`/api/org/${orgId}/notifications/${n.id}/read`, { method: 'PATCH' });
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x));
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    router.push(n.href || '/dashboard');
  }

  async function handleMarkAll() {
    await apiRequest(`/api/org/${orgId}/notifications/mark-all-read`, { method: 'POST' });
    setNotifications([]);
    setUnreadCount(0);
  }

  const priorityDot: Record<string, string> = {
    urgent: 'bg-red-500',
    high: 'bg-amber-400',
    normal: 'bg-blue-400',
    low: 'bg-gray-300',
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-2 rounded-full hover:bg-black/5 transition-colors"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5 text-black/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center w-4 h-4 text-[10px] font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-black/8 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-black/8">
            <span className="text-sm font-semibold text-black/80">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={handleMarkAll} className="text-xs text-azure hover:underline">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto divide-y divide-black/5">
            {loading && notifications.length === 0 && (
              <div className="px-4 py-6 text-sm text-center text-black/40">Loading...</div>
            )}
            {!loading && notifications.length === 0 && (
              <div className="px-4 py-6 text-sm text-center text-black/40">You&apos;re all caught up</div>
            )}
            {notifications.map(n => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className="w-full text-left px-4 py-3 hover:bg-black/3 transition-colors flex gap-3"
              >
                <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${priorityDot[n.priority] ?? 'bg-gray-300'}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-black/80 leading-snug truncate">{n.title}</p>
                  <p className="text-xs text-black/50 mt-0.5 line-clamp-2">{n.body}</p>
                </div>
              </button>
            ))}
          </div>

          <div className="px-4 py-2 border-t border-black/8">
            <button
              onClick={() => { setOpen(false); router.push(`/dashboard/notifications`); }}
              className="text-xs text-azure hover:underline w-full text-center"
            >
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
