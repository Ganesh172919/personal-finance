# GitHub changes and application releases

## What a push does

Pushing a commit to `codex/aws-deploy` updates that branch on GitHub and triggers the **Tests** workflow. It does not cause the EC2 instance to fetch the commit or restart its containers. The website continues serving its last applied release.

A push to `main` or another branch does not update `codex/aws-deploy` until the changes are incorporated into the release branch. A documentation-only change generally does not require an application deployment.

The branch was reported as unprotected on 21 November 2026. Confirm its current protection settings in GitHub. A pull request allows a reviewer to inspect the diff and CI before merging; branch protection can enforce a chosen policy.

## Before deploying

1. Identify the full target commit SHA and the currently running production SHA.
2. Review the exact changes between those SHAs, including configuration and database changes.
3. Check the **Tests** workflow for the target SHA on the [release branch](https://github.com/Ganesh172919/personal-finance/actions?query=branch%3Acodex%2Faws-deploy).
4. Confirm the test run passed and inspect any failures or skipped checks.
5. Verify that a recoverable backup exists, that there is sufficient disk space and that prior release images are available.
6. Assess migration compatibility and the effects of a rollback on current database data.
7. Select a maintenance window and prepare to verify the application after deployment.

The last recorded live checkout was `b70ef81024b57f328477a2420e8dff4117f553fa`. Confirm the actual host SHA with `git rev-parse HEAD`; the release branch has newer commits.

## Release procedure

Connect through AWS Systems Manager Session Manager and follow the reviewed [production runbook](../../deploy/aws/PRODUCTION_RUNBOOK.md#release-an-approved-commit) for the exact target SHA. The runbook includes the commands for retrieving the release script from the target commit and deploying it.

The release script checks the checkout, verifies branch ancestry, checks rollback images, builds or reuses tagged images, tests native OCR imports and then applies the candidate. It probes key routes and attempts to restore the previous application release if an apply or probe fails.

CI tested the release and rollback logic with disposable repositories and service stubs. That does not guarantee a production rollback will succeed under every infrastructure or data failure. Preserve the previous images and know the recovery procedure before applying a release.

## Verify the result

From an external network, check the public login, registration, health and Python gateway routes. Use a designated test account to check sign-in, session recovery, a disposable transaction and an AI reply. Test receipts, email or speech when the change affects those features. Review container health and logs without copying credentials or customer data into a ticket.

Record the target SHA, time, operator, CI run and verification results. Keep the previous SHA and image tags until the release has been accepted.

## Rollback limits

The reviewed release script can use retained local images to restore the earlier application. A code rollback does not reverse data writes or automatically undo a database migration. Restoring a database backup can discard later writes. Assess database compatibility and data loss separately from reverting code.

## Automatic deployment

No automatic deployment workflow was recorded for this branch. Adding one requires a separately designed mechanism for AWS access, immutable release selection, health checks, secrets and rollback. A successful CI run alone is not a deployment.
