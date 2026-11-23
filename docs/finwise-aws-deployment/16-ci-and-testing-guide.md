# CI and testing guide

This guide describes the Tests workflow on the release branch as inspected on 23 November 2026.
The workflow file is `.github/workflows/test.yml`.
The authoritative definition is the file at the commit being tested.
Confirm that a CI run belongs to the exact commit you intend to release.

## Why the commit matters

A successful run validates the checked-out commit in that workflow's environment.
A later push can change code, dependencies, infrastructure or the workflow itself.
The later commit needs its own review and checks.
A successful workflow does not automatically update EC2.
An EC2 release needs an explicit, reviewed deployment step.

## Branch triggers

The inspected workflow is configured for pushes to `main`, `develop`, `features/*` and `codex/aws-deploy`.
It is also configured for pull requests targeting `main`, `develop` and `codex/aws-deploy`.
The branch patterns and protection settings can change.
Inspect the current workflow and repository settings rather than assuming they remain unchanged.

The workflow uses a concurrency group based on the workflow and Git reference.
A later run on the same reference can cancel an earlier in-progress run.
When this happens, inspect the newer run rather than treating the canceled run as successful.

## Client test job

The client job checks out the repository and sets up Node 24.
It installs dependencies with `npm ci` using the client lockfile.
It audits runtime dependencies with the configured severity threshold.
It runs client tests.
It builds the client.

If the install fails, inspect the lockfile, registry availability and Node compatibility.
If an audit fails, inspect the advisory and whether the affected dependency is used at runtime.
If tests fail, identify the failing test and reproduce it with the same relevant environment.
If the build fails, inspect compiler and bundler output.
Avoid changing the lockfile without reviewing the dependency impact.

## Server test job

The server job sets up Node 24 and installs the server lockfile.
It audits runtime dependencies.
It caches the MongoDB test binary used by the server test setup.
It runs the server CI test command with test configuration.
It builds the server and worker.

The server tests use isolated test stores according to the workflow configuration.
The separate Compose job exercises additional shared-service behavior.
A passing server test job does not establish that production credentials or external providers work.

## AI Core test job

The AI job sets up Python 3.11.
It installs the development requirements.
It runs the non-latency test selection.
It runs the evaluation runner and uploads reports.
The workflow uses test configuration instead of production provider credentials.

When a test fails, inspect the failing case and dependency versions.
When an evaluation fails, inspect the uploaded report for the tested commit.
Do not publish test output that contains personal data or secrets.

## Docker image build jobs

The workflow builds separate web, server and AI Core images.
The matrix uses the corresponding build context for each image.
These jobs check whether the images can be built in the CI environment.
They do not deploy the images to EC2.
The inspected workflow uses GitHub Actions build cache scopes for the images.

An image build failure can originate in a Dockerfile, package installation, lockfile, base image or build context.
Check the failing build step before changing unrelated services.

## Release and rollback fixture job

The release job checks the release script's shell syntax.
It runs the repository's release test script.
The tests use disposable repositories and service stubs to exercise release transitions.
They do not replicate every AWS outage or database failure.
Production still needs a backup, compatible migration plan and retained rollback images.

## EC2 HTTPS and k6 smoke job

The Compose smoke job starts a temporary stack with test settings.
It uses a mock model provider and throwaway secrets.
It builds and starts the web, server and AI Core images with the EC2 overlays.
It uses a local Caddy certificate authority to test HTTPS for a primary name and an alias.
It runs the Node smoke script against the temporary stack.
It runs OCR and Mongo-backed state checks using the runtime image.
It starts a load-test configuration and runs the k6 smoke scenario.
It collects logs when a failure occurs and tears down the temporary stack.

The job is useful for checking integration across containers.
It does not prove the real public DNS, production provider key, production database contents or backup restore.
The load test runs in a limited CI environment and is not a production capacity guarantee.

## Lint and template checks

The inspected lint job installs client dependencies and runs the client linter.
It installs the pinned Ruff and CloudFormation lint tools in CI.
It checks AI Core and the AI smoke script.
It checks the EC2 and ECS CloudFormation templates.
Template validation does not apply an infrastructure change or predict every operational effect.

## Historical CI observations

The Tests run for commit `600d509` failed during a Linux OCR import check.
The error involved a native zlib and `pyclipper` interaction in the AI runtime.
A subsequent commit adjusted the runtime and added smoke checks.
The [Tests run for `41798f7`](https://github.com/Ganesh172919/personal-finance/actions/runs/45132649356) passed all listed jobs.
The [Tests run for `879b9c3`](https://github.com/Ganesh172919/personal-finance/actions/runs/45135317085) also completed successfully.
These results are historical; inspect the run for the release target.

## Local preparation

Use Node 24 and Python 3.11 to match the inspected workflow.
Use isolated test data and test-only credentials.
Install JavaScript dependencies using the repository lockfiles.
Create a Python virtual environment and install the AI development requirements.
Some server tests may download a MongoDB test binary on first use.
Check platform compatibility before interpreting a local installation failure as an application failure.

## Client commands

Run these commands from the repository root:

```bash
npm --prefix client test
npm --prefix client run lint
npm --prefix client run build
```

Start with tests relevant to the changed client feature when iterating.
Run the wider suite before relying on the change.
Inspect the exact error and preserve useful logs without user data.

## Server commands

```bash
npm --prefix server run test:ci
npm --prefix server run build
```

The server build covers the gateway and worker code.
Authentication, proxy and CORS changes need relevant ingress and configuration checks.
Database changes need integration coverage and a migration review.

## AI Core commands

```bash
cd server/AI_Core
python -m pytest tests/ -m 'not latency'
python -m evals.runner -m 'not latency'
```

Run these in the intended virtual environment.
Use a mock or test provider configuration where the tests require one.
Check provider-specific tests and reports when changing integration behavior.

## Release script checks

On a Linux environment or suitable shell:

```bash
bash -n deploy/aws/release-ec2.sh
bash scripts/test-release-ec2.sh
```

Do not run the production deployment command as a test against the live host.
The fixture test uses disposable resources and stubs.
Review its coverage when changing release behavior.

## Dependency audit procedure

1. Identify the exact lockfile or requirements version being assessed.
2. Run the appropriate audit tool in an isolated environment.
3. Record the date because advisory databases change.
4. Inspect the affected package, version, severity and reachable use.
5. Identify the available fixed versions.
6. Review compatibility with the rest of the application.
7. Apply an upgrade in a test branch.
8. Run relevant tests and the complete CI workflow.
9. Re-run the audit.
10. Record unresolved findings and an owner.

An earlier Python audit found remaining advisories after partial updates.
Do not treat that historical finding count as the current count.
Do not claim the application has no vulnerabilities based only on a passing build.

## Test evidence for a release

Record the target SHA.
Record the exact CI run URL.
Record the workflow conclusion.
Record meaningful local checks not covered by CI.
Record real-provider checks performed in a suitable environment.
Record any skipped checks and why they were skipped.
Record database migration and rollback tests.
Record the operator and verification time.

## Handling a failure

1. Stop promotion of the failing commit.
2. Identify the failing job and first relevant error.
3. Determine whether the failure is reproducible.
4. Check for an infrastructure or registry outage.
5. Preserve the job URL and redacted logs.
6. Fix the underlying issue or document a reviewed exception where appropriate.
7. Push the change and inspect the new run.
8. Deploy only the reviewed target that passed its required checks.

Do not remove a meaningful smoke check solely to make a release appear green.
