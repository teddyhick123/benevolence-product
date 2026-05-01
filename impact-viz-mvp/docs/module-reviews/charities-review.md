# Charities Discovery — Module Review

**Reviewed:** 2026-04-26  
**Reviewer:** Senior Product Engineer  
**Scope:** `app/charities/`, `components/charities/`, `app/api/charities/`, `lib/services/` (charity-related), `db/migrations/0010_charities_and_news.sql`

---

## Data Richness Assessment

### What is stored in the DB schema (`0010_charities_and_news.sql`)

The canonical `charities` table defines the following columns:

| Column | Notes |
|---|---|
| `ein`, `name`, `also_known_as`, `mission` | Identity |
| `ntee_code`, `subsection_code`, `foundation_code`, `ruling_year` | Classification |
| `address_line1`, `city`, `state`, `zip`, `country`, `latitude`, `longitude` | Address + geo |
| `total_revenue`, `total_expenses`, `net_assets`, `fiscal_year` | Financials |
| `charity_navigator_score` (numeric), `charity_navigator_rating` (int) | CN rating fields |
| `give_well_top_charity` (boolean) | GiveWell flag only |
| `candid_seal` (text) | Candid |
| `propublica_score` | ProPublica |
| `is_active`, `deductibility_code`, `search_vector` | Meta |

**Missing from schema entirely:** `program_expense_ratio`, `annual_expenses` (uses `total_expenses`), `assets` (uses `net_assets`), `impact_focus` (text[]), `impact_metrics` (jsonb), `mission_statement` (uses `mission`), `street_address` (uses `address_line1`), `contact_email`, `contact_phone`, `contact_name`, `website` (present as `website`), `description`, `data_source`, `data_last_updated`, `ratings_last_updated`, `irs_deductibility_status`, `charity_navigator_rating` as JSONB (schema has it as `int`, not JSONB), `candid_rating` as JSONB (schema has `candid_seal` as text), `charity_impact_stories` table, `charity_activity_feed` table, `charity_rating_cache` table.

### Schema vs. Code mismatch — critical

The API routes and components were written against a **different schema** than what the migration creates. Virtually every column name used in the API code differs from what the migration defines:

| Code references | Actual DB column |
|---|---|
| `charity.mission_statement` | `charities.mission` |
| `charity.annual_revenue` | `charities.total_revenue` |
| `charity.annual_expenses` | `charities.total_expenses` |
| `charity.assets` | `charities.net_assets` |
| `charity.street_address` | `charities.address_line1` |
| `charity.charity_navigator_rating` (JSONB) | `charities.charity_navigator_rating` (int) + `charity_navigator_score` (numeric) |
| `charity.candid_rating` (JSONB) | `charities.candid_seal` (text) |
| `charity.contact_email` | Not in schema |
| `charity.contact_phone` | Not in schema |
| `charity.impact_focus` | Not in schema |
| `charity.impact_metrics` | Not in schema |
| `charity.description` | Not in schema |
| `charity.program_expense_ratio` | Not in schema |
| `charity.data_source` | Not in schema |

The API at `app/api/charities/route.ts:77` filters on `charity_navigator_rating->score` using JSONB path syntax, but the migration column is `charity_navigator_rating int` — this query will fail at runtime or return wrong results.

The `/api/charities/[ein]/route.ts` queries `charity_impact_stories` and `charity_activity_feed` tables (lines 49–61) that are not defined in any migration file.

The `/api/charities/enrich/route.ts` queries `charity_rating_cache` table that is not defined in any migration file.

### Comparison to competitors

| Data point | Charity Navigator | Candid | Benevolence (current) |
|---|---|---|---|
| Overall score (0–100) | Yes | Seal level | Stored but broken (int vs JSONB mismatch) |
| Financial sub-scores | Yes (3–4 dimensions) | Financials full | Schema has only score + rating int |
| Accountability score | Yes | Yes | Missing from schema |
| Program expense ratio | Yes | Yes | Not in schema |
| 990 filing history | Yes (links) | Yes | ProPublica filings in service, not in schema |
| Executive compensation | Yes (990 data) | Yes | Not present |
| Form 990 PDF links | Yes | Yes | Not present |
| Revenue trend (multi-year) | Yes | Limited | Not present |
| GiveWell recommendation | N/A | N/A | `give_well_top_charity` boolean only — no detail |
| Governance info | Yes | Yes | Not present |
| Board member data | Limited | Yes | Not present |
| NTEE classification | Yes | Yes | Present (ntee_code) |
| Geolocation | No | No | Present (lat/long indexed) |

The data richness is **well below Charity Navigator** for a research-grade tool. A program officer cannot perform due diligence from this page alone — no multi-year financials, no 990 PDF links, no executive compensation, no governance data.

---

## Search & Discovery Quality

### Strengths

- PostgreSQL full-text search using `search_vector` with tsvector weights (A=name, B=also_known_as, C=mission, D=ntee_code) is architecturally sound (`0010_charities_and_news.sql:75–81`).
- GIN trigram index `idx_charities_name_trgm` enables fast fuzzy prefix matching.
- Autocomplete endpoint at `/api/charities/search/autocomplete/route.ts` uses `ilike` with 2-character minimum. Response cached 5 minutes (`s-maxage=300`).
- Filters cover: sector, state, CN rating range, revenue range, impact focus (multi-select), and portfolio-specific interaction status.

### Weaknesses

1. **Autocomplete is not wired to the search UI.** `app/charities/page.tsx` has a plain `<input>` with no autocomplete dropdown component. The endpoint exists but is never called from the frontend. The `CharityFilterSidebar` and `CharityCard` components make no reference to the autocomplete route.

2. **Relevance sort does nothing useful for empty-query browsing.** `app/api/charities/route.ts:103–110`: when no `searchQuery`, it falls back to `created_at DESC` — which puts recently imported records first. For a 2M-row database this will surface arbitrary charities, not the most impactful or highly-rated ones.

3. **Rating filter will fail at runtime.** The filter `query.gte('charity_navigator_rating->score', parseInt(minRating))` (line 77) uses JSONB dot notation, but `charity_navigator_rating` in the migration is an `int`, not JSONB. This query will produce a Supabase error or return empty results for any rating filter applied.

4. **Sector list is hardcoded** in `CharityFilterSidebar.tsx:29–39` (10 entries), and does not align with the NTEE-derived sectors in `propublica.ts:133–165` (26 NTEE letter mappings). A user filtering by "Health" will miss records with sector "Mental Health" (NTEE F), "Food & Agriculture" (NTEE K), etc.

5. **Impact Focus filter is also hardcoded** (10 values in `CharityFilterSidebar.tsx:49–60`) and maps to an `impact_focus` column that does not exist in the migration schema.

6. **No EIN-format normalization.** The search bar placeholder says "Search by name, EIN, or location" but autocomplete uses a plain `ilike` that will fail to match `12-3456789` if stored as `123456789` (or vice versa). ProPublica strips hyphens; Charity Navigator strips hyphens in `charity-ratings.ts:104`; no normalization is enforced on insert.

7. **Pagination is broken for pages 4+.** `app/charities/page.tsx:323`: the pagination renders only `Math.min(3, totalPages)` page buttons — always pages 1, 2, 3 only — then an ellipsis and the last page. There is no window around the current page, so navigating to page 10 of 50 shows buttons [1][2][3]...[50] with no way to reach 8, 9, 11, 12.

---

## Competitive Assessment

Against the stated competitors:

**vs. Charity Navigator:** CN shows financial health, accountability, and leadership/adaptability sub-scores with trendlines, full 990 data, and IRS advisories. Benevolence currently shows only a score integer and grade letter on the detail page. No sub-scores, no trendlines, no advisories. CN is entirely free and publicly available — a program officer will simply open a new tab to CN rather than stay in Benevolence.

**vs. Candid (GuideStar):** Candid provides detailed 990 PDFs, financials breakdowns (program vs. fundraising vs. admin expense ratios), board composition, and executive compensation. Benevolence shows only a seal level (when configured). The Candid API client (`lib/services/candid.ts`) notes the endpoint format "may vary — check docs for exact format" (line 49), suggesting the integration was not tested against the live API.

**vs. GiveWell:** GiveWell provides cost-per-outcome estimates, intervention evidence grades, and room-for-more-funding analysis. Benevolence stores only a `give_well_top_charity boolean` with no detail, no narrative, no links.

**vs. ProPublica Nonprofit Explorer:** ProPublica shows multi-year 990 filing history with downloadable PDFs and trend charts. Benevolence's ProPublica client imports a snapshot and then the data goes stale — no refresh mechanism is triggered from the UI.

**Verdict:** The discovery module is not yet a compelling research tool for program officers. It would serve adequately as a lightweight watchlist manager, but cannot replace or compete with any of the four listed competitors for due diligence use cases.

---

## Bugs & Reliability Issues

### Critical (would cause runtime failures)

1. **Column name mismatches cause silent empty results or 500 errors across all routes.**  
   - `app/api/charities/route.ts:55` — `textSearch('search_vector', ...)` is correct, but lines 77–82 use `charity_navigator_rating->score` JSONB path on an `int` column. Supabase will return a `42883` operator error for any rating-filtered query.  
   - `app/api/charities/route.ts:50` — `select('*')` returns `total_revenue`, `total_expenses`, `net_assets`, `address_line1`, `mission` — but `CharityCard.tsx:40–41` references `charity.charity_navigator_rating?.score` (JSONB), `charity.annual_revenue`, `CharityDetailTabs.tsx:14–15` references `charity.annual_revenue`, `charity.program_expense_ratio`, `charity.mission_statement` — none of which match schema column names. All financial display will show "N/A".

2. **Missing tables queried at runtime.**  
   - `app/api/charities/[ein]/route.ts:49–60` queries `charity_impact_stories` and `charity_activity_feed` — neither exists in any migration. These will throw a Supabase `42P01` (undefined table) error on every charity detail page load, which is swallowed silently (the error is not logged when `data` is just null from `.select()`).  
   - `app/api/charities/enrich/route.ts` calls `cacheRating()` in `lib/services/charity-navigator.ts:167` which queries `charity_rating_cache` — also not defined. The enrichment endpoint will always fail when trying to write the cache.

3. **`PUT /api/charities/[ein]` allows unrestricted field updates without auth.**  
   `app/api/charities/[ein]/route.ts:145–153`: the PUT handler calls `supabasePublic()` (which respects RLS), then does `update({ ...body })`. However, the RLS policy at migration line 96–98 says `FOR UPDATE USING (false)` — meaning no user can update via RLS. Any PUT call will silently fail (Supabase returns 0 rows updated, not an error). The enrich route uses `createAdminClient()` and would bypass RLS correctly, but the public PUT route is a dead endpoint.

4. **`POST /api/charities/route.ts` uses `supabasePublic()` for inserts with RLS `INSERT ... WITH CHECK (false)`.** All charity creation from the API will fail silently. Only `createAdminClient()` (used in the import and enrich routes) can write to `charities`.

5. **`add-to-portfolio` inserts into `portfolio_recommendations` which has a schema mismatch.**  
   `app/api/charities/[ein]/add-to-portfolio/route.ts:143` inserts `organization_name`, `ein`, `interaction_status`, `min_investment`, `max_investment`, `description` — but the migration schema at `0008_metrics_and_kpis.sql:85–103` defines `portfolio_recommendations` as having only `recommendation_type`, `title`, `body`, `supporting_data`, `priority`, `is_dismissed`, `dismissed_by`, `dismissed_at`, `expires_at`. Columns `organization_name`, `ein`, `charity_id`, `interaction_status`, `recommended_by`, `status`, `min_investment`, `max_investment` do not exist in the migration. This insert will fail with a column-not-found error every time.

### High severity

6. **No rate limiting on `/api/charities` or `/api/charities/[ein]`.**  
   The routes use `supabasePublic()` with no Upstash/Redis rate limiter. Other routes in the codebase use `@upstash/ratelimit`. A malicious actor or misconfigured client can hammer the charity search endpoint with no throttling.

7. **`interactionStatus` filter in `CharityFilterSidebar` is never passed to the API.**  
   `app/charities/page.tsx:95–108` builds query params but never includes `interactionStatus`. The filter renders in the sidebar (line 278–295 of `CharityFilterSidebar.tsx`) but has no effect.

8. **No debouncing on the search input.**  
   `app/charities/page.tsx:66–68` fires `fetchCharities` on every `searchQuery` state change via `useEffect`. Since there is no debounce, each keystroke triggers a new API call. For a database with 2M rows, this creates significant unnecessary load.

9. **Charity Navigator API auth header mismatch.**  
   `lib/services/charity-navigator.ts:74` sends `'Subscription-Key': CHARITY_NAVIGATOR_API_KEY`. `lib/services/charity-ratings.ts:110` sends `'Authorization': Bearer ${apiKey}` for the same CN API endpoint. These two clients use different authentication headers — one will always fail when the API is enabled.

10. **30-day cache TTL for ratings is too long.**  
    Charity Navigator re-rates organizations quarterly. A 30-day cache (`lib/services/charity-navigator.ts:183`) is reasonable, but there is no mechanism to force-refresh from the UI, no `data_last_updated` display, and no staleness indicator shown to users. A program officer has no way to know if a 4-star rating is from yesterday or 29 days ago.

---

## UX Gaps

1. **No autocomplete dropdown.** The autocomplete route exists at `/api/charities/search/autocomplete` but is never rendered. Typing in the search box shows no suggestions.

2. **No side-by-side comparison.** Program officers routinely compare 2–3 organizations before a grant decision. There is no selection mechanism, no comparison drawer, and no comparison page.

3. **No watchlist / saved charities** outside of adding to a portfolio. There is no lightweight "bookmark for later" feature. Adding to a portfolio requires selecting a specific portfolio and setting investment ranges — too heavyweight for early-stage research.

4. **Mission statement is shown only on hover on the card** (`CharityCard.tsx:85–89`). This is a poor UX affordance — CSS hover states do not work on touch devices, and the information disappears when moving the mouse. Mission text should always be visible (truncated to 2 lines).

5. **No GiveWell context.** When `give_well_top_charity = true`, nothing on the detail page indicates this or links to the GiveWell analysis page. The boolean is stored but never rendered.

6. **"Add to Portfolio" modal does not link to portfolio creation** when no portfolios exist. It shows "No portfolios available. Please create a portfolio first." with no link or action button to navigate to portfolio creation (`AddToPortfolioModal.tsx:219–221`).

7. **Detail page has no "Also consider" / related charities panel.** After viewing a single charity, there is no discovery path to similar organizations by sector, location, or rating tier.

8. **No due diligence workflow.** There is no structured checklist, notes field per-charity (outside of the add-to-portfolio recommendation note), document attachment, or follow-up task system. Competing tools like FoundationSearch and even Candid's Nonprofit Profile provide structured DD templates.

9. **"My Portfolio" view does not show grant amounts, dates, or history** — only `interaction_status`. A program officer viewing their portfolio charities cannot see how much was previously granted.

10. **No map view for geographic giving analysis.** The schema stores `latitude` and `longitude` with a spatial index (`idx_charities_location`), but neither the list page nor the detail page renders a map. Google Maps service exists (`lib/services/google-maps.ts`) but is not used here.

---

## Missing Features

1. **Multi-year financial trend charts.** ProPublica stores `filings_with_data` (array of years) but `convertToCharity()` in `lib/services/propublica.ts:107` takes only `latestFiling` and discards the rest. No historical financials are stored or rendered. Charity Navigator shows 7-year revenue trend lines — a key due diligence signal.

2. **Form 990 PDF access.** ProPublica's API returns `url` fields linking to 990 PDFs (`filings_with_data[].url`). These are discarded in `convertToCharity()` and never displayed. Program officers routinely need to inspect 990s.

3. **Impact per dollar / cost-effectiveness metrics.** GiveWell's core value proposition. No cost-per-outcome data is modeled or shown.

4. **Peer benchmarking.** No ability to compare a charity's program expense ratio, revenue growth, or CN score against sector median or a custom peer set.

5. **Grant history visualization.** If a charity has received grants from the foundation before, the detail page shows nothing about past engagement. The `holdings` table supports this via `holding_type = 'foundation_grant'` and `charity_ein` linkage (confirmed in `0010_charities_and_news.sql:108`), but the detail page does not query or display this.

6. **ProPublica score display.** `charity_navigator_score` (numeric) and `propublica_score` are in the migration schema but neither is rendered in `CharityDetailTabs.tsx` or `CharityCard.tsx`.

7. **News/press section.** `news_articles` table is defined in `0010_charities_and_news.sql:103–157` with `charity_ein` linkage, but the detail page Activity tab queries the non-existent `charity_activity_feed` table instead of `news_articles`.

8. **Charity Navigator Encompass Rating.** CN launched its new "Encompass" scoring model in 2020, which includes Leadership & Adaptability and Culture & Community dimensions in addition to Finance and Accountability. The service file references `encompassRating` (`lib/services/charity-ratings.ts:32`) but the DB schema has no column for it and the UI does not display it.

9. **IRS BMF bulk seeding.** The migration comment mentions "seeded from IRS BMF" but no script or migration performs this. The empty-state UI (`app/charities/page.tsx:379`) tells users to run `npx ts-node scripts/import-charities-propublica.ts`, but that script does not appear to exist in the codebase.

---

## Integration with Portfolio

### What works (in theory)

- `POST /api/charities/[ein]/add-to-portfolio` has the right intent: permission check via `can_modify_portfolio`, duplicate detection, archived reactivation logic.
- The modal (`AddToPortfolioModal.tsx`) collects portfolio selection, note, and investment range — appropriate for a recommendation workflow.
- `CharityCard` passes `onAddToPortfolio` correctly from the list page.

### What is broken

- As documented above, the insert in `add-to-portfolio/route.ts:143` will fail because `portfolio_recommendations` in the migration lacks `charity_id`, `organization_name`, `ein`, `interaction_status`, `min_investment`, `max_investment`, `recommended_by`, and `status` columns. The entire add-to-portfolio flow is non-functional end-to-end.

- The "My Portfolio" view in `app/api/charities/route.ts:155–224` joins `portfolio_recommendations` with `charities` via `charity_id`, but `portfolio_recommendations` in the migration has no `charity_id` foreign key. This join will fail.

- There is no reverse integration: when viewing a holding of type `foundation_grant` on the dashboard or holdings page, there is no "View Charity Profile" link back to `/charities/[ein]`. Discovery is one-directional only.

- No grant creation from the charity detail page. The "Add to Portfolio" CTA creates a `portfolio_recommendations` record, not a `holdings` record. There is no path from the charity detail page to actually record a grant disbursement.

---

## Overall Rating

**3/10**

The module has a solid architectural skeleton — good routing structure, the right external API clients, a properly indexed search vector, and thoughtful caching design — but it is not functional in production. The `charities` table schema and the API/component code were developed independently and have diverged to the point where virtually every data read and write path fails at runtime. The `portfolio_recommendations` mismatch means the core "add to portfolio" flow is broken. The autocomplete endpoint exists but is unwired. The Impact and Activity tabs query non-existent tables. Until the schema and code are reconciled, this module cannot be used by real program officers.

---

## Priority Fixes (Top 5)

### 1. Reconcile the `charities` schema with the API column contract (Critical)

**File:** `db/migrations/0010_charities_and_news.sql` (schema), cross-referenced against `app/api/charities/route.ts`, `components/charities/CharityDetailTabs.tsx`, `components/charities/CharityCard.tsx`, `lib/services/charity-navigator.ts`, `lib/services/candid.ts`.

Create a new migration (`0026_charities_schema_fix.sql`) that adds the missing columns matching what the code actually uses:

```sql
ALTER TABLE charities
  ADD COLUMN IF NOT EXISTS annual_revenue         numeric(20,2), -- alias/rename total_revenue
  ADD COLUMN IF NOT EXISTS annual_expenses        numeric(20,2),
  ADD COLUMN IF NOT EXISTS assets                 numeric(20,2),
  ADD COLUMN IF NOT EXISTS program_expense_ratio  numeric(5,4),
  ADD COLUMN IF NOT EXISTS mission_statement      text,
  ADD COLUMN IF NOT EXISTS description            text,
  ADD COLUMN IF NOT EXISTS street_address         text,
  ADD COLUMN IF NOT EXISTS contact_email          text,
  ADD COLUMN IF NOT EXISTS contact_phone          text,
  ADD COLUMN IF NOT EXISTS contact_name           text,
  ADD COLUMN IF NOT EXISTS impact_focus           text[],
  ADD COLUMN IF NOT EXISTS impact_metrics         jsonb,
  ADD COLUMN IF NOT EXISTS data_source            text,
  ADD COLUMN IF NOT EXISTS data_last_updated      timestamptz,
  ADD COLUMN IF NOT EXISTS ratings_last_updated   timestamptz,
  ADD COLUMN IF NOT EXISTS irs_deductibility_status text;

-- Convert charity_navigator_rating from int to jsonb to match API expectations
ALTER TABLE charities
  ALTER COLUMN charity_navigator_rating TYPE jsonb USING
    CASE WHEN charity_navigator_rating IS NOT NULL
         THEN jsonb_build_object('score', charity_navigator_score, 'rating', charity_navigator_rating)
         ELSE NULL
    END;

-- Convert candid_seal text to jsonb candid_rating
ALTER TABLE charities ADD COLUMN IF NOT EXISTS candid_rating jsonb;
UPDATE charities SET candid_rating = jsonb_build_object('seal_level', candid_seal) WHERE candid_seal IS NOT NULL;
```

Alternatively, audit and update all API routes and components to use the existing column names (`total_revenue`, `net_assets`, `mission`, `address_line1`). Either approach is valid, but a new migration is safer than altering the live code.

### 2. Fix `portfolio_recommendations` schema for charity use (Critical)

**File:** `db/migrations/0008_metrics_and_kpis.sql` (current schema), `app/api/charities/[ein]/add-to-portfolio/route.ts`.

The current `portfolio_recommendations` table was designed for AI-generated portfolio suggestions, not for user-curated charity watchlists. Either:

(a) Create a separate `portfolio_charities` join table with the columns the add-to-portfolio code expects (`charity_id`, `portfolio_id`, `interaction_status`, `recommended_by`, `min_investment`, `max_investment`, `status`, `description`), or

(b) Add those columns to `portfolio_recommendations` via migration and update the RLS policies.

Until this is resolved, the "Add to Portfolio" button on every charity card and detail page will throw a database error.

### 3. Create missing tables: `charity_impact_stories`, `charity_activity_feed`, `charity_rating_cache` (High)

**File:** `app/api/charities/[ein]/route.ts:49–61`, `lib/services/charity-navigator.ts:134–200`, `lib/services/candid.ts:95–161`.

Add a migration defining these tables:

```sql
CREATE TABLE IF NOT EXISTS charity_impact_stories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  charity_id uuid NOT NULL REFERENCES charities(id) ON DELETE CASCADE,
  title text NOT NULL,
  story_text text,
  beneficiaries_impacted int,
  published_date date,
  image_url text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS charity_activity_feed (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  charity_id uuid NOT NULL REFERENCES charities(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  title text NOT NULL,
  description text,
  published_date date,
  source_url text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS charity_rating_cache (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  charity_id uuid NOT NULL REFERENCES charities(id) ON DELETE CASCADE,
  provider text NOT NULL,
  rating_data jsonb,
  expires_at timestamptz,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (charity_id, provider)
);
```

In the short term, replace the `charity_activity_feed` query in `app/api/charities/[ein]/route.ts:56–61` with a query against `news_articles WHERE charity_ein = $1` — that table already exists and is populated.

### 4. Wire autocomplete to the search UI (High)

**File:** `app/charities/page.tsx:217–223`.

The autocomplete endpoint (`/api/charities/search/autocomplete`) is fully built and cached. Add a debounced dropdown to the search input:

- Add 300ms `useCallback`/`useDebounce` on `searchQuery` change.
- Fetch `/api/charities/search/autocomplete?q=${query}` when `query.length >= 2`.
- Render a positioned dropdown below the search input showing name, sector, and location.
- On selection, navigate directly to `/charities/[ein]` (bypassing the list page for exact EIN matches).
- This also resolves the missing debounce on the main search (fix #8 in Bugs section).

### 5. Fix the Charity Navigator API client auth header inconsistency and surface 990 data (High)

**File:** `lib/services/charity-navigator.ts:74`, `lib/services/charity-ratings.ts:110`, `lib/services/propublica.ts:104–126`.

Two separate Charity Navigator clients use different auth headers (`Subscription-Key` vs `Authorization: Bearer`). Consolidate to a single client using the documented header and delete the redundant `charity-ratings.ts` CN implementation.

Separately, update `convertToCharity()` in `lib/services/propublica.ts` to store all filings, not just the latest:

```typescript
// Instead of:
const latestFiling = org.filings_with_data?.[0];

// Store all:
const filingHistory = org.filings_with_data?.map(f => ({
  year: f.tax_prd_yr,
  revenue: f.totrevenue,
  expenses: f.totfuncexpns,
  assets: f.totassetsend,
  pdf_url: f.url,
}));
```

Store this in an `impact_metrics` jsonb column (once added per Fix #1) so the Financials tab can render multi-year trend data — the single most impactful differentiator vs. what a program officer can find with a basic Google search.
