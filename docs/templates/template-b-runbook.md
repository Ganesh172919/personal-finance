---
title: "Runbook: <alert name>"
description: "What to do when <alert name> fires"
quadrant: runbook
audience: [operator]
owner: "@<team>"
status: reviewed
last_reviewed: YYYY-MM-DD
review_every_days: 90
last_drill: YYYY-MM-DD
---

# Runbook: <alert name>

**Severity:** SEV<1-3> | **Alert source:** <system and rule name> | **Dashboard:** <link>

## 1. Summary and impact

<Which user-visible behavior is affected and how badly.>

## 2. Detection and symptoms

* Alert text: `<exact alert message>`
* Typical symptoms: <list>
* Is this a known issue? Check the incident channel and recent deployments first.

## 3. Triage (five minutes or less)

1. <Check 1, with the exact command and what a healthy result looks like>
2. <Check 2>
3. Decide severity using the table below.

| Condition | Severity | Action |
|---|---|---|
| <condition> | SEV1 | Page the incident commander, open an incident channel |
| <condition> | SEV2 | <action> |
| <condition> | SEV3 | <action> |

## 4. Mitigation (stop the bleeding)

1. <Step with exact command>
   **Verify:** <command and expected output>
2. <Step>
   **Verify:** <check>

## 5. Diagnosis (find the cause)

<Decision tree or ordered checks with commands and how to read the results.>

## 6. Resolution

<Permanent fix steps, or the link to the how-to guide.>

## 7. Escalation

| Condition | Contact | How |
|---|---|---|
| <not mitigated within N minutes> | <team or role> | <channel or pager> |

## 8. After the incident

- [ ] Open or update the incident ticket: <link pattern>
- [ ] Schedule a blameless postmortem (SEV1 and SEV2) within 48 hours
- [ ] Update this runbook if any step was missing or wrong

**Evidence:** <files, dashboards, and alert definitions this runbook relies on>
