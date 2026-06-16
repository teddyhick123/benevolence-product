# Simulated Walkthrough Testing Implementation Plan

**Goal:** Give developers and coding agents a deterministic environment for repeatable browser journeys and exploratory simulated walkthroughs that discover authorization, workflow, state, and UX bugs.

**Architecture:** Run destructive walkthrough testing against a local Supabase stack seeded with stable personas and domain records. Use Playwright for repeatable regression journeys and trace collection. Use the in-app Browser Use plugin for exploratory sessions, following the same persona catalog, reset command, invariants, and bug-report format.

**Tech Stack:** Next.js 15, Supabase CLI/local stack, TypeScript, Playwright, Vitest, Browser Use.

---

## Implementation Status

Implemented on June 12, 2026:

- Guarded local Supabase lifecycle, canonical migration symlink, deterministic seeding, and environment doctor.
- Eight personas across full-module Alpha, minimal-module Beta, and isolated Gamma organizations.
- Playwright observation fixtures, 13 smoke/journey tests, database assertions, and failure artifacts.
- Critical coverage for login routing, tenant isolation, role boundaries, module gating, org switching, onboarding provisioning, grant lifecycle, and module administration.
- Five exploratory walkthrough cards, agent operating protocol, bug template, and CI smoke workflow.
- Product fixes discovered while implementing the walkthroughs: org dashboard membership proof, multi-org `/api/me`, canonical onboarding portfolio creation, and org-scoped grant transitions.

Verification still requiring a machine with Docker:

- Apply all canonical migrations to a fresh local Supabase stack, seed the baseline, and execute the 13 Playwright tests end to end.
- Confirm the CI workflow in GitHub and configure branch protection to require it.

Priority 2 journeys remain future product expansion and are not part of the critical-path definition of done.

---

## Verified Baseline

- `db/migrations` is the canonical schema source and currently contains 44 active migrations.
- The repo has a substantial Vitest suite, but no Playwright/Cypress browser harness.
- There are no tracked CI workflows under `.github/workflows`.
- No production components currently use `data-testid`.
- `db/demo/seed_demo_org.sql` is useful for demos, but it uses random IDs and the first auth user, so it is not deterministic enough for walkthrough testing.
- Supabase CLI `2.67.1` is installed. The local stack is not currently running because Docker is not running.
- The application uses real Supabase email/password login and synchronizes browser auth to server cookies through `/api/auth/session`.

---

## Strategic Decisions

| Decision | Recommendation | Reason |
|---|---|---|
| Test database | Local Supabase only | Walkthroughs need destructive resets and real Auth/RLS behavior without risking shared data. |
| Schema source | Keep `db/migrations` canonical | Walkthrough tooling must consume the product schema, never create a second migration history. |
| Persona creation | TypeScript seed script using the service-role client | Auth users must be created through Supabase Auth; stable IDs and records make assertions reliable. |
| Repeatable browser tests | Playwright | Provides fixtures, multiple browser contexts, network/console observation, screenshots, and traces. |
| Exploratory agent testing | Browser Use plus documented walkthroughs | Lets an agent behave like a user while sharing the same deterministic baseline as Playwright. |
| Selectors | Prefer accessible roles/labels; add `data-testid` only for unstable or ambiguous controls | Keeps tests user-centered without making complex interactions brittle. |
| External services | Stub or disable by default | AI, QuickBooks, email, and third-party APIs should not make core walkthroughs flaky or expensive. |
| State assertions | Query local Supabase from Playwright fixtures | Confirms UI actions produced the correct database state and did not cross tenant boundaries. |

---

## Target Developer Experience

```bash
npm run walkthrough:doctor       # Verify Docker, Supabase CLI, ports, and required tools
npm run walkthrough:setup        # Start local Supabase, reset schema, and seed personas
npm run walkthrough:reset        # Restore the deterministic baseline
npm run walkthrough:dev          # Run Next.js against local walkthrough Supabase
npm run walkthrough:test         # Run all repeatable Playwright journeys
npm run walkthrough:smoke        # Run the fastest critical-path journeys
npm run walkthrough:test:ui      # Open Playwright UI for local debugging
```

`walkthrough:reset` must refuse to run unless the Supabase URL is local.

---

## Deterministic Persona Catalog

Use fixed UUIDs, emails under `@walkthrough.local`, and one non-secret local-only password.

| Persona | Membership | Primary purpose |
|---|---|---|
| `app_admin` | App admin and owner of Alpha | Admin console and platform-level boundaries |
| `org_owner` | Owner of Alpha | Full organization and module administration |
| `org_admin` | Admin of Alpha | Privileged org operations without app-admin access |
| `member` | Member of Alpha | Normal daily workflows |
| `viewer` | Viewer of Alpha | Read-only mutation boundaries |
| `multi_org_member` | Member of Alpha, admin of Beta | Org switching and stale-context isolation |
| `new_user` | No org and no completed onboarding | Signup/onboarding journey |
| `outsider` | Member of Gamma only | Cross-org authorization attacks |

Seed organizations:

- **Alpha Foundation:** all core walkthrough modules enabled and rich domain data.
- **Beta Foundation:** minimal modules enabled to test module gating.
- **Gamma Foundation:** isolation target that Alpha users cannot access.

Seed stable portfolios, holdings, grants at several lifecycle stages, donors, pledges, tax records, tasks, and compliance records. Every fixture record should have a named exported ID.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `package.json` | Modify | Add walkthrough and Playwright commands/dependencies |
| `playwright.config.ts` | Create | Browser projects, web server, retries, traces, screenshots, and output paths |
| `supabase/config.toml` | Create | Local Supabase project configuration |
| `supabase/migrations` | Create symlink or verified adapter | Make local Supabase consume canonical `db/migrations` without copying them |
| `scripts/walkthrough/doctor.ts` | Create | Validate local prerequisites and prevent unsafe targets |
| `scripts/walkthrough/reset.ts` | Create | Reset local schema and invoke deterministic seeding |
| `scripts/walkthrough/seed.ts` | Create | Create auth personas and stable application records |
| `scripts/walkthrough/dev.ts` | Create | Start Next.js with local Supabase environment values |
| `tests/walkthrough/personas.ts` | Create | Persona credentials and stable fixture IDs |
| `tests/walkthrough/fixtures.ts` | Create | Playwright auth, database, observation, and reset fixtures |
| `tests/walkthrough/smoke/*.spec.ts` | Create | Fast login, routing, tenant-isolation, and module-gating checks |
| `tests/walkthrough/journeys/*.spec.ts` | Create | Full user journeys |
| `tests/walkthrough/BUG_TEMPLATE.md` | Create | Standard reproducible bug report |
| `docs/walkthroughs/*.md` | Create | Human/agent exploratory walkthrough cards |
| `AGENTS.md` | Modify | Add simulated walkthrough protocol and safety rules |
| `.gitignore` | Modify | Ignore Playwright reports, traces, screenshots, and local walkthrough env |
| `.github/workflows/walkthrough-smoke.yml` | Create | Run deterministic smoke journeys in CI |

---

## Phase 1: Local Harness And Safety

### Task 1.1: Add Playwright and local Supabase configuration

- [ ] Add `@playwright/test` as a development dependency.
- [ ] Create `playwright.config.ts` with Chromium first; retain a path to add Firefox/WebKit later.
- [ ] Configure traces on first retry, screenshots on failure, and HTML plus JUnit reports.
- [ ] Create `supabase/config.toml`.
- [ ] Make local Supabase consume `db/migrations` through a symlink or adapter that is verified by a clean reset.
- [ ] Document Docker as a walkthrough prerequisite.

Acceptance:

- A clean local Supabase stack can apply every active migration from `db/migrations`.
- No duplicate migration files are committed under `supabase/migrations`.

### Task 1.2: Add guarded lifecycle commands

- [ ] Implement `walkthrough:doctor`.
- [ ] Implement `walkthrough:setup`, `walkthrough:reset`, and `walkthrough:dev`.
- [ ] Read local Supabase keys/URLs from `supabase status`, rather than hard-coding secrets.
- [ ] Add a hard guard that rejects non-local database URLs before reset or seed.
- [ ] Make commands fail with actionable messages when Docker or Supabase is unavailable.

Acceptance:

- `npm run walkthrough:setup` brings a new machine from stopped stack to seeded baseline.
- Running reset with a remote Supabase URL fails before any mutation.

---

## Phase 2: Deterministic Personas And Fixtures

### Task 2.1: Build the seed model

- [ ] Define stable UUIDs and persona metadata in `tests/walkthrough/personas.ts`.
- [ ] Create users through `auth.admin.createUser()` with confirmed emails.
- [ ] Seed organizations, memberships, portfolios, and modules.
- [ ] Seed the minimum realistic records needed by initial journeys.
- [ ] Ensure every insert is deterministic and reset-safe.
- [ ] Add a seed verification step that checks expected row counts and relationships.

Acceptance:

- Two consecutive resets produce the same IDs and logical state.
- Every persona can sign in with the documented local credentials.
- Alpha, Beta, and Gamma data are provably isolated.

### Task 2.2: Build Playwright fixtures

- [ ] Add a `loginAs(persona)` helper using the real login UI.
- [ ] Save per-persona authenticated storage state after setup for fast repeat tests.
- [ ] Add a local service-role Supabase fixture for post-action state assertions.
- [ ] Capture `pageerror`, failed requests, HTTP 5xx responses, and unexpected console errors.
- [ ] Add a small explicit allowlist for known benign browser noise.

Acceptance:

- Tests can launch as any persona without sharing cookies between personas.
- Unexpected browser/runtime failures fail the test and appear in the report.

---

## Phase 3: First Vertical Slice

### Task 3.1: Add stable selectors only where needed

- [ ] Audit login, org switcher, module settings, grant pipeline, and grant transition controls.
- [ ] Prefer role/name/label selectors where they are unique.
- [ ] Add `data-testid` only to ambiguous controls, dynamic cards, and stateful workflow affordances.
- [ ] Establish a naming convention: `<domain>-<entity>-<action>`.

Acceptance:

- Initial journeys do not rely on CSS classes, element order, or incidental copy.

### Task 3.2: Implement smoke journeys

Create these first:

1. `login-routing.spec.ts`
   - Each persona reaches the correct post-login destination.
   - App admin can reach admin console; ordinary users cannot.
   - New user reaches onboarding.

2. `tenant-isolation.spec.ts`
   - Alpha member can view Alpha.
   - Alpha member cannot view or mutate Gamma by direct URL/API request.
   - Multi-org member switching does not leak stale Alpha data into Beta.

3. `role-boundaries.spec.ts`
   - Viewer can read allowed data.
   - Viewer mutation attempts fail in UI, API, and resulting DB state.
   - Org admin cannot perform app-admin actions.

4. `module-gating.spec.ts`
   - Alpha can access enabled modules.
   - Beta cannot access disabled-module routes or data.

Acceptance:

- `npm run walkthrough:smoke` passes from a fresh reset.
- Each test checks both visible behavior and resulting database state where relevant.
- A deliberately introduced cross-org regression causes a clear failure and trace.

---

## Phase 4: High-Value Product Journeys

Implement one journey at a time, adding focused selectors and fixture data as required.

### Priority 1

- [ ] **Onboarding:** new user completes intake, creates org/portfolio, and lands in the correct workspace.
- [ ] **Grant lifecycle:** create grant, transition through allowed stages, record decisions/history, reject invalid transition, and verify viewer restrictions.
- [ ] **Org switching:** change active org in one tab, exercise stale second tab, and verify all mutations remain correctly scoped.
- [ ] **Module administration:** enable/disable modules and verify navigation, routes, APIs, and AI tool filtering agree.

### Priority 2

- [ ] Donor creation through pledge and acknowledgment workflows.
- [ ] Tax contribution creation, document permissions, and export.
- [ ] Compliance filing completion and task/notification effects.
- [ ] Import review/approval/commit/rollback.
- [ ] AI assistant mutation plus undo/redo using a deterministic fake provider.

For every journey, cover:

- Happy path
- Permission boundary
- Invalid input
- Refresh/interruption
- Duplicate submit or repeated action
- Direct URL/API attempt
- Resulting database invariants

---

## Phase 5: Exploratory Agent Walkthroughs

### Task 5.1: Add walkthrough cards

Create one Markdown card per exploratory mission under `docs/walkthroughs/`. Each card must include:

- Persona and starting state
- User goal, not a click-by-click script
- Relevant invariants
- Suggested adversarial variations
- Expected cleanup/reset
- Known external-service limitations

Initial cards:

- `onboarding.md`
- `grant-lifecycle.md`
- `org-isolation.md`
- `module-gating.md`
- `stale-tabs-and-interruptions.md`

### Task 5.2: Add the agent protocol

Update `AGENTS.md` so an agent asked to discover bugs:

1. Runs `walkthrough:doctor` and `walkthrough:reset`.
2. Chooses a documented persona and walkthrough card.
3. Uses Browser Use to behave like a real user.
4. Checks console errors, failed requests, server output, and resulting DB state.
5. Records reproducible findings using `tests/walkthrough/BUG_TEMPLATE.md`.
6. Fixes confirmed bugs when requested, resets, and reruns the affected journey plus smoke suite.

Acceptance:

- Another agent can perform a useful exploratory session without asking how to authenticate, seed data, or judge success.

---

## Phase 6: CI And Operating Discipline

### Task 6.1: Add CI smoke coverage

- [ ] Start local Supabase in CI.
- [ ] Reset and seed the walkthrough baseline.
- [ ] Build/start Next.js against the local stack.
- [ ] Run Chromium smoke journeys.
- [ ] Upload traces, screenshots, and reports on failure.

Acceptance:

- Pull requests cannot merge with failing critical-path smoke journeys.
- Failure artifacts are sufficient to diagnose the issue without rerunning locally.

### Task 6.2: Establish maintenance rules

- [ ] Any bug found through a walkthrough gets a Playwright regression test when practical.
- [ ] Any new high-value workflow gets a walkthrough card and at least one smoke or journey test.
- [ ] Fixture changes preserve stable IDs and document intentional state changes.
- [ ] Tests must not call paid or mutable external services by default.
- [ ] Quarterly, review allowlisted console/network failures and delete stale exceptions.

---

## Recommended First Delivery

Keep the first implementation intentionally narrow:

1. Local Supabase config and guarded reset/setup commands.
2. Alpha, Gamma, `org_owner`, `viewer`, `new_user`, and `outsider` fixtures.
3. Playwright observation fixtures.
4. Login/routing and tenant-isolation smoke tests.
5. One `org-isolation.md` exploratory Browser Use card.
6. AGENTS.md walkthrough protocol.

This first slice proves the entire loop: reset, authenticate, simulate, observe, detect, report, fix, and rerun. Expand persona and workflow coverage only after that loop is reliable.

---

## Definition Of Done

- A developer or agent can restore a known local state with one command.
- Repeatable browser tests exercise real Auth, RLS, API routes, and UI behavior.
- Exploratory agents have personas, missions, invariants, and a bug-report format.
- Failed journeys preserve useful traces, screenshots, console errors, and network failures.
- Critical tenant, role, module, onboarding, and grant-lifecycle regressions are caught before merge.
