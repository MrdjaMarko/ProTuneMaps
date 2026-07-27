# ProTuneMaps Technical Architecture Proposal

## Scope and Intent

This document sets the technical direction for building PTM-01 through PTM-18.
It defines stack, service boundaries, and data model baseline for MVP implementation.

## Architectural Style

- Modular monolith for MVP with clear domain modules.
- API-first boundaries and event-driven side effects for future service extraction.
- Monorepo to keep product, API, schema, contracts, and tests versioned together.

## Proposed Stack

### Language and Runtime

- TypeScript across frontend, backend, and shared packages.
- Node.js 22 LTS runtime.

### Monorepo and Tooling

- pnpm workspaces.
- Turborepo for task orchestration and caching.
- Biome for linting and formatting.
- Vitest for unit and integration tests.

### Applications

- apps/web: Next.js 15 (App Router) for buyer, tuner, and admin UI.
- apps/api: NestJS with Fastify adapter for REST API and domain modules.
- apps/worker: Node worker process for async jobs.

### Data and Infrastructure

- PostgreSQL 16 as system of record.
- Prisma ORM with migration-driven schema management.
- Redis for queues, short-lived cache, and rate limiting.
- S3-compatible object storage for map binaries and dyno evidence uploads.

### Platform Integrations

- Stripe for checkout and payment events.
- Resend (or SES) for transactional email.
- OpenTelemetry + Sentry for traces/errors.

## Service and Module Boundaries

MVP will ship as one deployable API with internal modules.

- Identity and Access Module:
  - user registration, verification, session lifecycle, RBAC.
  - roles: buyer, tuner, admin.
- Vehicle and Compatibility Module:
  - vehicle setups, compatibility rule evaluation, compatibility badges.
- Listing and Version Module:
  - map listings, publication flow, version uploads, changelogs.
- Commerce and Entitlement Module:
  - checkout, payment webhook handling, orders, entitlement issuance.
- Delivery Module:
  - signed download URLs, checksum metadata, download audit events.
- Support Module:
  - ticket creation, threaded messaging, status transitions.
- Trust and Moderation Module:
  - tuner verification, review moderation, listing moderation actions.
- Observability Module:
  - business metrics events for PTM-18 dashboarding.

## API Shape

- REST JSON APIs under /v1.
- OpenAPI spec generated from DTO contracts.
- Shared request and response contracts in a workspace package to keep web and api aligned.

## Domain Event Contracts

Internal async events for side effects and auditability:

- user.verified
- tuner.verification.requested
- listing.published
- map.version.created
- checkout.completed
- payment.failed
- entitlement.created
- file.downloaded
- ticket.created
- ticket.replied
- review.created
- moderation.action.logged

Use transactional outbox table to guarantee at-least-once event publication.

## Data Model Baseline

### Core Tables

- users
- tuner_profiles
- vehicle_setups
- map_listings
- map_listing_requirements
- map_versions
- orders
- payment_events
- entitlements
- download_events
- support_tickets
- ticket_messages
- reviews
- moderation_actions
- admin_audit_logs
- outbox_events

### Key Relationship Rules

- One user can own many vehicle_setups and orders.
- One user can have zero or one tuner_profile.
- One tuner_profile can own many map_listings.
- One map_listing can have many map_versions.
- One order references one listing and one purchased version snapshot.
- One entitlement is issued per successful order item.
- One support_ticket must reference order, listing, version, and buyer setup.
- One review must be linked to a verified purchase.

### Suggested Minimal Fields

users
- id (uuid pk)
- email (unique)
- password_hash
- role
- email_verified_at
- created_at

vehicle_setups
- id (uuid pk)
- user_id (fk users)
- make
- model
- year
- engine
- ecu_id
- transmission
- fuel_type
- mods_json
- created_at

map_listings
- id (uuid pk)
- tuner_profile_id (fk tuner_profiles)
- title
- stage
- price_amount
- price_currency
- status (draft, published, unpublished)
- created_at

map_versions
- id (uuid pk)
- listing_id (fk map_listings)
- semver
- changelog
- file_object_key
- file_checksum_sha256
- created_at

orders
- id (uuid pk)
- buyer_user_id (fk users)
- listing_id (fk map_listings)
- purchased_version_id (fk map_versions)
- amount
- currency
- status
- created_at

entitlements
- id (uuid pk)
- order_id (fk orders)
- buyer_user_id (fk users)
- listing_id (fk map_listings)
- version_id (fk map_versions)
- active
- created_at

audit tables
- actor_user_id
- target_type
- target_id
- action
- metadata_json
- created_at

## Mapping Architecture to PTM Issues

- PTM-01, PTM-02: Identity and Access Module.
- PTM-03, PTM-04, PTM-05: Vehicle and Compatibility Module.
- PTM-06, PTM-07, PTM-08, PTM-09: Listing, Version, Trust, Moderation Modules.
- PTM-10, PTM-11, PTM-12, PTM-13: Commerce and Delivery Modules.
- PTM-14, PTM-15: Support Module.
- PTM-16, PTM-17: Trust, Moderation, and Review workflows.
- PTM-18: Observability Module and event instrumentation.

## Security and Compliance Baseline

- Passwords hashed with Argon2id.
- Row-level authorization checks in API handlers and service layer.
- All privileged actions written to admin_audit_logs.
- Signed download URLs with short TTL.
- Checksums displayed and verified on file generation pipeline.
- Idempotent payment webhook processing with event deduplication.

## TDD Strategy (Mandatory for Future Feature Work)

### Test Layers

- Unit tests:
  - domain rules, compatibility engine logic, policy guards.
- Integration tests:
  - repository + database behavior, transactions, webhook idempotency.
- Contract tests:
  - web to api contract compatibility using shared DTO schemas.
- E2E tests:
  - critical user journeys from PTM acceptance criteria.

### Required TDD Loop

1. Select PTM issue and acceptance criteria subset.
2. Write failing test(s) first.
3. Implement minimal passing code.
4. Refactor with tests still green.
5. Commit with evidence of tests run.

### MVP Critical E2E Flows

- Signup and email verification gating purchase.
- Setup creation and compatibility badge behavior.
- Compatible checkout success and entitlement issuance.
- Download access with signed URL and audit log.
- Ticket creation linked to order, setup, and version.

## Delivery Milestones

- Milestone A: Foundation and compatibility (PTM-01 to PTM-05).
- Milestone B: Listing and version workflows (PTM-06 to PTM-09).
- Milestone C: Commerce and secure delivery (PTM-10 to PTM-13).
- Milestone D: Support, moderation, and observability (PTM-14 to PTM-18).

## Deferred Decisions (Track as ADRs)

- Container orchestrator and production hosting platform.
- Search engine upgrade beyond PostgreSQL search.
- Feature flag system vendor choice.
- Analytics warehouse and BI tooling.
