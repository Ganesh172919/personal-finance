## 0. PR Review & Verification Lifecycle

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': '#1e293b', 'primaryTextColor': '#f8fafc', 'primaryBorderColor': '#38bdf8', 'lineColor': '#818cf8', 'secondaryColor': '#0f172a', 'tertiaryColor': '#1e1e38'}}}%%
mindmap
  root((Pull Request Gates))
    Static Quality
      TypeScript Compiler noEmit
      ESLint & Prettier Format
      Markdown Syntax & Link Verification
    Automated Testing
      Client Vitest Suite (:5173)
      Server Jest Supertest Suite (:3000)
      AI Core Pytest & Evals (:8001)
    Security & Multi-Tenancy
      Mongoose orgId Scope Enforced
      Zod Runtime Schemas Validated
      Argon2id & JWT Token Safety
    Deployment Readiness
      Docker Build Multi-Stage
      Zero Port Regressions 5173 3000 8001
```

---

## 0.1 CI/CD Quality Gate Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       AUTOMATED PR QUALITY GATES                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [Developer Git Push] ────► [GitHub Actions CI Runner]                      │
│                                      │                                      │
│         ┌────────────────────────────┼────────────────────────────┐         │
│         ▼                            ▼                            ▼         │
│  [Client Gates]               [Server Gates]              [AI Core Gates]   │
│  - npm run lint               - npm run test              - pytest tests/   │
│  - npm run build              - Zod validation audit      - pytest evals/   │
│  - vitest run                 - orgId tenant audit        - Port 8001 audit │
│         │                            │                            │         │
│         └────────────────────────────┼────────────────────────────┘         │
│                                      ▼                                      │
│                         [Docker Multi-Tier Build]                           │
│                                      │                                      │
│                                      ▼                                      │
│                            [PR Approved & Merged]                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 0.2 Automated Pre-Merge Verification Script

```bash
#!/usr/bin/env bash
# scripts/verify-pr.sh - Run before submitting PR
set -e

echo "🚀 [1/3] Verifying Client..."
cd client && npm run build -- --noEmit && npm test -- --run
cd ..

echo "🚀 [2/3] Verifying Express Gateway..."
cd server && npm run build && npm test
cd ..

echo "🚀 [3/3] Verifying FastAPI AI Core..."
cd server/AI_Core && pytest tests/ -q
cd ../..

echo "✅ All PR pre-flight checks PASSED!"
```

---

## Description

<!-- Brief description of the changes -->

## Type of Change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Test addition/update
- [ ] Refactoring (no functional changes)

## Changes Made

<!-- List the specific changes -->

-
-
-

## Testing

- [ ] Client tests pass (`cd client && npm test`)
- [ ] Server tests pass (`cd server && npm test`)
- [ ] AI Core tests pass (`cd server/AI_Core && pytest`)
- [ ] AI Core evals pass (`cd server/AI_Core && pytest evals/`)
- [ ] Manual testing completed

## Screenshots (if applicable)

<!-- Add screenshots for UI changes -->

## Checklist

- [ ] My code follows the project's coding conventions
- [ ] I have added tests that prove my fix is effective or my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] I have updated the documentation accordingly
- [ ] I have added `.env.example` entries for any new environment variables
