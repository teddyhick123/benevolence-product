# Module Gating Walkthrough

**Mission:** Verify that module configuration, navigation, pages, APIs, and permissions tell the same story.

## Start

- Run `npm run walkthrough:reset` and `npm run walkthrough:dev`.
- Sign in as `multiOrgMember` (`multi-org@walkthrough.local`).
- Alpha has the full module set; Beta begins with core only.

## Invariants

- Disabled Beta modules do not expose product data or mutation routes.
- Enabling a module makes its product area available without granting app-admin powers.
- Only organization owners and admins can change module state.
- Switching back to Alpha restores Alpha's independent module state.

## Explore

- Visit donor and compliance URLs directly while Beta is active.
- Enable donor management in Beta, refresh, and open the page in a second tab.
- Attempt module changes as `viewer`.
- Disable dependencies and dependent modules in different orders.
- Switch organizations during a module update.

Reset after the mission to restore Beta's minimal module set.
