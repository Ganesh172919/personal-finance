# Operator record templates

Use these templates to capture verified operational facts.
Store completed records in a location appropriate for their sensitivity.
Do not include passwords, tokens, customer financial data or backup contents.

## Production release record

```text
Change title:
Operator:
Date and timezone:
AWS account and region:
EC2 instance ID:
Canonical hostname:
Previous production SHA:
Target production SHA:
GitHub Actions run URL:
CI conclusion:
Database migration reviewed:
Backup recovery point:
Previous image availability:
Deployment start time:
Deployment end time:
Public HTTPS result:
Login and session result:
Affected feature checks:
Worker and dependency checks:
Rollback required:
Final running SHA:
Outstanding issues and owners:
```

Verify each field rather than copying a historical value forward.
If a check was not performed, state that explicitly and record its owner.

## Infrastructure change record

```text
Change title:
Operator:
Date and timezone:
AWS account and region:
CloudFormation stack:
Template commit SHA:
Change-set identifier:
Parameter review completed:
Resources added:
Resources modified:
Resources replaced:
Resources deleted:
EBS retention reviewed:
Elastic IP impact reviewed:
IAM and security-group impact reviewed:
Backup recovery point:
Expected interruption:
Application verification result:
Final stack status:
Outstanding issues and owners:
```

The actual change set and AWS stack history remain the source of truth.
Do not include secrets in CloudFormation parameters or the record unless an approved secure process explicitly requires it.

## DNS change record

```text
Hostname:
Domain owner:
DNS provider:
Change operator:
Date and timezone:
Previous authoritative nameservers:
New authoritative nameservers:
Previous A record:
New A record:
Current Elastic IP verified in AWS:
Public DNS verification time:
HTTPS certificate verification result:
Application origin and login checks:
Canonical URL changed:
OAuth and email link review:
Outstanding issues and owners:
```

Do not include DNS provider passwords or recovery codes.
Record the hostname and IP actually verified, including the time of the check.

## Backup record

```text
Backup owner:
Backup type:
Source environment:
Source region:
Database or volume scope:
Creation time and timezone:
Completion status:
Archive or snapshot identifier:
Off-host location:
Encryption and access review:
Checksum verification result:
Retention date:
Last isolated restore result:
Observed recovery duration:
Missing data sources:
Outstanding issues and owners:
```

The record does not contain the backup contents or encryption key.
An untested backup has an unverified recovery outcome.

## Incident record

```text
Incident identifier:
Incident owner:
Detection time and timezone:
Affected hostnames and features:
Last known working time:
Current production SHA:
Recent changes:
Confirmed observations:
Suspected causes:
Redacted request IDs:
Actions and results:
Selected recovery point:
Potential data impact:
Service restoration time:
Remaining issues:
Follow-up owners and dates:
```

Keep confirmed observations separate from hypotheses.
Redact tokens, cookies, one-time codes and personal financial information.

## Credential rotation record

```text
Credential purpose:
Provider or internal service:
Operator:
Date and timezone:
Affected services:
Expected user impact:
Previous-key recovery requirement reviewed:
New configuration applied:
Feature verification result:
Previous credential revoked:
Outstanding issues and owners:
```

Record the event, not the credential value.
For webhook encryption, confirm that existing stored credentials remain recoverable.
