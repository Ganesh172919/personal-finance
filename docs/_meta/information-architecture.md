# Information Architecture & Diátaxis Documentation Map

**Version:** 2026.1  
**Architecture Model:** Diátaxis (Tutorials, How-To Guides, Reference, Explanation) + System Records & Operational Runbooks.

---

## 1. Information Architecture Overview

```
                                Action (Practical)
                                        │
                                        ▼
             ┌─────────────────────────────────────────────────────┐
             │                   TUTORIALS                         │
             │   Learning-oriented, hand-holding, zero digressions │
             │   - documentation/01-getting-started.md             │
             │   - docs/QUICK_START.md                             │
             │   - docs/COMPLETE_PROJECT_ONBOARDING.md             │
             └──────────────────────────┬──────────────────────────┘
                                        │
    Acquisition                         │                         Application
    (Theoretical) ◄─────────────────────┼─────────────────────►   (Work-oriented)
                                        │
             ┌──────────────────────────┴──────────────────────────┐
             │                 HOW-TO GUIDES                       │
             │   Task-oriented, step-by-step developer recipes     │
             │   - BUILDING_ON_THIS_PROJECT.md (25 recipes)        │
             │   - docs/MEGA_DEVELOPER_RECIPES.md                  │
             │   - docs/DEVELOPMENT.md                             │
             └─────────────────────────────────────────────────────┘
                                        ▲
                                        │
                                Cognition (Theoretical)
             ┌──────────────────────────┴──────────────────────────┐
             │                  EXPLANATIONS                       │
             │   Understanding-oriented, architecture & concepts   │
             │   - docs/ARCHITECTURE.md                            │
             │   - docs/AI_CORE.md                                 │
             │   - PROJECT_EXPLANATION.md                          │
             │   - PROJECT_FLOW.md                                 │
             └──────────────────────────┬──────────────────────────┘
                                        │
             ┌──────────────────────────┴──────────────────────────┐
             │                   REFERENCES                        │
             │   Information-oriented, neutral, comprehensive      │
             │   - docs/API.md                                     │
             │   - docs/DATABASE.md                                │
             │   - docs/SERVICES.md                                │
             │   - docs/FRONTEND.md                                │
             │   - docs/AI_AGENTS_REFERENCE.md                     │
             └─────────────────────────────────────────────────────┘
```

---

## 2. Records and Runbooks (Living Engineering Artifacts)

- **Records**:
  - `docs/CHANGELOG.md` — Keep a Changelog SemVer releases.
  - `docs/_meta/` — Baseline manifest, audit report, coverage matrix, system profile, open questions.
  - `server/AI_Core/evals/` — Automated quality gates and continuous invariant benchmarks.
- **Operational Runbooks**:
  - `docs/MEGA_OPERATIONS_RUNBOOK.md` — Alert triage and on-call procedures.
  - `docs/DEPLOYMENT.md` — Container orchestration and deployment runbooks.
  - `docs/TROUBLESHOOTING.md` — Diagnostic trees for Redis, Mongo, and AI Core.
  - `docs/SECURITY.md` — STRIDE threat modeling, SSRF defenses, and key rotation.
