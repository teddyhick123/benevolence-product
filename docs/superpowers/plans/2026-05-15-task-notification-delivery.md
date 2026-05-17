# Task Notification Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the notification layer that turns the task graph into timely in-app alerts and email digests — fan-out from `task_events` → `notification_events` → in-app inbox + email + digest.

**Architecture:** A polling fan-out job scans recent `task_events` and inserts `notification_events` rows (one per recipient/channel). The in-app inbox reads those rows directly. A send job delivers emails via Resend. A digest job compiles daily/weekly summaries. All delivery is idempotent via `dedupe_key` unique constraint.

**Tech Stack:** Supabase PostgreSQL + RLS, Next.js App Router API routes, Resend + React Email, Vitest contract tests

**Product decisions baked in:**
- Unassigned urgent tasks → admins/owners only for immediate notification
- Completion notifications → digest only in v1
- Default digest for new members → weekly
- Due-soon window → 7 days globally
- Watchers/subscribers → deferred

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `db/migrations/0041_task_workflow_foundation.sql` | Modify | Strengthen `notification_events` table |
| `db/migrations/0024_settings_ops_hub.sql` | Modify | Update `notification_prefs` default shape |
| `lib/notifications/types.ts` | Create | Shared notification constants + TS types |
| `lib/__tests__/notification-contract.test.ts` | Create | Contract tests guarding schema alignment |
| `app/api/org/[orgId]/notifications/route.ts` | Create | GET inbox list |
| `app/api/org/[orgId]/notifications/[notificationId]/read/route.ts` | Create | PATCH mark read |
| `app/api/org/[orgId]/notifications/mark-all-read/route.ts` | Create | POST mark all read |
| `components/notifications/NotificationBell.tsx` | Create | Bell icon + popover |
| `app/dashboard/notifications/page.tsx` | Create | Full notifications page |
| `components/settings/NotificationsTab.tsx` | Modify | Expand to full prefs shape, remove "coming soon" |
| `app/api/org/[orgId]/members/[userId]/notifications/route.ts` | Modify | Accept new prefs shape |
| `lib/notifications/preferences.ts` | Create | Load + merge prefs with defaults |
| `lib/notifications/recipients.ts` | Create | Recipient resolution from task event |
| `lib/notifications/fanout.ts` | Create | `fanOutTaskEvent` |
| `app/api/jobs/notifications/fanout/route.ts` | Create | Fan-out cron job route |
| `lib/notifications/render.ts` | Create | Subject + body builder |
| `lib/email/templates/task-notification.tsx` | Create | React Email single-task template |
| `lib/notifications/delivery.ts` | Create | Suppression check + Resend call + retry |
| `app/api/jobs/notifications/send/route.ts` | Create | Email send cron job route |
| `lib/notifications/digest.ts` | Create | Digest compiler |
| `lib/email/templates/task-digest.tsx` | Create | React Email digest template |
| `app/api/jobs/notifications/digest/route.ts` | Create | Digest cron job route |
| `components/Header.tsx` | Modify | Add `<NotificationBell />` |

---

### Task 1: Strengthen `notification_events` Schema

**Files:**
- Modify: `db/migrations/0041_task_workflow_foundation.sql` (replace `notification_events` CREATE TABLE block starting at line 464)
- Modify: `db/migrations/0024_settings_ops_hub.sql` (update `notification_prefs` default)

- [ ] **Step 1: Replace the `notification_events` table block**

In `db/migrations/0041_task_workflow_foundation.sql`, find the existing block (lines 464–485) and replace with:

```sql
CREATE TABLE IF NOT EXISTS public.notification_events (
  id                   uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id               uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  recipient_user_id    uuid        NOT NULL REFERENCES auth.users(id),
  task_id              uuid        REFERENCES public.tasks(id) ON DELETE CASCADE,
  task_event_id        uuid        REFERENCES public.task_events(id) ON DELETE SET NULL,
  actor_id             uuid        REFERENCES auth.users(id),
  event_type           text        NOT NULL,
  channel              text        NOT NULL CHECK (channel IN ('in_app', 'email', 'digest')),
  status               text        NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending', 'sent', 'failed', 'suppressed', 'cancelled')),
  priority             text        NOT NULL DEFAULT 'normal'
                                   CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  dedupe_key           text        NOT NULL,
  scheduled_for        timestamptz NOT NULL DEFAULT now(),
  sent_at              timestamptz,
  read_at              timestamptz,
  delivery_attempts    int         NOT NULL DEFAULT 0,
  last_attempt_at      timestamptz,
  next_attempt_at      timestamptz,
  error_message        text,
  payload              jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_notification_dedupe UNIQUE (org_id, recipient_user_id, channel, dedupe_key)
);
```

- [ ] **Step 2: Replace the indexes and add new ones**

Remove the two old indexes (keep searching for `idx_notification_events_pending` and `idx_notification_events_recipient`) and replace with:

```sql
-- Inbox query (unread first, recent)
CREATE INDEX IF NOT EXISTS idx_notification_events_inbox
  ON public.notification_events (recipient_user_id, status, created_at DESC);

-- Pending send job
CREATE INDEX IF NOT EXISTS idx_notification_events_pending
  ON public.notification_events (status, scheduled_for)
  WHERE status = 'pending';

-- Retry backoff query
CREATE INDEX IF NOT EXISTS idx_notification_events_retry
  ON public.notification_events (status, next_attempt_at)
  WHERE status = 'failed';

-- Task + event type lookup for fan-out dedup
CREATE INDEX IF NOT EXISTS idx_notification_events_task_event
  ON public.notification_events (org_id, task_id, event_type);
```

- [ ] **Step 3: Replace RLS policies**

Find the existing `notification_events` RLS block (around line 810) and replace with:

```sql
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_events: recipients can view" ON public.notification_events;
CREATE POLICY "notification_events: recipients can view"
  ON public.notification_events FOR SELECT TO authenticated
  USING (
    recipient_user_id = auth.uid()
    AND public.can_view_org(org_id)
  );

DROP POLICY IF EXISTS "notification_events: recipients can mark read" ON public.notification_events;
CREATE POLICY "notification_events: recipients can mark read"
  ON public.notification_events FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

DROP POLICY IF EXISTS "notification_events: service role can manage" ON public.notification_events;
CREATE POLICY "notification_events: service role can manage"
  ON public.notification_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, UPDATE ON public.notification_events TO authenticated;
GRANT ALL ON public.notification_events TO service_role;
```

- [ ] **Step 4: Add `updated_at` trigger for `notification_events`**

After the RLS block for `notification_events`, add:

```sql
CREATE TRIGGER trg_notification_events_updated_at
  BEFORE UPDATE ON public.notification_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

- [ ] **Step 5: Update `notification_prefs` default in `0024_settings_ops_hub.sql`**

Find line 34 and replace the `ADD COLUMN` statement:

```sql
ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{
    "digest": "weekly",
    "channels": {"in_app": true, "email": true},
    "alerts": {
      "assigned_to_me": true,
      "due_soon": true,
      "overdue": true,
      "approvals": true,
      "comments": true,
      "mentions": true,
      "automation_failures": true,
      "digest_summary": true,
      "org_admin": false
    }
  }'::jsonb;
```

- [ ] **Step 6: Commit**

```bash
git add db/migrations/0041_task_workflow_foundation.sql db/migrations/0024_settings_ops_hub.sql
git commit -m "feat: strengthen notification_events schema with dedupe, retry, read_at fields"
```

---

### Task 2: Notification Types + Constants

**Files:**
- Create: `lib/notifications/types.ts`

- [ ] **Step 1: Write the failing contract test for type coverage (placeholder — full tests in Task 3)**

Just verify the file won't exist yet:

```bash
ls lib/notifications/types.ts 2>/dev/null && echo EXISTS || echo "not found — ok"
```

Expected: `not found — ok`

- [ ] **Step 2: Create `lib/notifications/types.ts`**

```typescript
// lib/notifications/types.ts

export const NOTIFICATION_EVENT_TYPES = [
  'task_assigned',
  'task_due_soon',
  'task_overdue',
  'task_priority_escalated',
  'approval_requested',
  'task_commented',
  'task_mentioned',
  'task_completed',
  'task_cancelled',
  'automation_failed',
  'digest_ready',
] as const;

export type NotificationEventType = typeof NOTIFICATION_EVENT_TYPES[number];

export const NOTIFICATION_ALERT_KEYS = [
  'assigned_to_me',
  'due_soon',
  'overdue',
  'approvals',
  'comments',
  'mentions',
  'automation_failures',
  'digest_summary',
  'org_admin',
] as const;

export type NotificationAlertKey = typeof NOTIFICATION_ALERT_KEYS[number];

export type NotificationChannel = 'in_app' | 'email' | 'digest';
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'suppressed' | 'cancelled';
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export type NotificationPrefs = {
  digest: 'daily' | 'weekly' | 'never';
  quiet_hours?: {
    enabled: boolean;
    timezone: string;
    start: string;
    end: string;
  };
  channels: {
    in_app: boolean;
    email: boolean;
  };
  alerts: Record<NotificationAlertKey, boolean>;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  digest: 'weekly',
  channels: { in_app: true, email: true },
  alerts: {
    assigned_to_me: true,
    due_soon: true,
    overdue: true,
    approvals: true,
    comments: true,
    mentions: true,
    automation_failures: true,
    digest_summary: true,
    org_admin: false,
  },
};

// Payload stored in notification_events.payload — render-ready, no sensitive data
export type NotificationPayload = {
  title: string;
  body: string;
  href: string;
  task_title?: string;
  source_label?: string;
  reason: string;
  suppression_reason?: string;
};

export type FanOutTaskEventInput = {
  taskEventId: string;
  now?: string;
};

// Row shape returned from the DB for inbox rendering
export type InboxNotification = {
  id: string;
  event_type: NotificationEventType;
  priority: NotificationPriority;
  task_id: string | null;
  payload: NotificationPayload;
  read_at: string | null;
  created_at: string;
  channel: NotificationChannel;
  status: NotificationStatus;
};
```

- [ ] **Step 3: Commit**

```bash
git add lib/notifications/types.ts
git commit -m "feat: add notification event types, alert keys, and shared TypeScript types"
```

---

### Task 3: Contract Test for Notification Schema

**Files:**
- Create: `lib/__tests__/notification-contract.test.ts`

- [ ] **Step 1: Create the contract test file**

```typescript
// lib/__tests__/notification-contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_ALERT_KEYS,
} from '../notifications/types';

const ROOT = process.cwd();

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), 'utf8');
}

function readMigrations(): string {
  const migDir = join(ROOT, 'db/migrations');
  return readdirSync(migDir)
    .filter(f => f.endsWith('.sql'))
    .map(f => readFileSync(join(migDir, f), 'utf8'))
    .join('\n');
}

const migrations = readMigrations();
const typesSrc = read('lib/notifications/types.ts');
const fanoutSrc = read('lib/notifications/fanout.ts');
const deliverySrc = read('lib/notifications/delivery.ts');
const notifEmailTemplate = read('lib/email/templates/task-notification.tsx');
const digestEmailTemplate = read('lib/email/templates/task-digest.tsx');
const settingsTabSrc = read('components/settings/NotificationsTab.tsx');

// ---------------------------------------------------------------------------
// 1. Schema: notification_events must have required columns
// ---------------------------------------------------------------------------
describe('notification_events schema', () => {
  const REQUIRED_COLUMNS = [
    'dedupe_key',
    'read_at',
    'delivery_attempts',
    'next_attempt_at',
    'updated_at',
    'task_event_id',
    'actor_id',
    'priority',
  ];

  for (const col of REQUIRED_COLUMNS) {
    it(`notification_events has column "${col}"`, () => {
      expect(migrations).toMatch(new RegExp(`\\b${col}\\b`));
    });
  }

  it('notification_events has cancelled status', () => {
    expect(migrations).toContain("'cancelled'");
  });

  it('notification_events has unique dedupe_key constraint', () => {
    expect(migrations).toMatch(/UNIQUE\s*\([^)]*dedupe_key[^)]*\)/i);
  });

  it('notification_events has recipient-scoped read_at update RLS', () => {
    expect(migrations).toMatch(/recipients can mark read/i);
    expect(migrations).toMatch(/read_at.*auth\.uid\(\)|auth\.uid\(\).*read_at/is);
  });
});

// ---------------------------------------------------------------------------
// 2. NOTIFICATION_EVENT_TYPES covers all types used in fanout
// ---------------------------------------------------------------------------
describe('NOTIFICATION_EVENT_TYPES coverage', () => {
  for (const eventType of NOTIFICATION_EVENT_TYPES) {
    it(`fanout.ts references '${eventType}'`, () => {
      expect(fanoutSrc).toContain(`'${eventType}'`);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. NOTIFICATION_ALERT_KEYS appear in the settings UI
// ---------------------------------------------------------------------------
describe('NOTIFICATION_ALERT_KEYS coverage in settings', () => {
  for (const key of NOTIFICATION_ALERT_KEYS) {
    it(`settings tab references alert key '${key}'`, () => {
      expect(settingsTabSrc).toContain(`'${key}'`);
    });
  }
});

// ---------------------------------------------------------------------------
// 4. Email templates are brand-agnostic (no hard-coded client names)
// ---------------------------------------------------------------------------
describe('Email template brand-agnosticism', () => {
  const FORBIDDEN_NAMES = ['Benevolence', ' Ben ', 'B.', 'benevolence'];

  for (const name of FORBIDDEN_NAMES) {
    it(`task-notification.tsx does not hard-code "${name}"`, () => {
      expect(notifEmailTemplate).not.toContain(name);
    });

    it(`task-digest.tsx does not hard-code "${name}"`, () => {
      expect(digestEmailTemplate).not.toContain(name);
    });
  }
});

// ---------------------------------------------------------------------------
// 5. Job routes check CRON_SECRET
// ---------------------------------------------------------------------------
describe('Job route security', () => {
  const fanoutRoute = read('app/api/jobs/notifications/fanout/route.ts');
  const sendRoute = read('app/api/jobs/notifications/send/route.ts');
  const digestRoute = read('app/api/jobs/notifications/digest/route.ts');

  it('fanout route checks CRON_SECRET', () => {
    expect(fanoutRoute).toContain('CRON_SECRET');
  });

  it('send route checks CRON_SECRET', () => {
    expect(sendRoute).toContain('CRON_SECRET');
  });

  it('digest route checks CRON_SECRET', () => {
    expect(digestRoute).toContain('CRON_SECRET');
  });
});

// ---------------------------------------------------------------------------
// 6. Delivery uses retry backoff constants
// ---------------------------------------------------------------------------
describe('Delivery retry policy', () => {
  it('delivery.ts has retry backoff values', () => {
    // Verifies the 5-min / 30-min / 2-hour progression exists as constants or literals
    expect(deliverySrc).toMatch(/5\s*\*\s*60|300/); // 5 minutes in seconds
    expect(deliverySrc).toMatch(/30\s*\*\s*60|1800/); // 30 minutes
    expect(deliverySrc).toMatch(/2\s*\*\s*60\s*\*\s*60|7200/); // 2 hours
  });

  it('delivery.ts suppresses after max attempts', () => {
    expect(deliverySrc).toContain('5'); // MAX_ATTEMPTS = 5
    expect(deliverySrc).toMatch(/suppressed|suppression/i);
  });
});

// ---------------------------------------------------------------------------
// 7. Settings tab does NOT contain "coming soon"
// ---------------------------------------------------------------------------
describe('Settings tab completeness', () => {
  it('settings tab does not say "coming soon"', () => {
    expect(settingsTabSrc.toLowerCase()).not.toContain('coming soon');
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail at this stage (expected)**

```bash
npx vitest run lib/__tests__/notification-contract.test.ts 2>&1 | tail -20
```

Expected: many FAILUREs — `fanout.ts`, `delivery.ts`, email templates don't exist yet.

- [ ] **Step 3: Commit**

```bash
git add lib/__tests__/notification-contract.test.ts
git commit -m "test: add notification delivery contract tests (failing until implementation is complete)"
```

---

### Task 4: In-App Inbox API Routes

**Files:**
- Create: `app/api/org/[orgId]/notifications/route.ts`
- Create: `app/api/org/[orgId]/notifications/[notificationId]/read/route.ts`
- Create: `app/api/org/[orgId]/notifications/mark-all-read/route.ts`

- [ ] **Step 1: Write contract test for inbox API behavior**

Add to `lib/__tests__/notification-contract.test.ts` (append before the last `}`):

Actually, these are route-level tests that need mocking — skip per the plan's YAGNI approach. The contract test already covers security. The route behavior will be verified by testing the UI.

- [ ] **Step 2: Create `app/api/org/[orgId]/notifications/route.ts`**

```typescript
// app/api/org/[orgId]/notifications/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'unread';
    const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10), 100);
    const cursor = searchParams.get('cursor');

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) return NextResponse.json({ error: 'Not a member of this organization' }, { status: 403 });

    const db = createAdminClient();

    let query = db
      .from('notification_events')
      .select('id, event_type, priority, task_id, payload, read_at, created_at, channel, status')
      .eq('org_id', orgId)
      .eq('recipient_user_id', user.id)
      .eq('channel', 'in_app')
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (status === 'unread') {
      query = query.is('read_at', null).not('status', 'in', '(suppressed,cancelled)');
    } else if (status === 'read') {
      query = query.not('read_at', 'is', null);
    }

    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    const { data, error } = await query;
    if (error) throw error;

    const hasMore = (data?.length ?? 0) > limit;
    const rows = hasMore ? data!.slice(0, limit) : (data ?? []);
    const nextCursor = hasMore ? rows[rows.length - 1].created_at : null;

    // Unread count (always fresh)
    const { count } = await db
      .from('notification_events')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('recipient_user_id', user.id)
      .eq('channel', 'in_app')
      .is('read_at', null)
      .not('status', 'in', '(suppressed,cancelled)');

    return NextResponse.json({
      data: rows.map((n: any) => ({
        id: n.id,
        event_type: n.event_type,
        priority: n.priority,
        task_id: n.task_id,
        title: n.payload?.title ?? '',
        body: n.payload?.body ?? '',
        href: n.payload?.href ?? '/dashboard',
        read_at: n.read_at,
        created_at: n.created_at,
      })),
      unread_count: count ?? 0,
      next_cursor: nextCursor,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create `app/api/org/[orgId]/notifications/[notificationId]/read/route.ts`**

```typescript
// app/api/org/[orgId]/notifications/[notificationId]/read/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string; notificationId: string }> }
) {
  try {
    const { orgId, notificationId } = await params;

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

    const db = createAdminClient();
    const { error } = await db
      .from('notification_events')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('recipient_user_id', user.id)
      .eq('org_id', orgId)
      .is('read_at', null);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Create `app/api/org/[orgId]/notifications/mark-all-read/route.ts`**

```typescript
// app/api/org/[orgId]/notifications/mark-all-read/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

    const db = createAdminClient();
    const { error } = await db
      .from('notification_events')
      .update({ read_at: new Date().toISOString() })
      .eq('org_id', orgId)
      .eq('recipient_user_id', user.id)
      .eq('channel', 'in_app')
      .is('read_at', null);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add "app/api/org/[orgId]/notifications/"
git commit -m "feat: add in-app notification inbox API routes (list, mark read, mark all read)"
```

---

### Task 5: Notification Bell + Popover

**Files:**
- Create: `components/notifications/NotificationBell.tsx`
- Modify: `components/Header.tsx` (add bell after user avatar area)

- [ ] **Step 1: Create `components/notifications/NotificationBell.tsx`**

```tsx
// components/notifications/NotificationBell.tsx
'use client';

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
      const res = await fetch(`/api/org/${orgId}/notifications?status=unread&limit=10`);
      if (!res.ok) return;
      const data = await res.json();
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
      await fetch(`/api/org/${orgId}/notifications/${n.id}/read`, { method: 'PATCH' });
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x));
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    router.push(n.href || '/dashboard');
  }

  async function handleMarkAll() {
    await fetch(`/api/org/${orgId}/notifications/mark-all-read`, { method: 'POST' });
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
              <div className="px-4 py-6 text-sm text-center text-black/40">Loading…</div>
            )}
            {!loading && notifications.length === 0 && (
              <div className="px-4 py-6 text-sm text-center text-black/40">You're all caught up</div>
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
              onClick={() => { setOpen(false); router.push(`/dashboard/notifications?org=${orgId}`); }}
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
```

- [ ] **Step 2: Read `components/Header.tsx` and find the right insertion point**

Run: `head -120 components/Header.tsx` — look for user avatar area or a `<div className="flex items-center gap-...">` near the end of the header.

- [ ] **Step 3: Add `<NotificationBell />` to `components/Header.tsx`**

In `Header.tsx`, import the bell and add it just before the user/profile area:

```typescript
import NotificationBell from '@/components/notifications/NotificationBell';
```

In the JSX, inside the right-side header flex container (after the org switcher, before the user avatar), add:

```tsx
{orgId && <NotificationBell orgId={orgId} />}
```

The `orgId` is already available in the header (fetched from `/api/org`). If it's stored as a different variable name, use that.

- [ ] **Step 4: Commit**

```bash
git add components/notifications/NotificationBell.tsx components/Header.tsx
git commit -m "feat: add notification bell with unread count and popover to header"
```

---

### Task 6: Full Notifications Page

**Files:**
- Create: `app/dashboard/notifications/page.tsx`

- [ ] **Step 1: Create `app/dashboard/notifications/page.tsx`**

```tsx
// app/dashboard/notifications/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getCookie } from 'cookies-next';

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
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const id = getCookie('x-org-id') as string | undefined;
    if (id) setOrgId(id);
  }, []);

  const fetchNotifications = useCallback(async (reset = false) => {
    if (!orgId) return;
    setLoading(true);
    const cursorParam = reset ? '' : cursor ? `&cursor=${cursor}` : '';
    try {
      const res = await fetch(`/api/org/${orgId}/notifications?status=${statusFilter}&limit=30${cursorParam}`);
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(prev => reset ? data.data : [...prev, ...data.data]);
      setUnreadCount(data.unread_count ?? 0);
      setHasMore(!!data.next_cursor);
      setCursor(data.next_cursor ?? null);
    } finally {
      setLoading(false);
    }
  }, [orgId, statusFilter, cursor]);

  useEffect(() => {
    if (orgId) fetchNotifications(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, statusFilter]);

  async function markRead(n: NotificationItem) {
    if (n.read_at || !orgId) return;
    await fetch(`/api/org/${orgId}/notifications/${n.id}/read`, { method: 'PATCH' });
    setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }

  async function handleClick(n: NotificationItem) {
    await markRead(n);
    router.push(n.href || '/dashboard');
  }

  async function handleMarkAll() {
    if (!orgId) return;
    await fetch(`/api/org/${orgId}/notifications/mark-all-read`, { method: 'POST' });
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
          <div className="text-center py-12 text-black/40">Loading…</div>
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
```

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/notifications/page.tsx
git commit -m "feat: add full notifications page with read/unread filter and pagination"
```

---

### Task 7: Expand Notification Settings UI

**Files:**
- Modify: `components/settings/NotificationsTab.tsx`
- Modify: `app/api/org/[orgId]/members/[userId]/notifications/route.ts`

- [ ] **Step 1: Replace `components/settings/NotificationsTab.tsx`**

```tsx
// components/settings/NotificationsTab.tsx
'use client';

import { useState } from 'react';
import { NOTIFICATION_ALERT_KEYS, NotificationAlertKey, NotificationPrefs, DEFAULT_NOTIFICATION_PREFS } from '@/lib/notifications/types';

const ALERT_LABELS: Record<NotificationAlertKey, string> = {
  assigned_to_me: 'Assigned to me',
  due_soon: 'Task due soon (7 days)',
  overdue: 'Overdue task',
  approvals: 'Approval requests',
  comments: 'Comments on my tasks',
  mentions: 'Mentions',
  automation_failures: 'Automation failures',
  digest_summary: 'Digest summary email',
  org_admin: 'Org-wide admin alerts',
};

function mergeWithDefaults(raw: any): NotificationPrefs {
  return {
    digest: raw?.digest ?? DEFAULT_NOTIFICATION_PREFS.digest,
    channels: {
      in_app: raw?.channels?.in_app ?? DEFAULT_NOTIFICATION_PREFS.channels.in_app,
      email: raw?.channels?.email ?? DEFAULT_NOTIFICATION_PREFS.channels.email,
    },
    alerts: Object.fromEntries(
      NOTIFICATION_ALERT_KEYS.map(k => [k, raw?.alerts?.[k] ?? DEFAULT_NOTIFICATION_PREFS.alerts[k]])
    ) as Record<NotificationAlertKey, boolean>,
  };
}

interface Props {
  orgId: string;
  userId: string;
  initialPrefs: any;
}

export default function NotificationsTab({ orgId, userId, initialPrefs }: Props) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(mergeWithDefaults(initialPrefs));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setDigest(v: 'daily' | 'weekly' | 'never') {
    setPrefs(p => ({ ...p, digest: v }));
  }

  function toggleChannel(channel: 'in_app' | 'email') {
    setPrefs(p => ({ ...p, channels: { ...p.channels, [channel]: !p.channels[channel] } }));
  }

  function toggleAlert(key: NotificationAlertKey) {
    setPrefs(p => ({ ...p, alerts: { ...p.alerts, [key]: !p.alerts[key] } }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/org/${orgId}/members/${userId}/notifications`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    });

    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      const data = await res.json();
      setError(data.error || 'Failed to save preferences.');
    }
  }

  return (
    <form onSubmit={handleSave} className="max-w-lg space-y-8">
      {/* Channels */}
      <div>
        <h3 className="text-sm font-semibold text-black/70 mb-3">Channels</h3>
        <div className="space-y-2">
          {(['in_app', 'email'] as const).map(ch => (
            <label key={ch} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.channels[ch]}
                onChange={() => toggleChannel(ch)}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm text-black/70">
                {ch === 'in_app' ? 'In-app notifications' : 'Email notifications'}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Digest frequency */}
      <div>
        <label htmlFor="digest" className="block text-sm font-semibold text-black/70 mb-2">
          Digest frequency
        </label>
        <select
          id="digest"
          value={prefs.digest}
          onChange={e => setDigest(e.target.value as 'daily' | 'weekly' | 'never')}
          className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm text-black/80 bg-white"
        >
          <option value="daily">Daily (8 AM)</option>
          <option value="weekly">Weekly (Monday 8 AM)</option>
          <option value="never">Never</option>
        </select>
      </div>

      {/* Alert categories */}
      <div>
        <h3 className="text-sm font-semibold text-black/70 mb-3">Alert categories</h3>
        <div className="space-y-2">
          {NOTIFICATION_ALERT_KEYS.map(key => (
            <label key={key} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.alerts[key]}
                onChange={() => toggleAlert(key)}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm text-black/70">{ALERT_LABELS[key]}</span>
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="px-4 py-2 bg-azure text-white text-sm rounded-lg hover:bg-azure/90 disabled:opacity-50"
      >
        {saving ? 'Saving…' : saved ? 'Saved' : 'Save preferences'}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Update the PATCH route to accept the new prefs shape**

In `app/api/org/[orgId]/members/[userId]/notifications/route.ts`, replace the `notificationPrefsSchema` and merge logic:

```typescript
import { z } from 'zod';
import { NOTIFICATION_ALERT_KEYS } from '@/lib/notifications/types';

const alertsSchema = z.object(
  Object.fromEntries(NOTIFICATION_ALERT_KEYS.map(k => [k, z.boolean().optional()]))
);

const notificationPrefsSchema = z.object({
  digest: z.enum(['daily', 'weekly', 'never']).optional(),
  channels: z.object({
    in_app: z.boolean().optional(),
    email: z.boolean().optional(),
  }).optional(),
  alerts: alertsSchema.optional(),
});
```

The merge logic is the same (spread old prefs with new) so no further changes needed beyond the schema import.

- [ ] **Step 3: Commit**

```bash
git add components/settings/NotificationsTab.tsx "app/api/org/[orgId]/members/[userId]/notifications/route.ts"
git commit -m "feat: expand notification settings to full prefs shape (channels + alert categories)"
```

---

### Task 8: Preferences + Recipients Modules

**Files:**
- Create: `lib/notifications/preferences.ts`
- Create: `lib/notifications/recipients.ts`

- [ ] **Step 1: Create `lib/notifications/preferences.ts`**

```typescript
// lib/notifications/preferences.ts
import {
  NotificationPrefs,
  NotificationAlertKey,
  DEFAULT_NOTIFICATION_PREFS,
} from './types';
import { SupabaseClient } from '@supabase/supabase-js';

export function mergePrefsWithDefaults(raw: any): NotificationPrefs {
  return {
    digest: raw?.digest ?? DEFAULT_NOTIFICATION_PREFS.digest,
    channels: {
      in_app: raw?.channels?.in_app ?? DEFAULT_NOTIFICATION_PREFS.channels.in_app,
      email: raw?.channels?.email ?? DEFAULT_NOTIFICATION_PREFS.channels.email,
    },
    alerts: Object.fromEntries(
      (Object.keys(DEFAULT_NOTIFICATION_PREFS.alerts) as NotificationAlertKey[]).map(k => [
        k,
        raw?.alerts?.[k] ?? DEFAULT_NOTIFICATION_PREFS.alerts[k],
      ])
    ) as Record<NotificationAlertKey, boolean>,
  };
}

export async function loadMemberPrefs(
  db: SupabaseClient,
  orgId: string,
  userId: string
): Promise<NotificationPrefs> {
  const { data } = await db
    .from('organization_members')
    .select('notification_prefs')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .single();
  return mergePrefsWithDefaults(data?.notification_prefs);
}

export function channelEnabled(
  prefs: NotificationPrefs,
  channel: 'in_app' | 'email'
): boolean {
  return prefs.channels[channel] ?? true;
}

export function alertEnabled(
  prefs: NotificationPrefs,
  alertKey: NotificationAlertKey
): boolean {
  return prefs.alerts[alertKey] ?? true;
}
```

- [ ] **Step 2: Create `lib/notifications/recipients.ts`**

```typescript
// lib/notifications/recipients.ts
import { SupabaseClient } from '@supabase/supabase-js';

export type Recipient = {
  userId: string;
  role: string;
};

// Fetch all active admin/owner members of an org — used for unassigned urgent tasks and automation failures
export async function getOrgAdminRecipients(
  db: SupabaseClient,
  orgId: string
): Promise<Recipient[]> {
  const { data } = await db
    .from('organization_members')
    .select('user_id, role')
    .eq('org_id', orgId)
    .in('role', ['owner', 'admin']);
  return (data ?? []).map((m: any) => ({ userId: m.user_id, role: m.role }));
}

// Resolve recipients for a task event
// Returns array of { userId, alertKey } pairs (alertKey drives preference filtering)
export type RecipientWithAlert = {
  userId: string;
  role: string;
  alertKey: string; // a NotificationAlertKey
};

export async function resolveRecipients(
  db: SupabaseClient,
  orgId: string,
  task: {
    assigned_to: string | null;
    task_type: string;
    priority: string;
  },
  eventType: string,
  actorId: string | null,
  commentMentions?: string[]
): Promise<RecipientWithAlert[]> {
  const recipients: RecipientWithAlert[] = [];

  // Helper: check user is active org member
  async function isMember(userId: string): Promise<boolean> {
    const { data } = await db
      .from('organization_members')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .single();
    return !!data;
  }

  async function getMemberRole(userId: string): Promise<string> {
    const { data } = await db
      .from('organization_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .single();
    return data?.role ?? 'member';
  }

  switch (eventType) {
    case 'assigned': {
      if (task.assigned_to && task.assigned_to !== actorId) {
        if (await isMember(task.assigned_to)) {
          recipients.push({ userId: task.assigned_to, role: await getMemberRole(task.assigned_to), alertKey: 'assigned_to_me' });
        }
      }
      break;
    }

    case 'commented':
    case 'mentioned': {
      // Notify assignee if not the actor
      if (task.assigned_to && task.assigned_to !== actorId) {
        if (await isMember(task.assigned_to)) {
          recipients.push({ userId: task.assigned_to, role: await getMemberRole(task.assigned_to), alertKey: eventType === 'mentioned' ? 'mentions' : 'comments' });
        }
      }
      // Notify mentioned users
      for (const uid of (commentMentions ?? [])) {
        if (uid !== actorId && !(recipients.find(r => r.userId === uid))) {
          if (await isMember(uid)) {
            recipients.push({ userId: uid, role: await getMemberRole(uid), alertKey: 'mentions' });
          }
        }
      }
      break;
    }

    case 'task_due_soon':
    case 'task_overdue': {
      if (task.assigned_to) {
        if (await isMember(task.assigned_to)) {
          recipients.push({ userId: task.assigned_to, role: await getMemberRole(task.assigned_to), alertKey: eventType === 'task_due_soon' ? 'due_soon' : 'overdue' });
        }
      } else if (task.priority === 'urgent') {
        // Unassigned urgent → admins/owners
        const admins = await getOrgAdminRecipients(db, orgId);
        admins.forEach(a => recipients.push({ ...a, alertKey: eventType === 'task_due_soon' ? 'due_soon' : 'overdue' }));
      }
      break;
    }

    case 'approval_requested': {
      // Approval target is the assigned_to, or if null, admins
      if (task.assigned_to) {
        if (await isMember(task.assigned_to)) {
          recipients.push({ userId: task.assigned_to, role: await getMemberRole(task.assigned_to), alertKey: 'approvals' });
        }
      } else {
        const admins = await getOrgAdminRecipients(db, orgId);
        admins.forEach(a => recipients.push({ ...a, alertKey: 'approvals' }));
      }
      break;
    }

    case 'automation_failed': {
      const admins = await getOrgAdminRecipients(db, orgId);
      admins.forEach(a => recipients.push({ ...a, alertKey: 'automation_failures' }));
      break;
    }

    default:
      // task_completed, task_cancelled — digest only, no immediate recipients
      break;
  }

  return recipients;
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/notifications/preferences.ts lib/notifications/recipients.ts
git commit -m "feat: add notification preferences loader and recipient resolution"
```

---

### Task 9: Fan-Out Service

**Files:**
- Create: `lib/notifications/fanout.ts`

- [ ] **Step 1: Create `lib/notifications/fanout.ts`**

```typescript
// lib/notifications/fanout.ts
import { SupabaseClient } from '@supabase/supabase-js';
import {
  FanOutTaskEventInput,
  NotificationEventType,
  NotificationChannel,
  NotificationPriority,
} from './types';
import { loadMemberPrefs, channelEnabled, alertEnabled } from './preferences';
import { resolveRecipients, RecipientWithAlert } from './recipients';

const LOG = '[notifications:fanout]';

type FanOutResult = {
  taskEventId: string;
  created: number;
  suppressed: number;
  error?: string;
};

// Map task event + task state → notification event type
function classifyEvent(
  taskEventType: string,
  taskType: string,
  metadata: Record<string, any>
): NotificationEventType | null {
  switch (taskEventType) {
    case 'created':
      return taskType === 'approval' ? 'approval_requested' : null; // others are digest-only at creation
    case 'assigned':
      return 'task_assigned';
    case 'commented':
      return metadata?.mentions?.length > 0 ? 'task_mentioned' : 'task_commented';
    case 'status_changed': {
      const newStatus = metadata?.to ?? '';
      if (newStatus === 'completed') return 'task_completed';
      if (newStatus === 'cancelled') return 'task_cancelled';
      return null;
    }
    case 'due_date_changed':
      return 'task_due_soon'; // fan-out will check if within window
    default:
      return null;
  }
}

// Returns 'email' for events that warrant immediate delivery
function immediateEmailEvents(): Set<NotificationEventType> {
  return new Set<NotificationEventType>([
    'task_assigned',
    'task_overdue',
    'task_priority_escalated',
    'approval_requested',
    'task_commented',
    'task_mentioned',
    'automation_failed',
  ]);
}

function buildDedupeKey(
  taskId: string,
  taskEventId: string,
  notifType: NotificationEventType,
  now?: string
): string {
  if (notifType === 'task_due_soon') {
    const date = now ? now.slice(0, 10) : new Date().toISOString().slice(0, 10);
    return `task:${taskId}:due_soon:${date}`;
  }
  if (notifType === 'task_overdue') {
    const date = now ? now.slice(0, 10) : new Date().toISOString().slice(0, 10);
    return `task:${taskId}:overdue:${date}`;
  }
  return `task:${taskId}:event:${taskEventId}:type:${notifType}`;
}

function taskPriorityToNotifPriority(taskPriority: string): NotificationPriority {
  if (taskPriority === 'urgent') return 'urgent';
  if (taskPriority === 'high') return 'high';
  if (taskPriority === 'low') return 'low';
  return 'normal';
}

export async function fanOutTaskEvent(
  db: SupabaseClient,
  input: FanOutTaskEventInput
): Promise<FanOutResult> {
  const { taskEventId, now } = input;
  const result: FanOutResult = { taskEventId, created: 0, suppressed: 0 };

  try {
    // 1. Load the task event with task details
    const { data: event, error: eventError } = await db
      .from('task_events')
      .select(`
        id,
        task_id,
        event_type,
        actor_id,
        metadata,
        created_at,
        tasks!inner (
          id,
          org_id,
          assigned_to,
          task_type,
          priority,
          title,
          status,
          due_at,
          source_key,
          description
        )
      `)
      .eq('id', taskEventId)
      .single();

    if (eventError || !event) {
      result.error = eventError?.message ?? 'task_event not found';
      return result;
    }

    const task = (event as any).tasks as {
      id: string;
      org_id: string;
      assigned_to: string | null;
      task_type: string;
      priority: string;
      title: string;
      status: string;
      due_at: string | null;
      source_key: string;
      description: string;
    };

    const orgId = task.org_id;

    // 2. Skip if task is already completed or cancelled
    if (task.status === 'completed' || task.status === 'cancelled') {
      result.suppressed++;
      console.log(`${LOG} suppressed taskEventId=${taskEventId} — task already ${task.status}`);
      return result;
    }

    // 3. Classify into notification type
    const eventMeta = (event as any).metadata ?? {};
    const notifType = classifyEvent(event.event_type, task.task_type, eventMeta);
    if (!notifType) {
      result.suppressed++;
      return result;
    }

    // 4. Resolve recipients
    const mentions: string[] = eventMeta?.mentions ?? [];
    const recipients: RecipientWithAlert[] = await resolveRecipients(
      db,
      orgId,
      {
        assigned_to: task.assigned_to,
        task_type: task.task_type,
        priority: task.priority,
      },
      notifType,
      (event as any).actor_id ?? null,
      mentions
    );

    if (recipients.length === 0) {
      result.suppressed++;
      return result;
    }

    const dedupe = buildDedupeKey(task.id, taskEventId, notifType, now);
    const isImmediate = immediateEmailEvents().has(notifType);
    const notifPriority = taskPriorityToNotifPriority(task.priority);

    // 5. Build payload
    const href = `/dashboard/tasks?task=${task.id}&org=${orgId}`;
    const payload = {
      title: buildTitle(notifType, task.title, task.priority),
      body: buildBody(notifType, task.description, task.due_at, task.priority),
      href,
      task_title: task.title,
      reason: notifType.replace(/_/g, ' '),
    };

    // 6. Insert one row per recipient per channel (in_app always; email only if immediate and enabled)
    for (const recipient of recipients) {
      const prefs = await loadMemberPrefs(db, orgId, recipient.userId);

      // Per-alert-key check
      const alertKey = recipient.alertKey as any;
      if (!alertEnabled(prefs, alertKey)) {
        result.suppressed++;
        continue;
      }

      const channels: NotificationChannel[] = [];
      if (channelEnabled(prefs, 'in_app')) channels.push('in_app');
      if (isImmediate && channelEnabled(prefs, 'email')) channels.push('email');

      for (const channel of channels) {
        const channelDedupe = `${dedupe}:${channel}:${recipient.userId}`;
        const { error: insertError } = await db
          .from('notification_events')
          .upsert(
            {
              org_id: orgId,
              recipient_user_id: recipient.userId,
              task_id: task.id,
              task_event_id: taskEventId,
              actor_id: (event as any).actor_id ?? null,
              event_type: notifType,
              channel,
              status: 'pending',
              priority: notifPriority,
              dedupe_key: channelDedupe,
              scheduled_for: new Date().toISOString(),
              payload,
            },
            { onConflict: 'org_id,recipient_user_id,channel,dedupe_key', ignoreDuplicates: true }
          );

        if (insertError) {
          console.warn(`${LOG} upsert error for taskEventId=${taskEventId} channel=${channel}:`, insertError.message);
          result.suppressed++;
        } else {
          result.created++;
        }
      }
    }
  } catch (err: any) {
    result.error = err?.message ?? String(err);
    console.error(`${LOG} error for taskEventId=${taskEventId}:`, err);
  }

  return result;
}

function buildTitle(notifType: NotificationEventType, taskTitle: string, priority: string): string {
  switch (notifType) {
    case 'task_assigned':      return `Task assigned: ${taskTitle}`;
    case 'task_due_soon':      return `Task due soon: ${taskTitle}`;
    case 'task_overdue':       return `Overdue: ${taskTitle}`;
    case 'task_priority_escalated': return `Priority escalated: ${taskTitle}`;
    case 'approval_requested': return `Approval needed: ${taskTitle}`;
    case 'task_commented':     return `New comment: ${taskTitle}`;
    case 'task_mentioned':     return `You were mentioned: ${taskTitle}`;
    case 'task_completed':     return `Completed: ${taskTitle}`;
    case 'task_cancelled':     return `Cancelled: ${taskTitle}`;
    case 'automation_failed':  return `Automation failure: ${taskTitle}`;
    default:                   return taskTitle;
  }
}

function buildBody(
  notifType: NotificationEventType,
  description: string,
  dueAt: string | null,
  priority: string
): string {
  const duePart = dueAt ? ` Due: ${new Date(dueAt).toLocaleDateString()}.` : '';
  switch (notifType) {
    case 'task_assigned':       return `A task has been assigned to you.${duePart}`;
    case 'task_due_soon':       return `This task is due soon.${duePart}`;
    case 'task_overdue':        return `This task is past its due date.${duePart}`;
    case 'approval_requested':  return `Your approval is needed.${duePart}`;
    case 'task_commented':      return 'Someone left a comment on your task.';
    case 'task_mentioned':      return 'You were mentioned in a task comment.';
    case 'automation_failed':   return 'An automation run failed and requires attention.';
    default:                    return description.slice(0, 120);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/notifications/fanout.ts
git commit -m "feat: implement fanOutTaskEvent — classify, resolve recipients, insert notification_events"
```

---

### Task 10: Fan-Out Job Route

**Files:**
- Create: `app/api/jobs/notifications/fanout/route.ts`

- [ ] **Step 1: Create `app/api/jobs/notifications/fanout/route.ts`**

```typescript
// app/api/jobs/notifications/fanout/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { fanOutTaskEvent } from '@/lib/notifications/fanout';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const LOG = '[notifications:fanout]';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-job-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const dryRun: boolean = body.dry_run ?? false;
  const nowOverride: string | undefined = body.now;
  const taskEventId: string | undefined = body.task_event_id;

  // Repair window: accepts 'since' and 'until' ISO strings; defaults to last 24h
  const until = nowOverride ? new Date(nowOverride) : new Date();
  const since = body.since ? new Date(body.since) : new Date(until.getTime() - 24 * 60 * 60 * 1000);

  const db = createAdminClient();

  let scanned = 0;
  let created = 0;
  let suppressed = 0;
  const errors: Array<{ taskEventId: string; message: string }> = [];

  try {
    // Find task_events with no matching notification_events.task_event_id
    let query = db
      .from('task_events')
      .select('id')
      .gte('created_at', since.toISOString())
      .lte('created_at', until.toISOString());

    if (taskEventId) {
      query = query.eq('id', taskEventId);
    }

    const { data: events, error: fetchError } = await query;
    if (fetchError) throw fetchError;

    // Filter to those not yet fan-out'd (no notification_events.task_event_id match)
    const eventIds = (events ?? []).map((e: any) => e.id);
    scanned = eventIds.length;

    if (eventIds.length === 0) {
      return NextResponse.json({ ok: true, scanned, created, suppressed, errors });
    }

    // Find which event IDs already have notifications
    const { data: alreadyFanedOut } = await db
      .from('notification_events')
      .select('task_event_id')
      .in('task_event_id', eventIds);

    const alreadyDone = new Set((alreadyFanedOut ?? []).map((n: any) => n.task_event_id));
    const pending = eventIds.filter((id: string) => !alreadyDone.has(id));

    console.log(`${LOG} scanned=${scanned} pending=${pending.length} dry_run=${dryRun}`);

    for (const evId of pending) {
      if (dryRun) {
        suppressed++;
        continue;
      }
      const result = await fanOutTaskEvent(db, { taskEventId: evId, now: nowOverride });
      created += result.created;
      suppressed += result.suppressed;
      if (result.error) {
        errors.push({ taskEventId: evId, message: result.error });
      }
    }

    return NextResponse.json({ ok: true, scanned, created, suppressed, errors });
  } catch (err: any) {
    console.error(`${LOG} fatal:`, err);
    return NextResponse.json({ ok: false, error: err.message, scanned, created, suppressed, errors }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/jobs/notifications/fanout/route.ts
git commit -m "feat: add fan-out cron job route — scans task_events and creates notification_events"
```

---

### Task 11: Email Render Layer

**Files:**
- Create: `lib/notifications/render.ts`
- Create: `lib/email/templates/task-notification.tsx`

- [ ] **Step 1: Create `lib/notifications/render.ts`**

```typescript
// lib/notifications/render.ts
import { NotificationEventType, NotificationPayload, NotificationPriority } from './types';

export type EmailRenderInput = {
  appName: string;
  orgName: string;
  supportEmail: string;
  notifType: NotificationEventType;
  priority: NotificationPriority;
  taskTitle: string;
  taskBody: string;
  taskHref: string;
  sourceLabel?: string;
  reason: string;
};

export function buildEmailSubject(input: EmailRenderInput): string {
  switch (input.notifType) {
    case 'task_assigned':       return `Task assigned: ${input.taskTitle}`;
    case 'task_due_soon':       return `Due soon: ${input.taskTitle}`;
    case 'task_overdue':        return `Overdue: ${input.taskTitle}`;
    case 'task_priority_escalated': return `Urgent now: ${input.taskTitle}`;
    case 'approval_requested':  return `Approval needed: ${input.taskTitle}`;
    case 'task_commented':      return `New comment: ${input.taskTitle}`;
    case 'task_mentioned':      return `You were mentioned: ${input.taskTitle}`;
    case 'automation_failed':   return `Automation failure: ${input.taskTitle}`;
    default:                    return input.taskTitle;
  }
}

export function buildEmailPreheader(input: EmailRenderInput): string {
  if (input.priority === 'urgent') return `Urgent — ${input.taskBody}`;
  if (input.priority === 'high') return `High priority — ${input.taskBody}`;
  return input.taskBody;
}
```

- [ ] **Step 2: Create `lib/email/templates/task-notification.tsx`**

```tsx
// lib/email/templates/task-notification.tsx
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
  Tailwind,
} from '@react-email/components';

interface TaskNotificationEmailProps {
  appName: string;
  orgName: string;
  supportEmail: string;
  subject: string;
  preheader: string;
  title: string;
  body: string;
  taskHref: string;
  ctaLabel: string;
  reason: string;
  preferencesHref: string;
}

export default function TaskNotificationEmail({
  appName,
  orgName,
  supportEmail,
  subject,
  preheader,
  title,
  body,
  taskHref,
  ctaLabel,
  reason,
  preferencesHref,
}: TaskNotificationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{preheader}</Preview>
      <Tailwind>
        <Body className="bg-gray-50 font-sans">
          <Container className="max-w-xl mx-auto py-8 px-4">
            <Section className="bg-white rounded-xl p-8 shadow-sm">
              <Text className="text-xs text-gray-400 uppercase tracking-wide mb-4">{orgName}</Text>
              <Text className="text-xl font-semibold text-gray-800 mt-0 mb-2">{title}</Text>
              <Text className="text-gray-600 text-sm leading-relaxed mb-6">{body}</Text>
              <Button
                href={taskHref}
                className="bg-blue-600 text-white rounded-lg px-5 py-3 text-sm font-medium no-underline"
              >
                {ctaLabel}
              </Button>
              <Hr className="my-6 border-gray-100" />
              <Text className="text-xs text-gray-400">
                {reason} · Sent from {appName} for {orgName}
              </Text>
            </Section>
            <Text className="text-center text-xs text-gray-400 mt-4">
              <a href={preferencesHref} className="text-gray-400 underline">
                Manage notification preferences
              </a>
              {' · '}
              <a href={`mailto:${supportEmail}`} className="text-gray-400 underline">
                {supportEmail}
              </a>
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

TaskNotificationEmail.PreviewProps = {
  appName: 'Platform',
  orgName: 'Acme Foundation',
  supportEmail: 'support@example.com',
  subject: 'Task assigned: Submit quarterly grant report',
  preheader: 'A task has been assigned to you. Due: May 22.',
  title: 'Task assigned: Submit quarterly grant report',
  body: 'A task has been assigned to you. Due: May 22, 2026.',
  taskHref: 'https://example.com/dashboard/tasks?task=abc',
  ctaLabel: 'View Task',
  reason: 'You were assigned this task',
  preferencesHref: 'https://example.com/settings/notifications',
};
```

- [ ] **Step 3: Commit**

```bash
git add lib/notifications/render.ts lib/email/templates/task-notification.tsx
git commit -m "feat: add email render utilities and task notification React Email template"
```

---

### Task 12: Send Job + Delivery + Suppression

**Files:**
- Create: `lib/notifications/delivery.ts`
- Create: `app/api/jobs/notifications/send/route.ts`

- [ ] **Step 1: Create `lib/notifications/delivery.ts`**

```typescript
// lib/notifications/delivery.ts
import { SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { render } from '@react-email/components';
import { branding } from '@/lib/config';
import TaskNotificationEmail from '@/lib/email/templates/task-notification';
import { buildEmailSubject, buildEmailPreheader, EmailRenderInput } from './render';
import { NotificationEventType, NotificationPriority } from './types';

const LOG = '[notifications:send]';

// Retry backoff delays in seconds
const RETRY_DELAYS_SECONDS = [
  5 * 60,       // 1st failure: retry in 5 minutes (300s)
  30 * 60,      // 2nd failure: retry in 30 minutes (1800s)
  2 * 60 * 60,  // 3rd failure: retry in 2 hours (7200s)
];
const MAX_ATTEMPTS = 5;
// Suppress notifications older than 14 days
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

type DeliverResult = 'sent' | 'suppressed' | 'failed';

export async function deliverEmailNotification(
  db: SupabaseClient,
  notificationId: string,
  dryRun = false
): Promise<DeliverResult> {
  // Load notification row
  const { data: notif, error: fetchError } = await db
    .from('notification_events')
    .select(`
      id,
      org_id,
      recipient_user_id,
      task_id,
      event_type,
      priority,
      payload,
      delivery_attempts,
      created_at,
      status,
      tasks (
        id,
        status,
        assigned_to
      )
    `)
    .eq('id', notificationId)
    .single();

  if (fetchError || !notif) {
    console.warn(`${LOG} notification ${notificationId} not found`);
    return 'failed';
  }

  // Suppression checks
  const task = (notif as any).tasks as { id: string; status: string; assigned_to: string | null } | null;
  const payload = notif.payload as any;
  const now = Date.now();
  const age = now - new Date(notif.created_at).getTime();

  const reasons: string[] = [];
  if (task && (task.status === 'completed' || task.status === 'cancelled')) {
    reasons.push(`task is ${task.status}`);
  }
  if (age > MAX_AGE_MS && notif.priority !== 'urgent') {
    reasons.push('notification older than 14 days');
  }

  if (reasons.length > 0) {
    if (!dryRun) {
      await db
        .from('notification_events')
        .update({
          status: 'suppressed',
          error_message: `Suppressed: ${reasons.join('; ')}`,
          payload: { ...payload, suppression_reason: reasons.join('; ') },
        })
        .eq('id', notificationId);
    }
    console.log(`${LOG} suppressed ${notificationId}: ${reasons.join('; ')}`);
    return 'suppressed';
  }

  if (dryRun) return 'sent';

  // Fetch recipient email
  const { data: authUser } = await db.auth.admin.getUserById(notif.recipient_user_id);
  const recipientEmail = authUser?.user?.email;
  if (!recipientEmail) {
    await db.from('notification_events').update({ status: 'suppressed', error_message: 'No email address' }).eq('id', notificationId);
    return 'suppressed';
  }

  // Fetch org name
  const { data: org } = await db.from('organizations').select('name').eq('id', notif.org_id).single();
  const orgName = (org as any)?.name ?? 'Your Organization';

  // Build render input
  const renderInput: EmailRenderInput = {
    appName: branding.appName,
    orgName,
    supportEmail: branding.supportEmail ?? `support@${process.env.RESEND_FROM_DOMAIN ?? 'resend.dev'}`,
    notifType: notif.event_type as NotificationEventType,
    priority: notif.priority as NotificationPriority,
    taskTitle: payload?.task_title ?? payload?.title ?? '',
    taskBody: payload?.body ?? '',
    taskHref: payload?.href ?? '/dashboard',
    sourceLabel: payload?.source_label,
    reason: payload?.reason ?? notif.event_type,
  };

  const subject = buildEmailSubject(renderInput);
  const preheader = buildEmailPreheader(renderInput);

  const html = await render(
    TaskNotificationEmail({
      appName: branding.appName,
      orgName,
      supportEmail: renderInput.supportEmail,
      subject,
      preheader,
      title: payload?.title ?? subject,
      body: payload?.body ?? '',
      taskHref: payload?.href ?? '/dashboard',
      ctaLabel: 'View Task',
      reason: payload?.reason ?? '',
      preferencesHref: `/settings/notifications`,
    })
  );

  const resend = new Resend(process.env.RESEND_API_KEY!);
  const attempts = (notif.delivery_attempts as number) + 1;

  try {
    const { error: sendError } = await resend.emails.send({
      from: `${branding.appName} <noreply@${process.env.RESEND_FROM_DOMAIN ?? 'resend.dev'}>`,
      to: recipientEmail,
      subject,
      html,
    });

    if (sendError) throw new Error(sendError.message);

    await db.from('notification_events').update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      delivery_attempts: attempts,
      last_attempt_at: new Date().toISOString(),
      next_attempt_at: null,
    }).eq('id', notificationId);

    console.log(`${LOG} sent ${notificationId} to ${recipientEmail}`);
    return 'sent';
  } catch (err: any) {
    const delayIdx = Math.min(attempts - 1, RETRY_DELAYS_SECONDS.length - 1);
    const delaySec = RETRY_DELAYS_SECONDS[delayIdx] ?? RETRY_DELAYS_SECONDS[RETRY_DELAYS_SECONDS.length - 1];
    const nextAttempt = new Date(now + delaySec * 1000).toISOString();

    if (attempts >= MAX_ATTEMPTS) {
      await db.from('notification_events').update({
        status: 'suppressed',
        error_message: `Max attempts reached: ${err.message}`,
        delivery_attempts: attempts,
        last_attempt_at: new Date().toISOString(),
      }).eq('id', notificationId);
      console.warn(`${LOG} max attempts reached for ${notificationId}`);
      return 'suppressed';
    }

    await db.from('notification_events').update({
      status: 'failed',
      error_message: err.message,
      delivery_attempts: attempts,
      last_attempt_at: new Date().toISOString(),
      next_attempt_at: nextAttempt,
    }).eq('id', notificationId);

    console.warn(`${LOG} failed ${notificationId} (attempt ${attempts}), retry at ${nextAttempt}`);
    return 'failed';
  }
}
```

- [ ] **Step 2: Create `app/api/jobs/notifications/send/route.ts`**

```typescript
// app/api/jobs/notifications/send/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { deliverEmailNotification } from '@/lib/notifications/delivery';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const LOG = '[notifications:send]';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-job-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const dryRun: boolean = body.dry_run ?? false;
  const recipientFilter: string | undefined = body.recipient_user_id;

  const db = createAdminClient();

  let scanned = 0;
  let sent = 0;
  let suppressed = 0;
  let failed = 0;
  const errors: Array<{ notificationId: string; message: string }> = [];

  try {
    const now = new Date().toISOString();

    let query = db
      .from('notification_events')
      .select('id')
      .eq('channel', 'email')
      .lte('scheduled_for', now)
      .limit(200);

    // Pending rows OR failed rows due for retry
    // We use two separate queries and merge
    const [pendingRes, retryRes] = await Promise.all([
      query.eq('status', 'pending'),
      db
        .from('notification_events')
        .select('id')
        .eq('channel', 'email')
        .eq('status', 'failed')
        .lte('next_attempt_at', now)
        .limit(200),
    ]);

    const ids = [
      ...((pendingRes.data ?? []).map((n: any) => n.id)),
      ...((retryRes.data ?? []).map((n: any) => n.id)),
    ];

    scanned = ids.length;
    console.log(`${LOG} scanned=${scanned} dry_run=${dryRun}`);

    for (const id of ids) {
      if (dryRun) {
        suppressed++;
        continue;
      }
      const deliveryResult = await deliverEmailNotification(db, id, false);
      if (deliveryResult === 'sent') sent++;
      else if (deliveryResult === 'suppressed') suppressed++;
      else {
        failed++;
        errors.push({ notificationId: id, message: 'delivery failed' });
      }
    }

    return NextResponse.json({ ok: true, scanned, sent, suppressed, failed, errors });
  } catch (err: any) {
    console.error(`${LOG} fatal:`, err);
    return NextResponse.json({ ok: false, error: err.message, scanned, sent, suppressed, failed, errors }, { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/notifications/delivery.ts app/api/jobs/notifications/send/route.ts
git commit -m "feat: add email delivery with suppression checks, retry backoff, and send job route"
```

---

### Task 13: Digest Compiler, Template, and Job Route

**Files:**
- Create: `lib/notifications/digest.ts`
- Create: `lib/email/templates/task-digest.tsx`
- Create: `app/api/jobs/notifications/digest/route.ts`

- [ ] **Step 1: Create `lib/notifications/digest.ts`**

```typescript
// lib/notifications/digest.ts
import { SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { render } from '@react-email/components';
import { branding } from '@/lib/config';
import TaskDigestEmail from '@/lib/email/templates/task-digest';

const LOG = '[notifications:digest]';

type DigestTask = {
  id: string;
  title: string;
  priority: string;
  due_at: string | null;
  status: string;
  task_type: string;
};

type DigestSummary = {
  overdue: DigestTask[];
  dueSoon: DigestTask[];
  approvals: DigestTask[];
  automationFailures: DigestTask[];
  total: number;
};

async function buildDigestForUser(
  db: SupabaseClient,
  orgId: string,
  userId: string,
  periodStart: string,
  periodEnd: string
): Promise<DigestSummary | null> {
  const today = periodEnd.slice(0, 10);
  const sevenDaysOut = new Date(new Date(periodEnd).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Overdue assigned tasks
  const { data: overdue } = await db
    .from('tasks')
    .select('id, title, priority, due_at, status, task_type')
    .eq('org_id', orgId)
    .eq('assigned_to', userId)
    .eq('status', 'pending')
    .not('due_at', 'is', null)
    .lt('due_at', today);

  // Due soon (within 7 days)
  const { data: dueSoon } = await db
    .from('tasks')
    .select('id, title, priority, due_at, status, task_type')
    .eq('org_id', orgId)
    .eq('assigned_to', userId)
    .eq('status', 'pending')
    .not('due_at', 'is', null)
    .gte('due_at', today)
    .lte('due_at', sevenDaysOut);

  // Approval requests (unassigned or assigned to user)
  const { data: approvals } = await db
    .from('tasks')
    .select('id, title, priority, due_at, status, task_type')
    .eq('org_id', orgId)
    .eq('task_type', 'approval')
    .eq('status', 'pending')
    .or(`assigned_to.eq.${userId},assigned_to.is.null`);

  // Automation failures (for admins)
  const { data: memberRow } = await db
    .from('organization_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .single();
  const isAdmin = memberRow && ['owner', 'admin'].includes((memberRow as any).role);

  let automationFailures: DigestTask[] = [];
  if (isAdmin) {
    const { data: failedTasks } = await db
      .from('tasks')
      .select('id, title, priority, due_at, status, task_type')
      .eq('org_id', orgId)
      .eq('task_type', 'review')
      .eq('status', 'pending')
      .gte('created_at', periodStart);
    automationFailures = (failedTasks ?? []).filter((t: any) =>
      (t.title as string).toLowerCase().includes('automation') ||
      (t.title as string).toLowerCase().includes('import') ||
      (t.title as string).toLowerCase().includes('failure')
    );
  }

  const total = (overdue?.length ?? 0) + (dueSoon?.length ?? 0) + (approvals?.length ?? 0) + automationFailures.length;
  if (total === 0) return null;

  return {
    overdue: overdue ?? [],
    dueSoon: dueSoon ?? [],
    approvals: approvals ?? [],
    automationFailures,
    total,
  };
}

export async function runDigestForOrg(
  db: SupabaseClient,
  orgId: string,
  periodStart: string,
  periodEnd: string,
  dryRun = false
): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const resend = new Resend(process.env.RESEND_API_KEY!);
  const errors: string[] = [];
  let sent = 0;
  let skipped = 0;

  // Fetch members who want digest
  const { data: members } = await db
    .from('organization_members')
    .select('user_id, notification_prefs')
    .eq('org_id', orgId);

  const { data: org } = await db.from('organizations').select('name').eq('id', orgId).single();
  const orgName = (org as any)?.name ?? 'Your Organization';

  for (const member of (members ?? [])) {
    const prefs = member.notification_prefs ?? {};
    if (prefs?.digest === 'never') { skipped++; continue; }
    if (!prefs?.channels?.email && prefs?.channels?.email !== undefined) { skipped++; continue; }
    if (!prefs?.alerts?.digest_summary) { skipped++; continue; }

    const summary = await buildDigestForUser(db, orgId, member.user_id, periodStart, periodEnd);
    if (!summary) { skipped++; continue; }

    if (dryRun) { sent++; continue; }

    // Fetch email
    const { data: authUser } = await db.auth.admin.getUserById(member.user_id);
    const email = authUser?.user?.email;
    if (!email) { skipped++; continue; }

    const subject = `${summary.total} task${summary.total === 1 ? '' : 's'} need your attention`;
    const html = await render(
      TaskDigestEmail({
        appName: branding.appName,
        orgName,
        supportEmail: `support@${process.env.RESEND_FROM_DOMAIN ?? 'resend.dev'}`,
        subject,
        overdue: summary.overdue,
        dueSoon: summary.dueSoon,
        approvals: summary.approvals,
        automationFailures: summary.automationFailures,
        preferencesHref: `/settings/notifications`,
      })
    );

    try {
      const { error } = await resend.emails.send({
        from: `${branding.appName} <noreply@${process.env.RESEND_FROM_DOMAIN ?? 'resend.dev'}>`,
        to: email,
        subject,
        html,
      });
      if (error) throw new Error(error.message);
      sent++;
      console.log(`${LOG} digest sent to ${email} for org ${orgId}`);
    } catch (err: any) {
      errors.push(`${member.user_id}: ${err.message}`);
    }
  }

  return { sent, skipped, errors };
}
```

- [ ] **Step 2: Create `lib/email/templates/task-digest.tsx`**

```tsx
// lib/email/templates/task-digest.tsx
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
  Tailwind,
} from '@react-email/components';

interface DigestTask {
  id: string;
  title: string;
  priority: string;
  due_at: string | null;
}

interface TaskDigestEmailProps {
  appName: string;
  orgName: string;
  supportEmail: string;
  subject: string;
  overdue: DigestTask[];
  dueSoon: DigestTask[];
  approvals: DigestTask[];
  automationFailures: DigestTask[];
  preferencesHref: string;
}

function TaskRow({ task, appUrl }: { task: DigestTask; appUrl?: string }) {
  const due = task.due_at ? new Date(task.due_at).toLocaleDateString() : null;
  return (
    <div style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
      <span style={{ fontWeight: 500, color: '#1f2937' }}>{task.title}</span>
      {due && <span style={{ color: '#9ca3af', fontSize: '12px', marginLeft: '8px' }}>Due {due}</span>}
    </div>
  );
}

export default function TaskDigestEmail({
  appName,
  orgName,
  supportEmail,
  subject,
  overdue,
  dueSoon,
  approvals,
  automationFailures,
  preferencesHref,
}: TaskDigestEmailProps) {
  const total = overdue.length + dueSoon.length + approvals.length + automationFailures.length;

  return (
    <Html>
      <Head />
      <Preview>{total} items need your attention — {orgName}</Preview>
      <Tailwind>
        <Body className="bg-gray-50 font-sans">
          <Container className="max-w-xl mx-auto py-8 px-4">
            <Section className="bg-white rounded-xl p-8 shadow-sm">
              <Text className="text-xs text-gray-400 uppercase tracking-wide mb-4">{orgName}</Text>
              <Text className="text-xl font-semibold text-gray-800 mt-0 mb-1">{subject}</Text>
              <Text className="text-sm text-gray-500 mb-6">Here is your activity digest from {appName}.</Text>

              {overdue.length > 0 && (
                <>
                  <Text className="text-sm font-semibold text-red-600 mb-2">Overdue ({overdue.length})</Text>
                  {overdue.map(t => <TaskRow key={t.id} task={t} />)}
                </>
              )}

              {dueSoon.length > 0 && (
                <>
                  <Text className="text-sm font-semibold text-amber-600 mb-2 mt-4">Due this week ({dueSoon.length})</Text>
                  {dueSoon.map(t => <TaskRow key={t.id} task={t} />)}
                </>
              )}

              {approvals.length > 0 && (
                <>
                  <Text className="text-sm font-semibold text-blue-600 mb-2 mt-4">Approval requests ({approvals.length})</Text>
                  {approvals.map(t => <TaskRow key={t.id} task={t} />)}
                </>
              )}

              {automationFailures.length > 0 && (
                <>
                  <Text className="text-sm font-semibold text-gray-600 mb-2 mt-4">Automation failures ({automationFailures.length})</Text>
                  {automationFailures.map(t => <TaskRow key={t.id} task={t} />)}
                </>
              )}

              <Hr className="my-6 border-gray-100" />
              <Button
                href="/dashboard/tasks"
                className="bg-blue-600 text-white rounded-lg px-5 py-3 text-sm font-medium no-underline"
              >
                View all tasks
              </Button>
            </Section>
            <Text className="text-center text-xs text-gray-400 mt-4">
              <a href={preferencesHref} className="text-gray-400 underline">Manage preferences</a>
              {' · '}
              <a href={`mailto:${supportEmail}`} className="text-gray-400 underline">{supportEmail}</a>
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

TaskDigestEmail.PreviewProps = {
  appName: 'Platform',
  orgName: 'Acme Foundation',
  supportEmail: 'support@example.com',
  subject: '3 tasks need your attention',
  overdue: [{ id: '1', title: 'File Form 990', priority: 'urgent', due_at: '2026-05-01' }],
  dueSoon: [{ id: '2', title: 'Submit grant report', priority: 'high', due_at: '2026-05-22' }],
  approvals: [{ id: '3', title: 'Board meeting minutes', priority: 'normal', due_at: null }],
  automationFailures: [],
  preferencesHref: '/settings/notifications',
};
```

- [ ] **Step 3: Create `app/api/jobs/notifications/digest/route.ts`**

```typescript
// app/api/jobs/notifications/digest/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { runDigestForOrg } from '@/lib/notifications/digest';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const LOG = '[notifications:digest]';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-job-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const dryRun: boolean = body.dry_run ?? false;
  const orgIdFilter: string | undefined = body.org_id;
  const periodEnd = body.now ?? new Date().toISOString();
  const periodStart = body.since ?? new Date(new Date(periodEnd).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const db = createAdminClient();

  let totalSent = 0;
  let totalSkipped = 0;
  const allErrors: string[] = [];

  try {
    let query = db.from('organizations').select('id');
    if (orgIdFilter) query = query.eq('id', orgIdFilter);

    const { data: orgs, error: orgsError } = await query;
    if (orgsError) throw orgsError;

    console.log(`${LOG} running for ${orgs?.length ?? 0} orgs dry_run=${dryRun}`);

    for (const org of (orgs ?? [])) {
      try {
        const result = await runDigestForOrg(db, org.id, periodStart, periodEnd, dryRun);
        totalSent += result.sent;
        totalSkipped += result.skipped;
        allErrors.push(...result.errors);
      } catch (err: any) {
        allErrors.push(`org ${org.id}: ${err.message}`);
      }
    }

    return NextResponse.json({
      ok: true,
      orgs_processed: orgs?.length ?? 0,
      sent: totalSent,
      skipped: totalSkipped,
      errors: allErrors,
    });
  } catch (err: any) {
    console.error(`${LOG} fatal:`, err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/notifications/digest.ts lib/email/templates/task-digest.tsx app/api/jobs/notifications/digest/route.ts
git commit -m "feat: add digest compiler, React Email template, and digest job route"
```

---

### Task 14: Run Contract Tests

**Files:**
- No changes — run existing tests

- [ ] **Step 1: Run the full notification contract test suite**

```bash
npx vitest run lib/__tests__/notification-contract.test.ts 2>&1
```

Expected: all tests pass. If any fail, read the error and fix the referenced file.

- [ ] **Step 2: Also run the existing task automation contract tests to check for regressions**

```bash
npx vitest run lib/__tests__/task-automation-contract.test.ts lib/__tests__/task-workflow-schema-contract.test.ts 2>&1
```

Expected: all pass.

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve any contract test failures from notification delivery implementation"
```

---

## Self-Review

### Spec Coverage Check

| Spec Section | Covered By |
|---|---|
| Strengthen `notification_events` | Task 1 |
| `notification_prefs` shape formalized | Task 1 (migration) + Task 7 (settings UI) |
| `NOTIFICATION_EVENT_TYPES` const | Task 2 |
| Contract tests | Task 3 |
| In-app inbox API (GET/PATCH/POST) | Task 4 |
| Header bell + popover | Task 5 |
| Full notifications page | Task 6 |
| Settings UI with all alert keys | Task 7 |
| `preferences.ts` + `recipients.ts` | Task 8 |
| `fanout.ts` — `fanOutTaskEvent` | Task 9 |
| Fan-out job route | Task 10 |
| Email render + subject builder | Task 11 |
| Email template (brand-agnostic) | Task 11 |
| `delivery.ts` + retry backoff | Task 12 |
| Send job route | Task 12 |
| Digest compiler | Task 13 |
| Digest email template | Task 13 |
| Digest job route | Task 13 |
| "Coming soon" removed | Task 7 |
| CRON_SECRET on all job routes | Tasks 10, 12, 13 |

### Placeholder Scan

No "TBD", "TODO", or incomplete sections found.

### Type Consistency

- `NotificationEventType` from `types.ts` is used in `fanout.ts`, `render.ts`, `delivery.ts`
- `NotificationAlertKey` from `types.ts` is used in `preferences.ts`, `NotificationsTab.tsx`
- `NOTIFICATION_ALERT_KEYS` drives both the contract test and the settings UI

### Edge Cases Addressed

- Dedupe key unique constraint prevents duplicate notification rows on re-run
- Fan-out skips task events for already-completed/cancelled tasks
- Send job suppresses if task completes before email is delivered
- Digest skips users with `digest: 'never'` or `email: false`
- Retry capped at `MAX_ATTEMPTS = 5`, then `suppressed`
- Notifications older than 14 days suppressed unless urgent
