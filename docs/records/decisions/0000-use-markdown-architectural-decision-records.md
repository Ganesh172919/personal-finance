---
status: accepted
date: 2026-11-08
title: "0000. Use Markdown Architectural Decision Records (MADR)"
description: "Adoption of MADR for tracking architectural choices in the FinWise platform"
quadrant: record
owner: "FinWise Architecture Team"
last_reviewed: 2026-11-08
review_every_days: 365
decision-makers: "FinWise Architecture Team"
---

# 0000. Use Markdown Architectural Decision Records (MADR)

## Context and problem statement

As the FinWise full-stack and multi-agent AI system evolves, architectural decisions (such as stateful LangGraph workflows, dual-layer canary validation, and 64-D merchant vector spaces) must be recorded with their context, trade-offs, and verification mechanisms in the repository alongside code.

## Decision drivers

* Traceability: Every architectural decision must be reviewable in git history.
* Accessibility: Records must render natively in Markdown without specialized tooling.
* Lightweight: Fast creation and clear structured format (MADR 4.0.0).

## Decision outcome

Chosen option: "MADR 4.0.0 in docs/records/decisions/NNNN-title.md", because it is human-readable, machine-lintable, and versioned directly with code.

### Consequences

* Good, because new engineers can understand why technical trade-offs were made.
* Good, because automated CI checks can ensure ADRs accompany major architectural shifts.

**Evidence:** `docs/records/decisions/`, `docs/ARCHITECTURE.md`
