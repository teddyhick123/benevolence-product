# Tax Center — Module Review

**Reviewed:** 2026-04-26
**Reviewer:** Senior Product Engineer (automated review)
**Codebase snapshot:** branch `main`, commit `b8d0c391`
**Scope:** 21 components, 10 lib files, 13 API routes

---

## Competitive Assessment

| Capability | Blackbaud RE NXT | Sage Intacct | Daffy / Fidelity Charitable | Benevolence Tax Center |
|---|---|---|---|---|
| AGI limit buckets (60/30/20%) | No | Partial | No | Yes |
| 5-year carryforward tracking | No | Yes | No | Yes |
| Form 8283 generation | No | Yes | No | Yes (draft PDF) |
| TurboTax TXF export | No | No | No | Yes |
| Scenario / what-if modeling | No | No | No | Yes |
| Bunching strategy analysis | No | No | No | Yes |
| QCD tracking | No | No | No | Yes (basic) |
| CPA share link | No | No | No | Yes (commented out) |
| OBBB 2026 rule support | No | No | No | Yes |
| State deduction limits | No | Partial | No | No |
| AMT impact | No | No | No | No |
| Married Filing Separately rules | No | No | No | Partially broken (see bugs) |

Benevolence is meaningfully ahead of Blackbaud and Daffy for a sophisticated family office / foundation audience. The gap vs. Sage Intacct is state-level deductions and multi-entity consolidation. The gap vs. Lacerte/ProSeries is everything AMT-related and multi-state.

---

## Bugs & Reliability Issues

### Bug 1 — CRITICAL: Conservation Easement AGI Limit Wrong in `agi-calculator.ts`

**File:** `lib/tax/agi-calculator.ts`, line 57–68
**File:** `lib/tax/scenario-calculator.ts`, lines 279–292

The `determineAGILimitCategory()` function in `agi-calculator.ts` maps all non-cash contributions to the `30_appreciated` bucket (30% limit). Conservation easements, however, qualify for a **50% AGI limit** under IRC §170(b)(1)(E), not 30%. The scenario calculator's `getAGILimitForType()` correctly returns 50 for `conservation_easement`, but `determineAGILimitCategory()` — which is what runs on stored contributions — has no conservation easement case and will silently mis-categorize such contributions into the 30% bucket.

The result: a user who donates a $1M conservation easement with $2M AGI would be shown a $600,000 limit (30%) instead of the correct $1M limit (50%). The carryforward would be wrong by $400,000. This is a material compliance error.

**The `AGILimitCategory` type itself (`lib/schemas/tax`) has no `50_conservation` variant, so the database schema cannot store this correctly either.**

### Bug 2 — HIGH: Carryforward Expiration Boundary Off by One Year

**File:** `lib/tax/carryforward-tracker.ts`, line 75

```ts
cf.expires_tax_year >= currentTaxYear
```

A carryforward that expires in tax year `currentTaxYear` (i.e., December 31 of the current filing year) is correctly included as active — this is right. But the alert in `generateCarryforwardAlerts` at line 194 triggers a "critical" alert when `cf.expires_tax_year === currentTaxYear`. If today is April 26, 2026 and the carryforward expires in tax year 2026 (meaning the taxpayer still has until Dec 31, 2026 to use it), that critical alert fires immediately at the start of the year — which is correct behavior but may alarm users unnecessarily in January. No actual calculation error, but the user-facing message says "expire on December 31, [year]" which is accurate. Low risk — document as known UX behavior.

### Bug 3 — HIGH: Married Filing Separately AGI Limits Not Enforced

**File:** `lib/tax/agi-calculator.ts` (entire file); `lib/tax/constants.ts` lines 110–115

The four AGI limit buckets (60/30/30/20) apply to MFJ and single filers. For **Married Filing Separately**, IRC §170(b)(1)(A) imposes the same percentage limits, but the code applies them identically — which is correct for charitable deductions. However, the **OBBB 2026 changes** (0.5% floor, 35% cap) use a single threshold check regardless of filing status. The `calculateOBBBAGIFloor` function at `lib/tax/constants.ts` line 198 takes `agi` and `taxYear` but no `filingStatus`. The 0.5% floor applies per return, which may differ in MFS cases. Minor for most users but relevant if the platform serves MFS filers.

### Bug 4 — HIGH: Optimization Engine Ignores 60% Cash Bucket When Modeling Appreciated Assets

**File:** `lib/tax/optimization-engine.ts`, lines 166–167 and 239–240

Both `optimizeByAppreciation()` and `maximizeCurrentYearDeduction()` compute capacity only against the **30% AGI limit**, completely ignoring the user's 60% cash bucket:

```ts
const agiLimit30Pct = taxSituation.agi * 0.30;
const remainingCapacity = agiLimit30Pct - taxSituation.existing_contributions_30_pct;
```

If a user has already made cash donations that fill part of the 60% bucket, those do not affect the 30% bucket. This is correct. But the engine never recommends a combined strategy that might suggest cash donations alongside appreciated-asset donations to use both limits. More importantly, for Strategy 2 ("Maximize Current Year Deduction"), it tells the user "Donate exactly $X to use all available capacity" based only on the 30% bucket — leaving the entire 60% cash capacity unmentioned. A user could donate significantly more and still be within IRS limits.

### Bug 5 — MEDIUM: Bunching Strategy Hardcodes Standard Deduction in Projection

**File:** `lib/tax/optimization-engine.ts`, line 467

```ts
tax_savings: Math.max(amount - 29200, 0) * 0.37, // Benefit over standard deduction
```

`$29,200` is the 2024 MFJ standard deduction, hardcoded in the bunching strategy's multi-year projection. The bunching *analysis* function correctly calls `getStandardDeduction(tax_year, filing_status)`, but when the engine builds the `YearProjection` record it falls back to the hardcoded constant. In tax year 2026 the MFJ standard deduction is $32,200, meaning the projected tax savings will be overstated by approximately `($32,200 - $29,200) * 0.37 = $1,110` per bunch year.

### Bug 6 — MEDIUM: Form 8283 PDF Section A / Section B Threshold Error

**File:** `lib/tax/form8283-generator.ts`, lines 61–62

```ts
const sectionA = contributions.filter(c => c.fmv_at_donation <= 5000);
const sectionB = contributions.filter(c => c.fmv_at_donation > 5000);
```

Per IRS Form 8283 instructions, **publicly traded securities** go in Section A regardless of value. The generator does not distinguish publicly traded vs. closely held / illiquid assets. A $50,000 donation of publicly traded AAPL stock would be routed to Section B (requiring a qualified appraisal statement), when in fact it belongs in Section A with no appraisal requirement. This could cause CPAs to request unnecessary appraisals.

### Bug 7 — MEDIUM: The overview API uses `supabasePublic()` (RLS client) but has no auth check

**File:** `app/api/portfolio/[id]/tax/overview/route.ts`, line 19

The GET handler calls `supabasePublic()` (the RLS-respecting client), which means RLS must be correctly configured on `tax_profiles`, `v_tax_contributions_enriched`, and `tax_carryforwards` for this to be secure. However, unlike the contributions POST route (which explicitly calls `can_edit_portfolio`), the overview GET route has no explicit auth check at all — it relies entirely on RLS. This is by design per the codebase pattern, but given the sensitivity of AGI and contribution data, an explicit `can_view_portfolio` RPC check would be safer. The form8283 route partially addresses this by checking portfolio existence but uses portfolio name as the proof of access, not an explicit permission RPC.

### Bug 8 — LOW: Scenario Calculator Uses `new Date().getFullYear()` as QCD Limit Year

**File:** `lib/tax/scenario-calculator.ts`, lines 180–187

```ts
const currentYear = new Date().getFullYear();
const qcdLimit = getQCDLimit(currentYear);
```

When a scenario is run for a past or future tax year, the QCD limit shown in the recommendation always reflects the current calendar year rather than the tax year being modeled. A user running a 2024 scenario in April 2026 would see the 2026 QCD limit ($111,000) instead of the 2024 limit ($105,000). The fix is to use the `ScenarioInput` tax year or pass `taxYear` as a parameter.

### Bug 9 — LOW: CPA Share URL Hardcoded to `app.benevolence.com`

**File:** `lib/tax/cpa-collaboration.ts`, line 64

```ts
export function generateCPAShareURL(shareToken: string, baseURL: string = 'https://app.benevolence.com'): string {
```

The CPA share URL generator defaults to a production domain that does not match the component implementation in `CPACollaborationPortal.tsx` at line 197, which correctly uses `window.location.origin`. The `cpa-share` API route (line 144) calls `generateCPAShareURL(shareToken)` with no base URL override, meaning the URL stored in `email_preview` points to the hardcoded domain. In staging or development this generates invalid links in the email preview. Should use `process.env.NEXT_PUBLIC_APP_URL`.

---

## UX Gaps

### Gap 1 — Dashboard Layout Buries Critical Data

The primary tax page (`app/dashboard/tax/page.tsx`) renders components in this order:
1. Tax Profile Setup
2. Holdings Importer
3. "Add Contribution" button
4. Contribution Wizard (modal)
5. AGI Limit Visualizer
6. Contributions List
7. Export Panel
8. Tax Strategy Center
9. Carryforward summary / alerts
10. Quick Stats

The AGI Limit Visualizer (item 5) is the most important "at-a-glance" view for a foundation finance officer — it tells them immediately how much deduction capacity remains. It should be at the top, not below the contribution entry form. The carryforward alerts (item 9) are equally high priority but render near the bottom. A CFO reviewing the Tax Center sees a form before they see their tax position.

### Gap 2 — No Visual Progress Toward December 31 Deadline

There is no indicator showing days remaining in the tax year or flagging that contributions must be made by December 31 to count. For high-value foundations that plan December giving, this is table-stakes. Compare to Fidelity Charitable, which prominently surfaces year-end giving deadlines.

### Gap 3 — Wizard Does Not Pre-fill From Charity Database

The `ContributionTaxWizard.tsx` requires the user to manually type the recipient name and EIN. The platform has a `charities` table with 2M+ nonprofits. An EIN-lookup / autocomplete would eliminate a major source of data quality issues (misspelled names, wrong EINs) that affect Form 8283 accuracy.

### Gap 4 — QCD Entry Has No Dedicated Flow

QCDs must be tracked differently from regular charitable deductions (excluded from income, not on Schedule A, sourced from an IRA). The wizard (`ContributionTaxWizard.tsx`) has no QCD-specific step. A user marking a contribution as QCD-eligible (`qcd_qualified`) must know to do this independently. The `TXF` export correctly skips QCDs from Schedule A, but there is no UI guardrail preventing a user from accidentally deducting a QCD on Schedule A (double benefit, which is not allowed).

### Gap 5 — CPACollaborationPortal is Commented Out

Line 15 of `app/dashboard/tax/page.tsx`:
```ts
// import CPACollaborationPortal from '@/components/tax/CPACollaborationPortal'; // Hidden - not ready yet
```

The component is fully implemented and functional. The backend API is complete and tested. The only reason it's hidden is the comment "not ready yet." Given that CPA collaboration is a top-10 feature request from the target user base (foundation finance staff), this should be shipped or at minimum behind a feature flag — not hard-commented out.

### Gap 6 — No Year-Over-Year Comparison

The tax year selector (a `<select>` in the page header) allows switching years, but there is no side-by-side comparison of deductible amounts across years. A foundation director reviewing "did we do more than last year?" must toggle between years manually. Even a simple sparkline in the overview cards would address this.

### Gap 7 — Compliance Score Metric Lacks Explanatory Context

The "Compliance Score" card on the dashboard shows a percentage (e.g., "78%") but provides no tooltip or drill-down explaining which specific contributions are pulling the score down. Users see a number but cannot act on it without scrolling to find the specific missing documents.

### Gap 8 — Carryforward Section Hidden When Zero

The carryforward panel (line 249, `page.tsx`) only renders when `totalAvailable > 0`. A user with zero carryforward sees nothing — including no explanation of *what* carryforwards are or that they have none. First-time users navigating the Tax Center will not understand this concept without seeing it presented proactively.

---

## Missing Features

### Missing 1 — State Deduction Limits

States like California cap charitable deductions at 50% of federal AGI, and several states (e.g., New York) have their own non-conformity rules on carryforward periods. The platform has no state tax layer whatsoever. For California-based foundations — a substantial portion of the target market — the federal deductible amount shown in the UI may materially overstate the actual combined deduction benefit. This is the largest gap vs. Sage Intacct.

### Missing 2 — AMT (Alternative Minimum Tax) Impact

The optimization engine and scenario calculator assume a standard 37% marginal rate and 20% LTCG rate. They do not model AMT. For taxpayers subject to AMT, charitable deductions have different effective values. This is particularly relevant for private foundation owners and high-net-worth individuals donating illiquid assets, who are more likely to be in AMT territory.

### Missing 3 — Qualified Opportunity Zone Interaction

QOZ investments interact with charitable deductions in complex ways (basis exclusion, timing). No mention anywhere in the codebase.

### Missing 4 — Charitable Remainder Trust / Gift Annuity Tracking

The QCD split-interest limit is defined in constants (`lib/tax/constants.ts`, line 126), but there is no contribution type for CRT or gift annuity in the `CONTRIBUTION_TYPE_LABELS` constant or the database schema. Foundation users frequently use CRTs as part of their giving strategy.

### Missing 5 — Donor-Advised Fund Tracking (Full Lifecycle)

DAF contributions appear as a `recipient_type` option, but the platform does not track:
- The DAF account balance itself
- Grants made *from* the DAF to operating charities
- The timing difference between the DAF contribution (deductible year) and grants out

For a foundation that uses both direct giving and a DAF, the tax picture is incomplete.

### Missing 6 — Short-Term vs Long-Term Capital Gain Distinction

The scenario calculator and optimization engine assume **20% LTCG rate** for all appreciated asset donations. Short-term appreciated assets (held less than 1 year) are deductible at FMV only if they are capital gain property — and the deduction is limited to **cost basis, not FMV**, for ordinary income property. A user donating stock held for 9 months would see an inflated deduction estimate. The wizard collects `date_acquired` but the calculation layer never checks holding period.

### Missing 7 — IRA RMD / QCD Integration

The QCD optimization strategy (Strategy 5 in `optimization-engine.ts`) detects IRA holdings by checking `asset_type === 'qcd_distribution'` or name contains "ira" (line 514). This is a fragile heuristic. There is no first-class RMD calculation or integration with the user's IRA balance to tell them "your RMD is $X, consider directing $Y as a QCD."

### Missing 8 — OBBB 2026 Universal Deduction for Non-Itemizers

The OBBB universal charitable deduction ($1,000 single / $2,000 MFJ for non-itemizers) is defined in `constants.ts` and the helper `getUniversalCharitableDeduction()` exists, but it is **never called anywhere** in the calculation or display layer. Users who do not itemize get no benefit shown from OBBB changes.

---

## Security / Data Integrity

### Security 1 — HIGH: Optimize and Scenarios Routes Use Admin Client to Bypass RLS

**Files:** `app/api/portfolio/[id]/tax/optimize/route.ts`, lines 51–58; `app/api/portfolio/[id]/tax/scenarios/route.ts`, lines 47–53

Both routes call `createAdminClient()` to read from `tax_years` because "RLS policies may block reading tax_years even for authorized users." The comment acknowledges this is a workaround for an RLS misconfiguration, not intentional design. If `can_edit_portfolio` passes, the user is authorized — but using an admin client to bypass RLS on a table containing AGI data is an elevated risk surface. The proper fix is to correct the RLS policy on `tax_years`.

### Security 2 — MEDIUM: SSN Written to PDF Without Server-Side Validation

**File:** `lib/tax/form8283-generator.ts`, lines 106–113

The Form 8283 PDF will include the donor's SSN (`donor_ssn`) if it is passed in. The generator masks it to `XXX-XX-XXXX` format (line 356), which is good. However, the API route (`app/api/portfolio/[id]/tax/form8283/route.ts`) passes `donorProfile` data but does not explicitly pass `donor_ssn` — leaving the `donor_ssn` field in the interface as dead weight that could be populated if the signature is changed in the future. The PDF contains a PII masking function, but no server-side audit log is created when the PDF is generated and returned. For a financial platform, PDF generation of a tax document containing any SSN data should create an audit trail.

### Security 3 — MEDIUM: CPA Share Link Does Not Validate Portfolio Ownership Across Delete

**File:** `app/api/portfolio/[id]/tax/cpa-share/route.ts`, lines 183–220

The DELETE handler validates `can_edit_portfolio` for `portfolio_id` from the URL, then calls `revoke_share_link(p_share_link_id)` using only the share link ID. There is no check that the given `share_link_id` actually belongs to the given `portfolio_id`. An authorized user of portfolio A could potentially revoke a share link belonging to portfolio B if they know its UUID. The RPC `revoke_share_link` should enforce the portfolio relationship internally, but this relies on the RPC being correctly written — the SQL is not visible in this review.

### Security 4 — LOW: Tax Data Returned with 60-Second Cache Header on Sensitive Routes

**File:** `app/api/portfolio/[id]/tax/overview/route.ts`, line 140; `app/api/portfolio/[id]/tax/contributions/route.ts`, line 65

Both routes return `Cache-Control: private, s-maxage=60`. The `s-maxage` directive applies to shared caches (CDN edge nodes). Financial data including AGI, contribution amounts, and deductible amounts should not be cached at the edge even if `private` is set — `private` is a hint not a guarantee at all proxy layers. These should use `Cache-Control: private, no-cache` or `private, max-age=0, must-revalidate`.

### Security 5 — LOW: Console Logs Emit AGI Values in Production

**Files:** `app/api/portfolio/[id]/tax/optimize/route.ts`, lines 60–63; `app/api/portfolio/[id]/tax/scenarios/route.ts`, lines 55–58

```ts
console.log(`[Optimize] Tax year data:`, taxYear);
```

`taxYear` contains `adjusted_gross_income`. These debug logs were left in from development and will emit AGI values to server logs in production. PII in server logs is a compliance risk under many data handling frameworks.

---

## IRS Compliance Assessment

| Rule | Status | Detail |
|---|---|---|
| 60% AGI limit for cash to public charities | Correct | `constants.ts` line 111 |
| 30% AGI limit for appreciated property to public charities | Correct | `constants.ts` line 112 |
| 30% AGI limit for cash to private foundations | Correct | `constants.ts` line 113 |
| 20% AGI limit for property to private foundations | Correct | `constants.ts` line 114 |
| **50% AGI limit for conservation easements** | **WRONG** | See Bug 1 — `agi-calculator.ts` ignores this category |
| 5-year carryforward period | Correct | `constants.ts` line 252 |
| 15-year carryforward for conservation easements | Correct (scenario only) | `scenario-calculator.ts` line 121, `agi-calculator.ts` line 180 |
| QCD eligibility at age 70.5 | Correct | `constants.ts` line 151 |
| QCD annual limit (inflation-indexed, 2024+) | Correct | `constants.ts` QCD_LIMITS table |
| QCD not deductible on Schedule A | Correct | `turbotax-export.ts` line 63 |
| QCD ineligible for DAF / private foundations | Correct | `constants.ts` line 153 |
| Form 8283 Section A threshold ($500) | Correct | `substantiation-validator.ts` line 80 |
| Form 8283 Section B threshold ($5,000) | Correct | `substantiation-validator.ts` line 109 |
| Qualified appraisal required at $5,000 | Correct | `constants.ts` line 245 |
| Written acknowledgment required at $250 | Correct | `constants.ts` line 244 |
| Quid pro quo disclosure at $75 | Correct | `constants.ts` line 246 |
| OBBB 2026 — 0.5% AGI floor | Correct | `constants.ts` line 168, `agi-calculator.ts` lines 201–203 |
| OBBB 2026 — 35% benefit cap for 37% bracket | Correct | `constants.ts` line 174, `constants.ts` calculateEffectiveDeductionValue |
| OBBB 2026 — Universal $1,000/$2,000 deduction | Implemented but never called | See Missing Feature 8 |
| Private foundation excise tax (1.39% flat) | Correct | `constants.ts` line 261 |
| Private foundation 5% minimum distribution | Correct | `constants.ts` line 279 |
| Short-term vs long-term holding period distinction | **Missing** | See Missing Feature 6 |
| State deduction limits | **Not implemented** | See Missing Feature 1 |
| AMT phaseout of itemized deductions | **Not implemented** | See Missing Feature 2 |
| Publicly traded securities in Form 8283 Section A | **Wrong** | See Bug 6 — all > $5k go to Section B |

**Summary:** The IRS rule coverage for the core 60/30/20 framework, substantiation, and carryforward is solid. The critical gaps are conservation easement categorization (Bug 1), publicly traded securities Form 8283 routing (Bug 6), short-term vs long-term holding period, and absent state-level and AMT rules.

---

## Overall Rating

**6.5 / 10**

The Tax Center is the most sophisticated charitable contribution tracking tool available in any foundation portfolio management platform — Blackbaud RE NXT has nothing close to this, and Fidelity Charitable's deduction tracker is read-only with no strategy modeling. The IRS rule coverage for the core 60/30/20/carryforward framework is accurate and the OBBB 2026 changes are already implemented. The scenario modeler and bunching analysis are genuinely useful. However, the conservation easement AGI limit bug (Bug 1) is a material IRS compliance error that could cause a user to structurally undercount a significant deduction; the Form 8283 publicly traded securities routing bug (Bug 6) will cause CPAs to request unnecessary appraisals; the CPA Collaboration Portal is fully implemented but hidden; and the missing short-term holding period logic means appreciated-asset deduction estimates are unreliable for assets held under one year. These are table-stakes issues for a platform serving family office finance staff and their CPAs.

---

## Priority Fixes (Top 5)

### Priority 1 — Fix Conservation Easement AGI Category (Bug 1)

**Files to change:**
- `lib/schemas/tax` — add `'50_conservation'` to `AGILimitCategory` enum
- `lib/tax/agi-calculator.ts`, `determineAGILimitCategory()` — add `conservation_easement` branch returning `'50_conservation'`
- `lib/tax/agi-calculator.ts`, `getAGILimitPercentage()` — add `'50_conservation': 0.50`
- `lib/tax/agi-calculator.ts`, `getAGILimitCategoryLabel()` — add label
- `lib/tax/agi-calculator.ts`, bucket initialization loop — add the new category
- Database migration — add `'50_conservation'` to the `agi_limit_category` enum

This is a single PR, low complexity, high urgency. Conservation easement donations are common among the platform's target users (land trusts, legacy family foundations).

### Priority 2 — Ship the CPA Collaboration Portal (Gap 5)

Un-comment the import and usage in `app/dashboard/tax/page.tsx` (lines 15 and 243–246). The component, the API, and the backend token generation are all complete. Fix Bug 9 (hardcoded base URL) in the same PR by using `process.env.NEXT_PUBLIC_APP_URL` in `lib/tax/cpa-collaboration.ts`. This is the highest-value hiding feature in the codebase — CPAs are the actual decision-makers who push clients to switch from Blackbaud.

### Priority 3 — Fix Form 8283 Publicly Traded Securities Routing (Bug 6)

**File:** `lib/tax/form8283-generator.ts`, lines 61–62

Add a `publicly_traded` boolean field to `Form8283Contribution` and route contributions where `publicly_traded === true` to Section A regardless of value. The wizard (`ContributionTaxWizard.tsx`) and contributions route should capture this for stock contributions. This directly affects document accuracy that CPAs rely on.

### Priority 4 — Add Short-Term Holding Period Check to Deduction Calculations (Missing 6)

**File:** `lib/tax/scenario-calculator.ts`, `calculateScenario()` and related functions

When `date_acquired` is present and the holding period is less than 12 months, set `capitalGainsAvoided = 0` and cap the deductible amount at `cost_basis` (not FMV) for ordinary income property. Add a warning to `recommendations[]`. Also update `ContributionTaxWizard.tsx` to flag this during entry when `date_acquired` is within 12 months of `contributionDate`.

### Priority 5 — Fix Production Console Logs and Cache Headers (Security 4 & 5)

In `app/api/portfolio/[id]/tax/optimize/route.ts` and `app/api/portfolio/[id]/tax/scenarios/route.ts`: remove or gate the `console.log` calls that emit `taxYear` objects containing AGI values. Replace with structured logging at `debug` level that redacts financial fields.

In `app/api/portfolio/[id]/tax/overview/route.ts` and `app/api/portfolio/[id]/tax/contributions/route.ts`: change `Cache-Control: private, s-maxage=60` to `Cache-Control: private, no-cache` for routes returning AGI, deduction amounts, or contribution details.

These are 30-minute changes with meaningful compliance and data protection impact.
