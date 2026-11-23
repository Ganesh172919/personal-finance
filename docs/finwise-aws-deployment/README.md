# FinWise AWS deployment handbook

This handbook describes the deployment recorded on 21 November 2026 and the release workflow available on 23 November 2026. Infrastructure and credentials can change. Confirm the current values in AWS and on the instance before acting.

The recorded public site is [FinWise](https://finwise.3-106-147-122.sslip.io/). The recorded release branch is [`codex/aws-deploy`](https://github.com/Ganesh172919/personal-finance/tree/codex/aws-deploy).

## Contents

1. [Deployment overview](01-overview.md) explains the live topology and its limitations.
2. [DNS and HTTPS](02-dns-https.md) covers the working hostname and the pending DigitalPlat domain.
3. [GitHub and releases](03-github-releases.md) explains what happens after a push and how an operator deploys.
4. [Configuration and security](04-configuration-security.md) describes configuration locations and credential handling.
5. [Backup and recovery](05-backup-recovery.md) explains backup scope, restore drills, and host recovery.
6. [Operations and troubleshooting](06-operations-troubleshooting.md) provides practical diagnostic procedures.
7. [Testing and maintenance](07-testing-maintenance.md) lists checks and a proposed maintenance routine.
8. [Deployment history](08-deployment-history.md) records notable changes and verified results.
9. [Service reference](09-service-reference.md) explains each running component.
10. [Operator checklists](10-operator-checklists.md) gives release, DNS, backup and review checklists.
11. [AWS host access](11-aws-host-access.md) covers Session Manager and infrastructure review.

The detailed executable procedures are also maintained in the repository's [production runbook](../../deploy/aws/PRODUCTION_RUNBOOK.md) and [EC2 guide](../../deploy/aws/EC2.md). Treat the repository source at the selected release SHA as authoritative when it differs from this historical description.

## Essential answers

- A push to `codex/aws-deploy` starts GitHub Actions. It does not automatically deploy to EC2.
- The last recorded live checkout was `b70ef81024b57f328477a2420e8dff4117f553fa`. Verify it on the host before a release.
- The `personalfinanceagent.dpdns.org` hostname still needed a public A record at the last DNS check.
- The stack uses one EC2 host and one MongoDB primary. Backups and tested recovery matter.
- The AWS Free plan and external services can have usage charges or limits. Check the current account billing page.
- A successful CI run is evidence for the tested commit. It does not prove every production provider and recovery path is working.

## How to update this handbook

After a release or infrastructure change, record the verification date, the deployed SHA, the operator, the tests performed and any remaining work. Never put passwords, tokens, recovery codes, customer financial information or database dumps in documentation.
