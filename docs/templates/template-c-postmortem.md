---
title: "Postmortem: <incident title>"
description: "Blameless review of <incident>"
quadrant: record
audience: [operator, developer]
owner: "@<team>"
status: reviewed
last_reviewed: YYYY-MM-DD
review_every_days: 365
---

# Postmortem: <incident title>

> This review is blameless. It focuses on what happened and why our systems allowed it, not on who made a mistake.

| Field | Value |
|---|---|
| Date and duration | YYYY-MM-DD, HH:MM to HH:MM UTC (<duration>) |
| Severity | SEV<n> |
| Authors | <names> |
| Incident commander | <name> |
| Status | draft / reviewed / actions complete |

## Summary

<One paragraph.>

## Impact

<Users and systems affected, duration, data loss, cost, SLO and error budget consumed.>

## Timeline (UTC)

| Time | Event |
|---|---|
| HH:MM | <detection> |
| HH:MM | <escalation> |
| HH:MM | <mitigation> |
| HH:MM | <resolution> |

## Root cause and contributing factors

<The causal chain. Name system conditions, not people.>

## Detection

<How it was detected, time to detect, what would have detected it earlier.>

## Response

<What worked, what slowed us down.>

## What went well / what went poorly / where we got lucky

* Went well: <list>
* Went poorly: <list>
* Got lucky: <list>

## Action items

| # | Action | Type (prevent / detect / mitigate) | Owner | Priority | Due | Ticket |
|---|---|---|---|---|---|---|
| 1 | <action> | <type> | @<owner> | P1 | YYYY-MM-DD | <link> |

## Lessons learned

<Key takeaways. Link runbooks and ADRs that changed because of this incident.>
