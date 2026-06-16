# Walkthrough Tests

These tests run against a destructive, local-only Supabase baseline.

```bash
npm run walkthrough:doctor
npm run walkthrough:setup
npm run walkthrough:smoke
```

Use `npm run walkthrough:reset` between exploratory sessions. The reset command applies the canonical `db/migrations` schema through the tracked `supabase/migrations` symlink, then creates deterministic logical personas and fixture records.

## Personas

Credentials and stable fixture IDs live in `personas.ts`. All personas use the local-only password printed by the seed command. Alpha has the full module set, Beta is a minimal-module switching target, and Gamma is an isolation target.

## Suites

- `smoke/` covers login, role boundaries, module gating, and tenant isolation for CI.
- `journeys/` covers stateful onboarding, grant lifecycle, organization switching, and module administration.
- `docs/walkthroughs/` contains open-ended missions for human and agent exploration.

## Test Expectations

- Prefer accessible roles, labels, and names over CSS selectors.
- Treat unexpected console errors, request failures, and HTTP 5xx responses as failures.
- Assert resulting database state for mutations and tenant-boundary tests.
- Add a regression test for each confirmed walkthrough bug when practical.
