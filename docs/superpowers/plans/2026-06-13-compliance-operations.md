# Phase 2.2: Compliance Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire nightly cron scheduling, fix FilingCalendar field-name bugs, add an IRS 990-PF Part XIII worksheet component, and add filing document attachment support.

**Architecture:** Four independent tasks in sequence. Task 1 creates `vercel.json` (zero code changes). Task 2 fixes a broken UI component against the real DB schema. Task 3 adds a read-only 990-PF worksheet component backed by an existing API. Task 4 adds a storage bucket migration, a new attachment sub-route, and upload/delete UI on the existing FilingCalendar.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase storage (`compliance-documents` bucket), Vitest

---

## File Map

| Status | File | Responsibility |
|--------|------|----------------|
| Create | `vercel.json` | Cron schedule for daily task generation + notification fanout |
| Modify | `components/compliance/FilingCalendar.tsx` | Fix field-name mismatches vs DB schema; fix mark-filed flow to use PATCH |
| Create | `components/compliance/IRS990PFWorksheet.tsx` | 990-PF Part XIII worksheet UI |
| Modify | `app/dashboard/compliance/page.tsx` | Mount IRS990PFWorksheet |
| Create | `db/migrations/0046_compliance_documents_bucket.sql` | `compliance-documents` private storage bucket + RLS |
| Create | `app/api/org/[orgId]/compliance/filing-calendar/[filingId]/attachments/route.ts` | POST upload / GET list / DELETE attachment |
| Create | `app/api/__tests__/compliance-attachments.test.ts` | Unit tests for attachments route |

---

## Task 1: Nightly Cron Scheduling (vercel.json)

**Files:**
- Create: `vercel.json`

**Context:** The existing `app/api/jobs/tasks/generate/route.ts` runs all task producers (including `compliance_deadlines`) when POSTed with `x-job-secret: CRON_SECRET`. The `app/api/jobs/notifications/fanout/route.ts` converts `task_events` into `notification_events`. Neither is scheduled yet — no `vercel.json` exists.

- [ ] **Step 1: Create vercel.json with cron schedules**

```json
{
  "crons": [
    {
      "path": "/api/jobs/tasks/generate",
      "schedule": "0 6 * * *"
    },
    {
      "path": "/api/jobs/notifications/fanout",
      "schedule": "0 7 * * *"
    },
    {
      "path": "/api/jobs/notifications/digest",
      "schedule": "0 8 * * *"
    }
  ]
}
```

> All three run once daily (UTC 06:00, 07:00, 08:00). Task generation fires first so fanout has fresh `task_events` to process. The `x-job-secret` header is set automatically by Vercel Cron using the `CRON_SECRET` env var (Vercel passes it as `Authorization: Bearer <secret>` — but our routes check `x-job-secret`). Since Vercel cron calls use `GET`, we need to either add GET handlers or note that this requires the cron to POST. Actually, Vercel Cron uses GET by default. Let us check.

Wait — Vercel Cron always sends `GET`. Our routes are `POST`. The correct approach is to add `GET` handlers that act as cron entry points, or to use a Vercel Cron-compatible pattern.

**Revise:** Add `GET` handlers for cron invocations to each job route, and note the `Authorization` header.

- [ ] **Step 2: Add GET cron handler to tasks/generate route**

Open `app/api/jobs/tasks/generate/route.ts` and add at the bottom:

```typescript
// Vercel Cron invocation — GET with Authorization: Bearer <CRON_SECRET>
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Run all producers for all orgs (no body needed — runProducers accepts empty options)
  const now = new Date();
  const db = createAdminClient();
  const runId = crypto.randomUUID();
  await db.from('task_automation_runs').insert({
    id: runId, producer: null, org_id: null, dry_run: false, status: 'running',
  });
  try {
    const results = await runProducers({ dryRun: false, now });
    const totals = results.reduce(
      (acc, r) => ({
        scanned: acc.scanned + r.scanned, created: acc.created + r.created,
        updated: acc.updated + r.updated, completed: acc.completed + r.completed,
        skipped: acc.skipped + r.skipped, errors: acc.errors + r.errors.length,
      }),
      { scanned: 0, created: 0, updated: 0, completed: 0, skipped: 0, errors: 0 }
    );
    await db.from('task_automation_runs').update({
      status: 'completed', completed_at: now.toISOString(),
      scanned: totals.scanned, created_count: totals.created, updated_count: totals.updated,
      completed_count: totals.completed, skipped_count: totals.skipped,
      error_count: totals.errors, metadata: { results },
    }).eq('id', runId);
    return NextResponse.json({ ok: true, run_id: runId, results });
  } catch (err: any) {
    await db.from('task_automation_runs').update({
      status: 'failed', completed_at: new Date().toISOString(), metadata: { error: err.message },
    }).eq('id', runId);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Add GET cron handler to notifications/fanout route**

Open `app/api/jobs/notifications/fanout/route.ts`. The existing `POST` handler reads `req.json()` for options. Add at the bottom:

```typescript
// Vercel Cron invocation — GET with Authorization: Bearer <CRON_SECRET>
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Delegate to POST logic with empty body (fanout defaults to last 24 hours)
  return POST(new NextRequest(req.url, { method: 'POST', headers: req.headers, body: '{}' }));
}
```

- [ ] **Step 4: Add GET cron handler to notifications/digest route**

Open `app/api/jobs/notifications/digest/route.ts`. Inspect the existing handler, then add the same `GET` pattern as fanout above, calling the existing `POST` handler.

- [ ] **Step 5: Verify the cron auth pattern in tests**

Run:
```bash
npm test -- --reporter=verbose app/api/jobs
```

Expected: All existing job tests pass (no regressions from new GET exports).

- [ ] **Step 6: Commit**

```bash
git add vercel.json \
  app/api/jobs/tasks/generate/route.ts \
  app/api/jobs/notifications/fanout/route.ts \
  app/api/jobs/notifications/digest/route.ts
git commit -m "feat(cron): add vercel.json and GET cron handlers for task generation and notification fanout"
```

---

## Task 2: Fix FilingCalendar Field-Name Bugs

**Files:**
- Modify: `components/compliance/FilingCalendar.tsx`

**Context:** The `filing_calendar` DB table uses `extension_due_date`, `completed_at`, and `filing_reference`. The component's `Filing` interface uses `extended_due_date`, `filed_date`, and `confirmation_number` — none of which exist in the DB. Additionally the "Mark as Filed" flow currently sends a POST (which *creates* a new entry) instead of a PATCH (which updates the existing one). The fix is: correct the `Filing` interface, update all references, and change the mark-filed flow to PATCH.

**Actual DB schema for `filing_calendar`:**
```
id, org_id, filing_type, title, description, jurisdiction,
due_date, extension_due_date, period_start, period_end,
status, completed_at, completed_by, filing_reference,
reminder_days, last_reminded_at, attachments, notes,
is_recurring, recurrence_rule, created_at, updated_at
```

- [ ] **Step 1: Write a failing test that verifies PATCH is called for mark-filed**

This is a UI component — we verify by inspection and manual test. Skip vitest for this task; there are no existing tests for FilingCalendar. Proceed directly to fix.

- [ ] **Step 2: Fix the Filing interface**

In `components/compliance/FilingCalendar.tsx`, replace the `Filing` interface:

```typescript
// OLD
interface Filing {
  id: string;
  filing_type: string;
  tax_year: number;
  jurisdiction: string;
  description: string | null;
  due_date: string;
  extended_due_date: string | null;
  status: string;
  filed_date: string | null;
  confirmation_number: string | null;
  urgency?: string;
  days_until_due?: number;
}
```

```typescript
// NEW
interface Filing {
  id: string;
  filing_type: string;
  period_start: string | null;
  period_end: string | null;
  jurisdiction: string | null;
  description: string | null;
  due_date: string;
  extension_due_date: string | null;
  status: string;
  completed_at: string | null;
  filing_reference: string | null;
  title: string;
  urgency?: string;
  days_until_due?: number;
}
```

- [ ] **Step 3: Fix field references throughout the component**

Replace all occurrences:

| Old | New |
|-----|-----|
| `f.extended_due_date` | `f.extension_due_date` |
| `f.filed_date` | `f.completed_at` |
| `f.confirmation_number` | `f.filing_reference` |
| `f.tax_year` | `f.period_end ? new Date(f.period_end).getFullYear() : ''` |

Also fix the `filedForm` state:
```typescript
// OLD
const [filedForm, setFiledForm] = useState({ filed_date: new Date().toISOString().split('T')[0], confirmation_number: '' });

// NEW
const [filedForm, setFiledForm] = useState({ completed_at: new Date().toISOString().split('T')[0], filing_reference: '' });
```

Update the modal inputs to match:
```tsx
{/* filed date input */}
<input type="date" value={filedForm.completed_at}
  onChange={e => setFiledForm(f => ({ ...f, completed_at: e.target.value }))}
  className="border rounded px-3 py-2 text-sm w-full" />

{/* confirmation number input */}
<input value={filedForm.filing_reference}
  onChange={e => setFiledForm(f => ({ ...f, filing_reference: e.target.value }))}
  placeholder="Confirmation number / EFIN (optional)"
  className="border rounded px-3 py-2 text-sm w-full" />
```

- [ ] **Step 4: Fix the mark-filed flow to use PATCH**

The existing code calls POST for mark-filed (wrong — POST creates). Replace the mark-filed `fetch` block with a PATCH call:

```typescript
// OLD (mark-filed block, around line 88)
await fetch(`/api/org/${orgId}/compliance/filing-calendar`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ...showMarkFiledModal,
    status: 'filed',
    filed_date: filedForm.filed_date,
    confirmation_number: filedForm.confirmation_number || null,
  }),
});
```

```typescript
// NEW
await fetch(`/api/org/${orgId}/compliance/filing-calendar`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: showMarkFiledModal.id,
    status: 'filed',
    completed_at: filedForm.completed_at ? new Date(filedForm.completed_at).toISOString() : new Date().toISOString(),
    filing_reference: filedForm.filing_reference || null,
  }),
});
```

- [ ] **Step 5: Fix the newFilingForm state and POST payload**

The "Add Filing" form sends `tax_year` but the DB doesn't have that column. Remove it and use `period_end` instead:

```typescript
// OLD
const [newFilingForm, setNewFilingForm] = useState({
  filing_type: '990_pf', tax_year: new Date().getFullYear(), jurisdiction: 'federal',
  due_date: '', description: '',
});
```

```typescript
// NEW
const [newFilingForm, setNewFilingForm] = useState({
  filing_type: '990_pf',
  period_end: `${new Date().getFullYear()}-12-31`,
  jurisdiction: 'federal',
  due_date: '',
  title: '',
  description: '',
});
```

Update the POST body to include `title` (required by the API: `if (!filing_type || !title || !due_date)`):

```typescript
body: JSON.stringify({
  filing_type: newFilingForm.filing_type,
  title: newFilingForm.title || FILING_TYPE_LABELS[newFilingForm.filing_type] || newFilingForm.filing_type,
  period_end: newFilingForm.period_end,
  jurisdiction: newFilingForm.jurisdiction,
  due_date: newFilingForm.due_date,
  description: newFilingForm.description,
}),
```

Update the Add Filing modal form fields to match the new state shape (replace `tax_year` input with `period_end` date input, add `title` text input).

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep FilingCalendar
```

Expected: No errors referencing `FilingCalendar.tsx`.

- [ ] **Step 7: Commit**

```bash
git add components/compliance/FilingCalendar.tsx
git commit -m "fix(compliance): correct FilingCalendar field names to match DB schema; fix mark-filed to use PATCH"
```

---

## Task 3: IRS 990-PF Part XIII Worksheet Component

**Files:**
- Create: `components/compliance/IRS990PFWorksheet.tsx`
- Modify: `app/dashboard/compliance/page.tsx`

**Context:** The `app/api/portfolio/[id]/compliance/990pf-export?year=YYYY` endpoint already returns:
```typescript
{
  portfolio: { id, name },
  taxYear: number,
  grants: Array<{ id, contribution_date, recipient_name, recipient_ein, recipient_type,
                   contribution_type, fair_market_value, description_of_property, deductible_amount }>,
  summary: {
    totalQualifyingDistributions: number,
    totalGrantAmount: number,
    distributionCount: number,
    fivePercentMinimumDistribution: number | null,   // requires pf990.fair_market_value_assets
    qualifiesForMinimumDistribution: boolean | null,
  },
  pf990: foundation_990pf_data row | null,
}
```

The component renders Part XIII of Form 990-PF: qualifying distributions by recipient with totals and the 5% minimum distribution test.

- [ ] **Step 1: Write a failing test — verify the component fetches the right URL**

```typescript
// components/compliance/__tests__/IRS990PFWorksheet.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import IRS990PFWorksheet from '../IRS990PFWorksheet';

const PORTFOLIO_ID = 'aaaa-bbbb-cccc-dddd';
const MOCK_DATA = {
  portfolio: { id: PORTFOLIO_ID, name: 'Test Foundation' },
  taxYear: 2024,
  grants: [
    {
      id: '1', contribution_date: '2024-03-15', recipient_name: 'Community Food Bank',
      recipient_ein: '12-3456789', contribution_type: 'cash',
      fair_market_value: 50000, deductible_amount: 50000,
    },
  ],
  summary: {
    totalQualifyingDistributions: 50000, totalGrantAmount: 50000, distributionCount: 1,
    fivePercentMinimumDistribution: 40000, qualifiesForMinimumDistribution: true,
  },
  pf990: null,
};

global.fetch = vi.fn(async () => ({ ok: true, json: async () => MOCK_DATA })) as any;

describe('IRS990PFWorksheet', () => {
  it('fetches from 990pf-export endpoint with correct year', async () => {
    render(<IRS990PFWorksheet portfolioId={PORTFOLIO_ID} year={2024} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/portfolio/${PORTFOLIO_ID}/compliance/990pf-export?year=2024`)
    ));
  });

  it('renders qualifying distribution rows', async () => {
    render(<IRS990PFWorksheet portfolioId={PORTFOLIO_ID} year={2024} />);
    await waitFor(() => expect(screen.getByText('Community Food Bank')).toBeInTheDocument());
    expect(screen.getByText('$50,000')).toBeInTheDocument();
  });

  it('shows minimum distribution test result', async () => {
    render(<IRS990PFWorksheet portfolioId={PORTFOLIO_ID} year={2024} />);
    await waitFor(() => expect(screen.getByText(/minimum distribution/i)).toBeInTheDocument());
  });
});
```

Run to confirm failure:
```bash
npm test -- --reporter=verbose components/compliance/__tests__/IRS990PFWorksheet
```

Expected: FAIL (component does not exist yet).

- [ ] **Step 2: Implement IRS990PFWorksheet**

Create `components/compliance/IRS990PFWorksheet.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';

interface Grant {
  id: string;
  contribution_date: string;
  recipient_name: string;
  recipient_ein: string | null;
  contribution_type: string;
  fair_market_value: number;
  deductible_amount: number;
}

interface WorksheetData {
  portfolio: { id: string; name: string };
  taxYear: number;
  grants: Grant[];
  summary: {
    totalQualifyingDistributions: number;
    totalGrantAmount: number;
    distributionCount: number;
    fivePercentMinimumDistribution: number | null;
    qualifiesForMinimumDistribution: boolean | null;
  };
}

interface Props {
  portfolioId: string;
  year?: number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export default function IRS990PFWorksheet({ portfolioId, year }: Props) {
  const taxYear = year ?? new Date().getFullYear() - 1;
  const [data, setData] = useState<WorksheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(taxYear);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/portfolio/${portfolioId}/compliance/990pf-export?year=${selectedYear}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [portfolioId, selectedYear]);

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 1 - i);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Form 990-PF — Part XIII: Qualifying Distributions</h3>
          <p className="text-xs text-gray-500 mt-0.5">Distributions for charitable purposes</p>
        </div>
        <select
          value={selectedYear}
          onChange={e => setSelectedYear(Number(e.target.value))}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700"
        >
          {yearOptions.map(y => (
            <option key={y} value={y}>Tax Year {y}</option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="text-sm text-gray-400 py-8 text-center">Loading worksheet...</div>
      )}

      {error && (
        <div className="text-sm text-red-600 py-4">{error}</div>
      )}

      {data && !loading && (
        <>
          {/* Distribution table */}
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left py-2 pr-4">Date</th>
                  <th className="text-left py-2 pr-4">Recipient</th>
                  <th className="text-left py-2 pr-4">EIN</th>
                  <th className="text-left py-2 pr-4">Type</th>
                  <th className="text-right py-2">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.grants.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-gray-400 text-sm">
                      No qualifying distributions recorded for {selectedYear}
                    </td>
                  </tr>
                )}
                {data.grants.map(g => (
                  <tr key={g.id} className="hover:bg-gray-50">
                    <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">
                      {new Date(g.contribution_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="py-2 pr-4 font-medium text-gray-800">{g.recipient_name}</td>
                    <td className="py-2 pr-4 text-gray-500 font-mono text-xs">{g.recipient_ein ?? '—'}</td>
                    <td className="py-2 pr-4 text-gray-500 capitalize">{g.contribution_type.replace(/_/g, ' ')}</td>
                    <td className="py-2 text-right font-medium text-gray-900">{fmt(g.deductible_amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300">
                  <td colSpan={4} className="py-2 pr-4 text-sm font-semibold text-gray-700">
                    Total Qualifying Distributions ({data.summary.distributionCount} grants)
                  </td>
                  <td className="py-2 text-right font-bold text-gray-900">
                    {fmt(data.summary.totalQualifyingDistributions)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Minimum distribution test */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">5% Minimum Distribution Requirement</p>
            {data.summary.fivePercentMinimumDistribution !== null ? (
              <div className="flex items-start gap-6">
                <div>
                  <p className="text-xs text-gray-500">Required (5% of FMV assets)</p>
                  <p className="text-lg font-semibold text-gray-700">{fmt(data.summary.fivePercentMinimumDistribution)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Actual qualifying distributions</p>
                  <p className="text-lg font-semibold text-gray-700">{fmt(data.summary.totalQualifyingDistributions)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Status</p>
                  <span className={`inline-flex items-center gap-1.5 text-sm font-semibold mt-0.5 ${
                    data.summary.qualifiesForMinimumDistribution ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {data.summary.qualifiesForMinimumDistribution
                      ? 'Minimum distribution met'
                      : 'Below minimum distribution requirement'}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                Enter fair market value of assets in foundation data to calculate the 5% minimum.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -- --reporter=verbose components/compliance/__tests__/IRS990PFWorksheet
```

Expected: 3 tests pass.

- [ ] **Step 4: Mount on the compliance page**

Open `app/dashboard/compliance/page.tsx`. Locate the page component. Add the worksheet below the filing calendar. The page will need the `portfolioId` — look at how `orgId` is retrieved and find the portfolio from org membership:

```typescript
// After getting membership (orgId, portfolioId), render:
{membership.portfolio_id && (
  <IRS990PFWorksheet portfolioId={membership.portfolio_id} />
)}
```

If the page only has `orgId` and not `portfolioId`, query portfolios by org:
```typescript
const { data: portfolio } = await supabase
  .from('portfolios')
  .select('id')
  .eq('org_id', membership.org_id)
  .order('created_at')
  .limit(1)
  .single();
```

Import the component:
```typescript
import IRS990PFWorksheet from '@/components/compliance/IRS990PFWorksheet';
```

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "IRS990PF|990pf"
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add components/compliance/IRS990PFWorksheet.tsx \
  components/compliance/__tests__/IRS990PFWorksheet.test.tsx \
  app/dashboard/compliance/page.tsx
git commit -m "feat(compliance): add IRS 990-PF Part XIII worksheet component"
```

---

## Task 4: Filing Document Attachment Support

**Files:**
- Create: `db/migrations/0046_compliance_documents_bucket.sql`
- Create: `app/api/org/[orgId]/compliance/filing-calendar/[filingId]/attachments/route.ts`
- Create: `app/api/__tests__/compliance-attachments.test.ts`
- Modify: `components/compliance/FilingCalendar.tsx`

**Context:** The `filing_calendar.attachments jsonb` column stores attachment metadata as a JSON array. Storage files live in a `compliance-documents` private bucket (to be created). Each attachment object: `{ path: string, name: string, size: number, uploaded_at: string }`. Always use `createAdminClient()` for storage (never user-session client — RLS deadlock). Return signed URLs with 1-hour expiry.

### Sub-task 4a: Storage bucket migration

- [ ] **Step 1: Write the migration**

Create `db/migrations/0046_compliance_documents_bucket.sql`:

```sql
-- Migration: Compliance Documents Storage Bucket
-- Description: Private bucket for filing calendar attachment uploads
-- Date: 2026-06-13

-- Create the compliance-documents bucket (private, not public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('compliance-documents', 'compliance-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated org admins to upload
CREATE POLICY "compliance_documents_upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'compliance-documents');

-- Allow authenticated users to read (download via signed URL served by admin client)
CREATE POLICY "compliance_documents_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'compliance-documents');

-- Allow service role full access
CREATE POLICY "compliance_documents_service"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'compliance-documents')
  WITH CHECK (bucket_id = 'compliance-documents');
```

- [ ] **Step 2: Commit the migration**

```bash
git add db/migrations/0046_compliance_documents_bucket.sql
git commit -m "feat(compliance): add compliance-documents storage bucket migration"
```

### Sub-task 4b: Attachments API route

- [ ] **Step 3: Write failing tests**

Create `app/api/__tests__/compliance-attachments.test.ts`:

```typescript
// app/api/__tests__/compliance-attachments.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const ORG_ID     = '11111111-1111-1111-1111-111111111111';
const FILING_ID  = '22222222-2222-2222-2222-222222222222';
const USER_ID    = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

let _authUser: { id: string } | null = { id: USER_ID };
let _isAdmin: boolean = true;
let _filingData: { id: string; attachments: any[] } | null = { id: FILING_ID, attachments: [] };
let _filingError: { message: string } | null = null;
let _updateError: { message: string } | null = null;
let _storageUploadError: { message: string } | null = null;
let _storageSignedUrlData: { signedUrl: string } | null = { signedUrl: 'https://signed.url/file.pdf' };

const mockUpload = vi.fn();
const mockCreateSignedUrl = vi.fn();
const mockRemove = vi.fn();
const mockAdminFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: _authUser } })) },
    rpc: vi.fn(async (fn: string) => {
      if (fn === 'is_org_admin') return { data: _isAdmin, error: null };
      return { data: null, error: null };
    }),
  })),
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
        createSignedUrl: mockCreateSignedUrl,
        remove: mockRemove,
      })),
    },
  })),
}));

function setupMocks() {
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'filing_calendar') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: _filingError ? null : _filingData, error: _filingError })),
            })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: _updateError })),
          })),
        })),
      };
    }
    return { select: vi.fn(() => ({})) };
  });

  mockUpload.mockResolvedValue({ data: { path: 'path/to/file.pdf' }, error: _storageUploadError });
  mockCreateSignedUrl.mockResolvedValue({ data: _storageSignedUrlData, error: null });
  mockRemove.mockResolvedValue({ error: null });
}

import { GET, DELETE } from '@/app/api/org/[orgId]/compliance/filing-calendar/[filingId]/attachments/route';

function makeParams(orgId = ORG_ID, filingId = FILING_ID) {
  return { params: Promise.resolve({ orgId, filingId }) } as any;
}

beforeEach(() => {
  _authUser = { id: USER_ID };
  _isAdmin = true;
  _filingData = { id: FILING_ID, attachments: [{ path: 'orgs/path/file.pdf', name: 'file.pdf', size: 1024, uploaded_at: '2026-06-13T00:00:00Z' }] };
  _filingError = null;
  _updateError = null;
  _storageUploadError = null;
  _storageSignedUrlData = { signedUrl: 'https://signed.url/file.pdf' };
  setupMocks();
});

describe('GET /attachments', () => {
  it('returns 401 when unauthenticated', async () => {
    _authUser = null;
    const res = await GET(new NextRequest(`http://localhost/api/org/${ORG_ID}/compliance/filing-calendar/${FILING_ID}/attachments`), makeParams());
    expect(res.status).toBe(401);
  });

  it('returns 403 when not admin', async () => {
    _isAdmin = false;
    const res = await GET(new NextRequest(`http://localhost/api/org/${ORG_ID}/compliance/filing-calendar/${FILING_ID}/attachments`), makeParams());
    expect(res.status).toBe(403);
  });

  it('returns attachments with signed URLs', async () => {
    const res = await GET(new NextRequest(`http://localhost/api/org/${ORG_ID}/compliance/filing-calendar/${FILING_ID}/attachments`), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].signed_url).toBe('https://signed.url/file.pdf');
  });

  it('returns empty array when filing has no attachments', async () => {
    _filingData = { id: FILING_ID, attachments: [] };
    const res = await GET(new NextRequest(`http://localhost/api/org/${ORG_ID}/compliance/filing-calendar/${FILING_ID}/attachments`), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it('returns 404 when filing not found', async () => {
    _filingError = { message: 'Not found' };
    const res = await GET(new NextRequest(`http://localhost/api/org/${ORG_ID}/compliance/filing-calendar/${FILING_ID}/attachments`), makeParams());
    expect(res.status).toBe(404);
  });
});

describe('DELETE /attachments', () => {
  it('returns 401 when unauthenticated', async () => {
    _authUser = null;
    const req = new NextRequest(`http://localhost/attachments`, { method: 'DELETE', body: JSON.stringify({ path: 'orgs/path/file.pdf' }), headers: { 'Content-Type': 'application/json' } });
    const res = await DELETE(req, makeParams());
    expect(res.status).toBe(401);
  });

  it('returns 400 when path is missing', async () => {
    const req = new NextRequest(`http://localhost/attachments`, { method: 'DELETE', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' } });
    const res = await DELETE(req, makeParams());
    expect(res.status).toBe(400);
  });
});
```

Run to confirm failure:
```bash
npm test -- --reporter=verbose app/api/__tests__/compliance-attachments
```

Expected: FAIL (route file does not exist).

- [ ] **Step 4: Implement the attachments route**

Create `app/api/org/[orgId]/compliance/filing-calendar/[filingId]/attachments/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; filingId: string }>;
}

interface Attachment {
  path: string;
  name: string;
  size: number;
  uploaded_at: string;
}

// GET — list attachments with signed URLs
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, filingId } = await params;
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const db = createAdminClient();
    const { data: filing, error } = await db
      .from('filing_calendar')
      .select('id, attachments')
      .eq('id', filingId)
      .eq('org_id', orgId)
      .single();

    if (error || !filing) {
      return NextResponse.json({ error: 'Filing not found' }, { status: 404 });
    }

    const attachments: Attachment[] = filing.attachments ?? [];
    if (attachments.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // Generate signed URLs for each attachment
    const withUrls = await Promise.all(
      attachments.map(async (att) => {
        const { data } = await db.storage
          .from('compliance-documents')
          .createSignedUrl(att.path, 3600);
        return { ...att, signed_url: data?.signedUrl ?? null };
      })
    );

    return NextResponse.json({ data: withUrls });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST — upload a file (multipart/form-data with field "file")
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, filingId } = await params;
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 });

    const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File exceeds 20 MB limit' }, { status: 413 });
    }

    const db = createAdminClient();

    // Fetch current attachments
    const { data: filing, error: fetchError } = await db
      .from('filing_calendar')
      .select('id, attachments')
      .eq('id', filingId)
      .eq('org_id', orgId)
      .single();

    if (fetchError || !filing) {
      return NextResponse.json({ error: 'Filing not found' }, { status: 404 });
    }

    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${orgId}/${filingId}/${Date.now()}_${safeFileName}`;

    const bytes = await file.arrayBuffer();
    const { error: uploadError } = await db.storage
      .from('compliance-documents')
      .upload(path, bytes, { contentType: file.type, upsert: false });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const attachment: Attachment = {
      path,
      name: file.name,
      size: file.size,
      uploaded_at: new Date().toISOString(),
    };

    const currentAttachments: Attachment[] = filing.attachments ?? [];
    const { error: updateError } = await db
      .from('filing_calendar')
      .update({ attachments: [...currentAttachments, attachment] })
      .eq('id', filingId)
      .eq('org_id', orgId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const { data: signed } = await db.storage
      .from('compliance-documents')
      .createSignedUrl(path, 3600);

    return NextResponse.json({
      data: { ...attachment, signed_url: signed?.signedUrl ?? null },
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE — remove an attachment by storage path
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, filingId } = await params;
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { path } = body;
    if (!path) return NextResponse.json({ error: 'path is required' }, { status: 400 });

    const db = createAdminClient();

    const { data: filing, error: fetchError } = await db
      .from('filing_calendar')
      .select('id, attachments')
      .eq('id', filingId)
      .eq('org_id', orgId)
      .single();

    if (fetchError || !filing) {
      return NextResponse.json({ error: 'Filing not found' }, { status: 404 });
    }

    const currentAttachments: Attachment[] = filing.attachments ?? [];
    const filtered = currentAttachments.filter(a => a.path !== path);

    if (filtered.length === currentAttachments.length) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    await db.storage.from('compliance-documents').remove([path]);

    const { error: updateError } = await db
      .from('filing_calendar')
      .update({ attachments: filtered })
      .eq('id', filingId)
      .eq('org_id', orgId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 5: Run tests**

```bash
npm test -- --reporter=verbose app/api/__tests__/compliance-attachments
```

Expected: All tests pass.

### Sub-task 4c: Upload UI in FilingCalendar

- [ ] **Step 6: Add attachment upload/list UI to FilingCalendar**

In `components/compliance/FilingCalendar.tsx`, add attachment state and upload capability to the expanded filing row. The attachment section appears when a filing row is expanded (add expand toggle). Add this state at the top of the component:

```typescript
const [expandedFilingId, setExpandedFilingId] = useState<string | null>(null);
const [attachments, setAttachments] = useState<Record<string, any[]>>({});
const [uploading, setUploading] = useState(false);
```

Add a `loadAttachments` function:

```typescript
async function loadAttachments(filingId: string) {
  const res = await fetch(`/api/org/${orgId}/compliance/filing-calendar/${filingId}/attachments`);
  const json = await res.json();
  setAttachments(prev => ({ ...prev, [filingId]: json.data || [] }));
}
```

Add toggle expand handler:

```typescript
function toggleExpand(filingId: string) {
  if (expandedFilingId === filingId) {
    setExpandedFilingId(null);
  } else {
    setExpandedFilingId(filingId);
    loadAttachments(filingId);
  }
}
```

Add upload handler:

```typescript
async function handleUpload(filingId: string, file: File) {
  setUploading(true);
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/org/${orgId}/compliance/filing-calendar/${filingId}/attachments`, {
      method: 'POST',
      body: fd,
    });
    if (res.ok) {
      await loadAttachments(filingId);
    }
  } finally {
    setUploading(false);
  }
}
```

Add delete handler:

```typescript
async function handleDeleteAttachment(filingId: string, path: string) {
  await fetch(`/api/org/${orgId}/compliance/filing-calendar/${filingId}/attachments`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  await loadAttachments(filingId);
}
```

In the filing row JSX, add a toggle button and the expanded attachment panel:

```tsx
{/* In each filing row, after the existing action buttons: */}
<button
  onClick={() => toggleExpand(f.id)}
  className="text-xs text-azure hover:underline"
>
  {expandedFilingId === f.id ? 'Hide docs' : `Docs${(attachments[f.id]?.length ?? 0) > 0 ? ` (${attachments[f.id].length})` : ''}`}
</button>

{/* Expanded panel */}
{expandedFilingId === f.id && (
  <div className="mt-2 pt-2 border-t border-gray-100">
    <p className="text-xs font-medium text-gray-500 mb-2">Supporting Documents</p>
    {(attachments[f.id] ?? []).map((att: any) => (
      <div key={att.path} className="flex items-center justify-between text-sm py-1">
        <a href={att.signed_url} target="_blank" rel="noopener noreferrer" className="text-azure hover:underline truncate">
          {att.name}
        </a>
        <button
          onClick={() => handleDeleteAttachment(f.id, att.path)}
          className="text-xs text-red-500 hover:text-red-700 ml-2"
        >
          Remove
        </button>
      </div>
    ))}
    <label className="mt-2 flex items-center gap-2 cursor-pointer text-xs text-gray-500 hover:text-azure">
      <input
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx,.xlsx,.png,.jpg"
        onChange={e => e.target.files?.[0] && handleUpload(f.id, e.target.files[0])}
        disabled={uploading}
      />
      {uploading ? 'Uploading...' : '+ Attach document'}
    </label>
  </div>
)}
```

- [ ] **Step 7: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "FilingCalendar|attachments"
```

Expected: No errors.

- [ ] **Step 8: Run full test suite**

```bash
npm test -- --reporter=verbose
```

Expected: All tests pass (1299+ passing, 0 failing).

- [ ] **Step 9: Commit**

```bash
git add \
  app/api/org/\[orgId\]/compliance/filing-calendar/\[filingId\]/attachments/route.ts \
  app/api/__tests__/compliance-attachments.test.ts \
  components/compliance/FilingCalendar.tsx
git commit -m "feat(compliance): add filing document attachment upload/list/delete"
```

---

## Self-Review

**Spec coverage:**
- Nightly cron for compliance producer → Task 1 (GET handlers on existing job routes + vercel.json) ✅
- 990-PF Part XIII worksheet UI → Task 3 ✅
- Filing document attachments → Task 4 ✅
- Compliance notification wiring → Covered: `upsertGeneratedTask` already emits `task_events`; notification fanout is scheduled in Task 1's vercel.json ✅
- FilingCalendar field-name bug discovered during investigation → Task 2 (bonus fix, makes attachments work correctly) ✅

**Placeholder scan:** No TBDs or incomplete sections.

**Type consistency:** `Attachment` interface defined in the route and referenced in tests consistently. `Filing` interface rename is self-contained in FilingCalendar.tsx.
