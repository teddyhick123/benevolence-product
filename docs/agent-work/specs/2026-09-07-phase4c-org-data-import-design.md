# Phase 4C — Organization Data Import

**Status:** Design approved 2026-09-07. Implementation plan not yet written.

**Goal:** An archive produced by Phase 4B can be loaded into a fresh instance and produce a functionally identical organization — one whose members can regain access, whose numbers are exact, and whose relationships are intact.

**Roadmap context:** `docs/agent-work/plans/2026-08-16-tenant-sovereignty-roadmap.md` § Phase 4, scope item 3.

**Depends on:** Phase 4B (`docs/agent-work/specs/2026-08-31-phase4b-org-data-export-design.md`), merged. The archive format, its manifest, and the string-encoded numerics are that phase's output and this phase's input.

---

## Scope

Phase 4 is decomposed across four specs. This one covers import only.

| Phase | Covers | Status |
|---|---|---|
| 4A | Migrations ledger and schema transparency | Merged `c0d0eca2` |
| 4B | Full org data export | Merged `b9d49920` |
| **4C** | **Import (item 3)** | **This spec** |
| 4D | Configuration as a portable artifact (item 2) | Deferred |

Import is one project rather than several: read, verify, order, insert, confirm. Roughly 8 tasks.

**This phase carries the roadmap's exit criterion for the pair.** 4B could show an archive was complete, correctly scoped, and faithful; it could not show it reloads, because nothing reloaded it. The round trip is proven here or not at all.

---

## Decisions

| Decision | Choice |
|---|---|
| Identifiers | Preserve original UUIDs |
| Target | Create the organization from the archive |
| Identity | Recreate `auth.users` with no usable credentials |
| Atomicity | One transaction, all or nothing |
| Entry point | A CLI script |

### Why preserved UUIDs

Rows keep the ids they had, so no foreign key is rewritten. Referential integrity holds by construction rather than by a remapping table that must be correct across 142 exportable tables and 341 foreign keys, where one missed column silently corrupts relationships. Idempotency follows for free: a re-import conflicts on the primary key and skips.

The consequence is that the archive carries the organization's own row and its original id, so the import creates the organization rather than filling a pre-created one. Targeting a different existing organization would mean rewriting `org_id` across 83 tables — reintroducing exactly what preserving ids avoids.

### Why a CLI rather than a route

The headline use case is a *fresh* deployment, which has no administrator account to authenticate against yet. A multi-gigabyte upload through a serverless route is also the transport Phase 4B deliberately avoided. The script uses the same service-role credentials as `scripts/migrate-client.ts` and sits beside it.

---

## Ordering

Insert order for the 142 exportable tables — of 150 base tables, the rest being reference or platform data — is derived from `pg_constraint` by topological sort, not from a hand-maintained list. A hand-ordered list would rot the moment a table was added — the same argument that made 4B's table manifest a guarded list rather than prose.

### Cycles

The schema has two mutual foreign-key cycles. Both are breakable, because the back-edge in each is nullable:

| Cycle | Nullable back-edge |
|---|---|
| `builder_proposals` ↔ `builder_proposal_revisions` | `builder_proposals.current_revision_id` |
| `contributions_received` ↔ `pledge_installments` | `contributions_received.pledge_installment_id` |

The sort drops those edges to produce an order, inserts both tables with the column NULL, and issues one `UPDATE` per cycle afterwards to restore it.

**A cycle with no nullable edge fails the build.** That schema is unimportable, and discovering it at import time on a client's data is far worse than discovering it in a test.

### Composite foreign keys

Phase 4B's classification walk filtered to single-column foreign keys (`array_length(conkey,1) = 1`), so composite ones were invisible to it. `pledge_installments (org_id, contribution_id) → contributions_received (org_id, id)` is one.

That blind spot produced no wrong classification, because both tables carry `org_id` and are `org_scoped` regardless. But **the ordering sort must consider composite foreign keys**, or it will order two tables wrongly and the insert will fail on a constraint whose cause is not obvious from the error.

A test also re-checks 4B's `via_parent` parents against composite foreign keys, since that walk is now known to have had a gap.

---

## The insert path

### Numerics survive, verified from both ends

The archive holds `"25000.00"` as a JSON string, because `JSON.parse` turns a Postgres `numeric` into a double and the schema has 260 of them covering every monetary amount.

`jsonb_populate_record` accepts a JSON string for a `numeric` column and preserves the scale exactly — verified against the live database: `25000.00 → "25000.00" → 25000.00`. This is the other half of 4B's central decision, and it now holds end to end.

### Insertion is per table, not per row

```sql
INSERT INTO public.holdings (<columns>)
SELECT ...
FROM jsonb_array_elements($1) AS line,
     LATERAL jsonb_populate_record(NULL::public.holdings, line)
ON CONFLICT (id) DO NOTHING
```

Per-row inserts across tens of thousands of rows would be slow and would make one transaction span far more round trips than it needs.

### Two column classes must be handled or the insert fails

The database has **12 generated columns** (`ai_usage_log.total_tokens`, `tax_contributions.fair_market_value`) and **2 identity columns**.

- Postgres rejects an explicit value for a generated column, so the column list is built from `information_schema` with `is_generated = 'ALWAYS'` excluded. Without this, every affected table's insert errors.
- Identity columns need `OVERRIDING SYSTEM VALUE` so preserved ids survive. Without this, ids are renumbered and the foreign keys this design chose not to rewrite point at nothing.

### Order of operations

Everything below happens inside one transaction.

1. Read the manifest and verify every file's `sha256` — **before any write**. An archive that fails its own hashes is not imported at all.
2. Refuse if the organization id already exists. There is no overwrite path.
3. Compare the archive's ledger against the target's schema (see below).
4. Restore `auth.users` from the archive's `profiles`, with unusable passwords.
5. Insert the `organizations` row, then the remaining exportable tables in topological order, cycle back-edges NULL.
6. `UPDATE` the two cycle back-edges.
7. Compare per-table row counts against the manifest and **abort if any differ**.

**Step 7 is what makes this more than hopeful.** `ON CONFLICT DO NOTHING` silently swallows a row that violates a constraint the design did not anticipate, so without a count check a partial import commits and reports success. The comparison converts silent data loss into a rollback.

---

## Schema compatibility

Phase 4B put the source instance's migration ledger into every manifest. This is what it was for.

| Target versus archive | Behaviour |
|---|---|
| Identical | Proceed |
| Target **ahead** — has migrations the archive lacks | Proceed with a warning; newer columns take their defaults |
| Target **behind** — archive has migrations the target lacks | **Refuse** |

Refusing the "behind" case is the one that matters. `jsonb_populate_record` ignores JSON keys with no matching column — verified against the live database, where a record built from `{"id":1,"ghost":"lost"}` yields `id=1` and no error. Importing a newer archive into an older schema therefore *succeeds* while quietly discarding whatever those columns held. That is precisely the silent-loss failure this phase exists to prevent, and it is invisible without the ledger comparison.

---

## Identity

88 foreign keys point at `auth.users`, and 21 of them are NOT NULL — including `organization_members.user_id`, `portfolios.owner_id`, and `profiles.id`. Credentials are never exported, so those accounts do not exist on a fresh instance, and without them the import produces an organization nobody can access.

The importer inserts `auth.users` rows with the original ids and the emails the archive already carries in `profiles`, with no usable password. Verified against the live database that `auth.users` accepts a chosen id.

Membership, ownership, and authorship survive intact. Each person regains access through the normal password-reset flow. A test asserts the restored account cannot authenticate as-is, because "no usable password" is a security claim and must be checked rather than assumed.

---

## Storage objects

Documents are uploaded from the archive's `storage/<bucket>/<path>` entries through the admin client, **after the transaction commits**.

Object storage has no rollback. Uploading before the commit would leave orphaned files behind a failed import that nobody would ever enumerate or clean up. Uploading after means a failed upload leaves the rows intact and reports which documents are missing — a recoverable state, and an honest one.

---

## Proof

The exit criterion is a round trip: export an organization, import it into a fresh database, export again, and compare the two manifests — same tables, same row counts, same per-file hashes.

Identical hashes are the strong claim. They mean identical bytes, so every field of every row survived, not merely the fields a test thought to check.

## Testing

- **Round trip** against a seeded organization, comparing both manifests.
- **Ordering**: the topological sort produces a valid order for the real schema; the cycle detector fails loudly on a cycle with no nullable edge to break.
- **Numeric fidelity from the far end**: a monetary value survives export and import with its scale.
- **Refusals**, each asserted separately: an organization id that already exists, a file whose hash does not match, a target behind the archive's ledger.
- **Idempotency**: importing the same archive twice leaves row counts unchanged.
- **Identity**: memberships and portfolio ownership survive, and a restored account cannot authenticate with an empty password.
- **Generated and identity columns**: a table carrying each imports without error and with its ids preserved.

## Scope estimate

Eight tasks: the topological sort with cycle handling, the archive reader and hash verification, the schema-compatibility check, identity restoration, the table loader, storage upload, the CLI, and the round-trip proof.

## Out of scope

- Configuration as a portable artifact — Phase 4D.
- Importing into an existing organization, or merging two organizations. Both require the `org_id` rewriting this design rejects.
- Selective import of one module or date range. A sovereignty claim is about completeness.
- Restoring credentials. Passwords are never exported and cannot be reconstructed; the password-reset flow is the recovery path.
- An HTTP upload route. A fresh instance has no administrator to authenticate as, which is the case this phase exists to serve.
