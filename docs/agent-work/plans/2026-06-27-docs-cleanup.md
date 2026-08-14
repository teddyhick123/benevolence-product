# Docs Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove stale/harmful docs, archive historical reviews and completed plans, update live references to reflect current product state, then write the missing product vision doc.

**Architecture:** Pure documentation work — no schema, code, or tests involved. Decisions are: delete (harmful or zero residual value), archive (historical value but not current reference), update (current reference that lags the product), or write (missing entirely). The reliability audit (`docs/module-reviews/2026-06-27-reliability-audit.md`) and full backlog (`docs/module-reviews/FULL-BACKLOG.md`) are the only module-reviews files with current value.

**Tech Stack:** Markdown, filesystem operations.

---

## File Disposition Map

| File | Action | Reason |
|------|---------|--------|
| `docs/DATABASE_AUDIT.md` | **Delete** | 2026-03-01, references dropped tables as "heavily used". Actively harmful. |
| `docs/archive/TAX_FEATURE_README.md` | **Delete** | References `db/0013_tax_tracking.sql` (stale path). Superseded by CLAUDE.md. |
| `docs/archive/CHARITY_RATINGS_FEATURE_README.md` | **Delete** | 2025-01-29 feature note. Superseded by MODULES.md and DATABASE_ARCHITECTURE.md. |
| `docs/archive/DEMO_DATA_GUIDE.md` | **Delete** | Thin how-to duplicated in GETTING_STARTED.md. |
| `docs/module-reviews/overall-review.md` | **Archive** | No staleness notice; describes missing modules that shipped. |
| `docs/module-reviews/MASTER-SUMMARY.md` | **Archive** | Has staleness notice but still leads with wrong scorecard. FULL-BACKLOG.md is the rollup. |
| `docs/module-reviews/2026-05-13-schema-code-alignment-sweep.md` | **Archive** | Historical; most issues resolved. |
| `docs/module-reviews/admin-import-review.md` | **Archive** | Snapshot review; FULL-BACKLOG.md is the rollup. |
| `docs/module-reviews/ai-assistant-review.md` | **Archive** | Same. |
| `docs/module-reviews/charities-review.md` | **Archive** | Same. |
| `docs/module-reviews/compliance-review.md` | **Archive** | Same. |
| `docs/module-reviews/donor-crm-review.md` | **Archive** | Same. |
| `docs/module-reviews/holdings-review.md` | **Archive** | Same. |
| `docs/module-reviews/quickbooks-review.md` | **Archive** | Same. |
| `docs/module-reviews/tax-review.md` | **Archive** | Same. |
| `docs/module-reviews/visualizations-review.md` | **Archive** | Same. |
| `docs/archive/plans/` (pre-2026-05-28) | **Archive** | Completed sprint plans. Preserve as history; do not treat as current. |
| `docs/USER_GUIDE.md` | **Rewrite** | Describes 2025-era product; omits grants, builder, tasks, AI mutations. |
| `docs/ARCHITECTURE.md` | **Update** | "White-label" and configurability language overstates current self-service surface. Update AI assistant description to include mutation capabilities. |
| `docs/DEMO_ENVIRONMENTS.md` | **Update** | Demo scenarios don't include grants lifecycle, Builder, or task/workflow. |
| `docs/README.md` | **Update** | Table of contents references files being archived/deleted. |
| `docs/PLATFORM_VISION.md` | **Write (new)** | The missing doc: what "tailored to your org" means from the foundation's perspective and where the product gap is. |
| `docs/ARCHITECTURE.md`, `docs/MODULES.md`, `docs/DATABASE_ARCHITECTURE.md`, `docs/GETTING_STARTED.md`, `docs/PROVISIONING.md`, `docs/MIGRATION_GUIDE.md`, `docs/PHILANTHROPY_TECH_MARKET_MAP.md` | **Keep** | Accurate and current. |
| `docs/walkthroughs/*.md` | **Keep** | Functional walkthrough mission guides. Current. |
| `docs/module-reviews/FULL-BACKLOG.md` | **Keep** | Canonical open backlog. Current. |
| `docs/module-reviews/2026-06-27-reliability-audit.md` | **Keep** | Most current audit. Critical. |

---

## Task 1: Delete harmful and zero-value files

**Files:**
- Delete: `docs/DATABASE_AUDIT.md`
- Delete: `docs/archive/TAX_FEATURE_README.md`
- Delete: `docs/archive/CHARITY_RATINGS_FEATURE_README.md`
- Delete: `docs/archive/DEMO_DATA_GUIDE.md`

- [ ] Delete `docs/DATABASE_AUDIT.md`
- [ ] Delete `docs/archive/TAX_FEATURE_README.md`
- [ ] Delete `docs/archive/CHARITY_RATINGS_FEATURE_README.md`
- [ ] Delete `docs/archive/DEMO_DATA_GUIDE.md`

---

## Task 2: Archive module review snapshots

**Files:**
- Move: `docs/module-reviews/overall-review.md` → `docs/archive/module-reviews/`
- Move: `docs/module-reviews/MASTER-SUMMARY.md` → `docs/archive/module-reviews/`
- Move: `docs/module-reviews/2026-05-13-schema-code-alignment-sweep.md` → `docs/archive/module-reviews/`
- Move: all individual `*-review.md` files → `docs/archive/module-reviews/`

- [ ] Create `docs/archive/module-reviews/` directory
- [ ] Move `overall-review.md` to archive
- [ ] Move `MASTER-SUMMARY.md` to archive
- [ ] Move `2026-05-13-schema-code-alignment-sweep.md` to archive
- [ ] Move all individual `*-review.md` files to archive

---

## Task 3: Archive completed sprint plans

**Files:**
- Move: `docs/agent-work/plans/2026-04-*.md`, `docs/agent-work/plans/2026-05-*.md` → `docs/archive/plans/`
- Keep in place: `docs/agent-work/plans/2026-06-*.md` (recent, may still be active)

- [ ] Create `docs/archive/plans/` directory
- [ ] Move all April and May 2026 plans to archive

---

## Task 4: Rewrite USER_GUIDE.md

**Files:**
- Modify: `docs/USER_GUIDE.md`

Must cover: onboarding flow, dashboard, holdings, grants lifecycle (14 stages, pipeline/table/calendar views), donors/acknowledgments, tax center (contributions, carryforwards, CPA sharing), compliance (filings, payout), tasks/workflow, AI assistant (what it can do including mutations, not just Q&A), Builder (org-level configuration), import/migration. Drop: outdated "Ben" framing, incomplete feature descriptions.

- [ ] Rewrite `docs/USER_GUIDE.md` with current product coverage

---

## Task 5: Update ARCHITECTURE.md

**Files:**
- Modify: `docs/ARCHITECTURE.md`

Changes:
- Tone down "rapidly create customized software" — be accurate: orgs enable modules and use AI tools within them; deeper customization requires the Builder
- Update AI assistant section to mention it can mutate data (create/update/delete operations via tools), not just answer questions
- Update onboarding diagram to reflect current 5-step flow (quick intake → AI conversation → recommendations → provisioning → dashboard)

- [ ] Update configurability language in opening and module system sections
- [ ] Update AI assistant section

---

## Task 6: Update DEMO_ENVIRONMENTS.md

**Files:**
- Modify: `docs/DEMO_ENVIRONMENTS.md`

Add to each scenario: grant pipeline (show attention queue + lifecycle transition), task/workflow (show task inbox), Builder (show an org admin making a module config change via chat). Update "AI Assistant" description — it can create holdings, log contributions, transition grants, etc.

- [ ] Rewrite Scenario 1 flow to include grants and tasks
- [ ] Rewrite Scenario 2 flow to include grants payments and task automation
- [ ] Add or update Scenario 3 to include Builder and module configuration

---

## Task 7: Update README.md

**Files:**
- Modify: `docs/README.md`

Remove references to `DATABASE_AUDIT.md`. Update module-reviews table to show only `FULL-BACKLOG.md` and `2026-06-27-reliability-audit.md` as current references. Add `PLATFORM_VISION.md` to the current references table. Add `docs/archive/` entry to historical material section.

- [ ] Update current references table
- [ ] Update module-reviews section
- [ ] Remove DATABASE_AUDIT.md reference

---

## Task 8: Write PLATFORM_VISION.md

**Files:**
- Create: `docs/PLATFORM_VISION.md`

This is the missing doc. It must answer: What does "tailored to your org" actually mean in this product? What journey does a foundation take from "this platform" to "our platform"? Where is the product today vs. where it needs to go to deliver on that promise?

Structure:
1. **The promise** — what we're building toward (the dream OS framing)
2. **What exists today** — honest accounting of what orgs can actually configure right now
3. **The gap** — what "tailored" requires that we don't yet have
4. **The path** — how the Builder, AI tools, and runtime config close that gap over time
5. **Who this is for** — foundation vs. family office vs. DAF sponsor — how tailoring looks different for each

- [ ] Write `docs/PLATFORM_VISION.md`
