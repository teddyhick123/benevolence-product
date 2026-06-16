# Stale Tabs And Interruptions Walkthrough

**Mission:** Discover operations that accidentally use stale organization, portfolio, role, or workflow state.

## Start

- Run `npm run walkthrough:reset` and `npm run walkthrough:dev`.
- Sign in as `multiOrgMember` (`multi-org@walkthrough.local`).
- Open Alpha and Beta in separate tabs.

## Invariants

- Every mutation is scoped by server-verified ownership, not only the active-org cookie or visible page.
- Switching organizations changes `/api/me` and its recommended portfolio consistently.
- A stale tab cannot mutate an entity through another organization's URL.
- Refresh, back navigation, retries, and duplicate submits preserve database invariants.

## Explore

- Leave an Alpha grant open, switch to Beta, then attempt the Alpha transition.
- Begin a form, switch organizations, and submit from the stale tab.
- Change roles or module state in one tab while another remains open.
- Retry a request after a timeout or rapid double-click.
- Sign out in one tab and attempt a mutation in another.

Reset after the mission. Record the active organization, URL organization, entity organization, and resulting database state for every finding.
