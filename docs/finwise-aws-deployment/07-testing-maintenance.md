# Testing and maintenance

## CI verification

The [Tests run for commit `41798f7`](https://github.com/Ganesh172919/personal-finance/actions/runs/45132649356) completed successfully. Its jobs included client tests, server tests, AI Core tests, lint, Docker image builds, EC2 release and rollback tests, and an HTTPS and k6 smoke test.

An earlier run for `600d509` failed its Linux OCR import check. A later commit changed the runtime library loading, and subsequent CI passed. Always inspect the run for the exact commit you intend to deploy. CI uses test credentials and a mock AI provider; real provider behavior requires separate verification.

## Local checks

From the repository root, with dependencies installed and an isolated test environment:

```bash
npm --prefix client test
npm --prefix client run lint
npm --prefix client run build
npm --prefix server run test:ci
npm --prefix server run build
(cd server/AI_Core && python -m pytest tests/ -m 'not latency')
(cd server/AI_Core && python -m evals.runner -m 'not latency')
bash scripts/test-release-ec2.sh
```

The workflow uses Node 24 and Python 3.11. Server integration tests may download a MongoDB test binary. Use test-only credentials and data. A passing unit test does not replace integration, security, backup or real-provider checks.

## Suggested routine

These are proposed practices; verify whether any corresponding monitoring or automation actually exists.

### Each release

- Review the target SHA, diff and CI run.
- Verify backup freshness, rollback images and database compatibility.
- Check external HTTPS, sign-in, affected features and service health after deployment.
- Record the release and verification outcome.

### Daily or on alert

- Check site availability, instance health and failed jobs.
- Review backup and alert delivery status.
- Investigate significant provider or application errors.

### Weekly

- Review AWS charges, credit balance, limits and provider usage.
- Review failed CI runs and dependency alerts.
- Check disk use, container logs and pending DNS issues.

### Monthly

- Restore a backup in isolation and record the result.
- Review AWS, GitHub, domain and provider access.
- Check certificate renewal and monitoring coverage.
- Plan operating-system, image and dependency updates.

### After a major change

- Reassess recovery objectives, capacity and single-host failure risks.
- Rehearse host replacement and database recovery.
- Update the deployment record from verified facts.

## Security work remaining

An earlier Python dependency audit identified remaining advisories after partial updates. Re-run a current audit, assess applicable findings, test compatible upgrades and verify the result. Do not assume a historical audit reflects the current vulnerability database.
