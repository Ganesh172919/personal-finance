# FinWise AWS deployment documentation

Snapshot date: 23 November 2026. Configuration can change after this date.

## Start here

- [Deployment, architecture, and domain](01-deployment-architecture.md)
- [Release, maintenance, security, and recovery](02-operations-and-maintenance.md)
- [Tests and CI guidance](03-testing-and-ci.md)
- [Client test inventory](04-client-test-inventory.md)
- [Server test inventory](05-server-test-inventory.md)
- [AI Core test inventory](06-ai-test-inventory.md)
- [Infrastructure and network operations](07-infrastructure-and-network.md)
- [Configuration and secrets](08-configuration-and-secrets.md)
- [GitHub, CI and release procedures](09-release-and-ci.md)
- [Backup, recovery and incidents](10-backup-recovery-and-incidents.md)
- [Maintenance checklists](11-maintenance-checklists.md)
- [EC2 and Compose source snapshot](12-source-snapshot-ec2-and-compose.md)
- [Release and CI source snapshot](13-source-snapshot-release-and-ci.md)
- [Images and example configuration snapshot](14-source-snapshot-images-and-environment.md)
- [Monitoring and load-test snapshot](15-source-snapshot-monitoring-and-load.md)
- [Alternative ECS and Kubernetes source snapshot](16-source-snapshot-other-hosting-options.md)

The inventory files are a source-code index, not proof that any test passed.
They intentionally include existing test declarations to make navigation and impact assessment easier.
Parameterized declarations can produce multiple executed cases and conditional or skipped tests may not run.
Refer to the CI run for actual test outcomes.

## Current website

The website was reachable at [https://finwise.3-106-147-122.sslip.io/](https://finwise.3-106-147-122.sslip.io/).
On 23 November 2026 the `/login` endpoint returned HTTP 200 over HTTPS.
A working login page alone does not verify sign-in, data recovery, all third-party features, or production readiness.

## Current status and source of truth

- The deployed checkout was last recorded at `b70ef81024b57f328477a2420e8dff4117f553fa` on 21 November 2026.
- The release branch is [codex/aws-deploy](https://github.com/Ganesh172919/personal-finance/tree/codex/aws-deploy).
- Direct pushes start CI but do not automatically update the EC2 application.
- [Tests run 45105575104](https://github.com/Ganesh172919/personal-finance/actions/runs/45105575104) passed for commit `f1ed41a`, including OCR and release checks.
- A previous remote run failed in EC2 HTTPS and k6 Smoke. Follow-up commit `73a4111` supplied a candidate OCR runtime fix and release script.
- Check the CI run for the exact SHA being released; passing CI does not deploy the branch to EC2.
- `personalfinanceagent.dpdns.org` did not have a public A record when checked on 23 November 2026.
- Remaining Python dependency advisories and the single-host architecture need further work before claiming full production readiness.

## How to use this documentation

Read the architecture guide first, then the operations guide before releasing or recovering anything.
The test index identifies code to inspect before a change; run the relevant tests and the complete CI workflow.
For commands involving production data or infrastructure, review the effect and check the current AWS and Git state.
The documents avoid credential values. Never commit environment files, tokens, backups, or personal financial data.
