#!/usr/bin/env bash
# Build, push and deploy FinWise to ECS Fargate using only the AWS CLI + Docker.
#
#   export AWS_REGION=ap-south-1 STACK=finwise-prod \
#          VPC_ID=vpc-... PUBLIC_SUBNETS=subnet-a,subnet-b TASK_SUBNETS=subnet-c,subnet-d \
#          APP_SECRET_ARN=arn:aws:secretsmanager:... PUBLIC_URL=https://app.example.com \
#          CERTIFICATE_ARN=arn:aws:acm:...            # optional (HTTPS)
#          ENABLE_GOOGLE_AUTH=true                    # optional; secret needs GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET
#   deploy/aws/deploy.sh
set -euo pipefail

: "${AWS_REGION:?}" "${VPC_ID:?}" "${PUBLIC_SUBNETS:?}" "${TASK_SUBNETS:?}" "${APP_SECRET_ARN:?}" "${PUBLIC_URL:?}"
STACK="${STACK:-finwise-prod}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TAG="${IMAGE_TAG:-$(git -C "$ROOT" rev-parse --short HEAD)}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
REGISTRY="${ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com"

for repo in web server ai-core; do
  aws ecr describe-repositories --repository-names "finwise/${repo}" --region "$AWS_REGION" >/dev/null 2>&1 \
    || aws ecr create-repository --repository-name "finwise/${repo}" --region "$AWS_REGION" \
         --image-scanning-configuration scanOnPush=true >/dev/null
done
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REGISTRY"

build_push() { # name context
  docker build -t "${REGISTRY}/finwise/$1:${TAG}" "$ROOT/$2"
  docker push "${REGISTRY}/finwise/$1:${TAG}"
}
build_push web client
build_push server server
build_push ai-core server/AI_Core

aws cloudformation deploy --region "$AWS_REGION" --stack-name "$STACK" \
  --template-file "$ROOT/deploy/aws/finwise.yaml" --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    VpcId="$VPC_ID" PublicSubnetIds="$PUBLIC_SUBNETS" TaskSubnetIds="$TASK_SUBNETS" \
    AssignPublicIp="${ASSIGN_PUBLIC_IP:-ENABLED}" AppSecretArn="$APP_SECRET_ARN" \
    PublicUrl="$PUBLIC_URL" CertificateArn="${CERTIFICATE_ARN:-}" \
    WebImage="${REGISTRY}/finwise/web:${TAG}" ServerImage="${REGISTRY}/finwise/server:${TAG}" \
    AiCoreImage="${REGISTRY}/finwise/ai-core:${TAG}" \
    LlmRpm="${LLM_RPM:-10}" AiCoreDesiredCount="${AI_CORE_DESIRED:-1}"     EnableGoogleAuth="${ENABLE_GOOGLE_AUTH:-false}"

aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$STACK" \
  --query "Stacks[0].Outputs" --output table
