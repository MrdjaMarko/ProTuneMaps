---
name: protunemaps-dev-tdd
description: "Workflow skill for implementing ProTuneMaps PTM issues with strict TDD and architecture conformance. Use for coding tasks that must be test-first and acceptance-criteria-driven."
---

# ProTuneMaps Dev TDD Skill

## When to Use

Use this skill for implementation tasks where the request includes:

- any PTM issue ID
- a feature or bug tied to MVP backlog criteria
- requirement to add or update automated tests

## Required Inputs

- PTM issue ID(s)
- acceptance criteria to cover
- intended scope slice for this change

## Mandatory Flow

1. Map request to PTM issue and criteria.
2. Write failing test(s) first.
3. Implement smallest passing change.
4. Refactor safely.
5. Run targeted and relevant regression tests.
6. Report criteria coverage and gaps.

## Architecture Alignment

Use architecture and data model from docs/technical-architecture.md.
Do not add alternate stack, framework, or service boundaries unless explicitly approved.

## Output Checklist

- PTM issue mapping
- files changed
- tests added and tests executed
- acceptance criteria covered
- risks, assumptions, and follow-up tasks
