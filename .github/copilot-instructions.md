# ProTuneMaps Project Rules

## Mission

ProTuneMaps is an ECU map marketplace and delivery workflow product focused on compatibility safety, tuner trust, secure delivery, and support traceability.

## Current Product Context

- Product scope is MVP planning and backlog execution.
- Architecture and technology stack are intentionally undefined.
- Work must align with the backlog and acceptance criteria in docs/sprint-backlog.md.
- GitHub Project source of truth: ProTuneMaps MVP Backlog (owner: MrdjaMarko).
- Ticket set source of truth: PTM-01 through PTM-18 in repository issues.

## Working Rules

- Do not assume or lock in backend/frontend/cloud architecture unless the user asks.
- For implementation asks, map proposed work to one or more PTM issue IDs.
- Keep outputs testable with explicit acceptance criteria and definition of done checks.
- Prioritize trust and safety flows over growth extras:
  - Compatibility accuracy
  - Purchase gating for incompatible setups
  - Version traceability
  - Auditability for admin actions
- Preserve project language consistently:
  - buyer
  - tuner
  - map listing
  - map version
  - entitlement
  - support ticket
- If a request conflicts with MVP scope, flag it and classify as post-MVP.
- Do not rewrite backlog priorities unless explicitly requested.

## Delivery Conventions

- For planning work, provide:
  - story or task title
  - linked PTM issue ID
  - acceptance criteria
  - dependencies
  - risk notes
- For execution work, provide:
  - files changed
  - tests or validation performed
  - impact against acceptance criteria
- For product decisions, state assumptions and decision tradeoffs.

## MVP Guardrails

- Block unsafe purchase paths by compatibility checks.
- Preserve entitlement boundaries for downloads.
- Tie support actions to order, setup, and version context.
- Keep moderation and admin actions auditable.

## Reference Files

- docs/sprint-backlog.md
- scripts/issues.json
- scripts/publish-backlog.ps1
