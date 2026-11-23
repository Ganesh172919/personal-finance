# Testing and continuous integration

## Observed status

The earlier remote Tests run for `600d509` failed the EC2 HTTPS and k6 Smoke job during the OCR import check.
The error was a `pyclipper` zlib decompression failure in the Linux runtime image.
Other jobs in that run passed, including client, server, AI Core, lint and Docker builds.
A candidate commit on the release branch modifies the runtime library loading, adds separate OCR and Mongo smoke checks, and expands release tests.
[Tests run 45105575104](https://github.com/Ganesh172919/personal-finance/actions/runs/45105575104) later passed for `f1ed41a`, including the candidate OCR and release checks. Check the run for the exact SHA you intend to release.
A passing run does not establish that the candidate is deployed; verify the actual host release separately.

[View the recorded failed run](https://github.com/Ganesh172919/personal-finance/actions/runs/44880286169)

## What the workflow covers

The remote workflow runs client and server tests, dependency audits, builds, AI Core tests and evaluations, lint, Docker image builds, and a production-like Compose smoke job.
The local candidate also includes a release and rollback fixture test.
The smoke environment uses throwaway secrets, a mock model provider and temporary data.
It cannot validate real production provider quotas, production DNS, production secrets, real customer data or recovery practices.
The nightly load workflow is a separate workflow and does not prove production capacity.

## Useful local commands

Run from the repository root with dependencies installed and appropriate test environment configuration.

```bash
npm --prefix client test
npm --prefix client run lint
npm --prefix client run build
npm --prefix server run test:ci
npm --prefix server run build
(cd server/AI_Core && python -m pytest tests/ -m 'not latency')
(cd server/AI_Core && python -m evals.runner -m 'not latency')
```

Use Node 24 and Python 3.11 to match the tested workflow.
The MongoDB Memory Server integration tests need a MongoDB binary, which may be downloaded on first use.
Use isolated test data and mock provider credentials during tests.
Run the full workflow after narrow local checks, and inspect the artifacts and failing job logs.

## Interpreting the catalogs

The following inventories index source declarations in the local release worktree as it existed on 23 November 2026.
A declaration is not necessarily one executed case: parameterization, suites, skips and framework behavior can alter counts.
Each entry identifies a source line and copies the declaration for discovery. Source code is the authoritative description.
The inventories do not claim that a test has passed, that all behavior is covered, or that the referenced local candidate is deployed.

- [Client declarations](04-client-test-inventory.md)
- [Server declarations](05-server-test-inventory.md)
- [AI Core declarations](06-ai-test-inventory.md)

## Security checks

The client and server CI jobs run npm audits for runtime dependencies at the configured severity.
The Python environment previously had remaining advisories after partial updates, including AI and OCR dependencies.
Re-run a current Python dependency audit, assess applicability, upgrade in a compatible staging environment and repeat the full test suite.
Never treat a historical audit result as a current clean bill of health.
