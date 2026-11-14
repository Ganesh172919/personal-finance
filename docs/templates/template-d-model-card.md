---
title: "System card: <system name>"
description: "What this AI system does, how it is evaluated, and where it fails"
quadrant: record
audience: [auditor, developer, security]
owner: "@<team>"
status: reviewed
last_reviewed: YYYY-MM-DD
review_every_days: 90
applies_to: ">=<version>"
---

# System card: <system name>

## 1. Purpose and intended use

<What the system is for, who uses it, which decisions it informs. Whether a human reviews outputs.>

## 2. Out-of-scope and prohibited use

<What the system must not be used for.>

## 3. Components

| Component | Role | Model or technology | Version or pin | Card |
|---|---|---|---|---|
| Embedding model | <role> | <name> | <exact id or hash> | [card](<path>) |
| Retriever and index | <role> | <store and index type> | <version> | [pipeline](<path>) |
| Reranker | <role> | <name> | <version> | [card](<path>) |
| Generator | <role> | <name> | <version> | [card](<path>) |
| Guardrails | <role> | <tool> | <version> | [safety](<path>) |
| Fine-tuned adapter | <role> | <base and adapter> | <hash> | [card](<path>) |

## 4. Data

<Corpora and datasets with links to datasheets. Data flows, retention.>

## 5. Evaluation

<Latest evaluation report link, dataset version, metrics and thresholds, date.>

| Metric | Threshold (release gate) | Latest result | Report |
|---|---|---|---|
| Faithfulness | <value from CI config> | <value> | [link](<path>) |
| Answer relevancy | <value> | <value> | [link](<path>) |
| Context precision | <value> | <value> | [link](<path>) |
| Context recall | <value> | <value> | [link](<path>) |

## 6. Known limitations and failure modes

<Concrete, tested failure modes. Not generic disclaimers.>

## 7. Risks and mitigations

<Link to the AI threat model and the OWASP LLM mapping.>

## 8. Operation

<Monitoring, dashboards, cost and latency profile, runbooks, human-in-the-loop points, how to report a bad output.>

## 9. Change history

| Date | Change | Evaluation run |
|---|---|---|

**Evidence:** <code, config and CI paths>
