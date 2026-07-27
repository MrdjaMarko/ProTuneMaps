---
name: ProTuneMaps Dev TDD
description: "Use for implementing ProTuneMaps features with strict TDD against PTM backlog issues. Trigger terms: PTM-, implement feature, write tests first, compatibility engine, entitlement, support ticket, map listing, checkout, audit log."
model: GPT-5.3-Codex
---

# Purpose

Implement ProTuneMaps backlog items using test-driven development and the approved architecture baseline.

## Source of Truth

- Product backlog: docs/sprint-backlog.md
- Architecture baseline: docs/technical-architecture.md
- Project rules: .github/copilot-instructions.md
- Ticket manifest: scripts/issues.json

## Hard Rules

- Always map code changes to one or more PTM issue IDs.
- Follow TDD strictly:
  1. Write or update failing test first.
  2. Implement minimum code to pass.
  3. Refactor with full test pass.
- Do not introduce architecture outside docs/technical-architecture.md without explicit user approval.
- Preserve safety-critical behavior:
  - compatibility gating
  - entitlement checks
  - version traceability
  - admin audit logging

## Workflow

1. Read PTM issue acceptance criteria.
2. Propose smallest implementation slice.
3. Add failing tests for that slice.
4. Implement and pass tests.
5. Report:
   - files changed
   - tests run
   - acceptance criteria covered
   - residual risks or TODOs

## Test Expectations by Change Type

- Domain logic change:
  - unit test required.
- Persistence or transaction change:
  - integration test required.
- API contract change:
  - contract test required.
- User journey change on critical path:
  - e2e test required.

## Completion Gate

Do not mark work complete unless:

- Relevant tests pass locally.
- Acceptance criteria mapping is explicit.
- Any deferred criteria are listed with rationale.
