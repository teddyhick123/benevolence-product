# Donor CRM + Letter Generator — Module Review

> Reviewed: 2026-04-26  
> Reviewer: Senior Product Engineer (automated)  
> Files examined: `app/dashboard/donors/`, `app/dashboard/letter/page.tsx`, `app/api/org/[orgId]/donors/`, `app/api/org/[orgId]/acknowledgments/`, `components/tax/DonorProfileForm.tsx`, `lib/types/org.ts`, `lib/schemas/donation.ts`, `db/migrations/0014_donors.sql`, `db/migrations/0015_acknowledgments.sql`

---

## Competitive Assessment vs Blackbaud RE NXT

Blackbaud RE NXT's donor CRM is built around five pillars: constituent management, relationship mapping, campaign/appeal/fund tracking, gift processing, and reporting. Benevolence covers approximately 40% of that surface area at MVP depth.

### What Benevolence Has
- Donor list with tier badges and recency status (new / active / lapsed / lost / prospect)
- Lifetime giving, gift count, first/last gift date on every record
- Five donor types: individual, organization, foundation, estate, trust
- Five tier labels: major, mid_major, regular, small, prospect
- Communication preference and do-not-contact flag
- Tag array and freeform notes
- Contribution history table on the profile page with acknowledgment status per gift
- Acknowledgment letter generation (four template types + general)
- PDF export via jsPDF stored in Supabase Storage
- RLS module-gating via `org_has_module(org_id, 'donors')`
- Source tracking and `external_id` for import deduplication (DB layer only)

### What Blackbaud Has That Benevolence Does Not

| RE NXT Feature | Benevolence Status |
|---|---|
| Constituent codes (Board Member, Major Donor, Volunteer, etc.) | Missing entirely — only `donor_type` |
| Relationships (spouse, employer, board connection) | Not in schema or UI |
| Campaigns, Funds, Appeals | Not in CRM module (grants module is separate) |
| Solicitor / relationship manager assignment | DB has `relationship_manager uuid` field; UI never exposes it |
| LYBUNT / SYBUNT segmentation | No queries or UI for these standard fundraising segments |
| Soft credits (credit for influenced gifts) | Not in schema |
| Pledge tracking with payment schedules | DB has `is_pledge`, `pledge_id`; UI/API never surfaces it |
| Recurring gift / sustainer management | Not present |
| Tribute / memorial gifts | Not present |
| Matching gift tracking | Not present |
| Donor portal / self-service | Not present |
| Mass email / mail-merge | Not present (single-letter generation only) |
| Import from Blackbaud / CSV with field mapping | Backend ETL system exists; no donor-specific import UI |
| Duplicate detection and merge | Not present |
| Event/volunteer/membership integration | Not present |
| Retention / attrition dashboard | Not present |
| Appeal ROI reporting | Not present |
| Giving society / cumulative giving clubs | Not present |

Compared to Bloomerang or Little Green Light (mid-market), Benevolence is roughly at feature parity on the read side (list + profile) but behind on the write side (no bulk actions, no pledge entry UI, no recurring gift workflow).

---

## Bugs & Reliability Issues

### Critical — Schema Mismatch Between Migration and API (will cause runtime 500s)

**File:** `db/migrations/0014_donors.sql` uses `org_id` as the column name on `donors` and `contributions_received`. The API routes and view queries use `organization_id`.

- `app/api/org/[orgId]/acknowledgments/route.ts:28` — `.eq('organization_id', orgId)` on `acknowledgment_letters`
- `app/api/org/[orgId]/acknowledgments/route.ts:193` — inserts `organization_id: orgId`
- `app/api/org/[orgId]/donors/route.ts:25` — `.eq('organization_id', orgId)` on `v_donor_summary`
- `db/migrations/0015_acknowledgments.sql` — `acknowledgment_letters` table has `org_id uuid NOT NULL`

Either the migration was not applied as written, or a later migration renames `org_id` to `organization_id`. Either way, the mismatch is a latent hard crash for any deployment that runs the migrations verbatim. This needs auditing against the actual Supabase schema in production.

### Critical — `v_donor_summary` Missing Most Computed Columns the API Expects

The migration at `db/migrations/0014_donors.sql:189-193` defines `v_donor_summary` as:

```sql
CREATE OR REPLACE VIEW v_donor_summary AS
SELECT d.*, d.first_name || ' ' || COALESCE(d.last_name, '') AS full_name
FROM donors d WHERE d.deleted_at IS NULL;
```

The `Donor` type at `lib/types/org.ts:77-86` expects these computed columns from the view:
- `display_name` — not in view (only `full_name`)
- `total_lifetime_giving` — not in view (DB column is `lifetime_giving`)
- `total_gift_count` — not in view (DB column is `gift_count`)
- `pending_acknowledgments_count` — not in view at all
- `has_pending_acknowledgments` — not in view at all
- `computed_tier` — not in view (DB column is `tier`)

The list page (`app/dashboard/donors/page.tsx:176,172`) renders `donor.total_lifetime_giving` and `donor.computed_tier`. Both will be `undefined` on every row, showing `$0` and the "Prospect" fallback badge for every donor regardless of actual data.

### High — Silent PDF Failure on Profile Page

`app/dashboard/donors/[donorId]/page.tsx:77`:
```ts
} catch {
  // silently fail
}
```
If PDF generation fails (storage not configured, network error), the user sees nothing — no toast, no error state. The button stays enabled. This is invisible data loss from the user's perspective.

### High — Acknowledgment `contribution_id` vs `contribution_ids` Mismatch

`db/migrations/0015_acknowledgments.sql:48` defines `contribution_ids uuid[] NOT NULL DEFAULT '{}'` (an array, supporting multi-gift letters). The API at `app/api/org/[orgId]/acknowledgments/route.ts:67,195` reads and inserts a single `contribution_id` (singular, nullable FK). The two are out of sync. The DB schema supports batch acknowledgments; the API silently drops that capability and writes to a column that may not exist.

### Medium — `org_role` RPC Returns Truthy for Viewers

`app/api/org/[orgId]/donors/route.ts:17-19`:
```ts
const { data: role } = await supabase.rpc('org_role', { p_org_id: orgId });
if (!role) { return NextResponse.json({ error: 'Not authorized' }, { status: 403 }); }
```
`org_role` returns the role string (e.g. `'viewer'`), which is truthy. A viewer can therefore reach the full donor list including PII (email, phone). There is no viewer-specific field masking. This should check `role !== null` and separately verify the role is appropriate for the operation type.

### Medium — Hard-coded `limit: '100'` on Donor List Page With No Pagination

`app/dashboard/donors/page.tsx:65` always fetches 100 donors. The API supports pagination via `offset`. Orgs with 200+ donors will silently lose records from the list with no indication to the user. The "X total records" counter (`page.tsx:91`) reflects only the fetched page count, not the real total.

### Low — Non-cash Letter Template Has a Raw Template String Leak

`app/api/org/[orgId]/acknowledgments/route.ts:177`:
```ts
`Please note that ${orgName} did not provide goods or services...`
```
This string is inside the `custom_message || '...'` fallback but the outer template literal uses `orgName` correctly. However the inner string uses `${orgName}` which is evaluated at route execution time. If `custom_message` is supplied and contains `${orgName}`, it will NOT be interpolated (it's a runtime string, not a template literal at that point). Inconsistent — the body template uses `orgName` via template literals while `custom_message` is treated as a static string.

### Low — `DonorProfileForm` Posts to a Nonexistent Route

`components/tax/DonorProfileForm.tsx:62`: POSTs to `/api/portfolio/${portfolioId}/donor-profile`. There is no corresponding API route in the codebase. This form will always return a network error. (`DonorProfileForm` is for `owner_tax_profiles`, not the `donors` CRM table — the naming conflation is also a design smell.)

---

## UX Gaps

### Donor List
- **No column sorting.** The list is always sorted by `total_lifetime_giving DESC` (API default). Users cannot sort by name, last gift date, or recency — all of which are core fundraising workflows.
- **Search is name-only and exact-substring.** The DB has a trigram index on `(first_name || ' ' || last_name || ' ' || organization_name)` but the API filters on `display_name` with `ilike`, which won't hit the trigram index. Email search is not exposed to the UI at all.
- **No "Add Donor" page exists.** The header button links to `/dashboard/donors/new?org=${orgId}` (`page.tsx:94`) but that route does not exist. The button silently 404s.
- **No bulk actions.** No way to select multiple donors, export to CSV, bulk-generate year-end letters, or bulk-tag.
- **No total count returned from API.** `app/api/org/[orgId]/donors/route.ts:51` returns `count: donors?.length || 0`, which is the count of the current page — not the total matching records. Pagination UI cannot be built without a real count.

### Donor Profile
- **Contribution history has no visualization.** There is a D3.js library in the stack. Blackbaud, Bloomerang, and even Little Green Light all show a giving history bar chart or timeline. The profile page shows a flat table only.
- **No edit capability on the profile page.** The API has a `PATCH` endpoint at `app/api/org/[orgId]/donors/[donorId]/route.ts:57`, but the profile UI has no edit button or inline form.
- **Tags are stored as an array** but the UI never renders or allows editing them.
- **No "Generate Letter" button on the profile page.** The profile shows existing letters but there is no way to initiate a new one from the profile view. Users must navigate elsewhere.
- **Relationship manager field (`relationship_manager uuid`) is in the DB schema but never shown.**

### Acknowledgment Letters Module
- **No standalone acknowledgment queue page.** Development officers need a view of "all pending acknowledgments across all donors." The only entry point to letters is through an individual donor's profile.
- **No send/email integration.** Status can be set to `'sent'` but there is no actual email delivery (SMTP, SendGrid, etc.). Marking as "sent" is entirely manual.

---

## Missing Features

1. **LYBUNT / SYBUNT queries** — the two most important fundraising segments. Cannot be answered without campaign/year data on contributions.
2. **Pledge management UI** — DB supports it (0014_donors.sql:119-126), API ignores it.
3. **Recurring gift / sustainer tracking** — no schema support.
4. **Soft credits** — for spousal gifts, foundation matching, board-influenced gifts.
5. **Constituent codes** — a classification system beyond tier (e.g., "Board Member," "Volunteer," "Event Attendee").
6. **Relationship mapping** — households, employer relationships, spousal links.
7. **Year-end letter batch generation** — generate and queue letters for all donors with gifts in a tax year in one operation.
8. **Letter template editor** — the `letter_templates` table exists (`db/migrations/0015_acknowledgments.sql:11-26`) but is completely unused by the UI and API. The API hardcodes four plain-text templates inline.
9. **Duplicate detection** — no UI to find or merge duplicate donor records.
10. **Import mapping for donor-specific fields** — the ETL system handles generic holdings; donor-specific CSV import from Blackbaud, Salesforce, or DonorPerfect exports is not wired.

---

## Acknowledgment Letter Compliance

### IRS Contemporaneous Written Acknowledgment (CWA) Requirements (IRC § 170(f)(8))

A legally sufficient CWA for cash gifts over $250 must include:
1. Name of the organization ✓ (present in all templates)
2. Date of the contribution ✗ — **Receipt template omits the contribution date from the letter body.** `app/api/org/[orgId]/acknowledgments/route.ts:149-158`: the `contributionDetail` block includes date only if `contribution_id` is provided. If no `contribution_id` is linked, the receipt has no date.
3. Amount of cash contribution ✓ (present when contribution_id is supplied)
4. Statement that no goods or services were provided, OR a description and good-faith estimate of value of goods/services received ✓ (the "no goods or services" language is present in all cash templates)
5. Description (not value) of non-cash contributions — **Non-cash template is critically deficient.** `app/api/org/[orgId]/acknowledgments/route.ts:173-179`: the non-cash template has a placeholder `custom_message` but does not include the property description, date received, or the required disclaimer that the organization did not value the property. This template is **not compliant** as generated without manual editing.

### QCD Requirements
The QCD template (`route.ts:161-171`) includes the 501(c)(3) statement and EIN. However it does not include:
- The amount of the QCD (required by IRS Notice 2007-7)
- The date the QCD was received
- Confirmation that the donor received no goods or services (the word "no" is absent — it says "no goods or services" correctly, ✓)

### Year-End Summary
The year-end template correctly includes total contributions, tax-deductible subtotal, gift count, and the "no goods or services" statement. This is the strongest of the four templates.

### PDF Output
The generated PDF (`app/api/org/[orgId]/acknowledgments/[id]/generate-pdf/route.ts:71-196`) renders the letter body verbatim. It uses `getPublicUrl` to generate a storage URL (`line 54`), meaning the PDF is publicly accessible to anyone with the URL. There is no signed URL or access control on the stored PDF. This is a significant PII exposure risk for letters containing donor addresses, gift amounts, and EINs.

---

## AI Letter Generator Assessment

The "letter generator" at `app/dashboard/letter/page.tsx` is **not a donor acknowledgment letter generator.** It is a portfolio/board letter generator — it generates a narrative summary of the investment portfolio for stakeholders (total holdings, funds allocated, KPIs). The name "Letter Generator" in the navigation conflates two distinct features.

### What It Actually Does
- Fetches or generates a portfolio narrative letter via `GET/POST /api/portfolio/${portfolioId}/letter/generate`
- Displays the letter with portfolio summary cards (total holdings, funds allocated)
- Provides a persistent chat interface to ask follow-up questions about the portfolio (powered by `/api/ai/chat`)
- Supports inline D3 widget rendering in chat responses
- Caches the generated letter with version tracking

### Strengths
- The regenerate + cache flow is well-designed
- The chat-with-widgets pattern is genuinely differentiating — no competitor provides this
- Clean print/export via `window.print()` with `print:hidden` on the chat bar
- Auto-trigger holding report from URL params is a useful deep-link pattern

### Weaknesses
- Completely disconnected from the Donor CRM. Cannot generate donor-facing acknowledgment letters, personalized stewardship letters, or appeal letters.
- "Export PDF" is `window.print()` — it will render the browser chrome and page UI unless there is print CSS. There is no `@media print` stylesheet visible in the codebase.
- Errors in `loadPortfolio` are silently swallowed (`catch (error) {}`), leaving the page blank with no user feedback
- The fallback to `process.env.NEXT_PUBLIC_PORTFOLIO_ID_DEFAULT` (line 91) is a debugging artifact that should not be in production

---

## Security / PII Protection

### Access Control
- All donor routes check `org_role` or `can_edit_org` RPCs — correct pattern
- RLS policies on `donors` and `contributions_received` require both org membership and module flag — well-designed
- `DELETE` requires `is_org_admin` — appropriate
- **Gap:** Viewer-role users can access the full donor list including PII fields (email, phone, address) because `org_role` returns a truthy string for any valid role. No field-level masking exists.

### PDF Storage
- `app/api/org/[orgId]/acknowledgments/[id]/generate-pdf/route.ts:41-54`: PDFs are uploaded to Supabase Storage `documents` bucket using `admin` client and then served via `getPublicUrl`. A public URL means anyone with the link can access the PDF. This bypasses RLS entirely.
- **Recommended fix:** Use `createSignedUrl` with a short TTL instead of `getPublicUrl`, or configure the bucket as private and serve through a signed-URL-generating API route.

### Input Validation
- Donor creation (`route.ts:POST`, lines 68-99) accepts raw body JSON with no Zod schema validation. Any extra fields are silently ignored (whitelist approach is correct), but there is no type coercion or format validation on email, phone, or postal code.
- Acknowledgment creation has no validation on `tax_year` (could be any integer including negative values), `letter_type` (any string — could break the template switch), or `donor_id` UUID format.

### Data Exposure
- The donor list page fetches up to 100 records including email addresses and renders them in the DOM. No partial masking (e.g., `j***@example.com`) for viewer-role users.
- Contribution amounts are fully exposed to all org members, including viewer role.

---

## Overall Rating

**4/10**

The data model and RLS architecture are thoughtful and production-quality — org-scoping, module gating, soft-delete, and the trigger-based aggregate pattern are all correct. However, the feature surface is approximately 40% of what a fundraising team migrating from Blackbaud RE NXT would expect, the schema is materially out of sync with the API in at least three places (column names, view columns, and contribution_id vs contribution_ids), the donor list is non-functional (Add Donor 404s, total_lifetime_giving always $0, no pagination), the non-cash acknowledgment template is IRS non-compliant, and PDF storage is publicly exposed. The letter generator is a portfolio narrative tool that is misleadingly named — it has no connection to the donor CRM. For a v0.1.0 MVP used internally or in a closely managed pilot, this is acceptable; for a paying customer replacing Blackbaud, it is not ready.

---

## Priority Fixes (Top 5)

### 1. Fix the Schema Drift — Column Names and View Definitions
**Files:** `db/migrations/0014_donors.sql`, `db/migrations/0015_acknowledgments.sql`, all API routes under `app/api/org/[orgId]/donors/` and `app/api/org/[orgId]/acknowledgments/`

The `v_donor_summary` view must be redefined to expose `display_name`, `total_lifetime_giving`, `total_gift_count`, `computed_tier`, `has_pending_acknowledgments`, and `pending_acknowledgments_count`. The `org_id` vs `organization_id` discrepancy between migration DDL and API code must be resolved. The `contribution_id` (singular) vs `contribution_ids` (array) mismatch between the API and the `acknowledgment_letters` table schema must be resolved. Without this, the donor list shows $0 lifetime giving and wrong tier badges for every donor.

### 2. Build the "Add Donor" Page and Wire Inline Editing
**Files:** Create `app/dashboard/donors/new/page.tsx`; add edit form to `app/dashboard/donors/[donorId]/page.tsx`

The "Add Donor" button at `app/dashboard/donors/page.tsx:93-98` links to a route that does not exist. The PATCH endpoint exists and is correct. Build a simple create/edit form covering: name fields, donor type, email, phone, address, tier, communication preference, tags, and notes. Without this, the CRM is read-only for any data not imported via the ETL pipeline.

### 3. Fix PDF Storage to Use Signed URLs (PII Exposure)
**File:** `app/api/org/[orgId]/acknowledgments/[id]/generate-pdf/route.ts:54`

Replace `getPublicUrl` with `createSignedUrl(storagePath, 3600)` (1-hour TTL), or configure the `documents` bucket as private and expose a new API route at `GET /api/org/[orgId]/acknowledgments/[id]/pdf` that generates a fresh signed URL on demand after verifying org membership. As-is, acknowledgment PDFs containing donor addresses, gift amounts, and EINs are publicly accessible via guessable paths (`acknowledgments/{orgId}/{letterId}.pdf`).

### 4. Add Contribution Date to Receipt Template and Fix Non-Cash Compliance
**File:** `app/api/org/[orgId]/acknowledgments/route.ts`, lines 136-158 (receipt) and 172-179 (non-cash)

The receipt template must always include the contribution date even when no `contribution_id` is linked (use the current date or require it from the request body). The non-cash template must include: (a) a required `property_description` field, (b) the date the property was received, and (c) the required statement that the organization did not provide a value for the property. Without these, generated letters cannot be used as IRS-compliant contemporaneous written acknowledgments.

### 5. Add Real Pagination and Fix the Donor List Silent Failure
**Files:** `app/dashboard/donors/page.tsx:65`, `app/api/org/[orgId]/donors/route.ts:51`

Change the API to return `{ donors, count: totalCount }` using Supabase's `{ count: 'exact' }` option. Add `Previous` / `Next` controls to the donor list page. Replace the hardcoded `limit: '100'` with a user-configurable page size. Also surface the PDF generation error (`app/dashboard/donors/[donorId]/page.tsx:77`) as a toast or inline error instead of a silent catch block. These two fixes together stop data silently disappearing from the UI for any org with more than 100 donors.
