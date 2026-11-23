# GitHub changes, CI and releases

Snapshot date: 23 November 2026. Check the current AWS console, live host and GitHub run before acting.

[Documentation index](00-START-HERE.md) · [Production runbook](../../deploy/aws/PRODUCTION_RUNBOOK.md)

## Direct pushes

A push to `codex/aws-deploy` changes the remote branch and triggers the Tests workflow.
It does not cause EC2 to fetch source or rebuild images. The website continues running the last applied release.
A documentation-only push normally needs no application deployment.
A push to `main` or another branch has no effect on the release branch until changes are incorporated into it.
A pull request gives reviewers a place to inspect the diff and exact checks before merging.

## Verified CI snapshot

[Tests run 45105575104](https://github.com/Ganesh172919/personal-finance/actions/runs/45105575104) for commit `f1ed41a5fdf5ba354ebfda199c0e69cebda1f369` completed successfully.
Its jobs included client tests, server tests, AI tests and evaluations, lint, three image builds, release/rollback fixtures, and EC2 HTTPS and k6 smoke.
The earlier run for `600d509` failed its Linux OCR import check. The subsequent successful run includes the candidate native-library fix and associated smoke checks.
A successful historical run is evidence for that commit and environment only. Inspect the run for the exact commit intended for release.
CI uses temporary credentials, test services and a mock AI provider; perform real integration checks in an appropriate environment.

## Local preflight

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

Use Node 24 and Python 3.11 with the repository's dependency files. Some tests need downloads or platform-specific dependencies.
For infrastructure edits, also validate CloudFormation templates and Compose files with the relevant tooling.

## Release planning

Before changing the running service, identify the target commit and verify its CI result.
Review the diff against the actual production SHA, especially migrations, dependency upgrades and configuration changes.
Confirm a recent recoverable backup, available rollback images, sufficient disk space and an operator with Session Manager access.
The recorded live SHA remains `b70ef81024b57f328477a2420e8dff4117f553fa` unless a later release is independently verified.
The later release tooling is present on the branch. Its tests passed in CI, but it was not recorded as applied to the production host.

## Controlled release

Use the detailed commands in [the production runbook](../../deploy/aws/PRODUCTION_RUNBOOK.md#release-an-approved-commit).
The release script requires a full 40-character SHA and a canonical HTTPS origin.
It checks branch ancestry, checkout cleanliness, rollback images, and build prerequisites before replacing containers.
It builds or reuses SHA-tagged images and performs the OCR smoke check before application.
After applying the release it checks public routes and rejects anonymous access to the protected profile endpoint.
If apply or checks fail, it attempts to restore the previous application release and exits with an error.
A code rollback does not undo data writes or make an irreversible migration backward compatible.

## Release acceptance

- Confirm the expected SHA and image tags on the host.
- Check container health and service logs without copying secrets or personal data into tickets.
- Verify login, registration and health endpoints from an external network.
- Use a designated account to verify a session, a safe transaction, an AI reply and affected features.
- Check the worker, receipt upload, speech or email if the change affects those components.
- Keep the prior release images until the release is accepted and the rollback period ends.
- Record release SHA, operator, time, tests, observed problems and rollback decision.

## Rollback

Use the reviewed release script and retained images as described in the production runbook.
For a legacy deployment, confirm the corresponding old image names exist before attempting the first tagged release.
If automatic rollback fails, stop additional changes, preserve logs and use the incident and recovery process.
Database restore can lose writes after the backup; evaluate the data impact separately from a code rollback.
