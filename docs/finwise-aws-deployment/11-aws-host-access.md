# AWS host access and infrastructure review

## Identify the correct environment

The initial deployment record identifies AWS Region `ap-southeast-2`, CloudFormation stack `finwise-ec2`, instance `i-06ee1a58a13fdff40`, and Elastic IP `3.106.147.122`. Confirm all four in the AWS console before acting. Resource identifiers can change after a rebuild or recovery.

The CloudFormation template creates an instance role with the Systems Manager managed-instance policy. The recorded operating method uses Session Manager for shell access. Access depends on the instance being managed and on the operator having appropriate AWS permissions.

## Session Manager workflow

1. Sign in to the correct AWS account using an authorized identity.
2. Select the Sydney region.
3. Confirm the instance identifier and current instance status.
4. Open a Session Manager session to the intended instance.
5. Confirm the host and navigate to `/opt/finwise`.
6. Inspect the running SHA and service status before making changes.
7. Use privileged access only when needed for the reviewed procedure.
8. Close the session when finished and record the change outcome.

The host's environment files contain credentials. Do not copy them to an issue, public paste or Git repository while diagnosing a problem.

## CloudFormation review

`deploy/aws/ec2.yaml` defines the recorded EC2 topology. It takes a VPC and public subnet, configures the instance, instance profile and security group, and associates an Elastic IP. The template requires IMDSv2 and configures encrypted gp3 storage.

The instance bootstrap installs Docker, Git and OpenSSL and installs checksum-verified Docker Compose and Buildx plugins. If provisioning fails, inspect the AWS instance status and cloud-init logs without exposing credentials.

An infrastructure update can replace resources even when a source change looks small. Review a CloudFormation change set, replacement behavior, persistent volumes, network routes, IAM permissions and cost before applying it. A Git push or Docker release does not automatically apply a CloudFormation update.

## Security group

The template permits public inbound TCP 80 and 443 for HTTP and HTTPS. The application uses internal container networking for MongoDB, Redis and AI Core. Do not add public database or AI service ingress simply to make troubleshooting easier; use an authorized administrative path.

## Host replacement

Before replacing the host, identify the correct recovery point and verify access to encrypted backups, environment files, the reviewed release SHA and necessary keys. Restore and test in isolation before moving production traffic. Confirm the Elastic IP association and DNS after cutover.

The root EBS volume was configured for retention after termination in the recorded template. Verify the actual resource settings and retain a separately tested off-host recovery copy.
