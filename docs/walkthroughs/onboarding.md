# Onboarding Walkthrough

**Mission:** Take a brand-new user from sign-in to a usable organization and portfolio without leaving partial or contradictory state.

## Start

- Run `npm run walkthrough:reset` and `npm run walkthrough:dev`.
- Sign in as `newUser` (`new-user@walkthrough.local`).
- Local-only password: `Walkthrough123!`.

## Invariants

- The user begins with no organization membership or completed onboarding session.
- Successful provisioning creates one organization, owner membership, owned portfolio, and portfolio owner membership.
- The new portfolio uses canonical columns and can immediately load through `/api/me`.
- Repeated provisioning must not create a second organization.
- A failed portfolio or membership step must not leave a partial organization.

## Explore

- Refresh, go back, and open a second tab during intake.
- Submit twice or revisit an earlier onboarding step after provisioning.
- Try missing names, invalid organization types, and unusual punctuation.
- Interrupt the flow immediately before and after organization creation.

Reset after the mission. External AI-assisted onboarding is not required for this deterministic core walkthrough.
