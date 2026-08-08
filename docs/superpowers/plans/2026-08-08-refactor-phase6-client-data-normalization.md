# Refactor Phase 6 — Client-side Data Normalization

**Date:** 2026-08-08  
**Status:** Approved for implementation by the request to plan and implement the next phase  
**Branch:** `codex/refactor-phase6-client-data`  
**Prerequisite:** Phase 5 schema alignment and its post-review hardening are merged into local `main` at `26e381ae`.

## Objective

Normalize browser-side data access against the stable, generated Phase 5 contracts without changing URLs or intended behavior. The phase establishes one JSON transport/error contract, domain-owned SWR hooks for interactive reads, named helpers for uploads/downloads/streams, and one hook location under `lib/`.

This is Refactor Phase 6 from `2026-07-26-full-refactor-design.md`. It is distinct from the older configurability document named `2026-07-08-phase6-integration-polish-design.md`.

## Verified starting point

- 175 client files call `fetch` directly, matching the umbrella design's original browser baseline.
- Direct calls span dashboard, analytics, visualizations, holdings, grants, donors, pledges, tax, compliance, reports, admin, settings, Builder Studio, onboarding, profile, organization, and auth surfaces.
- 23 files currently import SWR and most define their own local `fetcher` function.
- Generic hooks are split between root `hooks/` and `lib/hooks/`.
- Server-only external HTTP integrations under `lib/services/**`, API route upstream calls, and Builder's isolated verifier/GitHub client are separate transport boundaries and are not browser-fetch violations.
- Phase 5 provides stable typed database and repository boundaries; Phase 6 must consume API response contracts and must not move browser code around those repositories to direct database access.

## Non-negotiable boundaries

1. Preserve all routes, methods, bodies, headers, cache choices, response shapes, and intended loading/error behavior.
2. Browser-provided org context is routing context only. The shared client may not invent an authoritative `x-org-id` header or weaken server-side access checks.
3. Preserve the Phase 2 guard/repository boundary and the Phase 5 generated schema boundary. Client helpers call APIs; they do not construct Supabase clients.
4. Preserve the Phase 3 durable AI lifecycle. Streaming and non-streaming chat calls must continue to supply stable request IDs and must not introduce a second execution or persistence path around `begin_ai_turn`, `complete_ai_turn`, and `fail_ai_turn`.
5. Builder internals remain out of scope except for shared contract enforcement. Its server-side GitHub and verifier transports are not converted to browser helpers.
6. Security bugs receive dedicated commits and regression tests. Other behavior quirks go to the findings log rather than being silently changed.
7. No dependency upgrade and no URL migration.

## Transport contract

Create `lib/api/client.ts` as the only browser transport foundation.

### JSON

- `requestJson<T>(input, init?)` performs the request, parses JSON once, returns `T` for successful responses, and throws `ApiClientError` for non-2xx or malformed JSON responses.
- `ApiClientError` carries `status`, a stable message, optional `code`, optional `details`, and the parsed payload without assuming every API uses exactly the same envelope.
- Empty successful responses are supported explicitly rather than failing JSON parsing.
- `swrJsonFetcher` delegates to `requestJson` so every SWR read has identical parsing and rejection behavior.
- `apiRequest` is the low-level response-preserving primitive used only when a caller genuinely needs status/header/body-stream control. It does not add tenant authority.

### Named non-JSON transports

- `uploadJson<T>` accepts `FormData` and delegates JSON success/error handling without forcing a `Content-Type` boundary.
- `requestDownload` returns the checked response/blob plus a safe filename derived from `Content-Disposition` when present.
- `requestStream` returns a checked `Response` with its body intact for SSE/stream readers.
- External browser resources such as map topology use the same response-preserving primitive, with an explicit absolute URL.

These helpers preserve `AbortSignal`, caller headers, credentials, cache, and Next.js request options.

## Domain hook ownership

Interactive GET state belongs to the owning domain rather than a component-local SWR fetcher. Hooks may share the transport but own URL construction, response typing, cache keys, and mutation/revalidation behavior.

| Domain | Hook home | Initial consumers |
|---|---|---|
| holdings | `lib/holdings/hooks.ts` | holdings pages, holding widgets, report selectors |
| analytics | `lib/analytics/hooks.ts` | dashboard, projections, benchmarks, risk, insights |
| grants | `lib/grants/hooks.ts` | grants list and detail refresh |
| donors/pledges | `lib/donors/hooks.ts`, `lib/pledges/hooks.ts` | donor and pledge dashboards |
| reports | `lib/reports/hooks.ts` | templates, documents, schedules, export selectors |
| widgets/visualizations | `lib/visualizations/hooks.ts` | widget sections and editor |
| dashboard/map/news | owning `lib/<domain>/hooks.ts` | KPI, news, map, workbench reads |
| tax/compliance | `lib/tax/hooks.ts`, `lib/compliance/hooks.ts` | interactive module reads |
| admin/settings/Builder Studio | owning admin/settings/builder client hooks | administrative refresh state |

Hooks use `null` keys when required scope is unavailable and expose SWR's `mutate` rather than adding a second cache.

## Implementation sequence

### Task 1 — Foundation and executable contracts

1. Add the shared browser transport and unit tests covering:
   - successful JSON and empty responses;
   - JSON/text/malformed error bodies;
   - stable `ApiClientError` fields;
   - header merging without authoritative org headers;
   - uploads without a forced multipart content type;
   - downloads and streams retaining response metadata/body;
   - abort propagation.
2. Add a source contract that distinguishes browser/UI source from allowed server transports.
3. Initially make the contract report the inventory; enable fail-closed enforcement after the final conversion wave.

### Task 2 — SWR and domain read hooks

1. Replace every component-local SWR fetcher with `swrJsonFetcher` through a domain hook.
2. Move the existing holdings SWR hook from generic `lib/hooks/` to `lib/holdings/`.
3. Keep response envelopes typed at the domain boundary; do not use the generated database type as an API response type unless the endpoint actually returns that shape.
4. Preserve existing cache keys and revalidation options.

### Task 3 — Dashboard, analytics, visualization, and holdings wave

Convert interactive reads and mutations in the dashboard core, analytics, map, visualization/widget, and holding components. Preserve server-provided initial props where already present. Use named upload/stream helpers for holding reports, photos, and AI assistant traffic.

### Task 4 — Grants, donors, pledges, reports, tax, and compliance wave

Convert each bounded domain with its tests. Preserve grant lifecycle service ownership, private document signed-URL behavior, CPA token routes, and all download filenames/content types. A failed download must never be saved as a JSON error blob.

### Task 5 — Admin, settings, Builder Studio, onboarding, organization, profile, and auth wave

Convert remaining browser surfaces. Builder Studio may consume shared browser transport but may not alter `lib/builder/**` server transports or its path/review policies. Preserve onboarding ownership and partial-result behavior recorded in the findings log.

### Task 6 — Hook consolidation

1. Move `hooks/useAudioRecorder.ts` and `hooks/useWidgetDimensions.ts` to `lib/hooks/`.
2. Update imports and remove the root `hooks/` directory.
3. Keep generic UI/browser hooks in `lib/hooks/`; keep data hooks in their domain folders.

### Task 7 — Fail-closed guardrail and documentation

The final source contract must fail when:

- a client component, context, or client page calls raw `fetch`;
- a component defines a local generic SWR fetcher;
- code imports from root `@/hooks/`; or
- a browser caller reintroduces authoritative organization headers.

Document the transport and hook ownership in `AGENTS.md`, `CLAUDE.md`, and `docs/ARCHITECTURE.md`. Builder's scaffold context must receive the client-data rule through the existing agent-instruction excerpt.

### Task 8 — Verification and phase boundary

Run:

1. focused transport/domain-hook tests after each wave;
2. `npm run verify:types`;
3. `npm run verify:lint`, ratcheting the warning floor down only for warnings actually removed;
4. `npm run verify:unit`;
5. `npm run verify:build`;
6. `npm run verify:migrations` to prove Phase 6 did not disturb schema canon;
7. representative freshly seeded walkthrough journeys for dashboard, holdings, grants, donors, tax, compliance, reports, and AI chat; and
8. a repeated AI turn/request to prove deterministic replay and at-most-once side effects remain intact.

## Commit sequence

1. `docs(refactor): plan phase 6 client data normalization`
2. `refactor(client): add shared browser transport contract`
3. `refactor(client): centralize domain SWR hooks`
4. `refactor(client): normalize dashboard and portfolio domains`
5. `refactor(client): normalize operations and reporting domains`
6. `refactor(client): normalize admin and onboarding domains`
7. `refactor(client): consolidate hooks and enforce transport boundary`
8. Dedicated security/finding commits if required by discoveries.
9. `refactor(client): complete phase 6 normalization`

## Exit criteria

Phase 6 is complete only when:

- all component and client-page JSON requests use the shared parser/error contract;
- interactive SWR reads use domain-owned hooks and no component-local fetcher remains;
- uploads, downloads, and streams use named transport helpers;
- no raw `fetch` remains in components, contexts, or client pages;
- permitted server-side external transports are explicitly excluded by the contract rather than hidden by a broad allowlist;
- root `hooks/` is gone and hook ownership is unambiguous;
- no client code adds authoritative org context or bypasses an API/repository boundary;
- Phase 3 AI persistence/idempotency and Phase 5 schema contracts remain green;
- the full type, lint, unit, build, migration, and representative walkthrough gates pass; and
- the findings log records every discovered behavior quirk as resolved, deferred, or disproven.

## Expected review focus

- Error behavior: standardized failures must not erase endpoint-specific messages callers render.
- Cache identity: org/portfolio IDs and filters must remain in SWR keys.
- Mutation freshness: successful writes must revalidate the same domain key the reader owns.
- Non-JSON correctness: no double-reading streams, forced multipart boundaries, or JSON error blobs saved as files.
- Authorization: no browser hint may be treated as server authority.
- AI durability: request IDs, replay, disconnect handling, and tool idempotency are unchanged.
