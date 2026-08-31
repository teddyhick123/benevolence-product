# Phase 4A — Migrations Ledger and Schema Transparency

**Status:** Design approved 2026-08-31. Implementation plan not yet written.

**Goal:** Make the migration state of a database knowable, so that handing someone a database they can upgrade is a promise the platform can keep.

**Roadmap context:** `docs/agent-work/plans/2026-08-16-tenant-sovereignty-roadmap.md` § Phase 4, scope items 4 and 5, and finding F11. Items 1 and 3 (full data export and import) become Phase 4B; item 2 (configuration as a portable artifact) becomes Phase 4C. See [Scope](#scope).

---

## The problem

`scripts/migrate-client.ts` selects migrations by a human-supplied `--from`/`--to` range and applies every file in it. There is no record of what ran. Re-running against a populated database re-executes every migration file — 57 of them today — and because the DDL is guarded with `IF NOT EXISTS`, most statements silently do nothing and the run reports success.

Two consequences. An operator cannot tell whether a database is current, because "the migration ran" and "the migration did nothing" look identical. And a migration edited after it was applied — which the prerelease protocol in `CLAUDE.md` actively encourages — leaves no trace, so the file on disk and the schema in the database can disagree with nothing to detect it.

That is finding F11, and the roadmap states the consequence plainly: *"Portability is a promise you cannot keep while `run-migrations.sh` re-runs every file and guarded DDL silently no-ops."*

## Scope

Phase 4's five scope items are three independent projects plus a prerequisite. This spec covers the prerequisite and the small read surface that depends on it.

**In scope:** the migrations ledger (item 5) and schema transparency (item 4).

**Deferred:** full org data export and import (items 1 and 3) become **Phase 4B**, roughly 12–15 tasks over 100 org-scoped tables and three storage buckets. Configuration export and import as a portable artifact (item 2) becomes **Phase 4C**.

Both depend on this phase to be credible: an export whose schema state is unknowable cannot claim to reproduce a functionally identical org.

## Decisions

| Decision | Choice |
|---|---|
| Where the ledger lives | Our own table, `public.applied_migrations` |
| Behaviour on checksum drift | Refuse, with a documented reset escape. No override flag |
| Adopting an existing database | Backfill from Supabase's table; explicit `--adopt` when absent |
| Schema transparency scope | Migration state plus the org's own table inventory |
| Where comparison lives | One pure module, shared by the runner and the API |

### Why our own table

Supabase already maintains `supabase_migrations.schema_migrations` with `version`, `name` and `statements`, but only for CLI-driven runs. `scripts/migrate-client.ts` — what a client deployment actually uses — never writes to it, and it carries no checksum, so an edited file that already ran is undetectable.

Owning the table means owning the schema: checksums, an `applied_by` provenance column, and RLS. The cost is two tables describing overlapping facts, which the runner must keep consistent.

### Why no override flag

Drift is a hard error with no `--force`. An escape hatch that re-records a checksum without re-applying would become the habitual response, and the guarantee would erode to a warning nobody reads. The two real remedies are already correct: `supabase db reset` while the database is prerelease, and a new migration once it is not.

---

## The ledger

Migration `0060_migrations_ledger.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.applied_migrations (
  version      text PRIMARY KEY,
  filename     text NOT NULL,
  -- sha256 of the file's bytes, or 'unverified' for a backfilled row whose
  -- content at apply time is unknowable.
  checksum     text NOT NULL,
  applied_at   timestamptz NOT NULL DEFAULT now(),
  applied_by   text NOT NULL CHECK (applied_by IN ('cli','migrate-client','backfill'))
);
```

RLS gives organization admins read access; writes are service-role only. Reading is safe because the ledger describes the instance rather than a tenant, and each client gets a dedicated instance.

**The ledger migration records itself.** `0060` inserts its own row as part of its own execution, because the backfill it performs reads a table that does not yet list `0060`. Without that self-insert the ledger's first act would be to declare itself pending, and the next runner invocation would try to apply an already-applied migration — the exact failure this phase exists to prevent, reproduced at the bootstrap.

The self-insert is `applied_by: 'cli'` when the CLI applies it and is corrected to the real checksum on first runner contact, the same as any backfilled row.

### Adoption

Guessing is the failure mode, so adoption has three tiers.

1. **The migration backfills** from `supabase_migrations.schema_migrations`, which already records what ran, writing `checksum: 'unverified'` and `applied_by: 'backfill'`.
2. **The first ledger-aware runner invocation** replaces `'unverified'` with the file's real checksum. `'unverified'` is never treated as drift.
3. **A database with neither source** refuses to proceed and requires an explicit `--adopt <version>` naming the highest applied version.

The backfill covers exactly what the CLI recorded. On this repository that is all 57 files, verified: `supabase_migrations.schema_migrations` holds 57 rows and `db/migrations` holds 57 files. A deployment migrated by `scripts/migrate-client.ts` rather than the CLI will have fewer rows or none, which is precisely why tier 3 exists and why the runner reports the applied count rather than assuming it.

**Version numbers are not contiguous.** They are file-name prefixes, not a sequence, so adoption and comparison must key on the parsed version string and never on a numeric range.

### Three states, reported honestly

A backfilled row is recorded, not verified: the checksum written at first run is of the file *as it is now*, which may differ from what actually ran. That evidence does not exist and cannot be reconstructed, so the ledger distinguishes:

| State | Meaning |
|---|---|
| `verified` | Applied by a ledger-aware runner; checksum recorded at apply time |
| `adopted` | Present before the ledger; checksum recorded retroactively |
| `drifted` | Recorded checksum differs from the file on disk now |

Schema transparency shows which is which. Reporting a clean bill of health for history the platform cannot actually verify would be the same class of overstatement this phase exists to eliminate.

**Consequence for this repository:** its own database reads as 57 `adopted` and 1 `verified` — the ledger migration itself — until the next `supabase db reset`, after which everything is `verified`. That is correct and self-healing, not a defect.

---

## The comparison module

`lib/migrations/ledger.ts` is pure — no database, no filesystem — so the runner and the API cannot disagree about what drift means:

```ts
checksumOf(sql: string): string

compareLedger(
  files: { version: string; filename: string; sql: string }[],
  rows: AppliedMigrationRow[],
): {
  pending: MigrationFile[];
  drifted: { version: string; recorded: string; current: string }[];
  applied: { version: string; filename: string; state: 'verified' | 'adopted' }[];
}
```

`checksumOf` normalises line endings before hashing. Without that, a CRLF checkout reads as universal drift and the ledger refuses every migration on a Windows machine.

---

## The runner

`--from`/`--to` stops being the mechanism and becomes a filter. The runner queries `applied_migrations`, checksums every file on disk, and calls `compareLedger`.

| Condition | Behaviour |
|---|---|
| Any drift | Hard exit before applying anything. Names the file and both checksums, and prints both remedies |
| Nothing pending | Says so and exits 0 |
| Pending migrations | Applies them in order, recording a row per success with `applied_by: 'migrate-client'` |

The drift message states the two real answers rather than a generic failure:

```
ERROR  0030_ai_usage_log.sql has changed since it was applied
       recorded a3f9…  current 7c21…

  Prerelease: run `supabase db reset` to rebuild from source.
  Released:   add a new migration instead of editing this one.
```

"Nothing pending says so" is the roadmap's exit criterion. Today the same invocation re-runs all 57 files and reports success from guarded DDL that did nothing.

`--from` and `--to` continue to work as filters over `pending`, so existing invocations do not break — they simply can no longer re-run something already applied. A row is recorded in the same transaction as its migration wherever the driver permits it; where it does not, the row is written immediately after, and a crash between the two surfaces as drift on the next run rather than as silent success.

`scripts/run-migrations.sh` wraps `migrate-client.ts` and needs no logic change, but its `--help` text does: "apply all migrations" stops being what happens.

---

## Schema transparency

`GET /api/org/[orgId]/schema`, guarded by `requireOrgAccess(orgId, 'admin')`, returning two things:

- **Migration state** — every ledger row with its state, the count applied, and the latest version and date.
- **Table inventory** — the org-scoped tables holding their data, with row counts scoped to their `org_id`.

```
Migrations   57 adopted, 1 verified, 0 drifted
             latest 0060_migrations_ledger  31 Aug

Your data    holdings            1,204 rows
             tax_contributions     318
             grants                 87
             ai_usage_log        2,940
             … 96 more tables
```

### The counting constraint

A hundred separate `SELECT count(*)` queries per page load is not acceptable, and `pg_class.reltuples` is an estimate that goes stale after bulk changes — misleading on the one screen whose entire purpose is being trustworthy.

So: **one SQL function counting across the org-scoped tables in a single pass**, with an `s-maxage` cache header, because exact-to-the-second is not the point. If that proves slow for a large organization, the honest fallback is exact counts for the tables that matter and a name-only list for the rest — never an estimate presented as a count.

### Why this is safe, and when it stops being

The schema is shared across every organization on an instance. Showing an admin the table list and their own row counts leaks nothing, because the counts are `org_id`-scoped and the schema is identical for every client.

That holds **only because each client gets a dedicated instance**. Unscoped counts, or full DDL, would be a data leak the moment two organizations share a database. The scoping is therefore load-bearing rather than incidental, and the route's test asserts it.

---

## Testing

- `compareLedger` against fixtures: pending, drifted, adopted, and an empty ledger. No database.
- `checksumOf` is stable across line endings — a CRLF checkout must not read as universal drift.
- The runner exits non-zero on drift, and exits 0 with a clear message when nothing is pending.
- Migration assertions in `scripts/verify/schema-behavior.sql`: an org admin can read `applied_migrations` and cannot write it; the backfill inserts from `supabase_migrations.schema_migrations`.
- The schema route is org-admin guarded and scopes every count by `org_id`.

## Scope estimate

Seven tasks: the ledger migration, the comparison module, the runner rewrite, the adopt path, the schema function, the route and its hook, and the database-level assertions.

## Out of scope

- Data export and import — Phase 4B.
- Configuration as a portable artifact — Phase 4C.
- Down-migrations or rollback. The ledger records what was applied; reversing a migration remains a hand-written new migration.
- Reconciling `supabase_migrations.schema_migrations` beyond the initial backfill. The CLI owns that table; the ledger reads it once and then maintains its own.
- Verifying that a backfilled migration's recorded checksum matches what actually ran. That evidence does not exist, which is why `adopted` is a distinct state rather than being reported as `verified`.
