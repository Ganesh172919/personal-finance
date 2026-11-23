# GitHub and deployment questions

These answers describe the workflow recorded on 23 November 2026.
Check the current repository and EC2 host before applying a change.

## Branches and commits

### What is the release branch?

The recorded release branch is `codex/aws-deploy`.
It contains deployment configuration and application changes selected for AWS.
Its current tip may differ from the production checkout.

### What is a commit SHA?

A commit SHA identifies a specific Git commit.
Use the full SHA when selecting a production target for the release script.
Record it with the CI run and deployment result.

### Does pushing a commit deploy it?

No.
The recorded workflow starts tests after a push to the release branch.
An operator must separately deploy a reviewed commit to the EC2 host.

### What if I push to main?

The `main` branch changes independently of `codex/aws-deploy`.
Bring the intended changes into the release branch and review them before deploying.
Do not assume the production host follows either branch automatically.

### What if I push directly to the release branch?

GitHub updates the branch and schedules the configured Tests workflow.
The website keeps serving the last applied EC2 release.
Inspect the workflow conclusion for the commit before considering deployment.

### Can a push land before CI finishes?

Yes, unless repository rules prevent it.
The branch was observed as unprotected during the earlier deployment work.
Check current branch protection settings rather than relying on that historical observation.

### Why use a pull request?

A pull request provides a reviewable diff and a place to inspect checks.
Repository rules can require review and passing checks before merging.
The pull request does not itself deploy the merged commit in the recorded setup.

### Does merging a pull request change EC2?

Not automatically in the recorded setup.
After merging, inspect the resulting commit and its CI result.
Apply a reviewed release separately when the application should change.

## CI and checks

### Where can I see the checks?

Open the repository's Actions page and select the Tests run for the target SHA.
Inspect the conclusion and individual jobs.
Record the run URL with the release record.

### What if a run is canceled?

The workflow's concurrency settings can cancel an earlier run on the same reference.
Find the later run for the commit you intend to use.
A canceled run is not a passing result.

### What if one test job fails?

Inspect the first relevant error and the failing job's context.
Do not treat unrelated passing jobs as proof that the commit is ready.
Fix or resolve the failure and inspect the new run.

### Does a passing CI run test the real provider?

The inspected Compose smoke job uses a mock AI provider and test credentials.
It does not validate the production provider's key, model availability or quota.
Use a suitable real-provider test when needed.

### Does CI prove the custom domain works?

The CI smoke job tests temporary local HTTPS hostnames.
It does not validate the public DigitalPlat DNS record.
Verify public DNS and the actual certificate separately.

### Does CI prove backups work?

No.
Create backups according to the operating plan and restore them in isolation.
Record the recovery point and the outcome of the drill.

### Can I deploy a commit with failed checks?

The documented process calls for reviewing and passing required checks before release.
Investigate the failure and select a verified target.
Do not remove a meaningful test solely to bypass a failure.

## Releases

### How do I find the running commit?

Connect to the correct host through Session Manager.
In `/opt/finwise`, inspect `git rev-parse HEAD`.
Also inspect running image and container state when confirming a release.

### What was the last recorded production commit?

The deployment record listed `b70ef81024b57f328477a2420e8dff4117f553fa`.
That value is historical.
Verify it on the host before using it in a release or rollback.

### Why use a full SHA?

The release script validates a full 40-character commit SHA.
It checks the selected commit against the fetched release branch.
An explicit SHA makes the intended target reviewable.

### Where is the release procedure?

See [the production runbook](../../deploy/aws/PRODUCTION_RUNBOOK.md#release-an-approved-commit).
See also [the release walkthrough](12-release-walkthrough.md).
Review the script from the intended commit before running it.

### What does the release script check?

The inspected script checks the checkout, branch ancestry and existing rollback images.
It builds or reuses tagged images and checks the OCR import.
It applies the candidate and probes key endpoints.
It attempts an application rollback when an apply or smoke check fails.

### Does rollback restore database contents?

No.
Application rollback leaves current persistent data in place.
Database restore is a separate decision that can lose writes after the backup.

### Can a documentation-only commit deploy automatically?

The recorded workflow does not automatically deploy any push.
Documentation changes normally need no application restart.
They still trigger the configured branch workflow.

### What if a release changes CloudFormation?

Review and apply the infrastructure change separately.
Inspect the change set for replacements, deletion, storage and network effects.
An application container release does not apply the template.

## Domains and access

### What is the recorded working website?

The recorded address is `https://finwise.3-106-147-122.sslip.io/`.
The login route returned HTTP 200 when checked on 23 November 2026.
Availability can change after that observation.

### Is the DigitalPlat hostname ready?

The last recorded public DNS check did not return an A record.
Configure delegation and the A record through the domain owner's authorized account.
Then verify public HTTPS and application behavior.

### How do I access EC2?

The recorded method is AWS Systems Manager Session Manager.
Use the correct account, Sydney region and instance ID.
The operator and host need the required Systems Manager permissions and connectivity.

### Where are production secrets?

The recorded environment files are on the host under `/opt/finwise`.
They are excluded from Git.
Do not publish their contents in issues, logs or Markdown files.

### Is the website permanently free?

No permanent free hosting guarantee is established.
AWS compute, EBS, public IPv4, snapshots and provider usage may incur charges.
Review the current AWS account's credits, plan and billing.

## Recovery

### Is MongoDB redundant?

The recorded Compose stack uses a single-member replica set.
The replica-set format supports certain features but does not provide multiple database copies.
Maintain and test backups.

### Is a retained root volume a backup?

Volume retention can protect against a particular termination behavior.
It does not replace an encrypted off-host backup and an isolated restore test.
Confirm the actual deployed retention settings in AWS.

### Is a MongoDB dump a complete host backup?

No.
Redis, Caddy, environment files and other host data need separate coverage.
Review the complete recovery inventory and verify it against the deployed release.

### What should I record after a release?

Record the target SHA, previous SHA, date, operator, CI run and verification results.
Record the backup recovery point and migration assessment when relevant.
Exclude secrets and personal financial information.
