# Settings & Ops Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/settings` ops hub with six tabs (Team, Modules, Organization, Integrations, Audit Log, Notifications) including a full email invitation flow via Resend.

**Architecture:** New `/settings/*` pages guarded by owner/admin role check in the layout. Resend handles transactional invite emails. `org_invitations` and `org_audit_log` tables track invitation state and activity history. The `/join?token=xxx` public page accepts invitations for both existing and new users.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (PostgreSQL + RLS), Resend, @react-email/components, Vitest, Tailwind

---

## File Map

**New files:**
- `db/migrations/0024_settings_ops_hub.sql` — new tables + RLS
- `lib/email/resend.ts` — Resend singleton + sendInviteEmail helper
- `lib/email/templates/invite.tsx` — React Email invite template
- `lib/schemas/invitations.ts` — Zod schemas for invitation routes
- `app/settings/layout.tsx` — tab shell + admin auth guard
- `app/settings/page.tsx` — redirect to /settings/team
- `app/settings/team/page.tsx`
- `app/settings/modules/page.tsx`
- `app/settings/organization/page.tsx`
- `app/settings/integrations/page.tsx`
- `app/settings/audit/page.tsx`
- `app/settings/notifications/page.tsx`
- `app/join/page.tsx` — public invitation acceptance page
- `app/api/org/[orgId]/invitations/route.ts` — GET list + POST create
- `app/api/org/[orgId]/invitations/[inviteId]/route.ts` — DELETE cancel
- `app/api/org/[orgId]/invitations/[inviteId]/resend/route.ts` — POST resend
- `app/api/invitations/[token]/route.ts` — GET validate (public)
- `app/api/invitations/[token]/accept/route.ts` — POST accept
- `app/api/org/[orgId]/audit/route.ts` — GET audit log
- `app/api/org/[orgId]/members/[userId]/notifications/route.ts` — PATCH prefs
- `components/settings/SettingsTabs.tsx`
- `components/settings/TeamTab.tsx`
- `components/settings/InviteMemberModal.tsx`
- `components/settings/MemberRow.tsx`
- `components/settings/PendingInviteRow.tsx`
- `components/settings/ModulesTab.tsx`
- `components/settings/OrganizationTab.tsx`
- `components/settings/IntegrationsTab.tsx`
- `components/settings/AuditLogTab.tsx`
- `components/settings/NotificationsTab.tsx`
- `__tests__/invitations.test.ts`

**Modified files:**
- `lib/schemas/admin.ts` — fix `inviteMemberSchema` role enum
- `app/middleware.ts` — add `/settings/:path*` to matcher
- `components/Header.tsx` — add Settings gear icon link
- `app/api/org/[orgId]/members/route.ts` — join with profiles for email/name
- `.env.example` (or `.env`) — add `RESEND_API_KEY`

---

## Task 1: DB Migration

**Files:**
- Create: `db/migrations/0024_settings_ops_hub.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- db/migrations/0024_settings_ops_hub.sql
-- Settings & Ops Hub: org_invitations, org_audit_log, notification_prefs
-- Depends on: 0001-0023

-- ---------------------------------------------------------------------------
-- org_invitations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_invitations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email        text NOT NULL,
  role         member_role_enum NOT NULL DEFAULT 'member',
  token        text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by   uuid NOT NULL REFERENCES auth.users(id),
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '7 days',
  accepted_at  timestamptz,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'accepted', 'cancelled', 'expired')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_invitations_org_status_idx ON org_invitations (org_id, status);
CREATE INDEX IF NOT EXISTS org_invitations_token_idx ON org_invitations (token);

ALTER TABLE org_invitations ENABLE ROW LEVEL SECURITY;

-- Org admins/owners can read and manage invitations for their org
CREATE POLICY "org admins can manage invitations"
  ON org_invitations FOR ALL
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

-- Service role (used by accept endpoint) bypasses RLS — no policy needed

-- ---------------------------------------------------------------------------
-- org_audit_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id     uuid NOT NULL REFERENCES auth.users(id),
  action       text NOT NULL,
  target_id    uuid,
  metadata     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_audit_log_org_created_idx ON org_audit_log (org_id, created_at DESC);

ALTER TABLE org_audit_log ENABLE ROW LEVEL SECURITY;

-- Org admins/owners can read audit log for their org
CREATE POLICY "org admins can read audit log"
  ON org_audit_log FOR SELECT
  USING (is_org_admin(org_id));

-- Inserts only via service role (bypasses RLS) to prevent tampering

-- ---------------------------------------------------------------------------
-- notification_prefs column on organization_members
-- ---------------------------------------------------------------------------
ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{"digest":"weekly","alerts":["member_joined","module_changed"]}';
```

- [ ] **Step 2: Apply migration in Supabase SQL editor**

Paste the migration into your Supabase project's SQL editor and run it. Verify in Table Editor that `org_invitations` and `org_audit_log` tables appear.

- [ ] **Step 3: Commit**

```bash
git add db/migrations/0024_settings_ops_hub.sql
git commit -m "feat: add org_invitations, org_audit_log, notification_prefs migration"
```

---

## Task 2: Invitation Zod Schemas + Fix inviteMemberSchema

**Files:**
- Modify: `lib/schemas/admin.ts`
- Create: `lib/schemas/invitations.ts`
- Create: `__tests__/invitations.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/invitations.test.ts
import { describe, it, expect } from 'vitest';
import { createInvitationSchema, acceptInvitationSchema } from '../lib/schemas/invitations';
import { inviteMemberSchema } from '../lib/schemas/admin';

describe('createInvitationSchema', () => {
  it('accepts valid invitation', () => {
    const result = createInvitationSchema.safeParse({
      email: 'jane@example.com',
      role: 'member',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid role', () => {
    const result = createInvitationSchema.safeParse({
      email: 'jane@example.com',
      role: 'editor', // old incorrect role
    });
    expect(result.success).toBe(false);
  });

  it('rejects bad email', () => {
    const result = createInvitationSchema.safeParse({ email: 'notanemail', role: 'member' });
    expect(result.success).toBe(false);
  });
});

describe('inviteMemberSchema (fixed)', () => {
  it('accepts admin role', () => {
    const result = inviteMemberSchema.safeParse({ email: 'x@x.com', role: 'admin' });
    expect(result.success).toBe(true);
  });

  it('rejects editor role (old value)', () => {
    const result = inviteMemberSchema.safeParse({ email: 'x@x.com', role: 'editor' });
    expect(result.success).toBe(false);
  });
});

describe('acceptInvitationSchema', () => {
  it('accepts a valid token', () => {
    const result = acceptInvitationSchema.safeParse({ token: 'abc123' });
    expect(result.success).toBe(true);
  });

  it('rejects empty token', () => {
    const result = acceptInvitationSchema.safeParse({ token: '' });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /path/to/impact-viz-mvp && npx vitest run __tests__/invitations.test.ts
```

Expected: FAIL — modules not found yet.

- [ ] **Step 3: Create `lib/schemas/invitations.ts`**

```typescript
// lib/schemas/invitations.ts
import { z } from 'zod';

export const createInvitationSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['owner', 'admin', 'member', 'viewer'], {
    errorMap: () => ({ message: 'Role must be owner, admin, member, or viewer' }),
  }),
  message: z.string().max(500).optional().nullable(),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
```

- [ ] **Step 4: Fix `inviteMemberSchema` in `lib/schemas/admin.ts`**

Replace lines 23–29:

```typescript
/**
 * Schema for portfolio member invitation
 */
export const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['owner', 'admin', 'member', 'viewer'], {
    errorMap: () => ({ message: 'Role must be owner, admin, member, or viewer' })
  }),
  message: z.string().max(500).optional().nullable(),
});
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run __tests__/invitations.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/schemas/invitations.ts lib/schemas/admin.ts __tests__/invitations.test.ts
git commit -m "feat: add invitation schemas, fix inviteMemberSchema role enum"
```

---

## Task 3: Resend Email Client + Invite Template

**Files:**
- Create: `lib/email/resend.ts`
- Create: `lib/email/templates/invite.tsx`

- [ ] **Step 1: Install dependencies**

```bash
npm install resend @react-email/components
```

- [ ] **Step 2: Add env var**

Add to `.env.local`:
```
RESEND_API_KEY=re_your_key_here
```

Get a key at resend.com (free tier: 3,000 emails/month, 100/day). In Resend dashboard, verify your sending domain or use `onboarding@resend.dev` for testing.

- [ ] **Step 3: Create `lib/email/resend.ts`**

```typescript
// lib/email/resend.ts
import { Resend } from 'resend';
import { render } from '@react-email/components';
import InviteEmail from './templates/invite';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface SendInviteEmailParams {
  to: string;
  orgName: string;
  inviterName: string;
  role: string;
  message?: string | null;
  acceptUrl: string; // full URL: https://your-domain.com/join?token=xxx
}

export async function sendInviteEmail(params: SendInviteEmailParams): Promise<void> {
  const { to, orgName, inviterName, role, message, acceptUrl } = params;

  const html = await render(
    InviteEmail({ orgName, inviterName, role, message: message ?? undefined, acceptUrl })
  );

  const { error } = await resend.emails.send({
    from: `Benevolence <noreply@${process.env.RESEND_FROM_DOMAIN || 'resend.dev'}>`,
    to,
    subject: `You've been invited to join ${orgName} on Benevolence`,
    html,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}
```

- [ ] **Step 4: Create `lib/email/templates/invite.tsx`**

```tsx
// lib/email/templates/invite.tsx
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
  Preview,
} from '@react-email/components';

interface InviteEmailProps {
  orgName: string;
  inviterName: string;
  role: string;
  message?: string;
  acceptUrl: string;
}

export default function InviteEmail({
  orgName,
  inviterName,
  role,
  message,
  acceptUrl,
}: InviteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{inviterName} invited you to join {orgName} on Benevolence</Preview>
      <Body style={{ backgroundColor: '#f5f3ee', fontFamily: 'sans-serif' }}>
        <Container style={{ maxWidth: '480px', margin: '40px auto', backgroundColor: '#ffffff', borderRadius: '8px', padding: '40px' }}>
          <Text style={{ fontSize: '24px', fontWeight: '600', marginBottom: '8px' }}>
            You&apos;ve been invited
          </Text>
          <Text style={{ color: '#555', marginBottom: '24px' }}>
            <strong>{inviterName}</strong> has invited you to join <strong>{orgName}</strong> as a <strong>{role}</strong>.
          </Text>

          {message && (
            <Section style={{ backgroundColor: '#f5f3ee', borderRadius: '6px', padding: '16px', marginBottom: '24px' }}>
              <Text style={{ margin: 0, fontStyle: 'italic', color: '#444' }}>
                &ldquo;{message}&rdquo;
              </Text>
            </Section>
          )}

          <Button
            href={acceptUrl}
            style={{
              backgroundColor: '#1a56b0',
              color: '#ffffff',
              padding: '12px 24px',
              borderRadius: '6px',
              textDecoration: 'none',
              display: 'inline-block',
              fontWeight: '600',
            }}
          >
            Accept invitation
          </Button>

          <Hr style={{ margin: '32px 0', borderColor: '#e5e5e5' }} />
          <Text style={{ fontSize: '12px', color: '#999' }}>
            This invitation expires in 7 days. If you don&apos;t know {inviterName}, you can safely ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add lib/email/resend.ts lib/email/templates/invite.tsx
git commit -m "feat: add Resend email client and invite email template"
```

---

## Task 4: Invitation API Routes (Create, List, Cancel, Resend)

**Files:**
- Create: `app/api/org/[orgId]/invitations/route.ts`
- Create: `app/api/org/[orgId]/invitations/[inviteId]/route.ts`
- Create: `app/api/org/[orgId]/invitations/[inviteId]/resend/route.ts`

- [ ] **Step 1: Create `app/api/org/[orgId]/invitations/route.ts`**

```typescript
// app/api/org/[orgId]/invitations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import { createInvitationSchema } from '@/lib/schemas/invitations';
import { sendInviteEmail } from '@/lib/email/resend';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

// GET /api/org/[orgId]/invitations — list pending invitations
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const { data, error } = await supabase
      .from('org_invitations')
      .select('id, email, role, status, created_at, expires_at, invited_by')
      .eq('org_id', orgId)
      .in('status', ['pending'])
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ invitations: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/org/[orgId]/invitations — create + send invitation
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const validation = createInvitationSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.error.format() }, { status: 400 });
    }

    const { email, role, message } = validation.data;

    const adminClient = createAdminClient();

    // Check by email via profiles join
    const { data: profileMatch } = await adminClient
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (profileMatch) {
      const { data: memberMatch } = await adminClient
        .from('organization_members')
        .select('id')
        .eq('org_id', orgId)
        .eq('user_id', profileMatch.id)
        .is('deleted_at', null)
        .maybeSingle();

      if (memberMatch) {
        return NextResponse.json({ error: 'This person is already a member of your organization.' }, { status: 409 });
      }
    }

    // Check for existing pending invite to same email
    const { data: existingInvite } = await adminClient
      .from('org_invitations')
      .select('id, email, role, created_at, expires_at')
      .eq('org_id', orgId)
      .eq('email', email)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingInvite) {
      return NextResponse.json({ invitation: existingInvite, warning: 'A pending invitation already exists for this email.' });
    }

    // Create invitation
    const { data: invitation, error: insertError } = await adminClient
      .from('org_invitations')
      .insert({ org_id: orgId, email, role, invited_by: user.id })
      .select()
      .single();

    if (insertError || !invitation) {
      return NextResponse.json({ error: insertError?.message || 'Failed to create invitation' }, { status: 500 });
    }

    // Fetch org name + inviter name for email
    const [{ data: org }, { data: inviterProfile }] = await Promise.all([
      adminClient.from('organizations').select('name').eq('id', orgId).single(),
      adminClient.from('profiles').select('full_name, email').eq('id', user.id).single(),
    ]);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const acceptUrl = `${baseUrl}/join?token=${invitation.token}`;

    await sendInviteEmail({
      to: email,
      orgName: org?.name || 'your organization',
      inviterName: inviterProfile?.full_name || inviterProfile?.email || 'A team member',
      role,
      message,
      acceptUrl,
    });

    // Write audit log
    await adminClient.from('org_audit_log').insert({
      org_id: orgId,
      actor_id: user.id,
      action: 'invite_sent',
      target_id: null,
      metadata: { email, role },
    });

    return NextResponse.json({ invitation }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create `app/api/org/[orgId]/invitations/[inviteId]/route.ts`**

```typescript
// app/api/org/[orgId]/invitations/[inviteId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; inviteId: string }>;
}

// DELETE /api/org/[orgId]/invitations/[inviteId] — cancel
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, inviteId } = await params;
    const supabase = await createServerClient();

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminClient = createAdminClient();

    const { data: invite } = await adminClient
      .from('org_invitations')
      .select('id, email, status')
      .eq('id', inviteId)
      .eq('org_id', orgId)
      .single();

    if (!invite) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    if (invite.status !== 'pending') {
      return NextResponse.json({ error: 'Only pending invitations can be cancelled' }, { status: 409 });
    }

    const { error } = await adminClient
      .from('org_invitations')
      .update({ status: 'cancelled' })
      .eq('id', inviteId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await adminClient.from('org_audit_log').insert({
      org_id: orgId,
      actor_id: user.id,
      action: 'invite_cancelled',
      metadata: { email: invite.email },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create `app/api/org/[orgId]/invitations/[inviteId]/resend/route.ts`**

```typescript
// app/api/org/[orgId]/invitations/[inviteId]/resend/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import { sendInviteEmail } from '@/lib/email/resend';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; inviteId: string }>;
}

// POST /api/org/[orgId]/invitations/[inviteId]/resend
export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, inviteId } = await params;
    const supabase = await createServerClient();

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminClient = createAdminClient();

    const { data: invite } = await adminClient
      .from('org_invitations')
      .select('id, email, role, status')
      .eq('id', inviteId)
      .eq('org_id', orgId)
      .single();

    if (!invite) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    if (invite.status !== 'pending') {
      return NextResponse.json({ error: 'Only pending invitations can be resent' }, { status: 409 });
    }

    // Regenerate token + reset expiry
    const newToken = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');
    const { data: updated, error } = await adminClient
      .from('org_invitations')
      .update({
        token: newToken,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq('id', inviteId)
      .select()
      .single();

    if (error || !updated) return NextResponse.json({ error: error?.message || 'Update failed' }, { status: 500 });

    const [{ data: org }, { data: inviterProfile }] = await Promise.all([
      adminClient.from('organizations').select('name').eq('id', orgId).single(),
      adminClient.from('profiles').select('full_name, email').eq('id', user.id).single(),
    ]);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    await sendInviteEmail({
      to: invite.email,
      orgName: org?.name || 'your organization',
      inviterName: inviterProfile?.full_name || inviterProfile?.email || 'A team member',
      role: invite.role,
      acceptUrl: `${baseUrl}/join?token=${newToken}`,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add 'app/api/org/[orgId]/invitations/route.ts' \
        'app/api/org/[orgId]/invitations/[inviteId]/route.ts' \
        'app/api/org/[orgId]/invitations/[inviteId]/resend/route.ts'
git commit -m "feat: add invitation create/list/cancel/resend API routes"
```

---

## Task 5: Invitation Acceptance API + /join Page

**Files:**
- Create: `app/api/invitations/[token]/route.ts`
- Create: `app/api/invitations/[token]/accept/route.ts`
- Create: `app/join/page.tsx`

- [ ] **Step 1: Create `app/api/invitations/[token]/route.ts` (public validate)**

```typescript
// app/api/invitations/[token]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ token: string }>;
}

// GET /api/invitations/[token] — validate token (public, no auth required)
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;
    const adminClient = createAdminClient();

    const { data: invite } = await adminClient
      .from('org_invitations')
      .select('id, org_id, email, role, status, expires_at')
      .eq('token', token)
      .single();

    if (!invite) {
      return NextResponse.json({ valid: false, reason: 'not_found' }, { status: 404 });
    }

    if (invite.status === 'accepted') {
      return NextResponse.json({ valid: false, reason: 'already_accepted' });
    }

    if (invite.status === 'cancelled') {
      return NextResponse.json({ valid: false, reason: 'cancelled' });
    }

    if (new Date(invite.expires_at) < new Date()) {
      // Mark as expired
      await adminClient
        .from('org_invitations')
        .update({ status: 'expired' })
        .eq('id', invite.id);
      return NextResponse.json({ valid: false, reason: 'expired' });
    }

    if (invite.status === 'expired') {
      return NextResponse.json({ valid: false, reason: 'expired' });
    }

    // Fetch org name for display
    const { data: org } = await adminClient
      .from('organizations')
      .select('name')
      .eq('id', invite.org_id)
      .single();

    return NextResponse.json({
      valid: true,
      invitation: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        orgName: org?.name || 'Unknown Organization',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create `app/api/invitations/[token]/accept/route.ts`**

```typescript
// app/api/invitations/[token]/accept/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ token: string }>;
}

// POST /api/invitations/[token]/accept — accept invitation (auth required)
export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminClient = createAdminClient();

    const { data: invite } = await adminClient
      .from('org_invitations')
      .select('id, org_id, email, role, status, expires_at')
      .eq('token', token)
      .single();

    if (!invite) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    if (invite.status !== 'pending') {
      return NextResponse.json({ error: `Invitation is ${invite.status}` }, { status: 409 });
    }
    if (new Date(invite.expires_at) < new Date()) {
      await adminClient.from('org_invitations').update({ status: 'expired' }).eq('id', invite.id);
      return NextResponse.json({ error: 'Invitation has expired' }, { status: 410 });
    }

    // Check if already a member
    const { data: existingMember } = await adminClient
      .from('organization_members')
      .select('id')
      .eq('org_id', invite.org_id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (existingMember) {
      // Already a member — just mark accepted and redirect
      await adminClient.from('org_invitations').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('id', invite.id);
      return NextResponse.json({ success: true, orgId: invite.org_id });
    }

    // Add to org
    const { error: memberError } = await adminClient
      .from('organization_members')
      .insert({ org_id: invite.org_id, user_id: user.id, role: invite.role, invited_by: invite.id });

    if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 });

    // Mark accepted
    await adminClient
      .from('org_invitations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', invite.id);

    // Write audit log
    await adminClient.from('org_audit_log').insert({
      org_id: invite.org_id,
      actor_id: user.id,
      action: 'invite_accepted',
      metadata: { role: invite.role, email: invite.email },
    });

    return NextResponse.json({ success: true, orgId: invite.org_id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create `app/join/page.tsx`**

```tsx
// app/join/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type InviteState =
  | { status: 'loading' }
  | { status: 'valid'; orgName: string; role: string; email: string }
  | { status: 'invalid'; reason: string }
  | { status: 'accepting' }
  | { status: 'accepted' }
  | { status: 'error'; message: string };

export default function JoinPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const [state, setState] = useState<InviteState>({ status: 'loading' });

  useEffect(() => {
    if (!token) {
      setState({ status: 'invalid', reason: 'No invitation token provided.' });
      return;
    }

    async function validateAndMaybeAccept() {
      // Validate token
      const res = await fetch(`/api/invitations/${token}`);
      const data = await res.json();

      if (!data.valid) {
        const messages: Record<string, string> = {
          not_found: 'This invitation link is invalid.',
          expired: 'This invitation has expired. Please ask for a new one.',
          cancelled: 'This invitation has been cancelled.',
          already_accepted: 'This invitation has already been accepted.',
        };
        setState({ status: 'invalid', reason: messages[data.reason] || 'This invitation is no longer valid.' });
        return;
      }

      setState({ status: 'valid', orgName: data.invitation.orgName, role: data.invitation.role, email: data.invitation.email });

      // Check if user is already logged in
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await acceptInvitation();
      }
    }

    validateAndMaybeAccept();
  }, [token]);

  async function acceptInvitation() {
    if (!token) return;
    setState({ status: 'accepting' });

    const res = await fetch(`/api/invitations/${token}/accept`, { method: 'POST' });
    const data = await res.json();

    if (res.ok && data.success) {
      // Set org cookie and redirect
      if (data.orgId) {
        document.cookie = `x-org-id=${data.orgId}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;
      }
      setState({ status: 'accepted' });
      setTimeout(() => router.replace('/dashboard'), 1500);
    } else {
      setState({ status: 'error', message: data.error || 'Failed to accept invitation.' });
    }
  }

  function handleSignIn() {
    router.push(`/login?redirect=${encodeURIComponent(`/join?token=${token}`)}`);
  }

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-creme">
        <p className="text-black/50">Validating invitation…</p>
      </div>
    );
  }

  if (state.status === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-creme">
        <div className="max-w-md w-full bg-white rounded-lg p-8 shadow-sm text-center">
          <p className="text-lg font-semibold mb-2">Invalid Invitation</p>
          <p className="text-black/60 mb-6">{state.reason}</p>
          <a href="/" className="text-azure text-sm underline">Go home</a>
        </div>
      </div>
    );
  }

  if (state.status === 'accepting') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-creme">
        <p className="text-black/50">Joining organization…</p>
      </div>
    );
  }

  if (state.status === 'accepted') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-creme">
        <div className="max-w-md w-full bg-white rounded-lg p-8 shadow-sm text-center">
          <p className="text-lg font-semibold mb-2">You&apos;re in!</p>
          <p className="text-black/60">Redirecting to your dashboard…</p>
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-creme">
        <div className="max-w-md w-full bg-white rounded-lg p-8 shadow-sm text-center">
          <p className="text-lg font-semibold mb-2">Something went wrong</p>
          <p className="text-black/60 mb-4">{state.message}</p>
          <button onClick={handleSignIn} className="text-azure text-sm underline">Try signing in again</button>
        </div>
      </div>
    );
  }

  // status === 'valid', user not yet logged in
  return (
    <div className="min-h-screen flex items-center justify-center bg-creme">
      <div className="max-w-md w-full bg-white rounded-lg p-8 shadow-sm">
        <h1 className="text-2xl font-semibold mb-2">You&apos;ve been invited</h1>
        <p className="text-black/60 mb-6">
          Join <strong>{state.orgName}</strong> as a <strong>{state.role}</strong>.
        </p>
        <button
          onClick={handleSignIn}
          className="w-full py-3 rounded-md bg-azure text-white font-medium hover:opacity-90 transition-opacity"
        >
          Sign in to accept
        </button>
        <p className="mt-4 text-xs text-black/40 text-center">
          Don&apos;t have an account? You&apos;ll be able to create one.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add 'app/api/invitations/[token]/route.ts' \
        'app/api/invitations/[token]/accept/route.ts' \
        app/join/page.tsx
git commit -m "feat: add invitation validate/accept API and /join page"
```

---

## Task 6: Settings Layout + Middleware + Nav

**Files:**
- Create: `app/settings/layout.tsx`
- Create: `app/settings/page.tsx`
- Create: `components/settings/SettingsTabs.tsx`
- Modify: `app/middleware.ts`
- Modify: `components/Header.tsx`

- [ ] **Step 1: Update `app/middleware.ts` matcher**

Change the matcher to include `/settings/:path*`:

```typescript
export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/welcome', '/settings/:path*'],
};
```

- [ ] **Step 2: Create `app/settings/layout.tsx`**

```tsx
// app/settings/layout.tsx
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import SettingsTabs from '@/components/settings/SettingsTabs';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient();
  const cookieStore = await cookies();
  const orgId = cookieStore.get('x-org-id')?.value;

  if (!orgId) redirect('/welcome');

  const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
  if (!isAdmin) redirect('/dashboard');

  return (
    <div className="min-h-screen bg-creme">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="font-serif text-3xl mb-6">Settings</h1>
        <SettingsTabs />
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `app/settings/page.tsx`**

```typescript
// app/settings/page.tsx
import { redirect } from 'next/navigation';

export default function SettingsPage() {
  redirect('/settings/team');
}
```

- [ ] **Step 4: Create `components/settings/SettingsTabs.tsx`**

```tsx
// components/settings/SettingsTabs.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/settings/team',         label: 'Team' },
  { href: '/settings/modules',      label: 'Modules' },
  { href: '/settings/organization', label: 'Organization' },
  { href: '/settings/integrations', label: 'Integrations' },
  { href: '/settings/audit',        label: 'Audit Log' },
  { href: '/settings/notifications',label: 'Notifications' },
];

export default function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b border-black/10 mb-2">
      {TABS.map(({ href, label }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
              active
                ? 'border-b-2 border-azure text-azure bg-white'
                : 'text-black/50 hover:text-black/80 hover:bg-black/5'
            }`}
            aria-current={active ? 'page' : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 5: Add Settings link to `components/Header.tsx`**

In the desktop nav (after the "Integrations" link, around line 164) add:

```tsx
<Link
  href="/settings"
  aria-current={pathname.startsWith('/settings') ? 'page' : undefined}
  className={navLinkClass}
  aria-label="Settings"
>
  Settings
</Link>
```

Add the same link in the mobile menu section (after the Integrations mobile link, around line 256):

```tsx
<Link
  href="/settings"
  aria-current={pathname.startsWith('/settings') ? 'page' : undefined}
  className={mobileNavLinkClass}
>
  Settings
</Link>
```

Note: The Header doesn't currently know the user's role, so both links are visible. For now that's acceptable — the settings layout will redirect non-admins to `/dashboard`. If you want to hide it from members/viewers later, you'd need to pass role into the Header.

- [ ] **Step 6: Verify dev server renders /settings/team without error**

```bash
npm run dev
```

Navigate to `/settings` in the browser. Should redirect to `/settings/team` and show the tab bar. Expect a blank content area for now.

- [ ] **Step 7: Commit**

```bash
git add app/settings/layout.tsx app/settings/page.tsx \
        components/settings/SettingsTabs.tsx \
        app/middleware.ts components/Header.tsx
git commit -m "feat: settings layout, tab nav, middleware guard, header link"
```

---

## Task 7: Team Tab

**Files:**
- Create: `app/settings/team/page.tsx`
- Create: `components/settings/TeamTab.tsx`
- Create: `components/settings/MemberRow.tsx`
- Create: `components/settings/PendingInviteRow.tsx`
- Create: `components/settings/InviteMemberModal.tsx`
- Modify: `app/api/org/[orgId]/members/route.ts` (join with profiles)

- [ ] **Step 1: Update `app/api/org/[orgId]/members/route.ts` GET to include profile data**

Replace the GET handler (lines 11–35):

```typescript
// GET /api/org/[orgId]/members — list members with profile info
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('organization_members')
      .select(`
        id, org_id, user_id, role, created_at,
        profiles!user_id ( email, full_name, avatar_url )
      `)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const members = (data || []).map((m: any) => ({
      id: m.id,
      user_id: m.user_id,
      role: m.role,
      created_at: m.created_at,
      email: m.profiles?.email || null,
      full_name: m.profiles?.full_name || null,
      avatar_url: m.profiles?.avatar_url || null,
    }));

    return NextResponse.json({ members, currentRole: role });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create `components/settings/MemberRow.tsx`**

```tsx
// components/settings/MemberRow.tsx
'use client';

interface Member {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  created_at: string;
}

interface MemberRowProps {
  member: Member;
  currentUserId: string;
  currentRole: string;
  onRoleChange: (userId: string, newRole: string) => void;
  onRemove: (userId: string) => void;
}

const ROLE_OPTIONS = ['owner', 'admin', 'member', 'viewer'];

export default function MemberRow({ member, currentUserId, currentRole, onRoleChange, onRemove }: MemberRowProps) {
  const isSelf = member.user_id === currentUserId;
  const canEdit = currentRole === 'owner' || (currentRole === 'admin' && member.role !== 'owner' && member.role !== 'admin');
  const canRemove = canEdit && !isSelf;
  const displayName = member.full_name || member.email || member.user_id.slice(0, 8);

  return (
    <div className="flex items-center justify-between py-3 border-b border-black/5 last:border-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-azure/10 flex items-center justify-center text-azure text-xs font-medium">
          {displayName[0]?.toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-medium">{displayName}</p>
          {member.full_name && member.email && (
            <p className="text-xs text-black/40">{member.email}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {canEdit ? (
          <select
            value={member.role}
            onChange={(e) => onRoleChange(member.user_id, e.target.value)}
            className="text-xs border border-black/10 rounded px-2 py-1 bg-white"
            aria-label={`Role for ${displayName}`}
          >
            {ROLE_OPTIONS.filter(r => currentRole === 'owner' || r !== 'owner').map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        ) : (
          <span className="text-xs px-2 py-1 rounded bg-black/5 text-black/60">{member.role}</span>
        )}
        {canRemove && (
          <button
            onClick={() => onRemove(member.user_id)}
            className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
            aria-label={`Remove ${displayName}`}
          >
            Remove
          </button>
        )}
        {isSelf && <span className="text-xs text-black/30">(you)</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `components/settings/PendingInviteRow.tsx`**

```tsx
// components/settings/PendingInviteRow.tsx
'use client';

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  created_at: string;
  expires_at: string;
}

interface PendingInviteRowProps {
  invite: PendingInvite;
  onResend: (inviteId: string) => void;
  onCancel: (inviteId: string) => void;
}

export default function PendingInviteRow({ invite, onResend, onCancel }: PendingInviteRowProps) {
  const expiresDate = new Date(invite.expires_at).toLocaleDateString();

  return (
    <div className="flex items-center justify-between py-3 border-b border-black/5 last:border-0">
      <div>
        <p className="text-sm">{invite.email}</p>
        <p className="text-xs text-black/40">Invited as <span className="font-medium">{invite.role}</span> · expires {expiresDate}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onResend(invite.id)}
          className="text-xs text-azure hover:underline"
        >
          Resend
        </button>
        <button
          onClick={() => onCancel(invite.id)}
          className="text-xs text-black/40 hover:text-red-500"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `components/settings/InviteMemberModal.tsx`**

```tsx
// components/settings/InviteMemberModal.tsx
'use client';

import { useState } from 'react';

interface InviteMemberModalProps {
  orgId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function InviteMemberModal({ orgId, onClose, onSuccess }: InviteMemberModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    const res = await fetch(`/api/org/${orgId}/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role, message: message || null }),
    });

    const data = await res.json();
    setBusy(false);

    if (!res.ok && res.status !== 200) {
      setError(data.error || 'Failed to send invitation.');
      return;
    }

    if (data.warning) {
      setError(data.warning);
      return;
    }

    onSuccess();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" role="dialog" aria-modal="true" aria-label="Invite team member">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Invite team member</h2>
          <button onClick={onClose} aria-label="Close modal" className="text-black/40 hover:text-black">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="invite-email" className="block text-sm font-medium mb-1">Email address</label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-black/15 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-azure"
              placeholder="colleague@example.com"
            />
          </div>

          <div>
            <label htmlFor="invite-role" className="block text-sm font-medium mb-1">Role</label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full border border-black/15 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-azure"
            >
              <option value="admin">Admin — can manage team and settings</option>
              <option value="member">Member — can view and edit data</option>
              <option value="viewer">Viewer — read-only access</option>
            </select>
          </div>

          <div>
            <label htmlFor="invite-message" className="block text-sm font-medium mb-1">Personal message (optional)</label>
            <textarea
              id="invite-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full border border-black/15 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-azure resize-none"
              placeholder="Add a personal note to the invitation email…"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded border border-black/10 hover:bg-black/5">
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !email}
              className="px-4 py-2 text-sm rounded bg-azure text-white font-medium hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `components/settings/TeamTab.tsx`**

```tsx
// components/settings/TeamTab.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import MemberRow from './MemberRow';
import PendingInviteRow from './PendingInviteRow';
import InviteMemberModal from './InviteMemberModal';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface TeamTabProps {
  orgId: string;
}

export default function TeamTab({ orgId }: TeamTabProps) {
  const [members, setMembers] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<string>('viewer');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [membersRes, invitesRes] = await Promise.all([
      fetch(`/api/org/${orgId}/members`),
      fetch(`/api/org/${orgId}/invitations`),
    ]);
    const [membersData, invitesData] = await Promise.all([membersRes.json(), invitesRes.json()]);
    setMembers(membersData.members || []);
    setCurrentRole(membersData.currentRole || 'viewer');
    setInvitations(invitesData.invitations || []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleRoleChange(userId: string, newRole: string) {
    await fetch(`/api/org/${orgId}/members/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    });
    fetchData();
  }

  async function handleRemove(userId: string) {
    if (!confirm('Remove this member from your organization?')) return;
    await fetch(`/api/org/${orgId}/members/${userId}`, { method: 'DELETE' });
    fetchData();
  }

  async function handleResend(inviteId: string) {
    await fetch(`/api/org/${orgId}/invitations/${inviteId}/resend`, { method: 'POST' });
  }

  async function handleCancel(inviteId: string) {
    if (!confirm('Cancel this invitation?')) return;
    await fetch(`/api/org/${orgId}/invitations/${inviteId}`, { method: 'DELETE' });
    fetchData();
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Team members</h2>
          {(currentRole === 'owner' || currentRole === 'admin') && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="text-sm px-3 py-1.5 rounded bg-azure text-white font-medium hover:opacity-90"
            >
              + Invite member
            </button>
          )}
        </div>
        {loading ? (
          <p className="text-sm text-black/40">Loading…</p>
        ) : (
          <div className="bg-white rounded-lg border border-black/10 px-4">
            {members.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                currentUserId={currentUserId || ''}
                currentRole={currentRole}
                onRoleChange={handleRoleChange}
                onRemove={handleRemove}
              />
            ))}
          </div>
        )}
      </div>

      {invitations.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3">Pending invitations</h2>
          <div className="bg-white rounded-lg border border-black/10 px-4">
            {invitations.map((inv) => (
              <PendingInviteRow
                key={inv.id}
                invite={inv}
                onResend={handleResend}
                onCancel={handleCancel}
              />
            ))}
          </div>
        </div>
      )}

      {showInviteModal && (
        <InviteMemberModal
          orgId={orgId}
          onClose={() => setShowInviteModal(false)}
          onSuccess={fetchData}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Create `app/settings/team/page.tsx`**

```tsx
// app/settings/team/page.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import TeamTab from '@/components/settings/TeamTab';

export default async function TeamPage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get('x-org-id')?.value;
  if (!orgId) redirect('/welcome');

  return <TeamTab orgId={orgId} />;
}
```

- [ ] **Step 7: Test in browser**

Start dev server, navigate to `/settings/team`. Verify:
- Member list loads with names/emails
- Role dropdowns work for admin/owner
- Invite modal opens, sends request, closes on success

- [ ] **Step 8: Commit**

```bash
git add 'app/api/org/[orgId]/members/route.ts' \
        app/settings/team/page.tsx \
        components/settings/TeamTab.tsx \
        components/settings/MemberRow.tsx \
        components/settings/PendingInviteRow.tsx \
        components/settings/InviteMemberModal.tsx
git commit -m "feat: team tab — member list, invite modal, pending invitations"
```

---

## Task 8: Modules Tab

**Files:**
- Create: `app/settings/modules/page.tsx`
- Create: `components/settings/ModulesTab.tsx`

- [ ] **Step 1: Create `components/settings/ModulesTab.tsx`**

```tsx
// components/settings/ModulesTab.tsx
'use client';

import { useState } from 'react';

const MODULE_DEFS = [
  { key: 'tax',         label: 'Tax Center',     description: 'Contribution tracking, carryforward schedule, Form 8283, and TurboTax export.' },
  { key: 'donors',      label: 'Donor CRM',      description: 'Donor profiles, giving history, and acknowledgment letter generation.' },
  { key: 'compliance',  label: 'Compliance',     description: 'Filing calendar, state registrations, and deadline tracking.' },
  { key: 'quickbooks',  label: 'QuickBooks',     description: 'Sync chart of accounts and generate journal entries for your accounting team.' },
];

interface ModulesTabProps {
  orgId: string;
  initialModules: Record<string, boolean>;
}

export default function ModulesTab({ orgId, initialModules }: ModulesTabProps) {
  const [modules, setModules] = useState<Record<string, boolean>>(initialModules);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle(key: string) {
    const newValue = !modules[key];
    setModules((prev) => ({ ...prev, [key]: newValue }));
    setSaving(key);
    setError(null);

    const res = await fetch(`/api/org/${orgId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modules: { ...modules, [key]: newValue } }),
    });

    setSaving(null);
    if (!res.ok) {
      setModules((prev) => ({ ...prev, [key]: !newValue })); // revert
      setError('Failed to save. Please try again.');
    }
  }

  return (
    <div>
      <p className="text-sm text-black/50 mb-6">
        Enable or disable modules for your organization. Changes take effect immediately.
      </p>
      <div className="space-y-3">
        {MODULE_DEFS.map(({ key, label, description }) => (
          <div key={key} className="flex items-start gap-4 bg-white rounded-lg border border-black/10 p-4">
            <button
              role="switch"
              aria-checked={!!modules[key]}
              aria-label={`Toggle ${label}`}
              onClick={() => handleToggle(key)}
              disabled={saving === key}
              className={`relative inline-flex h-6 w-11 shrink-0 mt-0.5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-azure focus:ring-offset-1 ${
                modules[key] ? 'bg-azure' : 'bg-black/20'
              } ${saving === key ? 'opacity-50' : ''}`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform mt-0.5 ${
                  modules[key] ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
            <div>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-black/50 mt-0.5">{description}</p>
            </div>
          </div>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Create `app/settings/modules/page.tsx`**

```tsx
// app/settings/modules/page.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase';
import ModulesTab from '@/components/settings/ModulesTab';

export default async function ModulesPage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get('x-org-id')?.value;
  if (!orgId) redirect('/welcome');

  const supabase = await createServerClient();
  const { data: org } = await supabase
    .from('organizations')
    .select('modules')
    .eq('id', orgId)
    .single();

  const modules: Record<string, boolean> = org?.modules || {};

  return <ModulesTab orgId={orgId} initialModules={modules} />;
}
```

- [ ] **Step 3: Test in browser**

Navigate to `/settings/modules`. Toggle a module on and off. Verify it persists (reload and check state matches).

- [ ] **Step 4: Commit**

```bash
git add app/settings/modules/page.tsx components/settings/ModulesTab.tsx
git commit -m "feat: modules tab — toggle org modules with live persistence"
```

---

## Task 9: Organization Tab

**Files:**
- Create: `app/settings/organization/page.tsx`
- Create: `components/settings/OrganizationTab.tsx`

- [ ] **Step 1: Create `components/settings/OrganizationTab.tsx`**

```tsx
// components/settings/OrganizationTab.tsx
'use client';

import { useState } from 'react';

interface OrganizationTabProps {
  orgId: string;
  initialName: string;
  initialEin: string | null;
  orgType: string;
}

const ORG_TYPE_LABELS: Record<string, string> = {
  private_foundation:   'Family Foundation',
  family_office:        'Family Office',
  daf_sponsor:          'Donor-Advised Fund',
  community_foundation: 'Community Foundation',
  nonprofit:            'Nonprofit',
  corporation:          'Corporation',
  individual:           'Individual',
};

export default function OrganizationTab({ orgId, initialName, initialEin, orgType }: OrganizationTabProps) {
  const [name, setName] = useState(initialName);
  const [ein, setEin] = useState(initialEin || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    const res = await fetch(`/api/org/${orgId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), ein: ein.trim() || null }),
    });

    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      const data = await res.json();
      setError(data.error || 'Failed to save changes.');
    }
  }

  return (
    <form onSubmit={handleSave} className="max-w-lg space-y-6">
      <div>
        <label htmlFor="org-name" className="block text-sm font-medium mb-1">Organization name</label>
        <input
          id="org-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={255}
          className="w-full border border-black/15 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-azure"
        />
      </div>

      <div>
        <label htmlFor="org-ein" className="block text-sm font-medium mb-1">EIN (optional)</label>
        <input
          id="org-ein"
          type="text"
          value={ein}
          onChange={(e) => setEin(e.target.value)}
          placeholder="XX-XXXXXXX"
          className="w-full border border-black/15 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-azure"
        />
      </div>

      <div>
        <p className="text-sm font-medium mb-1">Organization type</p>
        <p className="text-sm text-black/60 bg-black/5 rounded px-3 py-2">
          {ORG_TYPE_LABELS[orgType] || orgType}
        </p>
        <p className="text-xs text-black/40 mt-1">Organization type is set at onboarding and cannot be changed here.</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-600">Changes saved.</p>}

      <button
        type="submit"
        disabled={saving || !name.trim()}
        className="px-5 py-2 rounded bg-azure text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Create `app/settings/organization/page.tsx`**

```tsx
// app/settings/organization/page.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase';
import OrganizationTab from '@/components/settings/OrganizationTab';

export default async function OrganizationPage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get('x-org-id')?.value;
  if (!orgId) redirect('/welcome');

  const supabase = await createServerClient();
  const { data: org } = await supabase
    .from('organizations')
    .select('name, ein, org_type')
    .eq('id', orgId)
    .single();

  if (!org) redirect('/dashboard');

  return (
    <OrganizationTab
      orgId={orgId}
      initialName={org.name}
      initialEin={org.ein}
      orgType={org.org_type}
    />
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/settings/organization/page.tsx components/settings/OrganizationTab.tsx
git commit -m "feat: organization tab — edit name and EIN"
```

---

## Task 10: Integrations Tab

**Files:**
- Create: `app/settings/integrations/page.tsx`
- Create: `components/settings/IntegrationsTab.tsx`

- [ ] **Step 1: Create `components/settings/IntegrationsTab.tsx`**

```tsx
// components/settings/IntegrationsTab.tsx
'use client';

interface IntegrationCardProps {
  name: string;
  description: string;
  connected: boolean;
  connectHref?: string;
  onDisconnect?: () => void;
  comingSoon?: boolean;
}

function IntegrationCard({ name, description, connected, connectHref, onDisconnect, comingSoon }: IntegrationCardProps) {
  return (
    <div className="flex items-center justify-between bg-white rounded-lg border border-black/10 p-4">
      <div>
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-black/50 mt-0.5">{description}</p>
      </div>
      <div className="ml-4 shrink-0">
        {comingSoon ? (
          <span className="text-xs text-black/30 px-3 py-1.5 rounded border border-black/10">Coming soon</span>
        ) : connected ? (
          <button
            onClick={onDisconnect}
            className="text-xs text-red-500 hover:text-red-700 px-3 py-1.5 rounded border border-red-200 hover:bg-red-50"
          >
            Disconnect
          </button>
        ) : (
          <a
            href={connectHref}
            className="text-xs text-azure px-3 py-1.5 rounded border border-azure/30 hover:bg-azure/5"
          >
            Connect
          </a>
        )}
      </div>
    </div>
  );
}

interface IntegrationsTabProps {
  qbConnected: boolean;
  orgId: string;
}

export default function IntegrationsTab({ qbConnected, orgId }: IntegrationsTabProps) {
  async function handleQbDisconnect() {
    await fetch(`/api/integrations/quickbooks/disconnect`, { method: 'POST' });
    window.location.reload();
  }

  return (
    <div className="space-y-3 max-w-2xl">
      <IntegrationCard
        name="QuickBooks"
        description="Sync chart of accounts and generate journal entries for your accounting team."
        connected={qbConnected}
        connectHref={`/api/integrations/quickbooks/connect?orgId=${orgId}`}
        onDisconnect={handleQbDisconnect}
      />
      <IntegrationCard
        name="Salesforce"
        description="Sync donor and grant data with your Salesforce CRM."
        connected={false}
        comingSoon
      />
      <IntegrationCard
        name="Fidelity Charitable"
        description="Import DAF grant recommendations directly."
        connected={false}
        comingSoon
      />

      <div className="mt-6 p-4 rounded-lg border border-dashed border-black/15 text-center">
        <p className="text-sm text-black/50 mb-1">AI-powered instance customization</p>
        <p className="text-xs text-black/30">Build new modules tailored to your organization — coming soon.</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `app/settings/integrations/page.tsx`**

```tsx
// app/settings/integrations/page.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase';
import IntegrationsTab from '@/components/settings/IntegrationsTab';

export default async function IntegrationsPage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get('x-org-id')?.value;
  if (!orgId) redirect('/welcome');

  const adminClient = createAdminClient();
  const { data: qbConn } = await adminClient
    .from('quickbooks_connections')
    .select('id')
    .eq('org_id', orgId)
    .maybeSingle();

  return <IntegrationsTab qbConnected={!!qbConn} orgId={orgId} />;
}
```

- [ ] **Step 3: Commit**

```bash
git add app/settings/integrations/page.tsx components/settings/IntegrationsTab.tsx
git commit -m "feat: integrations tab — QuickBooks status and coming soon cards"
```

---

## Task 11: Audit Log Tab

**Files:**
- Create: `app/api/org/[orgId]/audit/route.ts`
- Create: `app/settings/audit/page.tsx`
- Create: `components/settings/AuditLogTab.tsx`

- [ ] **Step 1: Create `app/api/org/[orgId]/audit/route.ts`**

```typescript
// app/api/org/[orgId]/audit/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const offset = parseInt(searchParams.get('offset') || '0');

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('org_audit_log')
      .select(`
        id, action, target_id, metadata, created_at,
        profiles!actor_id ( email, full_name )
      `)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const entries = (data || []).map((row: any) => ({
      id: row.id,
      action: row.action,
      target_id: row.target_id,
      metadata: row.metadata,
      created_at: row.created_at,
      actor_email: row.profiles?.email || null,
      actor_name: row.profiles?.full_name || null,
    }));

    return NextResponse.json({ entries });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create `components/settings/AuditLogTab.tsx`**

```tsx
// components/settings/AuditLogTab.tsx
'use client';

import { useState, useEffect } from 'react';

const ACTION_LABELS: Record<string, string> = {
  invite_sent:      'Invitation sent',
  invite_accepted:  'Invitation accepted',
  invite_cancelled: 'Invitation cancelled',
  member_removed:   'Member removed',
  role_changed:     'Role changed',
  module_toggled:   'Module toggled',
  org_updated:      'Organization updated',
};

interface AuditLogTabProps {
  orgId: string;
}

export default function AuditLogTab({ orgId }: AuditLogTabProps) {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/org/${orgId}/audit?limit=50`)
      .then((r) => r.json())
      .then((d) => { setEntries(d.entries || []); setLoading(false); });
  }, [orgId]);

  if (loading) return <p className="text-sm text-black/40">Loading…</p>;
  if (!entries.length) return <p className="text-sm text-black/40">No activity recorded yet.</p>;

  return (
    <div className="bg-white rounded-lg border border-black/10 divide-y divide-black/5">
      {entries.map((entry) => {
        const actor = entry.actor_name || entry.actor_email || 'Unknown';
        const label = ACTION_LABELS[entry.action] || entry.action;
        const date = new Date(entry.created_at).toLocaleString();
        const meta = entry.metadata;

        let detail = '';
        if (meta?.email) detail += ` · ${meta.email}`;
        if (meta?.role) detail += ` · ${meta.role}`;
        if (meta?.module) detail += ` · ${meta.module}`;
        if (meta?.old_value !== undefined && meta?.new_value !== undefined) {
          detail += ` · ${meta.old_value} → ${meta.new_value}`;
        }

        return (
          <div key={entry.id} className="px-4 py-3 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm"><span className="font-medium">{actor}</span> · {label}{detail}</p>
            </div>
            <p className="text-xs text-black/40 whitespace-nowrap shrink-0">{date}</p>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Create `app/settings/audit/page.tsx`**

```tsx
// app/settings/audit/page.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import AuditLogTab from '@/components/settings/AuditLogTab';

export default async function AuditPage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get('x-org-id')?.value;
  if (!orgId) redirect('/welcome');
  return <AuditLogTab orgId={orgId} />;
}
```

- [ ] **Step 4: Wire audit log write for member role changes and removal**

In `app/api/org/[orgId]/members/[userId]/route.ts`, add audit writes after each successful DB mutation.

After the PATCH success (after line 34 `return NextResponse.json(data)`), before returning:

```typescript
// Add before the return in PATCH handler — need user and adminClient
const { data: { user: actor } } = await supabase.auth.getUser();
if (actor) {
  const adminAudit = createAdminClient();
  await adminAudit.from('org_audit_log').insert({
    org_id: orgId,
    actor_id: actor.id,
    action: 'role_changed',
    target_id: userId,
    metadata: { role },
  });
}
```

After the DELETE success (before returning `{ success: true }`):

```typescript
const { data: { user: actor } } = await supabase.auth.getUser();
if (actor) {
  const adminAudit = createAdminClient();
  await adminAudit.from('org_audit_log').insert({
    org_id: orgId,
    actor_id: actor.id,
    action: 'member_removed',
    target_id: userId,
    metadata: {},
  });
}
```

- [ ] **Step 5: Commit**

```bash
git add 'app/api/org/[orgId]/audit/route.ts' \
        'app/api/org/[orgId]/members/[userId]/route.ts' \
        app/settings/audit/page.tsx \
        components/settings/AuditLogTab.tsx
git commit -m "feat: audit log tab, audit API route, wire member change audit writes"
```

---

## Task 12: Notifications Tab

**Files:**
- Create: `app/api/org/[orgId]/members/[userId]/notifications/route.ts`
- Create: `app/settings/notifications/page.tsx`
- Create: `components/settings/NotificationsTab.tsx`

- [ ] **Step 1: Create the PATCH notifications API route**

```typescript
// app/api/org/[orgId]/members/[userId]/notifications/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; userId: string }>;
}

const notificationPrefsSchema = z.object({
  digest: z.enum(['daily', 'weekly', 'never']).optional(),
  alerts: z.array(z.string()).optional(),
});

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, userId } = await params;
    const supabase = await createServerClient();

    // User can only update their own prefs
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Must be a member of this org
    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) return NextResponse.json({ error: 'Not a member of this organization' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const validation = notificationPrefsSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.error.format() }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: current } = await adminClient
      .from('organization_members')
      .select('notification_prefs')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .single();

    const merged = { ...(current?.notification_prefs || {}), ...validation.data };

    const { error } = await adminClient
      .from('organization_members')
      .update({ notification_prefs: merged })
      .eq('org_id', orgId)
      .eq('user_id', userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ notification_prefs: merged });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create `components/settings/NotificationsTab.tsx`**

```tsx
// components/settings/NotificationsTab.tsx
'use client';

import { useState } from 'react';

interface NotificationsTabProps {
  orgId: string;
  userId: string;
  initialPrefs: {
    digest: 'daily' | 'weekly' | 'never';
    alerts: string[];
  };
}

const ALERT_OPTIONS = [
  { key: 'member_joined',   label: 'A new member joins the organization' },
  { key: 'module_changed',  label: 'A module is enabled or disabled' },
];

export default function NotificationsTab({ orgId, userId, initialPrefs }: NotificationsTabProps) {
  const [digest, setDigest] = useState<'daily' | 'weekly' | 'never'>(initialPrefs.digest);
  const [alerts, setAlerts] = useState<string[]>(initialPrefs.alerts);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleAlert(key: string) {
    setAlerts((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/org/${orgId}/members/${userId}/notifications`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ digest, alerts }),
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
    <form onSubmit={handleSave} className="max-w-lg space-y-6">
      <p className="text-sm text-black/50">
        These preferences control email notifications sent to you. Notification sending beyond invitations is coming soon.
      </p>

      <div>
        <label htmlFor="digest" className="block text-sm font-medium mb-1">Activity digest</label>
        <select
          id="digest"
          value={digest}
          onChange={(e) => setDigest(e.target.value as 'daily' | 'weekly' | 'never')}
          className="border border-black/15 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-azure"
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="never">Never</option>
        </select>
      </div>

      <div>
        <p className="text-sm font-medium mb-2">Instant alerts</p>
        <div className="space-y-2">
          {ALERT_OPTIONS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={alerts.includes(key)}
                onChange={() => toggleAlert(key)}
                className="rounded border-black/20 text-azure focus:ring-azure"
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-600">Preferences saved.</p>}

      <button
        type="submit"
        disabled={saving}
        className="px-5 py-2 rounded bg-azure text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save preferences'}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Create `app/settings/notifications/page.tsx`**

```tsx
// app/settings/notifications/page.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import NotificationsTab from '@/components/settings/NotificationsTab';

export default async function NotificationsPage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get('x-org-id')?.value;
  if (!orgId) redirect('/welcome');

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const adminClient = createAdminClient();
  const { data: membership } = await adminClient
    .from('organization_members')
    .select('notification_prefs')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .single();

  const prefs = membership?.notification_prefs || { digest: 'weekly', alerts: ['member_joined', 'module_changed'] };

  return (
    <NotificationsTab
      orgId={orgId}
      userId={user.id}
      initialPrefs={prefs}
    />
  );
}
```

- [ ] **Step 4: Run full TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors. Fix any type errors before committing.

- [ ] **Step 5: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Smoke test full settings flow in browser**

1. Navigate to `/settings/team` — verify member list and invite modal work
2. Send a test invitation — check email arrives (or check Resend dashboard for delivery)
3. Click invite link in email — verify `/join` page loads and shows org name
4. Navigate to `/settings/modules` — toggle a module, reload, verify persisted
5. Navigate to `/settings/organization` — update org name, save, verify
6. Navigate to `/settings/integrations` — verify QB card shows correct connection state
7. Navigate to `/settings/audit` — verify invite_sent entry appears
8. Navigate to `/settings/notifications` — toggle preferences, save

- [ ] **Step 7: Commit**

```bash
git add 'app/api/org/[orgId]/members/[userId]/notifications/route.ts' \
        app/settings/notifications/page.tsx \
        components/settings/NotificationsTab.tsx
git commit -m "feat: notifications tab — per-user email preference storage and API"
```
