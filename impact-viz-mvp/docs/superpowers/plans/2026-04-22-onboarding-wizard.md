# Onboarding Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bare-bones welcome form and "Request a demo" CTA with a fully self-serve, conversational 5-step onboarding wizard that provisions a new org and lands the user on their dashboard.

**Architecture:** Six changes in dependency order: fix the TypeScript `OrgType` enum → update the landing CTA → update the login page → build the provision API route → build the Claude assist API route → rewrite the wizard UI. Each task is independently testable before moving to the next.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind v4, Supabase (service-role client for RPC), `@anthropic-ai/sdk`, Vitest + jsdom

---

## Pre-flight checks

Before starting, confirm the dev server runs:

```bash
cd /path/to/impact-viz-mvp
npm run dev
```

Expected: server starts on port 3000 with no TS errors. If there are TS errors, `npx tsc --noEmit` to see them before touching any files.

---

## Task 1: Fix `OrgType` to match the DB enum

The TypeScript `OrgType` in `lib/types/org.ts` is stale — it has values like `'daf'` and `'operating_nonprofit'` that do not exist in the database `org_type_enum`. Everything downstream breaks if we pass a value the DB doesn't recognise.

**Files:**
- Modify: `lib/types/org.ts:1`

- [ ] **Step 1: Write the failing type test**

Create `lib/types/__tests__/org.test.ts`:

```typescript
import { describe, it, expectTypeOf } from 'vitest';
import type { OrgType } from '../org';

describe('OrgType', () => {
  it('includes all DB enum values', () => {
    // Every value the DB org_type_enum accepts must be a valid OrgType
    const dbValues = [
      'private_foundation',
      'family_office',
      'daf_sponsor',
      'community_foundation',
      'nonprofit',
      'corporation',
      'individual',
    ] as const;

    // This will fail at compile time if any value is not assignable to OrgType
    dbValues.forEach((v) => {
      const _: OrgType = v;
    });
  });

  it('does not include removed values', () => {
    // 'daf' and 'operating_nonprofit' no longer exist in DB
    // @ts-expect-error — 'daf' is not a valid OrgType
    const _bad: OrgType = 'daf';
  });
});
```

- [ ] **Step 2: Run test — expect TS compile error**

```bash
npx vitest run lib/types/__tests__/org.test.ts
```

Expected: fails because `'daf'` is currently in `OrgType` so the `@ts-expect-error` line itself errors.

- [ ] **Step 3: Update `OrgType` to match DB**

In `lib/types/org.ts`, replace line 1:

```typescript
export type OrgType =
  | 'private_foundation'
  | 'family_office'
  | 'daf_sponsor'
  | 'community_foundation'
  | 'nonprofit'
  | 'corporation'
  | 'individual';
```

- [ ] **Step 4: Run test — expect pass**

```bash
npx vitest run lib/types/__tests__/org.test.ts
```

Expected: PASS

- [ ] **Step 5: Check for broken callers**

```bash
npx tsc --noEmit 2>&1 | head -40
```

If any file is now passing `'daf'` or `'operating_nonprofit'` to an `OrgType` field, update those callers. `SetupClient.tsx` will be fully rewritten in Task 6 so ignore errors there for now.

- [ ] **Step 6: Commit**

```bash
git add lib/types/org.ts lib/types/__tests__/org.test.ts
git commit -m "fix: align OrgType with DB org_type_enum"
```

---

## Task 2: Update landing page CTA

One-line change. "Request a demo" → "Get started →", pointing to `/login?signup=1`.

**Files:**
- Modify: `app/page.tsx` (the `href` and text of the primary CTA button)

- [ ] **Step 1: Find the line**

In `app/page.tsx`, the primary CTA is:
```tsx
<a
  href="/login"
  className="inline-flex items-center px-6 py-3 rounded-[2px] bg-azure text-white text-sm font-medium font-sans hover:bg-azure-deep transition-colors"
>
  Request a demo
</a>
```

- [ ] **Step 2: Update href and text**

```tsx
<a
  href="/login?signup=1"
  className="inline-flex items-center px-6 py-3 rounded-[2px] bg-azure text-white text-sm font-medium font-sans hover:bg-azure-deep transition-colors"
>
  Get started →
</a>
```

- [ ] **Step 3: Verify visually**

Open `http://localhost:3000` — confirm the button reads "Get started →". Click it — confirm it lands on `/login?signup=1` in the URL bar (the login page will still show sign-in mode until Task 3).

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: update landing CTA to Get started"
```

---

## Task 3: Login page defaults to sign-up mode when `?signup=1` is present

The login page at `app/login/page.tsx` already has `mode` state (`'signin' | 'signup'`). It currently always starts in `'signin'`. We read the URL param and default to `'signup'` when `?signup=1` is present.

**Files:**
- Modify: `app/login/page.tsx:25` (the `useState` for `mode`)

- [ ] **Step 1: Locate the mode state**

In `app/login/page.tsx`, inside `LoginPageContent`, find:

```typescript
const [mode, setMode] = useState<'signin' | 'signup'>('signin');
```

- [ ] **Step 2: Read `?signup` param and use it as initial state**

`useSearchParams` is already imported and `sp` is already in scope. Replace the `mode` useState line:

```typescript
const [mode, setMode] = useState<'signin' | 'signup'>(
  sp.get('signup') === '1' ? 'signup' : 'signin'
);
```

- [ ] **Step 3: Verify visually**

- Visit `http://localhost:3000/login` — should show "Sign in" form (unchanged)
- Visit `http://localhost:3000/login?signup=1` — should show "Create account" form immediately

- [ ] **Step 4: Commit**

```bash
git add app/login/page.tsx
git commit -m "feat: default login page to signup mode when ?signup=1"
```

---

## Task 4: `POST /api/onboarding/provision` route

New API route that calls the `provision_organization()` Supabase RPC (service-role only), then creates a default portfolio linked to the new org. Returns `{ org_id, portfolio_id }`.

**Files:**
- Create: `app/api/onboarding/provision/route.ts`
- Create: `app/api/onboarding/provision/__tests__/route.test.ts`

### What the route does

1. Authenticate the caller — must be a logged-in user
2. Verify they don't already have an org (prevent double-provision)
3. Validate the request body
4. Call `provision_organization()` via service-role client (bypasses RLS — required because the RPC has `REVOKE ALL ... FROM PUBLIC`)
5. Create a portfolio row linked to the org
6. Return `{ org_id, portfolio_id }`

### Module mapping

The wizard collects a modules object like `{ tax: true, donors: false, compliance: true, quickbooks: false }`. Pass `null` for `p_modules` if the user didn't customize (lets the DB apply org-type defaults), or pass the explicit jsonb object if they did customize.

- [ ] **Step 1: Write the test**

Create `app/api/onboarding/provision/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the validation logic in isolation — DB calls are mocked
const mockRpc = vi.fn();
const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockSingle = vi.fn();
const mockEq = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-123' } },
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: mockEq.mockResolvedValue({ data: [], error: null }),
      })),
    })),
  })),
  createAdminClient: vi.fn(() => ({
    rpc: mockRpc,
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: mockSingle,
        })),
      })),
    })),
  })),
}));

describe('POST /api/onboarding/provision — validation', () => {
  it('returns 400 if name is missing', async () => {
    const { POST } = await import('../route');
    const req = new Request('http://localhost/api/onboarding/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_type: 'private_foundation' }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/name/i);
  });

  it('returns 400 if org_type is not a valid DB enum value', async () => {
    const { POST } = await import('../route');
    const req = new Request('http://localhost/api/onboarding/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Org', org_type: 'daf' }), // 'daf' is old/invalid
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/org_type/i);
  });
});
```

- [ ] **Step 2: Run test — expect fail (route doesn't exist)**

```bash
npx vitest run app/api/onboarding/provision/__tests__/route.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the route**

Create `app/api/onboarding/provision/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import type { OrgType } from '@/lib/types/org';

export const dynamic = 'force-dynamic';

const VALID_ORG_TYPES: OrgType[] = [
  'private_foundation',
  'family_office',
  'daf_sponsor',
  'community_foundation',
  'nonprofit',
  'corporation',
  'individual',
];

export async function POST(req: NextRequest) {
  try {
    // 1. Auth check
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // 2. Parse + validate body
    const body = await req.json();
    const { name, org_type, ein, modules } = body as {
      name?: string;
      org_type?: string;
      ein?: string;
      modules?: Record<string, boolean> | null;
    };

    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (!org_type || !VALID_ORG_TYPES.includes(org_type as OrgType)) {
      return NextResponse.json(
        { error: `org_type must be one of: ${VALID_ORG_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // 3. Prevent double-provision — user already has an org
    const { data: existing } = await supabase
      .from('organization_members')
      .select('org_id')
      .eq('user_id', user.id);
    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: 'User already belongs to an organization' },
        { status: 409 }
      );
    }

    // 4. Provision org via RPC (service role required — PUBLIC access revoked)
    const admin = createAdminClient();
    const { data: orgId, error: rpcError } = await admin.rpc('provision_organization', {
      p_name: name.trim(),
      p_org_type: org_type,
      p_owner_user_id: user.id,
      p_ein: ein?.trim() || null,
      p_modules: modules ?? null, // null = use org-type defaults from DB
    });

    if (rpcError) {
      console.error('provision_organization RPC error:', rpcError);
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    const org_id = orgId as string;

    // 5. Create a default portfolio linked to the new org
    const { data: portfolio, error: portfolioError } = await admin
      .from('portfolios')
      .insert({
        org_id,
        name: name.trim(),
        base_currency: 'USD',
      })
      .select('id')
      .single();

    if (portfolioError) {
      console.error('Portfolio creation error:', portfolioError);
      // Org was created successfully — return org_id without portfolio_id
      return NextResponse.json({ org_id, portfolio_id: null }, { status: 201 });
    }

    // 6. Add owner to portfolio_members (no org_id column — portfolio_id is enough)
    await admin.from('portfolio_members').insert({
      portfolio_id: portfolio.id,
      user_id: user.id,
      role: 'owner',
    });

    return NextResponse.json({ org_id, portfolio_id: portfolio.id }, { status: 201 });
  } catch (err: any) {
    console.error('Provision error:', err);
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
npx vitest run app/api/onboarding/provision/__tests__/route.test.ts
```

Expected: PASS

- [ ] **Step 5: Smoke test with curl**

With the dev server running and a valid session cookie (sign in at `/login` first, then grab the cookie from DevTools → Application → Cookies → `sb-*`):

```bash
curl -X POST http://localhost:3000/api/onboarding/provision \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{"name":"Test Foundation","org_type":"private_foundation"}'
```

Expected: `{"org_id":"<uuid>","portfolio_id":"<uuid>"}` with status 201.

- [ ] **Step 6: Commit**

```bash
git add app/api/onboarding/provision/
git commit -m "feat: add /api/onboarding/provision route"
```

---

## Task 5: `POST /api/onboarding/assist` route

New API route that calls Claude with a tight prompt to explain org types or modules. Returns a 2–3 sentence plain-English answer.

**Files:**
- Create: `app/api/onboarding/assist/route.ts`
- Create: `app/api/onboarding/assist/__tests__/route.test.ts`

- [ ] **Step 1: Write the test**

Create `app/api/onboarding/assist/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'This is a helpful explanation.' }],
      }),
    },
  })),
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-123' } },
      }),
    },
  })),
}));

describe('POST /api/onboarding/assist', () => {
  it('returns 400 if question type is unknown', async () => {
    const { POST } = await import('../route');
    const req = new Request('http://localhost/api/onboarding/assist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'unknown_type', context: {} }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('returns 200 with answer for org_type_help', async () => {
    const { POST } = await import('../route');
    const req = new Request('http://localhost/api/onboarding/assist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'org_type_help',
        context: { org_name: 'Thornwood Foundation' },
      }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.answer).toBe('string');
    expect(json.answer.length).toBeGreaterThan(0);
  });

  it('returns 200 with answer for module_help', async () => {
    const { POST } = await import('../route');
    const req = new Request('http://localhost/api/onboarding/assist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'module_help',
        context: { org_name: 'Thornwood Foundation', org_type: 'private_foundation', module: 'compliance' },
      }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.answer).toBe('string');
  });
});
```

- [ ] **Step 2: Run test — expect fail**

```bash
npx vitest run app/api/onboarding/assist/__tests__/route.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the route**

Create `app/api/onboarding/assist/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const MODULE_LABELS: Record<string, string> = {
  tax: 'Tax Center',
  donors: 'Donor CRM',
  compliance: 'Compliance Calendar',
  quickbooks: 'QuickBooks Sync',
};

const ORG_TYPE_DESCRIPTIONS: Record<string, string> = {
  private_foundation: 'Private Foundation — funded by one family/individual, makes grants from investment returns, files Form 990-PF',
  family_office: 'Family Office — manages investments and giving for a wealthy family, often QB-integrated',
  daf_sponsor: 'DAF Sponsor — manages donor-advised funds, handles many donors recommending grants',
  community_foundation: 'Community Foundation — pools gifts from many donors to serve a geographic region',
  nonprofit: 'Nonprofit — operating charity that raises money and runs programs',
  corporation: 'Corporate Giving Program — manages a company\'s philanthropic activities',
  individual: 'Individual Philanthropist — a single person managing their own giving',
};

type QuestionType = 'org_type_help' | 'module_help';

function buildPrompt(question: QuestionType, context: Record<string, string>): string {
  if (question === 'org_type_help') {
    return `You are the onboarding assistant for Benevolence, a philanthropic portfolio management platform. A new user named "${context.org_name ?? 'the user'}" is setting up their account and isn't sure which organization type applies to them. Explain the differences between the available types in 2-3 plain-English sentences aimed at a foundation executive, then ask which sounds closest. Available types:\n${Object.values(ORG_TYPE_DESCRIPTIONS).join('\n')}`;
  }

  if (question === 'module_help') {
    const moduleLabel = MODULE_LABELS[context.module] ?? context.module;
    const orgDesc = ORG_TYPE_DESCRIPTIONS[context.org_type] ?? context.org_type;
    return `You are the onboarding assistant for Benevolence. A user setting up a "${orgDesc}" account wants to know what the "${moduleLabel}" feature does. Explain it in 2 plain-English sentences. Be specific about what it enables and who typically uses it. Do not use jargon.`;
  }

  throw new Error('Unknown question type');
}

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { question, context } = body as {
      question: string;
      context: Record<string, string>;
    };

    const validQuestions: QuestionType[] = ['org_type_help', 'module_help'];
    if (!validQuestions.includes(question as QuestionType)) {
      return NextResponse.json(
        { error: `question must be one of: ${validQuestions.join(', ')}` },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'AI not configured' }, { status: 500 });
    }

    const client = new Anthropic({ apiKey });
    const prompt = buildPrompt(question as QuestionType, context ?? {});

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }],
    });

    const answer = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');

    return NextResponse.json({ answer });
  } catch (err: any) {
    console.error('Assist error:', err);
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
npx vitest run app/api/onboarding/assist/__tests__/route.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/onboarding/assist/
git commit -m "feat: add /api/onboarding/assist route for wizard AI help"
```

---

## Task 6: Rewrite `SetupClient.tsx` as the conversational wizard

This is the main UI. `app/welcome/SetupClient.tsx` is replaced entirely. The wizard manages a `messages` array in state — each step appends bubbles. The nav bar at the top mirrors the landing page brand.

**Files:**
- Replace: `app/welcome/SetupClient.tsx`

### Key types (internal to the component)

```typescript
type BubbleKind = 'bot' | 'user' | 'help';

interface Message {
  id: string;
  kind: BubbleKind;
  text: string;
}

type WizardStep = 'org_name' | 'org_type' | 'ein' | 'ein_input' | 'modules' | 'provisioning' | 'done';
```

### Module metadata

The toggleable modules the wizard shows (Dashboard and Charities are always on — not toggleable):

```typescript
const MODULES = [
  { key: 'tax',         label: 'Tax Center' },
  { key: 'donors',      label: 'Donor CRM' },
  { key: 'compliance',  label: 'Compliance' },
  { key: 'quickbooks',  label: 'QuickBooks' },
] as const;
type ModuleKey = typeof MODULES[number]['key'];
```

### Org type options

```typescript
const ORG_TYPES = [
  { value: 'private_foundation',  label: 'Private Foundation' },
  { value: 'family_office',       label: 'Family Office' },
  { value: 'daf_sponsor',         label: 'DAF Sponsor' },
  { value: 'community_foundation',label: 'Community Foundation' },
  { value: 'nonprofit',           label: 'Nonprofit' },
  { value: 'individual',          label: 'Individual' },
] as const;
```

### Module defaults by org type (mirrors DB `org_type_defaults`)

```typescript
const MODULE_DEFAULTS: Record<string, Record<ModuleKey, boolean>> = {
  private_foundation:  { tax: true,  donors: false, compliance: true,  quickbooks: false },
  family_office:       { tax: true,  donors: false, compliance: false, quickbooks: true  },
  daf_sponsor:         { tax: true,  donors: true,  compliance: true,  quickbooks: false },
  community_foundation:{ tax: false, donors: true,  compliance: true,  quickbooks: false },
  nonprofit:           { tax: false, donors: true,  compliance: true,  quickbooks: true  },
  corporation:         { tax: true,  donors: false, compliance: false, quickbooks: true  },
  individual:          { tax: true,  donors: false, compliance: false, quickbooks: false },
};
```

- [ ] **Step 1: Write the component**

Replace the entire contents of `app/welcome/SetupClient.tsx` with:

```typescript
'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { OrgType } from '@/lib/types/org';

// ── Types ─────────────────────────────────────────────────────────────────────

type BubbleKind = 'bot' | 'user' | 'help';
interface Message { id: string; kind: BubbleKind; text: string; }
type WizardStep = 'org_name' | 'org_type' | 'ein' | 'ein_input' | 'modules' | 'provisioning' | 'done';

const MODULES = [
  { key: 'tax',         label: 'Tax Center' },
  { key: 'donors',      label: 'Donor CRM' },
  { key: 'compliance',  label: 'Compliance' },
  { key: 'quickbooks',  label: 'QuickBooks' },
] as const;
type ModuleKey = typeof MODULES[number]['key'];

const ORG_TYPES: { value: OrgType; label: string }[] = [
  { value: 'private_foundation',   label: 'Private Foundation' },
  { value: 'family_office',        label: 'Family Office' },
  { value: 'daf_sponsor',          label: 'DAF Sponsor' },
  { value: 'community_foundation', label: 'Community Foundation' },
  { value: 'nonprofit',            label: 'Nonprofit' },
  { value: 'individual',           label: 'Individual' },
];

const MODULE_DEFAULTS: Record<string, Record<ModuleKey, boolean>> = {
  private_foundation:   { tax: true,  donors: false, compliance: true,  quickbooks: false },
  family_office:        { tax: true,  donors: false, compliance: false, quickbooks: true  },
  daf_sponsor:          { tax: true,  donors: true,  compliance: true,  quickbooks: false },
  community_foundation: { tax: false, donors: true,  compliance: true,  quickbooks: false },
  nonprofit:            { tax: false, donors: true,  compliance: true,  quickbooks: true  },
  corporation:          { tax: true,  donors: false, compliance: false, quickbooks: true  },
  individual:           { tax: true,  donors: false, compliance: false, quickbooks: false },
};

function uid() { return Math.random().toString(36).slice(2); }

// ── Sub-components ────────────────────────────────────────────────────────────

function Bubble({ msg }: { msg: Message }) {
  if (msg.kind === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-azure text-white text-sm leading-relaxed px-4 py-2.5 max-w-[82%]"
          style={{ borderRadius: '12px 2px 12px 12px' }}>
          {msg.text}
        </div>
      </div>
    );
  }
  if (msg.kind === 'help') {
    return (
      <div className="flex gap-3 items-start">
        <Avatar />
        <div className="text-sm leading-relaxed px-4 py-2.5 max-w-[82%] italic"
          style={{ background: '#f0f7fb', border: '1px solid var(--color-azure-soft, #b8d0df)', borderRadius: '2px 12px 12px 12px', color: 'var(--color-azure-deep, #2f5c7a)', fontFamily: 'var(--font-serif)' }}>
          {msg.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3 items-start">
      <Avatar />
      <div className="bg-creme-warm text-ink text-sm leading-relaxed px-4 py-2.5 max-w-[82%]"
        style={{ borderRadius: '2px 12px 12px 12px' }}>
        {msg.text}
      </div>
    </div>
  );
}

function Avatar() {
  return (
    <div className="w-8 h-8 rounded-full bg-azure text-white flex items-center justify-center flex-shrink-0 mt-0.5"
      style={{ fontFamily: 'var(--font-serif)', fontSize: '0.875rem', fontWeight: 600 }}>
      B.
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SetupClient() {
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<Message[]>([
    { id: uid(), kind: 'bot', text: "Welcome to Benevolence. I'll help you set up your workspace in about 2 minutes. What's the name of your organization?" },
  ]);
  const [step, setStep] = useState<WizardStep>('org_name');
  const [inputValue, setInputValue] = useState('');

  // Collected answers
  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState<OrgType | null>(null);
  const [ein, setEin] = useState('');
  const [einSkipped, setEinSkipped] = useState(false);
  const [modules, setModules] = useState<Record<ModuleKey, boolean>>({ tax: false, donors: false, compliance: false, quickbooks: false });
  const [loadingHelp, setLoadingHelp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function addMessage(kind: BubbleKind, text: string) {
    setMessages(prev => [...prev, { id: uid(), kind, text }]);
  }

  // ── Step handlers ──────────────────────────────────────────────────────────

  function handleOrgNameSubmit() {
    const name = inputValue.trim();
    if (!name) return;
    setOrgName(name);
    setInputValue('');
    addMessage('user', name);
    setTimeout(() => {
      addMessage('bot', `What type of organization is ${name}?`);
      setStep('org_type');
    }, 300);
  }

  function handleOrgTypeSelect(value: OrgType) {
    const label = ORG_TYPES.find(t => t.value === value)?.label ?? value;
    setOrgType(value);
    addMessage('user', label);
    // Apply module defaults for this org type
    setModules(MODULE_DEFAULTS[value] ?? { tax: false, donors: false, compliance: false, quickbooks: false });
    setTimeout(() => {
      addMessage('bot', `Do you have an EIN (Employer Identification Number)? This unlocks charity verification and tax features — you can always add it later.`);
      setStep('ein');
    }, 300);
  }

  async function handleHelpMeDecide() {
    setLoadingHelp(true);
    addMessage('bot', 'Let me explain the differences…');
    try {
      const res = await fetch('/api/onboarding/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'org_type_help', context: { org_name: orgName } }),
      });
      const data = await res.json();
      if (res.ok && data.answer) {
        addMessage('help', data.answer);
      }
    } catch {
      // Silently fall through — user can still pick from chips
    } finally {
      setLoadingHelp(false);
    }
  }

  async function handleModuleHelp(moduleKey: ModuleKey) {
    if (!orgType) return;
    setLoadingHelp(true);
    try {
      const res = await fetch('/api/onboarding/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: 'module_help',
          context: { org_name: orgName, org_type: orgType, module: moduleKey },
        }),
      });
      const data = await res.json();
      if (res.ok && data.answer) {
        addMessage('help', data.answer);
      }
    } catch {
      // Silently fall through
    } finally {
      setLoadingHelp(false);
    }
  }

  function handleEinSubmit(skip: boolean) {
    if (skip) {
      setEinSkipped(true);
      addMessage('user', 'Skip for now');
    } else {
      const val = inputValue.trim();
      // Format validation: XX-XXXXXXX
      if (!/^\d{2}-\d{7}$/.test(val)) {
        setError('Please enter a valid EIN in the format XX-XXXXXXX, or skip for now.');
        return;
      }
      setEin(val);
      setInputValue('');
      addMessage('user', val);
    }
    setError(null);
    setTimeout(() => {
      const orgLabel = ORG_TYPES.find(t => t.value === orgType)?.label ?? orgType;
      addMessage('bot', `Based on ${orgLabel}, I've turned on the features most relevant to you. Tap any to learn more or toggle off.`);
      setStep('modules');
    }, 300);
  }

  function toggleModule(key: ModuleKey) {
    setModules(prev => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleProvision() {
    setStep('provisioning');
    addMessage('bot', `All set. Creating your ${orgName} workspace now…`);
    setError(null);
    try {
      const res = await fetch('/api/onboarding/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: orgName,
          org_type: orgType,
          ein: einSkipped ? undefined : ein || undefined,
          modules,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        setStep('modules');
        return;
      }
      setStep('done');
      const dest = data.portfolio_id
        ? `/dashboard?portfolio_id=${encodeURIComponent(data.portfolio_id)}`
        : '/dashboard';
      router.replace(dest);
    } catch {
      setError('Network error. Please check your connection and try again.');
      setStep('modules');
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const chipClass = "text-xs font-medium px-3 py-1.5 rounded-full border transition-colors cursor-pointer select-none";
  const chipDefault = "bg-white border-azure-soft text-azure-deep hover:bg-[#f0f7fb]";
  const chipSelected = "bg-azure border-azure text-white";
  const chipHelp = "bg-white border-ink-10 text-ink-60 italic hover:border-azure-soft";

  return (
    <div className="min-h-screen bg-creme flex flex-col font-sans antialiased">

      {/* Nav */}
      <nav className="flex items-center justify-between px-14 py-5 border-b border-ink-10">
        <Link href="/" style={{ fontFamily: 'var(--font-serif)', fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-azure-deep)' }}>
          Benevolence<span style={{ color: 'var(--color-coral)' }}>.</span>
        </Link>
        <span className="text-xs text-ink-30 tracking-wide font-medium uppercase">Setting up your workspace</span>
      </nav>

      {/* Chat thread */}
      <div className="flex-1 flex justify-center py-10 px-4 overflow-y-auto">
        <div className="w-full max-w-lg flex flex-col gap-4">

          {messages.map(msg => <Bubble key={msg.id} msg={msg} />)}

          {/* Step-specific controls rendered below the last message */}

          {/* Step: org_name — text input handled via input bar below */}

          {/* Step: org_type — chips */}
          {step === 'org_type' && (
            <div className="flex flex-wrap gap-2 pl-11">
              {ORG_TYPES.map(t => (
                <button key={t.value} onClick={() => handleOrgTypeSelect(t.value)}
                  className={`${chipClass} ${chipDefault}`}>
                  {t.label}
                </button>
              ))}
              <button onClick={handleHelpMeDecide} disabled={loadingHelp}
                className={`${chipClass} ${chipHelp}`}>
                {loadingHelp ? '…' : '✦ Help me decide'}
              </button>
            </div>
          )}

          {/* Step: ein — two choices + optional input */}
          {step === 'ein' && (
            <div className="pl-11 flex flex-col gap-2">
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => setStep('ein_input')}
                  className={`${chipClass} ${chipDefault}`}>
                  Yes, I have it
                </button>
                <button onClick={() => handleEinSubmit(true)}
                  className={`${chipClass} ${chipDefault}`}>
                  Skip for now
                </button>
              </div>
            </div>
          )}

          {/* Step: ein_input — text field shown after "Yes I have it" */}
          {step === 'ein_input' && (
            <div className="pl-11 flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="12-3456789"
                  value={inputValue}
                  onChange={e => { setInputValue(e.target.value); setError(null); }}
                  onKeyDown={e => { if (e.key === 'Enter') handleEinSubmit(false); }}
                  className="border border-ink-10 rounded-full px-4 py-1.5 text-sm focus:outline-none focus:border-azure-soft bg-white"
                  style={{ width: '160px' }}
                  autoFocus
                />
                <button onClick={() => handleEinSubmit(false)}
                  className="bg-azure text-white text-xs font-semibold px-4 py-1.5 rounded-full hover:bg-azure-deep transition-colors">
                  Continue →
                </button>
              </div>
              {error && <p className="text-xs text-rose-600" role="alert">{error}</p>}
            </div>
          )}

          {/* Step: modules */}
          {step === 'modules' && (
            <div className="pl-11 flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2 max-w-xs">
                {MODULES.map(m => (
                  <div key={m.key} className="flex items-center gap-1.5">
                    <button
                      onClick={() => toggleModule(m.key)}
                      className={`${chipClass} flex items-center gap-1.5 ${modules[m.key] ? chipSelected : chipDefault}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${modules[m.key] ? 'bg-white' : 'bg-azure-soft'}`} />
                      {m.label}
                    </button>
                    <button
                      onClick={() => handleModuleHelp(m.key)}
                      disabled={loadingHelp}
                      className="text-ink-30 hover:text-azure text-xs leading-none"
                      title={`What is ${m.label}?`}>
                      ?
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-1">
                <button onClick={handleProvision}
                  className="bg-azure text-white text-xs font-semibold px-5 py-2 rounded-full hover:bg-azure-deep transition-colors">
                  Looks good →
                </button>
              </div>
              {error && <p className="text-xs text-rose-600 mt-1" role="alert">{error}</p>}
            </div>
          )}

          {/* Step: provisioning spinner */}
          {step === 'provisioning' && (
            <div className="pl-11">
              <div className="w-4 h-4 border-2 border-azure border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input bar — only shown during org_name step */}
      {step === 'org_name' && (
        <div className="border-t border-ink-10 px-4 py-4 flex justify-center">
          <div className="w-full max-w-lg flex gap-2">
            <input
              type="text"
              placeholder="Your organization name…"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleOrgNameSubmit(); }}
              className="flex-1 border border-ink-10 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-azure-soft bg-white"
              autoFocus
            />
            <button
              onClick={handleOrgNameSubmit}
              disabled={!inputValue.trim()}
              className="bg-azure text-white text-sm font-semibold px-5 py-2 rounded-full hover:bg-azure-deep transition-colors disabled:opacity-50">
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "SetupClient|welcome"
```

Expected: no errors for `SetupClient.tsx`.

- [ ] **Step 3: Test the wizard manually**

Start the dev server (`npm run dev`) and sign up as a brand new user:

1. Visit `http://localhost:3000` — confirm "Get started →" button is present
2. Click it — should land on `/login?signup=1` in signup mode
3. Create an account with a fresh email
4. Should be redirected to `/welcome`
5. Walk through all 5 steps:
   - Type an org name → press Enter → B. asks org type
   - Click "✦ Help me decide" → a help bubble appears in Playfair italic
   - Select an org type → module step loads with correct defaults
   - Tap a module's `?` button → Claude explains it
   - Toggle a module off → chip updates visually
   - Click "Looks good →" → spinner appears → redirect to `/dashboard?portfolio_id=...`
6. Confirm the dashboard loads with the org name in the nav

- [ ] **Step 4: Test EIN validation**

On the EIN step, click "Yes, I have it" then type `badformat` and press Enter — confirm the error message `"Please enter a valid EIN in the format XX-XXXXXXX, or skip for now."` appears without crashing.

Type `12-3456789` and press Enter — confirm it proceeds to the modules step.

- [ ] **Step 5: Test error recovery**

If you want to test the provisioning error path, temporarily change the route URL in the component to `/api/onboarding/provision-BROKEN` and confirm the error message appears and the wizard stays on the modules step (not a blank screen).

- [ ] **Step 6: Commit**

```bash
git add app/welcome/SetupClient.tsx
git commit -m "feat: replace SetupClient with conversational onboarding wizard"
```

---

## Task 7: Final smoke test + cleanup

- [ ] **Step 1: Full type check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
```

Expected: all pass.

- [ ] **Step 3: Confirm `ConditionalHeader` excludes `/welcome`**

In `components/ConditionalHeader.tsx`, check that `/welcome` is in `HEADERLESS_ROUTES`:

```typescript
const HEADERLESS_ROUTES = ["/", "/login", "/signup"];
```

`/welcome` is NOT in this list — and that's correct. The wizard renders its own nav inside `SetupClient`, so the app `Header` would double-render. Add `/welcome` to the list:

```typescript
const HEADERLESS_ROUTES = ["/", "/login", "/signup", "/welcome"];
```

- [ ] **Step 4: Verify no double header on `/welcome`**

Visit `/welcome` while logged in (signed up but no org yet, or use a fresh account). Confirm only the wizard's own "Benevolence." nav appears, not two navbars.

- [ ] **Step 5: Final commit**

```bash
git add components/ConditionalHeader.tsx
git commit -m "fix: exclude /welcome from app Header (wizard has its own nav)"
```

---

## Done

The full self-serve onboarding flow is live:

- Landing page "Get started →" → `/login?signup=1` → create account → `/welcome` → conversational wizard → `/dashboard?portfolio_id=...`
- Claude assist on "Help me decide" and module `?` taps
- EIN format validated client-side (`XX-XXXXXXX`)
- Provisioning via `provision_organization()` RPC with module overrides
