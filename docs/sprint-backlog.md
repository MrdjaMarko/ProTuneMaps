# ProTuneMaps MVP Sprint Backlog

## Sprint Cadence

- Sprint length: 2 weeks
- Team assumptions: 1 product engineer + 1 full-stack engineer + part-time designer/PM
- Estimation scale: Story points (1, 2, 3, 5, 8)

## Sprint 1 - Foundation and Compatibility

Goal: enable authenticated users to create precise vehicle setups and discover compatible maps.

| ID | Title | Points | Priority | Depends On |
|---|---|---:|---|---|
| PTM-01 | Buyer signup/login/password reset | 5 | P0 | - |
| PTM-02 | Tuner role request and verification workflow | 3 | P0 | PTM-01 |
| PTM-03 | Vehicle setup CRUD (make/model/year/engine/ECU/trans/fuel/mods) | 8 | P0 | PTM-01 |
| PTM-04 | Compatibility evaluator and result badges | 8 | P0 | PTM-03 |
| PTM-05 | Marketplace search and filters | 5 | P0 | PTM-04 |

## Sprint 2 - Listings, Trust, and Versioning

Goal: tuners can publish credible listings with version control and buyers can evaluate trust.

| ID | Title | Points | Priority | Depends On |
|---|---|---:|---|---|
| PTM-06 | Public tuner profile and trust metrics shell | 5 | P0 | PTM-02 |
| PTM-07 | Map listing create/edit/publish with validation | 8 | P0 | PTM-02, PTM-04 |
| PTM-08 | Map version upload + changelog + version history view | 8 | P0 | PTM-07 |
| PTM-09 | Listing moderation controls for admins | 3 | P0 | PTM-07 |

## Sprint 3 - Commerce and Delivery

Goal: buyers can purchase compatible maps and receive secure digital delivery.

| ID | Title | Points | Priority | Depends On |
|---|---|---:|---|---|
| PTM-10 | Checkout with compatibility gate and terms acceptance | 8 | P0 | PTM-05, PTM-08 |
| PTM-11 | Payment success/failure events and order entitlement | 5 | P0 | PTM-10 |
| PTM-12 | Signed download links, checksum display, and audit logs | 5 | P0 | PTM-11 |
| PTM-13 | Order history and download center | 3 | P0 | PTM-11, PTM-12 |

## Sprint 4 - Support, Admin Ops, and Launch Readiness

Goal: complete support workflows, moderation, and release controls.

| ID | Title | Points | Priority | Depends On |
|---|---|---:|---|---|
| PTM-14 | Support ticket creation tied to order + setup + version | 8 | P0 | PTM-11, PTM-13 |
| PTM-15 | Ticket thread + status lifecycle + notifications | 5 | P0 | PTM-14 |
| PTM-16 | Admin dashboard for tuners/listings/orders/tickets/reviews | 8 | P0 | PTM-09, PTM-15 |
| PTM-17 | Post-purchase ratings and reviews (verified buyers only) | 5 | P1 | PTM-13 |
| PTM-18 | MVP observability and launch dashboard metrics | 3 | P0 | PTM-10, PTM-12, PTM-15 |

## Technical Dependencies

- Authentication service and role-based authorization are required before any seller/admin features.
- Compatibility rule schema must stabilize before listing publish validation.
- Entitlement records are the source of truth for secure downloads and support authorization.

## Definition of Done (Release)

- All P0 issues closed and acceptance criteria passed.
- End-to-end test coverage for auth, compatibility, checkout, download entitlement, and ticket creation.
- Admin audit logs enabled for privileged actions.
- Launch metrics live: conversion, refunds, support response time, and ticket volume.
