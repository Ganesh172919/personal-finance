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
12. [Release walkthrough](12-release-walkthrough.md) explains preparation, deployment and rollback.
13. [DNS operator guide](13-dns-operator-guide.md) covers delegation, records and certificate checks.
14. [Backup operator guide](14-backup-operator-guide.md) covers backup scope and isolated restoration.
15. [Incident playbooks](15-incident-playbooks.md) provide investigation steps for common failures.
16. [CI and testing guide](16-ci-and-testing-guide.md) explains the workflow jobs and evidence.
17. [Configuration reference](17-configuration-reference.md) describes settings and secret handling.
18. [AWS infrastructure guide](18-aws-infrastructure-guide.md) covers the host and stack review.
19. [Compose operations](19-compose-operations-guide.md) explains services, health and persistence.
20. [Post-release verification](20-post-release-verification.md) covers public and feature checks.
21. [Security operations](21-security-operations.md) covers access, rotation and incident evidence.
22. [GitHub workflow questions](22-github-workflow-faq.md) explains branches, CI and releases.
23. [Routine maintenance](23-routine-maintenance-guide.md) sets out proposed review procedures.
24. [Deployment glossary](24-deployment-glossary.md) defines terms used in this handbook.
25. [Operator command reference](25-command-reference.md) lists reviewed inspection commands.
26. [Cost and capacity](26-cost-and-capacity.md) covers billing and resource planning.
27. [Change management](27-change-management.md) describes review, release and rollback decisions.
28. [Recovery decisions](28-recovery-decision-guide.md) distinguishes rollback and data recovery.
29. [Recovery drill checklist](29-recovery-drill-checklist.md) supports isolated restore exercises.
30. [Operator records](30-operator-records.md) provides templates for verified operational facts.

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
