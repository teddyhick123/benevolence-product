# Organization Isolation Walkthrough

**Mission:** Try to make one organization reveal or mutate another organization's data.

## Start

- Run `npm run walkthrough:reset`.
- Run `npm run walkthrough:dev`.
- Begin as `orgOwner` (`org-owner@walkthrough.local`).
- Local-only password: `Walkthrough123!`.
- Alpha Foundation is the allowed tenant.
- Gamma Foundation is the isolation target.

## Invariants

- Alpha users must not read Gamma portfolio, holding, member, task, grant, donor, tax, or compliance data.
- Direct URLs and direct API requests must enforce the same boundary as navigation.
- Failed cross-org mutations must leave Gamma database rows unchanged.
- Error messages must not reveal Gamma names, amounts, or internal identifiers beyond the identifier already supplied by the tester.

## Explore

- Navigate normally through Alpha, then replace Alpha IDs with Gamma IDs in URLs.
- Call likely read and mutation APIs directly from the browser session.
- Open a stale Alpha tab, sign in as `outsider` elsewhere, and revisit the stale tab.
- Try settings, exports, downloads, and service-role-backed routes.
- Repeat the exercise as `viewer` and `outsider`.

## Observe

- Browser console errors
- Failed requests and HTTP 5xx responses
- Server terminal output
- Resulting database state through the local service-role client

Record confirmed findings with `tests/walkthrough/BUG_TEMPLATE.md`, then reset before reproducing or verifying a fix.
