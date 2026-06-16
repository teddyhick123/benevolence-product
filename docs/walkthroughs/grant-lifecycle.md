# Grant Lifecycle Walkthrough

**Mission:** Move an Alpha grant through its lifecycle while preserving authorization, transition rules, and history.

## Start

- Run `npm run walkthrough:reset` and `npm run walkthrough:dev`.
- Begin as `orgAdmin` (`org-admin@walkthrough.local`).
- Use the seeded `Alpha Education Initiative` draft grant.

## Invariants

- Every accepted stage change appends `grant_status_history`.
- Invalid stage jumps do not mutate the grant or append history.
- Decision-required transitions cannot proceed without a valid decision.
- Viewers and members cannot use admin-only lifecycle mutation routes.
- A grant can only be transitioned through its own organization route.

## Explore

- Attempt `draft` directly to `approved`, then follow the allowed path.
- Refresh or use two tabs between reading a grant and transitioning it.
- Repeat the same transition request.
- Switch to Beta while an Alpha grant tab remains open.
- Sign in as `viewer` and try both visible controls and direct API requests.

Reset after the mission so the seeded grant returns to `draft`.
