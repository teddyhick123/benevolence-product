# Benevolence AI-Native Importer — Implementation Blueprint

**Start Date:** 2026-03-31
**Target Duration:** 4 weeks (20 working days)
**Architecture:** AI-first, transparent, auditable, rollback-capable
**LLM:** Claude Haiku 4.5 for most tasks, Sonnet 4.6 selectively for complex reconciliation

---

## Guiding Principles

1. **Transparency over magic** — client always sees what's happening, why rows fail, and can intervene
2. **Zero data loss** — staging preserves raw data forever; rollback is instant and complete
3. **AI as copilot, not autopilot** — suggestions, not autonomous actions (until proven trustworthy)
4. **Performance at scale** — 10,000 rows in <15 minutes, with real-time progress
5. **Defensive engineering** — every AI suggestion is validated, logged, and reversible
6. **Client delight** — the migration experience should feel like a different category of software

---

## Sprint Schedule (4 Weeks)

### Sprint 1 (Days 1-5): Infrastructure & ETL Skeleton ✅ DONE
**Goal:** Can upload CSV and populate staging tables

**Day 1:** Database migrations ✅
- Created: `import_jobs`, `staging_import_*` (5 tables), `import_mapping_profiles`, `import_ai_suggestions`, `import_ai_feedback`, `import_audit_log`
- Added indexes, RLS policies, triggers
- Default Blackbaud RE NXT mapping profile seeded

**Day 2:** CSV extractor & job queue ✅
- `lib/import/types.ts`: shared TypeScript types for import system
- `lib/import/csv-extractor.ts`: PapaParse streaming, batch inserts (100 rows), staging population
- `lib/import/job-queue.ts`: BullMQ + ioredis queue, worker with extraction + ETL phases
- `app/api/admin/imports/route.ts`: GET list + POST create (multipart/form-data upload)
- `app/api/admin/imports/[id]/route.ts`: GET job detail with staging counts

**Day 3:** ETL runner skeleton ✅
- `lib/import/transformer.ts`: field mapping with type coercion (string/numeric/date/boolean/enum), transforms (normalize_ein, slugify)
- `lib/import/validator.ts`: validation rules (required, positive, date_valid, ein_format, contribution_type_valid, amount_reasonable, date_not_future)
- `lib/import/etl-runner.ts`: batched transform+validate (200 rows/batch), updates staging rows with transformed_data + validation_errors
- `app/api/admin/imports/[id]/errors/route.ts`: paginated error browser API

**Day 4:** Admin UI — Import dashboard & wizard ✅
- `app/admin/imports/page.tsx`: server component dashboard with import job table
- `app/admin/imports/ImportDashboardClient.tsx`: client wrapper with wizard modal trigger
- `components/admin/ImportStatusBadge.tsx`: reusable status badge with color coding
- `components/admin/NewImportWizard.tsx`: 3-step wizard (upload → mapping → confirm)
- `app/admin/imports/[id]/page.tsx`: detail page with stats, tabs, action buttons
- Added "Data Imports" link to admin console navigation

**Day 5:** Admin UI — Mapping grid & error browser ✅
- `components/admin/MappingGrid.tsx`: visual source→target field editor with confidence badges
- `components/admin/ImportErrorsTable.tsx`: paginated error browser with CSV export
- `app/admin/imports/[id]/mapping/page.tsx`: dedicated mapping review page
- `app/admin/imports/[id]/mapping/MappingPageClient.tsx`: client component with entity tabs + Save & Validate
- `app/api/admin/import/mapping-profiles/route.ts`: GET/POST mapping profile CRUD
- `app/api/admin/imports/[id]/run-validate/route.ts`: POST trigger transform+validate

**Demo:** Upload CSV → files stored in Supabase Storage → Bull job queued → rows extracted to staging → transform + validate → view errors in UI → edit field mapping → re-validate

---

### Sprint 2 (Days 6-10): Validation + AI Mapping Assistant
**Goal:** AI suggests field mappings; validation engine catches errors

**Day 6:** Validation rules engine
- `lib/import/validator.ts`: JSON-configurable rules per field
- Rules: required, type (string/numeric/date), format (regex), enum, composite (min/max)
- Store errors in `staging.validation_errors` JSONB
- API: `GET /api/admin/imports/:id/errors`

**Day 7:** AI mapping assistant service
- `app/api/admin/import/mapping-assist/route.ts` (POST)
- Build prompt from spec, call Anthropic Haiku
- Parse response → `MappingSuggestion[]`
- Store suggestions in DB for UI review

**Day 8:** Admin UI — AI mapping suggestions
- In `MappingGrid`, show AI suggestions with confidence badges
- Accept/reject buttons; accepted → apply to mapping profile
- Show reasoning ("Field contains full names, sample matches donor pattern")

**Day 9:** Transformer implementation
- `lib/import/transformer.ts`: apply field mapping + transformations
- Type coercion: string → numeric, date parsing (multiple formats)
- Enrichment: EIN → charity lookup, location geocoding (optional)
- Write `transformed_data` to staging

**Day 10:** Progress monitor & error browser
- `components/admin/ImportProgress.tsx`: real-time bars, counts, ETA
- WebSocket connection for live updates (`/ws/admin/imports/:id`)
- `components/admin/ImportErrors.tsx`: table with bulk select, apply AI fixes

**Demo:** Upload CSV → AI suggests mappings → validate → see errors → get AI fixes per row

---

### Sprint 3 (Days 11-15): Loader + Reconciliation + Rollback
**Goal:** Load to production tables with audit trail; reconcile totals; rollback

**Day 11:** Loader with dependency ordering
- `lib/import/loader.ts`: batch processing (500 rows/batch)
- Dependency order: investees → holdings → portfolio members → contributions → metrics
- Upsert logic: match criteria (configurable), insert or update
- Batch transactions, error handling per batch (continue on error)

**Day 12:** Audit logging
- `lib/import/audit-logger.ts`: write to `import_audit_log` for every DB change
- Store before/after snapshots (JSONB)
- Integrate with loader

**Day 13:** Reconciliation engine
- `lib/import/reconciler.ts`: compute source vs. target aggregates
- Detect deltas > threshold (configurable, default 1%)
- Identify mismatched records, sample analysis
- Store in `import_jobs.reconciliation_data`

**Day 14:** AI reconciliation analysis
- `app/api/admin/import/[id]/reconcilie/route.ts` (POST, triggered auto after load)
- Call AI service with aggregates + sample mismatches
- Get plain-English explanation, suggested adjustments
- Display in UI

**Day 15:** Rollback & partial rollback
- `POST /api/admin/imports/:id/rollback` (full)
- `POST /api/admin/imports/:id/rollback?entity=contributions` (partial)
- Read audit log, reverse operations in reverse order
- Update staging.action_taken = 'rolled_back'

**Demo:** Full import end-to-end: extract → transform → load → reconcile → rollback works

---

### Sprint 4 (Days 16-20): AI Copilot + Reporting + Polish
**Goal:** Polished UX, AI chat, auto-reports, performance

**Day 16:** AI chat endpoint
- `app/api/admin/import/ai/chat/route.ts` (WebSocket for streaming)
- Conversation context: import_job_id, recent errors, summary
- Prompt from spec; call Haiku; stream response
- Return suggested_actions array

**Day 17:** Chat UI integration
- `components/admin/ImportChat.tsx` embedded in import detail page
- Message history, suggested action buttons
- WebSocket connection for real-time AI responses

**Day 18:** AI report generation
- `app/api/admin/imports/:id/report/route.ts`
- Call AI service with summary + reconciliation + errors
- Generate Markdown, convert to PDF via Puppeteer (or just Markdown download)
- Store PDF in Supabase storage, return URL

**Day 19:** Performance & bulk fixes
- Batch AI suggestion calls (50 rows per request)
- UI: "Apply all fixable suggestions" button with confirmation
- Index optimization on staging tables (batch inserts, job_id partitions)
- Test with 10,000 sample rows (target <15 min)

**Day 20:** Documentation & beta test
- Client-facing migration guide (Loom video script, step-by-step)
- Admin user guide (feature overview, troubleshooting)
- Internal engineering post-mortem (lessons learned, performance metrics)
- Beta test with real Blackbaud sample (dry run on test DB)

**Demo:** Full production-ready importer with AI copilot, chat, reports, performance validated

---

## Technical Conventions

### File Structure
```
/app/api/admin/import/
  [id]/
    run.ts          # ETL runner (background job)
    pause.ts
    resume.ts
    commit.ts
    rollback.ts
    errors/
      route.ts
    reconciliation/
      route.ts
    report/
      route.ts
  mapping-assist/
    route.ts
  ai/
    chat/
      route.ts

/lib/import/
  csv-extractor.ts
  job-queue.ts
  validator.ts        # validation rules engine
  transformer.ts      # apply mapping + type coercion
  loader.ts           # batch upserts with dependency order
  auditor.ts          # import_audit_log writer
  reconciler.ts       # aggregate comparison
  ai/
    client.ts         # Anthropic wrapper
    prompts.ts        # prompt strings (versioned)
    mapping-assist.ts
    validate-row.ts
    reconcile.ts
    generate-report.ts
    chat.ts

/components/admin/
  ImportList.tsx
  NewImportWizard.tsx
  MappingGrid.tsx
  ImportProgress.tsx
  ImportErrors.tsx
  ImportChat.tsx
  ImportReportViewer.tsx

/db/migrations/
  0047_import_system.sql   # all import tables
```

### API Design
- All import endpoints under `/api/admin/import*` require admin role
- Long-running jobs use background queue; immediate response with job ID
- Progress via WebSocket: `/ws/admin/imports/:id` (authenticated)
- Chat endpoint streams responses (SSE or WebSocket)

---

## AI Prompt Management Strategy

Store prompts in `/lib/import/ai/prompts/`:

```
prompts/
  mapping-assist.system.txt   # system message
  mapping-assist.user.txt     # user message template
  validate-row.system.txt
  validate-row.user.txt
  reconcile.system.txt
  reconcile.user.txt
  generate-report.system.txt
  generate-report.user.txt
  chat.system.txt
  chat.user.txt
```

Use Handlebars-like template variables: `{{source_system}}`, `{{sample_records}}`, etc.

**Versioning:** When prompt changes, increment version in filename: `mapping-assist.v2.user.txt`. Keep old versions for backward compatibility if needed (unlikely for in-flight jobs).

**Evaluation:** Log every AI call with:
```typescript
{
  job_id,
  prompt_type,
  input_hash,  // hash of rendered prompt
  output,
  tokens_used,
  latency_ms,
  feedback: { accepted: boolean, modified: boolean } // from UI
}
```
Monthly review to iterate on prompts.

---

## Testing Strategy

- Unit tests for each ETL stage (extractor, validator, transformer, loader)
- Integration tests: full import on sample 100-row dataset
- AI service tests: prompt rendering, response parsing (mock Anthropic)
- Performance tests: 10K rows load time < 15min, memory < 2GB
- End-to-end UI tests: Cypress for wizard flow

---

## Rollout Plan

**Week 4 Friday:** Deploy to staging environment
**Week 5 Monday:** Beta with 1 friendly client (discounted migration)
**Week 5-6:** Iterate based on feedback; fix critical bugs
**Week 7:** Soft launch to next 3 clients
**Week 8:** General availability; start marketing "AI-Powered Migration"

---

## Success Metrics

- Time to first mapping: <15 min (was days)
- Import success rate: >95% rows without manual intervention
- Client NPS on migration: >50
- AI suggestion acceptance rate: >70% (indicates high quality)
- Total AI cost per import: <$5 (even for 10K rows)

---

## Risks & Mitigations (Detailed)

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| AI suggestions occasionally wrong | Medium | High | Human-in-the-loop: preview before apply; prominent rollback; start with "suggestions only" mode |
| Large datasets (>50K rows) slow | Medium | Medium | Pagination, background jobs, streaming; test with 10K then scale |
| Blackbaud API changes break mapping | Low | High | Versioned mapping profiles; easy to remap without re-import |
| Client data extremely messy (no EINs, lots of nulls) | High | Medium | Pre-import assessment phase (free) to set expectations; offer data cleansing add-on |
| AI latency > 5 seconds per batch | Medium | Low | Batch 50 rows per call; use Haiku; cache frequent patterns |
| Security: storing client API keys | Low | High | Encrypt at rest (Supabase pgsodium), never log, rotate monthly |

---

## Post-Launch Roadmap

After core importer is stable:

1. **Expand source systems:** Salesforce NPSP, DonorPerfect, Excel templates
2. **Pre-import assessment tool:** Free "Switchability Score" — upload sample, get estimated migration cost & timeline
3. **Migration intelligence dashboard:** Benchmark against other clients' migrations (anonymized)
4. **AI-assisted data cleansing:** Proactively fix patterns across entire dataset with one click
5. **Partner integrations:** Send enrichment requests to Charity Navigator, Candid during import (auto-lookup)

---

This blueprint is the execution plan. Every technical decision should trace back to: transparancy, auditability, rollback, and AI as copilot.

**Next step:** Start coding Sprint 1 Day 1 — database migrations.
