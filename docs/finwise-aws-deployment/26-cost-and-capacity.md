# Cost and capacity operations

This guide describes how to review cost and capacity for the recorded deployment.
It does not promise that the application will remain within a free allowance.
AWS pricing, account plans, provider prices and quotas can change.
Use the current AWS and provider billing interfaces for actual figures.

## Recorded resource profile

The deployment record identifies one `m7i-flex.large` EC2 instance.
The host runs Amazon Linux 2023.
The root EBS volume was recorded as encrypted gp3 with a size of 40 GiB.
The instance uses a public Elastic IPv4 address.
The application, database, cache and ingress run on the same host.
Confirm the actual deployed resources before estimating cost.

## Cost categories

### Compute

EC2 charges depend on the account plan, instance type, region and running usage.
Changing the instance type can change both capacity and cost.
Review the proposed type and availability before applying an infrastructure change.

### Storage

EBS volume charges can continue while a volume exists.
The recorded root volume was configured to remain after instance termination.
Retention supports recovery planning but can leave a billable resource.
Review attached and retained volumes in the correct account and region.

### Snapshots

EBS snapshots and copies can incur storage charges.
Retention rules affect the amount of stored backup data.
Cost review must not replace a recovery requirement or restore test.

### Public IPv4

Public IPv4 use may be billed under current AWS pricing.
Check the Elastic IP's association and the account's current billing details.
Do not release the production address merely to reduce cost without planning the DNS impact.

### Network transfer

Traffic, data transfer and other AWS networking features can have charges.
The cost depends on the actual architecture and traffic pattern.
Inspect the account's billing breakdown rather than assuming a fixed amount.

### Model provider

AI provider use can have token, request or plan-based charges and quotas.
The recorded provider was Groq with a configured model.
Verify the provider's current model access, limits and billing terms.
The CI mock provider does not represent production provider cost.

### Email and speech providers

SMTP and speech services can have separate quotas or charges.
Review their account dashboards and current terms.
Test service availability after any provider plan or credential change.

### DNS and hostname

The recorded `sslip.io` hostname was used without a paid domain registration.
The requested DigitalPlat name has its own registration and DNS requirements.
Free DNS does not make EC2, storage or external providers permanently free.

## AWS billing review

1. Sign in to the correct AWS account.
2. Open the current billing and cost information.
3. Confirm the relevant time period and currency.
4. Review EC2 compute charges.
5. Review EBS volume and snapshot charges.
6. Review public IPv4 and networking charges.
7. Review other services created for the account.
8. Check available credits and their expiration.
9. Compare actual usage with the intended plan.
10. Record unexpected changes and assign an owner.

The account's free plan eligibility and credit status are account-specific.
Do not infer remaining credits from the original deployment date.

## Budget and alert review

Decide who is responsible for cost alerts.
Review any configured AWS budgets and their thresholds.
Confirm the contact or notification destination is current.
Test alert delivery using an appropriate controlled method.
Review the provider dashboards for their own spending limits.
Record whether an alerting mechanism is actually configured.
Do not describe a proposed budget as an existing budget.

## Capacity boundaries

The recorded stack runs all core services on one host.
CPU, memory, disk and network capacity are shared by the application and its dependencies.
MongoDB and Redis health can affect the gateway and AI Core.
Image builds also consume host resources during deployment.
A successful small smoke test does not establish the maximum safe user load.

## CPU review

Check host and container CPU utilization over a representative period.
Correlate peaks with releases, background jobs and provider requests.
Identify sustained saturation rather than relying on one instantaneous sample.
Review the Compose CPU limits at the deployed release.
Test any capacity change in a suitable environment.

## Memory review

Check available host memory and container usage.
Review restart and out-of-memory events.
Inspect the limits configured for web, server, worker and AI Core.
Remember that database and cache services also consume host memory.
Increasing application replicas can increase aggregate memory use.

## Storage review

Check filesystem usage and available space.
Review MongoDB data growth.
Review Redis persistence growth.
Review Caddy state and application file storage.
Review Docker images and build cache.
Review local backups and temporary archives.
Review log rotation and retention.
Protect persistent volumes and rollback images during cleanup.

## AI concurrency review

The inspected Compose configuration exposes AI replica and inflight settings.
Some limits are per process or per replica.
Increasing replicas can multiply provider demand.
Compare aggregate request rates with the provider's current quota.
Monitor latency, errors, memory and user impact under representative load.
Do not increase concurrency solely to hide a provider outage.

## Worker capacity review

Check the age of pending jobs and retry patterns.
Check MongoDB, Redis and provider health before adding capacity.
The repository cautions about scheduler behavior with extra worker replicas.
Verify job idempotency and enqueue behavior before scaling workers.
Measure whether the host has enough CPU and memory for the proposed change.

## Load test interpretation

The repository includes k6 scenarios and a CI smoke test.
The CI environment runs the application and load generation with limited resources.
Its result is useful for catching some regressions.
It is not a production capacity guarantee.
Use an authorized staging environment and representative workload for capacity planning.
Avoid testing production with uncontrolled high traffic.

## Capacity change checklist

1. Record the observed bottleneck and measurement period.
2. Check whether a recent release or incident caused the change.
3. Identify the proposed configuration or infrastructure change.
4. Estimate its effect on cost and provider quota.
5. Test in an isolated environment where possible.
6. Review rollback and data recovery implications.
7. Apply during an appropriate maintenance window.
8. Measure the same workload after the change.
9. Check service health and user workflows.
10. Record the result and ongoing monitoring owner.

## Cost review record

Record the review date and account.
Record the billing period.
Record resource categories rather than credentials.
Record current credit balance and expiration from AWS.
Record major provider quotas and usage trends.
Record unexpected changes and their owner.
Record the next review date.
