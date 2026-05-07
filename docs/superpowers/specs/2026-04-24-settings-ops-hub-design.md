# Settings & Ops Hub Design

## Goal

Build a `/settings` area where org owners and admins can manage their team (including email invitations), toggle modules, edit org profile, manage integrations, view an audit log, and configure notifications — replacing ad-hoc org management with a coherent, professional ops hub.

## Architecture

Six-tab settings area at `/settings/*`, accessible to `owner` and `admin` roles only. Sits alongside `/dashboard` and `/admin` in the nav — `/admin` stays untouched (import/data tooling). A new `org_invitations` table drives the invitation flow. Resend handles transactional email. A `/join` page handles invitation acceptance for both existing and new users.

**Tech additions:**
- `resend` npm package + `RESEND_API_KEY` env var
- `react-email` for the invite email template
- One new DB migration: `org_invitations` table, `org_audit_log` table, both with RLS

---

## File Layout

```
app/settings/
  layout.tsx                    — tab shell, auth guard (owner/admin only), org context
  page.tsx                      — redirect to /settings/team
  team/page.tsx
  modules/page.tsx
  organization/page.tsx
  integrations/page.tsx
  audit/page.tsx
  notifications/page.tsx

app/join/
  page.tsx                      — invitation acceptance (public route)

app/api/org/[orgId]/invitations/
  route.ts                      — GET (list), POST (create + send email)
  [inviteId]/route.ts           — DELETE (cancel)
  [inviteId]/resend/route.ts    — POST (resend email)

app/api/invitations/[token]/
  route.ts                      — GET (validate token — public, no auth)
  accept/route.ts               — POST (accept invitation — auth required)

components/settings/
  SettingsTabs.tsx
  TeamTab.tsx
  InviteMemberModal.tsx
  MemberRow.tsx
  PendingInviteRow.tsx
  ModulesTab.tsx
  OrganizationTab.tsx
  IntegrationsTab.tsx
  AuditLogTab.tsx
  NotificationsTab.tsx

lib/email/
  resend.ts                     — Resend client singleton + send helpers
  templates/
    invite.tsx                  — React Email invite template
```

---

## Data Model

### New table: `org_invitations`

```sql
CREATE TABLE org_invitations (
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

CREATE INDEX ON org_invitations (org_id, status);
CREATE INDEX ON org_invitations (token);
```

**RLS:**
- `SELECT`: org owners/admins can read invitations for their org. Service role can read by token.
- `INSERT`: org owners/admins for their org only.
- `UPDATE`: org owners/admins (for cancel/accept status changes).

### New table: `org_audit_log`

```sql
CREATE TABLE org_audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id     uuid NOT NULL REFERENCES auth.users(id),
  action       text NOT NULL,    -- 'invite_sent', 'invite_accepted', 'member_removed',
                                 --  'role_changed', 'module_toggled', 'org_updated'
  target_id    uuid,             -- user_id or member_id affected, if applicable
  metadata     jsonb,            -- { role, module, old_value, new_value, etc. }
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON org_audit_log (org_id, created_at DESC);
```

**RLS:** org owners/admins can read for their org. Rows are insert-only (no update/delete).

### Schema fix

`lib/schemas/admin.ts` `inviteMemberSchema` currently uses roles `owner | editor | viewer`. Fix to match `member_role_enum`: `owner | admin | member | viewer`.

---

## Invitation Flow

```
1. Admin opens /settings/team → clicks "Invite member"
2. InviteMemberModal: email + role (admin/member/viewer) + optional message
3. POST /api/org/[orgId]/invitations
   → Validate: email format, role, admin/owner check
   → INSERT into org_invitations (status: pending)
   → Send email via Resend: org name, inviter name, role, CTA → /join?token=xxx
   → INSERT into org_audit_log (action: invite_sent)
   → Return invitation row

4. Recipient clicks /join?token=xxx
   → GET /api/invitations/[token] — validate: exists, status=pending, not expired
   → If invalid/expired: show error with "request a new invitation" message
   → If valid + user is logged in:
       POST /api/invitations/[token]/accept
       → status=accepted, accepted_at=now()
       → INSERT into organization_members (org_id, user_id, role)
       → INSERT into org_audit_log (action: invite_accepted)
       → redirect /dashboard
   → If valid + user not logged in:
       Redirect /signup?invite=TOKEN (or /login?invite=TOKEN)
       After auth, /auth/callback detects invite param → calls accept → redirect /dashboard

5. Pending invitations visible in Team tab with Resend / Cancel actions
   → Resend: regenerates token (old one invalidated), sends new email
   → Cancel: sets status=cancelled
```

---

## Settings Tabs

### Team
- Active members list: avatar, name, email, role badge, joined date, role change dropdown (owner can change anyone; admin cannot change owner or other admins), remove button
- Pending invitations list: email, role, sent date, expires date, Resend / Cancel actions
- "Invite member" button → InviteMemberModal
- Owners see all controls. Admins can invite and remove members (not admins/owners).

### Modules
- Toggle cards for each module: Tax, Donors, Compliance, QuickBooks, and any future modules
- Toggle calls `PATCH /api/org/[orgId]` updating `modules` jsonb column
- Changes take effect immediately (middleware reads `modules` from DB on each request)
- Both owners and admins can toggle

### Organization
- Editable: org name, EIN (optional)
- Read-only: org type (set at onboarding — changing has too many downstream implications)
- Future: logo upload, brand color
- Save button calls `PATCH /api/org/[orgId]`
- Writes to org_audit_log on save

### Integrations
- QuickBooks connect/disconnect card (existing QB integration, surfaced here)
- Placeholder cards for future connectors (Salesforce, Fidelity Charitable, etc.) — each shows "Coming soon" so the tab doesn't feel empty

### Audit Log
- Filterable table: actor, action, target, date
- Filter by: date range, action type, actor
- Read-only, append-only
- Useful for compliance and board accountability

### Notifications
- Per-user email preferences: digest frequency (daily/weekly/never), alert types (new member joined, module changed, etc.)
- Stored in a `notification_prefs` jsonb column on `organization_members` (e.g. `{ digest: 'weekly', alerts: ['member_joined', 'module_changed'] }`)
- Calls `PATCH /api/org/[orgId]/members/[userId]/notifications`
- Note: the Notifications tab stores preferences only — actual notification sending (beyond invitations) is a future concern

---

## Email Template (Resend / React Email)

Subject: `You've been invited to join [Org Name] on Benevolence`

Content:
- Inviter name + org name
- Role they'll have
- Optional personal message if provided
- CTA button: "Accept invitation" → `/join?token=xxx`
- Link expires in 7 days notice
- Footer: if they don't know the sender, they can ignore this email

---

## Access Control

- `/settings/*` routes: middleware guards to `owner` and `admin` roles only (same pattern as `/admin/*`)
- API routes check `organization_members` role before any mutation
- Admins cannot elevate themselves to owner
- Admins cannot remove or change the role of other admins or the owner
- Only owners can invite/assign the `owner` role

---

## Navigation

- Add "Settings" link to sidebar nav with gear icon, visible to owner/admin only
- Add `/settings` to middleware auth guard list alongside `/dashboard/*` and `/admin/*`
- Add `/join` to public routes (no auth guard — unauthenticated users must be able to reach it)

---

## Future: AI Builder Tab

The `/settings` layout is designed to accommodate a future **Builder** tab where Claude Code — given context about the codebase, org configuration, and the org's expressed needs — can propose and apply customizations to the instance. A placeholder card in the Integrations tab can point to this: *"Customize this instance — coming soon."*

---

## Error Handling

- Expired token: clear message on `/join`, prompt user to ask for a new invite
- Already-accepted token: redirect to `/dashboard` with "You're already a member" toast
- Duplicate invite (same email already pending): return existing pending invite, don't create duplicate
- User already a member: reject with clear error in InviteMemberModal
- Resend failure: surface error toast, don't mark invite as sent

---

## Testing

- DB: invitation creation, acceptance, cancellation, expiry status
- API: auth guards on all routes, admin-cannot-change-owner constraint, duplicate invite rejection
- Email: Resend integration tested in staging with a real inbox
- `/join` flow: logged-in acceptance, signup-then-accept, expired token, already-accepted token
- Settings tabs: module toggle persists, org name update persists, audit log entries written on each action
