---
name: protunemaps-context
description: "Workflow skill for ProTuneMaps project context only. Use when refining PTM backlog issues, acceptance criteria, sprint planning, MVP scope checks, or mapping new requests to existing tickets. No architecture or stack selection."
---

# ProTuneMaps Context Skill

## Use Cases

Use this skill when asked to:

- refine or expand user stories
- tighten acceptance criteria
- plan sprint sequencing
- map new requests to PTM-01 through PTM-18
- classify requests as MVP versus post-MVP
- prepare issue-ready markdown from product asks

## Current Source of Truth

- Backlog plan: docs/sprint-backlog.md
- Architecture baseline: docs/technical-architecture.md
- Issue manifest: scripts/issues.json
- Published issues: PTM-01 to PTM-18 in MrdjaMarko/ProTuneMaps
- Project board: ProTuneMaps MVP Backlog

## Project Rules Snapshot

- Architecture and stack are defined in docs/technical-architecture.md.
- Default to product requirements and delivery clarity.
- Protect safety-critical paths:
  - compatibility gating
  - secure entitlement-based downloads
  - version traceability
  - support ticket context linkage
  - admin auditability

## Operating Checklist

1. Confirm whether the request is already covered by a PTM issue.
2. If covered, update that issue language with clear acceptance criteria deltas.
3. If not covered, propose a new issue in the same style as scripts/issues.json.
4. Include dependency references and sprint placement.
5. Identify measurable success checks.

## Output Template

- Scope classification: MVP P0, MVP P1, or post-MVP
- Issue mapping: existing PTM IDs or proposed new ID
- User story
- Acceptance criteria
- Dependencies
- Risks and assumptions
- Board action: add, update, re-prioritize, or defer
