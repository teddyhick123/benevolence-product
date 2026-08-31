# Phase 4B — Full Organization Data Export

**Status:** Design approved 2026-08-31. Implementation plan not yet written.

**Goal:** An organization admin can produce a complete, verifiable archive of everything their organization owns — every row and every document — and download it without asking the platform for permission.

**Spec of record for the prerequisite:** `docs/agent-work/specs/2026-08-31-phase4a-migrations-ledger-design.md`

**Roadmap context:** `docs/agent-work/plans/2026-08-16-tenant-sovereignty-roadmap.md` § Phase 4, scope item 1, and finding F8.

---

## Scope

Phase 4 has been decomposed across four specs. This one covers export only.

| Phase | Covers | Status |
|---|---|---|
| 4A | Migrations ledger and schema transparency (items 4, 5) | Merged `c0d0eca2` |
| **4B** | **Full org data export (item 1)** | **This spec** |
| 4C | Import (item 3) | Deferred |
| 4D | Configuration as a portable artifact (item 2) | Deferred |

**This renumbers the roadmap's plan.** Phase 4A's spec called configuration "4C"; import now takes that slot and configuration becomes 4D. Import earns the earlier number because it is the other half of the round trip and shares this phase's artifact.

### Why export and import are separate phases

Export is a read that produces a file. Import is a write into a live database with foreign-key ordering, identifier remapping, idempotency on retry, and partial-failure recovery — the half where a defect corrupts data rather than producing a bad file.

The decisive argument is testability: **import cannot be tested without export.** The fixture an import test needs is an export archive. Designing import first would leave every decision unvalidated until export existed to check it against.

Export is independently valuable. It is the half of the pitch that says a client can walk away with their data.

### What this phase does not claim

A full round trip — "an export can be imported into a fresh instance and produce a functionally identical org" — is the roadmap's exit criterion for the pair, and it belongs to 4C. This phase can demonstrate that an archive is complete, correctly scoped, and faithful to the source. It cannot demonstrate that it reloads, because nothing reloads it yet. That distinction is stated here so the spec does not imply a guarantee it has no way to test.

---

## Decisions

| Decision | Choice |
|---|---|
| Table selection | Explicit typed manifest, guarded by a completeness test |
| Archive format | Gzipped NDJSON per table, tar-streamed, with a manifest |
| Execution | Background job; archive written to private storage |
| Access | Org admin, audit-logged |
| Retention | One-hour signed URL; archive deleted after 7 days by an enforced sweep |

---

## The problem

There is no org-level data export. The five existing export routes are per-domain CSV (`app/api/portfolio/[id]/tax/export`, `.../grants/export`, `.../reports/export`, and two QuickBooks routes), and `scripts/export-client-package.ts` exports source code, not tenant data. That is finding F8.

The database holds **149 base tables in `public`**. Eighty-three carry `org_id`. The other sixty-six do not, and they are where a naive export silently loses data.

A further **17 views** carry `org_id` and are not exported. A view is derived from base tables that the export already contains, so exporting one duplicates data and — worse for an importer — produces rows that cannot be inserted anywhere. The completeness guard therefore enumerates `BASE TABLE` only, and the manifest records views as a class rather than listing them individually.

---

## Table classification

This is the decision every other part of the phase rests on, so it is explicit data rather than inferred behaviour. `lib/export/tables.ts` names all 149 base tables in one of four classes.

| Class | Scoping | Count | Example |
|---|---|---|---|
| `org_scoped` | `WHERE org_id = $1` | 83 | `holdings`, `grants`, `ai_usage_log` |
| `via_parent` | join to a parent carrying `org_id` | ~40 | `grant_milestones` → `grants.org_id` |
| `reference` | excluded — platform data, identical on every instance | ~15 | `charities`, `module_definitions`, `org_type_defaults` |
| `platform` | excluded — instance state, not tenant data | ~11 | `applied_migrations`, `geocode_cache`, `benchmark_data` |

```ts
export type TableExportRule =
  | { table: string; kind: 'org_scoped'; column: 'org_id' }
  | { table: string; kind: 'via_parent'; parent: string; parentKey: string; localKey: string }
  | { table: string; kind: 'reference'; reason: string }
  | { table: string; kind: 'platform'; reason: string };

export const EXPORT_TABLES: readonly TableExportRule[];
```

### The completeness guard

A test enumerates `information_schema.tables` and fails when any `BASE TABLE` in `public` is absent from `EXPORT_TABLES`. Views are excluded from the guard by the same `table_type` filter that `org_table_row_counts` already uses, so a new view does not demand a classification it has no use for.

This is the difference between a manifest that stays true and one that rots. Without it, a table added six months from now is missing from every client's export, and nobody finds out until someone tries to leave and discovers their grant milestones are gone. Forcing a deliberate classification at the moment a table is created is the only point at which the decision is cheap.

### Three classification calls that are judgment, not fact

**`profiles` is `via_parent`, restricted.** A member list is part of an organization's configuration and belongs in the export. But `profiles` rows describe users who may also belong to other organizations. The export includes only profiles reachable through this organization's `organization_members`, and only the columns the organization can already see. Exporting the table wholesale would leak other tenants' users into a client's archive — the one failure mode that turns a sovereignty feature into a breach.

**Builder history is included.** `builder_proposals` carries `org_id`; `builder_proposal_revisions`, `builder_review_attempts`, `builder_review_findings`, `builder_verification_runs`, and `builder_delivery_records` are `via_parent`. A client's proposals are theirs, and the roadmap lists Builder history explicitly.

**`imports` storage is excluded; the other five buckets are included.** The database has six private buckets, not the three the roadmap named:

| Bucket | Included | Why |
|---|---|---|
| `tax-documents` | yes | Substantiation the org owns |
| `compliance-documents` | yes | Filings the org owns |
| `grant-documents` | yes | Grant records the org owns |
| `holding-contact-photos` | yes | Org-entered content |
| `builder-artifacts` | yes | Roadmap names it |
| `imports` | **no** | Raw uploaded source files already normalised into platform tables |

Excluding `imports` avoids roughly doubling archive size to re-ship data the export already carries in canonical form. It is a defensible default rather than an obvious one: a client who wants byte-for-byte everything would disagree, and the manifest records the exclusion so the choice is visible rather than silent.

---

## Fidelity

**Numeric precision is the trap in this phase.** The schema has **260 `numeric` columns**, including every monetary amount. `JSON.parse` produces a JavaScript double, and `numeric` exists precisely because doubles cannot represent these values exactly. A naive `JSON.stringify` round trip silently alters financial data — an export that changes a client's grant amounts in the fifteenth decimal place is worse than one that fails loudly.

The row serialiser therefore casts numerics to text in the select and writes them as JSON strings:

```json
{"id":"…","amount_usd":"25000.00","created_at":"2026-08-31T00:00:00.000Z"}
```

Never `25000`. The manifest records `"numericEncoding": "string"` so an importer knows to cast back rather than guessing from the data.

Other types: timestamps as ISO 8601 strings, `jsonb` nested natively, arrays as JSON arrays. No exported table contains a `bytea` column — verified against the live schema, not assumed. If one is added later, the completeness guard forces a decision about it at that point.

---

## The archive

```
export-<orgId>-<timestamp>.tar
  manifest.json
  tables/holdings.ndjson.gz
  tables/grants.ndjson.gz
  tables/grant_milestones.ndjson.gz
  …
  storage/tax-documents/<original path>
  storage/builder-artifacts/<original path>
```

NDJSON, one row per line, gzipped per table, streamed into a tar. NDJSON streams in both directions, is diffable line by line, and lets an importer read one row at a time without parsing a whole file. Per-table files let a reader find one table without scanning the archive.

This needs one small dependency — `tar-stream` (~30KB, no native build). Node's `zlib` handles gzip without one, but a tar cannot be produced streaming from the standard library alone.

### The pipeline

Per table:

```
keyset paginate (order by id, 1000 rows/page)
  → JSON.stringify per row → NDJSON line
  → zlib.createGzip
  → tar entry (tar-stream)
  → storage upload stream
```

Keyset pagination rather than `OFFSET`: offset scanning degrades quadratically, and one large table would dominate the run. Nothing accumulates in memory beyond a single page and the gzip window, which is what "stream it, do not buffer" requires.

Storage objects stream through the same tar — downloaded from their bucket and piped in without landing on disk — path-prefixed by bucket so their origin is unambiguous.

### The manifest

```json
{
  "orgId": "…",
  "orgName": "…",
  "exportedAt": "2026-08-31T12:00:00.000Z",
  "formatVersion": 1,
  "numericEncoding": "string",
  "schema": {
    "ledger": [{ "version": "0060", "state": "verified" }],
    "driftCheckAvailable": true
  },
  "files": [
    { "path": "tables/holdings.ndjson.gz", "sha256": "…", "rows": 1204, "bytes": 48210 }
  ],
  "excluded": [
    { "table": "charities", "reason": "reference" },
    { "bucket": "imports", "reason": "raw source files, normalised into platform tables" }
  ]
}
```

Two deliberate inclusions.

**It carries the Phase 4A ledger state.** An archive says which schema produced it. This is the dependency 4A existed to satisfy, made concrete: without it, "this export reproduces the org" is a claim about a database nobody can identify.

**It lists what was excluded and why.** A recipient can see the export was complete by decision rather than complete by accident. An archive that silently omits fifteen tables looks identical to one that correctly excluded them.

Hashes are computed over the compressed bytes as they stream past, so no file is re-read to hash it.

---

## The job

### Storage

Migration `0061_org_export_runs.sql`:

```sql
CREATE TABLE public.org_export_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by  uuid REFERENCES auth.users(id),
  status        text NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','running','succeeded','failed','expired')),
  manifest_hash text,
  row_count     bigint,
  byte_count    bigint,
  storage_path  text,
  error         text,
  expires_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

Org admins read; service role writes. A unique partial index over `(org_id) WHERE status IN ('queued','running')` prevents two live runs for one organization — concurrent exports would double storage cost and race on the same path. The claim from `queued` to `running` is a conditional update, matching `claimRun` in `lib/api/repositories/ai-evaluations.ts`, so two workers cannot both take one run.

A new private bucket, `org-exports`, holds the archives.

### Routes and worker

| Route | Behaviour |
|---|---|
| `POST /api/org/[orgId]/export` | Guard, write the `org_audit_log` row, enqueue, return 202 with `runId` |
| `GET /api/org/[orgId]/export/[runId]` | Status; a one-hour signed URL once `succeeded` |
| `GET /api/org/[orgId]/export` | Recent runs, so a client sees their own export history |

A third BullMQ worker (`npm run export:worker`) alongside the existing Builder and evaluation workers. The cost is real and worth naming: an instance with no running worker cannot export. That is the same dependency Phase 2B accepted for evaluations, and the alternative — streaming a multi-minute response through a serverless timeout — fails harder and leaves nothing to re-download.

### Failure

**A failed export leaves no archive.** A partial tar is worse than no tar: it looks like a download and is not one. The worker writes to a temporary path and moves it into place only on success; a failure deletes the partial and records the reason on the run row.

The run row survives either way. An export that failed is something a client should be able to see, along with why.

### Retention is enforced, not aspirational

`expires_at` on a row is a claim until something acts on it. A `CRON_SECRET`-guarded sweep route deletes expired archives and marks their runs `expired`, following the existing cron pattern. Without the sweep, "the platform does not retain a copy of your data indefinitely" is a sentence in a spec rather than a property of the system — and the archive is the most concentrated collection of a client's data that will ever exist.

---

## Access and audit

`requireOrgAccess(orgId, 'admin')` on every route. Consistent with every other admin-guarded surface; restricting to `owner` would be defensible for the most sensitive action in the product but inconsistent with the rest, and restricting to app admin would contradict the pitch outright.

Every export writes an `org_audit_log` row — the existing table, with columns `org_id`, `actor_id`, `action`, `target_id`, `metadata` — using action `org.data_exported`, `target_id` set to the run id, and row and byte counts in `metadata`. An archive contains tax documents and personal data, so who produced one is a fact worth keeping after the archive itself is gone, which is why both the audit row and the run row outlive the file.

The signed URL is valid for one hour, against a private bucket, generated with `createAdminClient()` per the tax-documents storage rule in `CLAUDE.md`.

---

## Testing

- **Completeness guard** — every `BASE TABLE` in `public` appears in `EXPORT_TABLES`, or the build fails.
- **Numeric fidelity** — a row with `numeric` values round-trips as strings with digits intact. The test that catches the trap this design exists to avoid.
- **Tenancy** — an export of org A contains no row belonging to org B, asserted against a real two-organization fixture rather than by inspection.
- **`via_parent` scoping** — a child row whose parent belongs to another organization is excluded.
- **`profiles` restriction** — a user who belongs to both organizations appears once, with no data from the other organization's membership.
- **Manifest integrity** — every recorded `sha256` matches the bytes actually written.
- **Streaming** — memory stays flat across a large fixture rather than growing with row count.
- **Exclusive claim** — two workers racing for one queued run produce exactly one `running`.
- **Failure leaves nothing** — a mid-run failure leaves no object in the bucket and a `failed` row with a reason.

## Scope estimate

Seven tasks: the table manifest and its guard, the row serialiser, the archive writer, the run table and repository, the worker, the routes, and the retention sweep.

## Out of scope

- Import — Phase 4C.
- Configuration as a portable artifact — Phase 4D.
- Scheduled or automatic exports. The roadmap flags cadence as an open question; on-demand is the smaller commitment and nothing here forecloses scheduling later.
- Selective or partial export (one module, one date range). A sovereignty claim is about completeness; filtering is a convenience that can follow.
- Encrypting the archive at rest beyond what the storage bucket already provides.
