# Phase 3B — Spend Caps and Transparency

**Status:** Design approved 2026-08-24. Implementation plan not yet written.

**Goal:** Bound what the platform spends on an organization's behalf, and show that organization exactly what it was.

**Roadmap context:** `docs/agent-work/plans/2026-08-16-tenant-sovereignty-roadmap.md` § Phase 3, scope items 3 and 4. Items 1, 2 and 5 shipped as Phase 3A (`docs/agent-work/specs/2026-08-24-phase3a-attribution-and-pricing-design.md`), which this phase depends on entirely: without priced, attributed rows there is nothing to cap or display.

---

## The problem

Phase 3A made every model call attributable and priced. Nothing yet bounds it, and no organization can see it. `AIModelsSettings.tsx` shows four tiles — invocations, failures, tokens, reported cost — computed by fetching thirty days of `ai_usage_log` rows and reducing them in TypeScript (`lib/api/repositories/ai-settings.ts:87-113`). That is enough for four numbers and not enough for a breakdown, a trend, or a limit.

## Decisions

| Decision | Choice |
|---|---|
| Cap behaviour at the ceiling | A per-org setting: `hard_stop` (default), `read_only`, or `own_key` |
| Where the cap is enforced | Turn start, with funding inferred from route configuration |
| Who sets the limit | The platform sets a ceiling; an organization may set a lower one |
| Dashboard scope | Funding split, per-workload breakdown, and a time series |
| Spend computation | One SQL function is the single definition, shared by enforcement and display |

### Why one definition of spend

The number an administrator sees and the number that stops their assistant have to be the same number. Two implementations of the same sum will diverge, and a dashboard reading 80% while the cap fires destroys trust in both. A single function makes divergence a test failure rather than a support ticket.

---

## Schema

A new migration, `0059_org_ai_spend_caps.sql`.

```sql
CREATE TABLE public.org_ai_spend_caps (
  org_id              uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Null means uncapped. Only the platform may set this.
  platform_limit_usd  numeric CHECK (platform_limit_usd IS NULL OR platform_limit_usd >= 0),
  -- An organization's self-imposed limit, never above the platform's.
  org_limit_usd       numeric CHECK (org_limit_usd IS NULL OR org_limit_usd >= 0),
  warn_at_percent     integer NOT NULL DEFAULT 80
                        CHECK (warn_at_percent BETWEEN 1 AND 100),
  on_limit            text NOT NULL DEFAULT 'hard_stop'
                        CHECK (on_limit IN ('hard_stop','read_only','own_key')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_ai_spend_caps_org_limit_within_platform
    CHECK (org_limit_usd IS NULL
           OR platform_limit_usd IS NULL
           OR org_limit_usd <= platform_limit_usd)
);
```

The effective limit is `LEAST(platform_limit_usd, org_limit_usd)`, treating null as absent rather than zero. `warn_at_percent` is a percentage of that effective limit, not of the platform ceiling.

RLS gives organization admins read access; all writes are service-role only. The authority split lives in the route guards — an app-admin route writes `platform_limit_usd`, an org-admin route writes `org_limit_usd` — rather than in column permissions, which Postgres RLS cannot express per-column here.

**Lowering the platform ceiling clamps the organization's limit.** Without a rule, an app admin reducing `platform_limit_usd` below an existing `org_limit_usd` would violate the CHECK and the update would fail — the platform unable to reduce a budget it owns because the tenant set a number under the old ceiling. The app-admin write path therefore sets `org_limit_usd = LEAST(org_limit_usd, platform_limit_usd)` in the same statement. The constraint stays as the backstop; the clamp is what keeps it from being an obstruction.

## The definition of spend

```sql
org_platform_spend(p_org_id uuid, p_period_start timestamptz) RETURNS numeric
```

Two things it encodes that are easy to get wrong.

**Funding.** It sums only rows where `deployment_id IS NULL` — platform-default targets. An organization routing a workload to its own deployment is spending its own money, and capping that would throttle something the platform does not pay for.

This is also what makes `own_key` coherent rather than surprising: crossing the cap moves execution to a funding source the cap does not count, so platform spend stops by construction rather than by policy.

**Cost precedence.** `COALESCE(reported_cost, computed_cost)`, matching `resolveCost` in `lib/api/repositories/ai-invocations.ts` exactly. If the two disagreed, the cap and the row it read would disagree about the same call.

**Period.** Calendar month. A rolling window never resets cleanly and produces "why am I still capped?"; a calendar month matches how providers invoice and how people reason about budgets. `p_period_start` is a parameter rather than computed inside the function so tests can pin it.

### Unpriced rows contribute zero

A platform-default model with no rate produces `cost_source: 'unpriced'` and a null cost, so it adds nothing to the total. Spend is under-counted and the cap under-enforces.

**Phase 3A's rate coverage guard is what prevents this**, which makes that guard load-bearing for cap correctness rather than only for reporting accuracy. Anyone removing it needs to know what else breaks.

---

## Enforcement

Only one of the three behaviours refuses anything. `hard_stop` declines a turn, which is what `begin_ai_turn` can do. `read_only` and `own_key` do not refuse — they change how a turn resolves, which belongs to the resolver.

| Behaviour | Enforced in | Mechanism |
|---|---|---|
| `hard_stop` | `begin_ai_turn` | Returns a refusal in its JSONB envelope; no turn row is created |
| `read_only` | `resolveOrganizationAIExecution` | Forces `toolMode: 'read_only'` |
| `own_key` | `resolveOrganizationAIExecution` | Resolves to an active organization deployment |

Both consult `org_platform_spend`, so they cannot disagree about whether the org is over.

### Funding at turn start

`begin_ai_turn(p_portfolio_id, p_user_id, p_request_id, p_content)` takes no workload, so it is the assistant turn boundary specifically; the workload is implicitly `assistant`. The organization comes from `portfolios.org_id`.

Funding is inferable without resolving a plan: a workload with an enabled organization route to a deployment is org-funded; everything else is platform-funded. That is the same discriminator `org_platform_spend` uses, one step earlier.

**A cap refusal returns rather than raises.** `begin_ai_turn` currently raises for access denial with SQLSTATE `42501`. A spend cap is an expected business condition, not a fault, and raising would make it indistinguishable from a real failure to every caller. It therefore returns its normal JSONB envelope carrying an error discriminator, and `lib/api/repositories/ai-chat.ts` maps that to a typed error. The exact envelope must match what that repository already destructures — read it before choosing field names rather than inventing a new shape.

### `own_key` requires a fallback

`own_key` only applies when the organization has an active deployment whose template advertises the workload's required capabilities — and by definition it has *not* routed this workload to that deployment, or the call would already be org-funded and uncounted.

When no eligible deployment exists, `own_key` degrades to `hard_stop` rather than continuing to spend. The degradation is surfaced in the dashboard, not only in code: an administrator who chose `own_key` and got a stop deserves to see why.

**`own_key` interacts with Phase 2B verification, and can quietly become `read_only`.** Once resolution targets an organization deployment, the existing `toolMode` rule applies: full tools require current passing evidence for that workload, or an explicit `allow_experimental` acceptance. An organization that falls back to an unverified deployment therefore keeps the assistant answering but loses write tools — arriving at `read_only` behaviour without having chosen it.

This is correct behaviour and must not be special-cased away; verification exists precisely so unverified models do not get write access. But it must be visible. The dashboard states which deployment `own_key` selected and whether it carries write access, so "my assistant stopped creating holdings after we hit the cap" has a stated cause rather than being a second silent capability change.

### Builder always hard-stops

Phase 3A made Builder workloads non-routable and platform-funded. `own_key` is therefore impossible for them, and `read_only` is meaningless for a scaffold run. `builder_claim_code_run` refuses at the cap regardless of `on_limit`.

This asymmetry follows from a decision already made, but it must be documented: an administrator who selects `own_key` and watches Builder stop anyway needs an explanation rather than a mystery.

### The warning threshold is display-only

At `warn_at_percent` the dashboard shows an approaching-limit state and the settings payload carries it. No emails and no notification rows: `lib/notifications` is a separate system, and wiring it in is a larger commitment than this phase needs.

---

## Dashboard

### A separate endpoint

`GET /api/org/[orgId]/ai-settings/usage` returns the report, consumed through a domain hook in `lib/ai/hooks.ts` (created in Phase 2B).

The main settings payload keeps only cap *status* — one scalar function call — because the routing UI needs to know whether the organization is capped. The detail moves out because that payload already carries connections, deployments, routes and catalog, and is fetched on every settings page load by users who are mostly not looking at spend.

The existing in-TypeScript reduction over thirty days of rows is replaced by SQL aggregation. It was adequate for four tiles and is not adequate for a breakdown and a trend.

### Two functions, not five

`org_platform_spend` stays the scalar authority. `org_ai_usage_report(p_org_id, p_period_start)` returns a single JSONB carrying the funding split, the per-workload rows, and the daily series — one round trip, one place the aggregation lives, and one thing for the reconciliation test to compare.

### What it shows

```
Platform-funded   $412.80 of $500    83%   resets 1 Sep
Your own key      $88.20                   not capped

By workload       assistant        $210.40
                  builder_review   $118.90
                  builder_build    $ 61.10
                  extraction       $ 22.40

30-day trend      ▁▂▃▃▅▆▇█
```

Per-user and per-deployment breakdowns are deliberately excluded. Per-user cannot include Builder at all — Phase 3A established that scaffold rows carry `user_id: null` because a queued job has no user present — and a breakdown that silently omits the most expensive workload is worse than no breakdown. Per-deployment largely duplicates per-workload for any organization with a small number of deployments.

---

## Failure states

A silent failure is worse than a refusal. Each of these is legible or it does not ship.

**`hard_stop`.** The chat route surfaces a typed error naming the effective limit and the reset date, not a generic 500.

**`read_only`.** The assistant keeps answering and loses write tools. This is the most confusing state available — "it stopped being able to act and nobody said why" — so it requires a visible banner in the assistant UI, not merely a changed `toolMode`. **If the banner cannot be placed, `read_only` does not ship**; shipping a silent capability change would be worse than offering two behaviours instead of three.

**Builder at the cap.** The claim refuses and the run is marked failed with a spend-cap reason. A proposal sitting queued forever with no explanation is the worst available outcome.

---

## Testing

The reconciliation test is the one the structure exists for:

> the report's platform-funded total **equals** `org_platform_spend` for the same period.

Also required:

- Cap arithmetic: under, exactly at, and over the limit; `LEAST` of the two limits; a null limit means uncapped rather than zero.
- The funding discriminator: rows with a `deployment_id` are excluded from the platform total.
- Unpriced rows contribute zero — asserted explicitly, so the dependency on Phase 3A's rate guard is visible in the test suite and not only in prose.
- Each behaviour: `hard_stop` refuses at `begin_ai_turn`; `read_only` forces `toolMode`; `own_key` selects an eligible deployment; `own_key` with none degrades to `hard_stop`.
- Builder hard-stops regardless of `on_limit`.
- Schema behaviour in `scripts/verify/schema-behavior.sql`: the `org_limit <= platform_limit` CHECK holds, and an organization admin cannot write `platform_limit_usd`.

---

## Scope

This is the largest of the three phases: a migration with two functions, changes to two RPCs, resolver changes for two behaviours, a new endpoint, and interface work in two places. Roughly 10–12 tasks. Still one plan, because the pieces are not independently useful — a cap nobody can see is not shippable, and a dashboard showing a limit that does not exist is not either.

## Out of scope

- Notifications or email at the warning threshold. Display only.
- Per-user and per-deployment breakdowns, for the reasons above.
- Capping organization-funded spend. That is their provider bill, not platform cost.
- Rollup or materialised spend counters. A live `SUM` is authoritative by construction and cannot drift; add a rollup when the query cost is demonstrated, not before.
- Backfilling caps onto existing organizations. A row is created on first configuration; its absence means uncapped.
