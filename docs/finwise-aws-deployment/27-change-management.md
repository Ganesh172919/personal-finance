# Change management guide

Use this guide to plan changes to the recorded AWS deployment.
The goal is to make each change reviewable and recoverable.
The application release, infrastructure, DNS and credential changes have different procedures.

## Classify the change

### Documentation

A Markdown-only change updates repository documentation after it is pushed.
It normally does not require an application restart.
The configured GitHub workflow still runs on a release-branch push.
Review links, factual accuracy and accidental secret exposure.

### Frontend

A frontend code change affects the web image.
Run client tests, lint and build checks.
Review API compatibility and browser session behavior when relevant.
Deploying the change requires an application release.

### Gateway or worker

A server change can affect API requests, authentication or background jobs.
Run server tests and build checks.
Review database and AI Core compatibility.
Test the affected workflow after deployment.

### AI Core

An AI Core change can affect provider calls, state, OCR or processing limits.
Run the AI test and evaluation suites.
Review the Python dependency and runtime-image impact.
Test real provider behavior separately when appropriate.

### Compose configuration

A Compose change can affect service startup, networks, volumes and environment precedence.
Review the base file and each selected overlay together.
Check that the project name remains correct.
Validate against an isolated stack before release.

### CloudFormation

An infrastructure template change can affect AWS resources.
Review a change set for replacements and deletions.
Check EBS retention, Elastic IP, security group and IAM impact.
Apply it separately from an application release.

### DNS and domain

A DNS change affects how clients find the host.
Review the registrar, nameservers, A record and certificate implications.
Confirm the current Elastic IP before editing records.
Test both DNS and HTTPS after propagation.

### Credentials

A credential change affects access to one or more services.
Determine whether old credentials must remain available for decryption or rollback.
Plan session invalidation and provider verification.
Keep the secret value out of the change record.

### Database migration

A migration changes persisted data or indexes.
Review backward compatibility and recovery requirements.
Test against an isolated restored copy.
Do not assume reverting code reverses the migration.

## Prepare the change record

Record the purpose and affected users.
Record the source commit and target environment.
Record the current production SHA.
Record the test plan and CI run.
Record relevant configuration or infrastructure changes.
Record the backup recovery point.
Record the rollback or recovery plan.
Record the operator and planned window.
Record the expected user impact.

## Review dependencies

Identify services that start before the changed service.
Identify databases and caches used by the feature.
Identify external providers and quotas.
Identify domains, callbacks and email links affected by the change.
Identify secrets needed to run and recover the feature.
Identify whether a one-host failure affects the entire workflow.

## Test before production

Use test-only accounts and non-sensitive data.
Run narrow tests while iterating.
Run the full required workflow for the target commit.
Test migrations on an isolated copy.
Test real provider integration in an appropriate environment.
Review error handling and rollback conditions.
Record test results and known limitations.

## Plan deployment

Confirm the target SHA belongs to the release branch.
Confirm its required CI checks passed.
Confirm the host checkout and current release images.
Confirm sufficient disk capacity.
Confirm a recoverable backup and its scope.
Confirm that the rollback release can read current data.
Allow time to verify and, if necessary, recover.

## Apply the change

Use Session Manager for the recorded host access path.
Use the reviewed release script for application releases.
Use a reviewed CloudFormation change set for infrastructure changes.
Use the authorized DNS provider for record changes.
Use protected host configuration or an approved secret store for credentials.
Do not mix unrelated emergency changes into the same operation without recording them.

## Verify the result

Check the exact deployed SHA and image state.
Check public HTTPS and the expected hostnames.
Check authentication with a designated account.
Check affected application and background workflows.
Check provider access and quota where relevant.
Check service health, logs, disk and backup behavior.
Record the outcome and any incomplete checks.

## Decide whether to roll back

Assess user impact and the scope of the failure.
Check whether the failure is caused by code, configuration, infrastructure or an external provider.
Determine whether the prior application is compatible with current data.
Confirm that previous images are available.
Follow the reviewed rollback procedure.
If rollback fails, preserve evidence and begin incident recovery.

## Close the change

Record the final running SHA.
Record the time and outcome of each verification.
Record any rollback or recovery action.
Record unresolved issues and owners.
Update the deployment record when the result is verified.
Retain rollback images and backup material according to the acceptance policy.

## Example change: update the frontend

Review the client diff and test results.
Confirm API compatibility with the target gateway.
Check the image build and HTTPS smoke jobs.
Deploy the tested commit.
Verify login, navigation and the modified page in a fresh browser session.
Record the result without screenshots of private financial data.

## Example change: enable an alias

Confirm domain ownership and DNS delegation.
Point the A record to the current Elastic IP.
Review Caddy and allowed-origin configuration.
Verify trusted HTTPS on the alias.
Test authentication and API access from the alias.
Review canonical links and OAuth callbacks before switching `CLIENT_URL`.

## Example change: update a Python dependency

Review the advisory or compatibility reason.
Update the dependency in an isolated branch.
Run AI tests and evaluations.
Build the runtime image.
Run the OCR and Mongo-backed smoke checks where relevant.
Review remaining advisories and deploy only the tested commit.

## Example change: rotate the AI provider key

Confirm the provider account and intended model.
Prepare the new credential through an authorized channel.
Update the protected AI Core configuration.
Recreate the affected service according to the running release.
Run a non-sensitive provider-backed request.
Revoke the old credential after verification when appropriate.
Record the event without the key value.
