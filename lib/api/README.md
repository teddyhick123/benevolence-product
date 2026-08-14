# API Ownership

`lib/api/` is the application boundary between browser/UI code and protected
data. It owns authorization, typed request/response conventions, browser
transport, and construction of repositories that operate within proven tenant
scope.

## Route order

An authenticated route should follow this order:

```text
request and route parameters
  → require*Access guard
  → proven principal + organization/portfolio scope
  → construct or use the matching scoped repository
  → return jsonOk/jsonError
```

Use the narrowest applicable guard from `access.ts`:

- `requireUserAccess` for authenticated user behavior without tenant scope.
- `requireOrgAccess`, `requirePortfolioAccess`, or `requireHoldingAccess` for
  tenant-scoped product behavior.
- `requireAppAdmin` for platform administration.
- `requireJobAccess` for authenticated workers/automation.
- token-specific guards for public invitation and CPA access.

Client-provided IDs never establish authority. Routes must not construct an
elevated client or issue unscoped cross-tenant queries to compensate for a
missing guard.

## Files at a glance

| File | Responsibility |
| --- | --- |
| `access.ts` | Authentication, authorization, and scoped access contexts. |
| `principals.ts` | Types representing proven callers and access scope. |
| `repositories/` | Tenant-scoped database behavior, grouped in the [repository map](repositories/README.md). |
| `server-client.ts` | Server-side session client construction. |
| `admin-client.ts` | Internal elevated-client construction for scoped server-only repositories. |
| `auth-session.ts` | Session-oriented server helpers. |
| `responses.ts` | Standard `jsonOk`/`jsonError` response behavior. |
| `client.ts` | Browser JSON, upload, download, and stream transport primitives. |
| `client-hooks.ts` | Shared SWR hooks built on the browser transport. |
| `rate-limit.ts`, `rate-limit-response.ts` | Route-level rate-limit policy and consistent denials. |
| `validation.ts` | Shared request validation helpers. |

## Browser data contract

Browser domain calls use `client.ts`:

- `requestJson` for ordinary JSON requests.
- `readJson` only when intentionally inspecting a raw response.
- `uploadJson`, `requestDownload`, and `requestStream` for their respective
  non-JSON transports.

Interactive GET state belongs in a domain hook under `lib/<domain>/hooks.ts`,
backed by `client-hooks.ts`. Components do not use raw `fetch`, local SWR
fetchers, direct Supabase queries, or a second client cache.

## Repository construction

Repositories preserve database boundaries; they do not replace access guards.
Construct a repository only after its guard establishes the caller and tenant
scope. Keep multi-write task mutations in the canonical RPC/repository helpers,
and keep organization AI credentials inside the credentials repository.

The directory remains flat by design. A repository's filename is a stable
domain noun, while [the repository map](repositories/README.md) provides the
navigation index without import churn.
