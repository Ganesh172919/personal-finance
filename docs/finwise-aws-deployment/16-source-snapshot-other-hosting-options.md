# Deployment source snapshot

Snapshot date: 23 November 2026. Check the current AWS console, live host and GitHub run before acting.

[Documentation index](00-START-HERE.md) · [Production runbook](../../deploy/aws/PRODUCTION_RUNBOOK.md)

This appendix preserves selected version-controlled files from release-branch commit `f1ed41a5fdf5ba354ebfda199c0e69cebda1f369`.
It is a historical reference; compare against the current files before using commands or configuration.
The example environment files contain placeholders and defaults, not the live secret values.

**Scope:** ECS and Kubernetes are alternative deployment definitions. The recorded live website runs on EC2 with Compose.

## `deploy/aws/finwise.yaml`

Snapshot SHA-256: `aa6d0c85e98b61ae52668b831cf49fb065af99d78df70ed3525095d8e39d8614`.

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: FinWise on ECS Fargate - web, API gateway, worker, AI Core behind one ALB (Redis via ElastiCache; MongoDB external)

Parameters:
  VpcId: {Type: "AWS::EC2::VPC::Id"}
  PublicSubnetIds:
    Type: "List<AWS::EC2::Subnet::Id>"
    Description: ALB subnets (at least two AZs)
  TaskSubnetIds:
    Type: "List<AWS::EC2::Subnet::Id>"
    Description: Fargate task subnets (private with NAT, or public with AssignPublicIp=ENABLED)
  AssignPublicIp: {Type: String, Default: ENABLED, AllowedValues: [ENABLED, DISABLED]}
  WebImage: {Type: String}
  ServerImage: {Type: String}
  AiCoreImage: {Type: String}
  AppSecretArn:
    Type: String
    Description: Secrets Manager JSON with JWT_SECRET, AI_CORE_INTERNAL_TOKEN, WEBHOOK_CREDENTIALS_KEY, MONGO_URI, and the enabled provider credentials
  CertificateArn:
    Type: String
    Default: ""
    Description: ACM certificate for HTTPS. Empty = plain HTTP listener (testing only)
  PublicUrl:
    Type: String
    Description: Public origin used for CLIENT_URL and CORS, e.g. https://app.example.com
  EnableGoogleAuth:
    Type: String
    Default: "false"
    AllowedValues: ["true", "false"]
    Description: "true = server gets GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET from AppSecretArn (keys must exist, ECS fails task start otherwise) and GOOGLE_CALLBACK_URL=PublicUrl/api/auth/google/callback. PublicUrl must have no trailing slash."
  EnableGnaniSpeech:
    Type: String
    Default: "false"
    AllowedValues: ["true", "false"]
    Description: Enable Gnani Prisma and Timbre using the GNANI_API_KEY in AppSecretArn
  LlmProvider: {Type: String, Default: gemini}
  LlmModel: {Type: String, Default: "", Description: Empty uses the default model for the selected provider}
  LlmRpm: {Type: Number, Default: 10, Description: "Free-tier requests/minute PER AI Core task; keep tasks x RPM within the provider quota"}
  AiCoreMaxInflight: {Type: Number, Default: 6}
  ServerDesiredCount: {Type: Number, Default: 2, MinValue: 1}
  ServerMaxCount: {Type: Number, Default: 6, MinValue: 1}
  AiCoreDesiredCount: {Type: Number, Default: 1, MinValue: 1}
  AiCoreMaxCount: {Type: Number, Default: 3, MinValue: 1}
  RedisNodeType: {Type: String, Default: cache.t4g.micro}
  LogRetentionDays: {Type: Number, Default: 30}

Conditions:
  HasCert: !Not [!Equals [!Ref CertificateArn, ""]]
  GoogleAuthEnabled: !Equals [!Ref EnableGoogleAuth, "true"]
  GnaniSpeechEnabled: !Equals [!Ref EnableGnaniSpeech, "true"]
  UseGroq: !Equals [!Ref LlmProvider, groq]

Resources:
  LogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: !Sub /ecs/${AWS::StackName}
      RetentionInDays: !Ref LogRetentionDays

  Cluster:
    Type: AWS::ECS::Cluster
    Properties:
      ClusterSettings: [{Name: containerInsights, Value: enabled}]

  Namespace:
    Type: AWS::ServiceDiscovery::PrivateDnsNamespace
    Properties:
      Name: finwise.local
      Vpc: !Ref VpcId

  AiCoreDiscovery:
    Type: AWS::ServiceDiscovery::Service
    Properties:
      Name: ai-core
      NamespaceId: !GetAtt Namespace.Id
      DnsConfig:
        RoutingPolicy: MULTIVALUE
        DnsRecords: [{Type: A, TTL: 10}]
      HealthCheckCustomConfig: {FailureThreshold: 1}

  # ---- networking ------------------------------------------------------------
  AlbSg:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: ALB ingress
      VpcId: !Ref VpcId
      SecurityGroupIngress:
        - {IpProtocol: tcp, FromPort: 80, ToPort: 80, CidrIp: 0.0.0.0/0}
        - {IpProtocol: tcp, FromPort: 443, ToPort: 443, CidrIp: 0.0.0.0/0}
  AppSg:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Fargate tasks
      VpcId: !Ref VpcId
      SecurityGroupIngress:
        - {IpProtocol: tcp, FromPort: 80, ToPort: 80, SourceSecurityGroupId: !Ref AlbSg}
        - {IpProtocol: tcp, FromPort: 3000, ToPort: 3000, SourceSecurityGroupId: !Ref AlbSg}
  AiCoreFromApp:
    Type: AWS::EC2::SecurityGroupIngress
    Properties:
      GroupId: !Ref AppSg
      IpProtocol: tcp
      FromPort: 8001
      ToPort: 8001
      SourceSecurityGroupId: !Ref AppSg
  RedisSg:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Redis from tasks only
      VpcId: !Ref VpcId
      SecurityGroupIngress:
        - {IpProtocol: tcp, FromPort: 6379, ToPort: 6379, SourceSecurityGroupId: !Ref AppSg}

  RedisSubnets:
    Type: AWS::ElastiCache::SubnetGroup
    Properties:
      Description: FinWise Redis
      SubnetIds: !Ref TaskSubnetIds
  Redis:
    Type: AWS::ElastiCache::ReplicationGroup
    Properties:
      ReplicationGroupDescription: FinWise cache, locks and rate counters
      Engine: redis
      CacheNodeType: !Ref RedisNodeType
      NumCacheClusters: 1
      AutomaticFailoverEnabled: false
      CacheSubnetGroupName: !Ref RedisSubnets
      SecurityGroupIds: [!Ref RedisSg]
      AtRestEncryptionEnabled: true

  # ---- load balancer -----------------------------------------------------------
  Alb:
    Type: AWS::ElasticLoadBalancingV2::LoadBalancer
    Properties:
      Type: application
      Scheme: internet-facing
      Subnets: !Ref PublicSubnetIds
      SecurityGroups: [!Ref AlbSg]
      LoadBalancerAttributes:
        # Long enough for SSE token streams.
        - {Key: idle_timeout.timeout_seconds, Value: "180"}
  WebTg:
    Type: AWS::ElasticLoadBalancingV2::TargetGroup
    Properties:
      VpcId: !Ref VpcId
      Protocol: HTTP
      Port: 80
      TargetType: ip
      HealthCheckPath: /healthz
      HealthCheckIntervalSeconds: 15
      HealthyThresholdCount: 2
      TargetGroupAttributes:
        - {Key: deregistration_delay.timeout_seconds, Value: "30"}
  ServerTg:
    Type: AWS::ElasticLoadBalancingV2::TargetGroup
    Properties:
      VpcId: !Ref VpcId
      Protocol: HTTP
      Port: 3000
      TargetType: ip
      HealthCheckPath: /readyz
      HealthCheckIntervalSeconds: 10
      HealthyThresholdCount: 2
      UnhealthyThresholdCount: 2
      TargetGroupAttributes:
        # /readyz flips to 503 on SIGTERM; give in-flight requests time to finish.
        - {Key: deregistration_delay.timeout_seconds, Value: "60"}
  HttpListener:
    Type: AWS::ElasticLoadBalancingV2::Listener
    Properties:
      LoadBalancerArn: !Ref Alb
      Protocol: HTTP
      Port: 80
      DefaultActions:
        - !If
          - HasCert
          - Type: redirect
            RedirectConfig: {Protocol: HTTPS, Port: "443", StatusCode: HTTP_301}
          - Type: forward
            TargetGroupArn: !Ref WebTg
  HttpsListener:
    Type: AWS::ElasticLoadBalancingV2::Listener
    Condition: HasCert
    Properties:
      LoadBalancerArn: !Ref Alb
      Protocol: HTTPS
      Port: 443
      SslPolicy: ELBSecurityPolicy-TLS13-1-2-2021-06
      Certificates: [{CertificateArn: !Ref CertificateArn}]
      DefaultActions: [{Type: forward, TargetGroupArn: !Ref WebTg}]
  ApiRule:
    Type: AWS::ElasticLoadBalancingV2::ListenerRule
    Properties:
      ListenerArn: !If [HasCert, !Ref HttpsListener, !Ref HttpListener]
      Priority: 10
      Conditions: [{Field: path-pattern, Values: ["/api/*"]}]
      Actions: [{Type: forward, TargetGroupArn: !Ref ServerTg}]

  # ---- IAM -----------------------------------------------------------------------
  ExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement: [{Effect: Allow, Principal: {Service: ecs-tasks.amazonaws.com}, Action: "sts:AssumeRole"}]
      ManagedPolicyArns: ["arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"]
      Policies:
        - PolicyName: read-app-secret
          PolicyDocument:
            Version: "2012-10-17"
            Statement: [{Effect: Allow, Action: "secretsmanager:GetSecretValue", Resource: !Ref AppSecretArn}]
  TaskRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement: [{Effect: Allow, Principal: {Service: ecs-tasks.amazonaws.com}, Action: "sts:AssumeRole"}]

  # ---- AI Core -----------------------------------------------------------------------
  AiCoreTask:
    Type: AWS::ECS::TaskDefinition
    Properties:
      Family: !Sub ${AWS::StackName}-ai-core
      RequiresCompatibilities: [FARGATE]
      NetworkMode: awsvpc
      Cpu: "1024"
      Memory: "2048"
      ExecutionRoleArn: !GetAtt ExecutionRole.Arn
      TaskRoleArn: !GetAtt TaskRole.Arn
      ContainerDefinitions:
        - Name: ai-core
          Image: !Ref AiCoreImage
          Essential: true
          StopTimeout: 60
          PortMappings: [{ContainerPort: 8001}]
          HealthCheck:
            Command: [CMD-SHELL, "python -c \"import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/ready', timeout=3)\""]
            Interval: 15
            Timeout: 5
            Retries: 3
            StartPeriod: 60
          Environment:
            - {Name: NODE_ENV, Value: production}
            - {Name: LLM_PROVIDER, Value: !Ref LlmProvider}
            - {Name: LLM_MODEL, Value: !Ref LlmModel}
            - {Name: LLM_RPM, Value: !Ref LlmRpm}
            - {Name: AI_CORE_MAX_INFLIGHT, Value: !Ref AiCoreMaxInflight}
            - {Name: LLM_CACHE_ENABLED, Value: "1"}
            - {Name: AI_CORE_STATE_BACKEND, Value: mongo}
            - {Name: AI_CORE_READY_REQUIRES_STATE, Value: "true"}
            - {Name: REDIS_URL, Value: !Sub "redis://${Redis.PrimaryEndPoint.Address}:6379"}
          Secrets:
            - {Name: MONGO_URI, ValueFrom: !Sub "${AppSecretArn}:MONGO_URI::"}
            - {Name: AI_CORE_INTERNAL_TOKEN, ValueFrom: !Sub "${AppSecretArn}:AI_CORE_INTERNAL_TOKEN::"}
            - !If
              - UseGroq
              - {Name: GROQ_API_KEY, ValueFrom: !Sub "${AppSecretArn}:GROQ_API_KEY::"}
              - {Name: GEMINI_API_KEYS, ValueFrom: !Sub "${AppSecretArn}:GEMINI_API_KEYS::"}
          LogConfiguration:
            LogDriver: awslogs
            Options: {awslogs-group: !Ref LogGroup, awslogs-region: !Ref "AWS::Region", awslogs-stream-prefix: ai-core}
  AiCoreService:
    Type: AWS::ECS::Service
    Properties:
      Cluster: !Ref Cluster
      LaunchType: FARGATE
      DesiredCount: !Ref AiCoreDesiredCount
      TaskDefinition: !Ref AiCoreTask
      DeploymentConfiguration:
        MinimumHealthyPercent: 100
        MaximumPercent: 200
        DeploymentCircuitBreaker: {Enable: true, Rollback: true}
      NetworkConfiguration:
        AwsvpcConfiguration: {AssignPublicIp: !Ref AssignPublicIp, Subnets: !Ref TaskSubnetIds, SecurityGroups: [!Ref AppSg]}
      ServiceRegistries: [{RegistryArn: !GetAtt AiCoreDiscovery.Arn}]

  # ---- API gateway ----------------------------------------------------------------------
  ServerTask:
    Type: AWS::ECS::TaskDefinition
    Properties:
      Family: !Sub ${AWS::StackName}-server
      RequiresCompatibilities: [FARGATE]
      NetworkMode: awsvpc
      Cpu: "512"
      Memory: "1024"
      ExecutionRoleArn: !GetAtt ExecutionRole.Arn
      TaskRoleArn: !GetAtt TaskRole.Arn
      ContainerDefinitions:
        - Name: server
          Image: !Ref ServerImage
          Essential: true
          StopTimeout: 70
          PortMappings: [{ContainerPort: 3000}]
          HealthCheck:
            Command: [CMD-SHELL, "node -e \"fetch('http://127.0.0.1:3000/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
            Interval: 15
            Timeout: 5
            Retries: 3
            StartPeriod: 30
          Environment:
            - {Name: NODE_ENV, Value: production}
            - {Name: PORT, Value: "3000"}
            - {Name: TRUST_PROXY, Value: "1"}
            - {Name: ASYNC_JOBS_ENABLED, Value: "true"}
            - {Name: CLIENT_URL, Value: !Ref PublicUrl}
            - {Name: CORS_ORIGINS, Value: !Ref PublicUrl}
            - {Name: PYTHON_API_URL, Value: "http://ai-core.finwise.local:8001"}
            - {Name: REDIS_URL, Value: !Sub "redis://${Redis.PrimaryEndPoint.Address}:6379"}
            - !If
              - GoogleAuthEnabled
              - {Name: GOOGLE_CALLBACK_URL, Value: !Sub "${PublicUrl}/api/auth/google/callback"}
              - !Ref "AWS::NoValue"
          Secrets:
            - {Name: JWT_SECRET, ValueFrom: !Sub "${AppSecretArn}:JWT_SECRET::"}
            - {Name: MONGO_URI, ValueFrom: !Sub "${AppSecretArn}:MONGO_URI::"}
            - {Name: AI_CORE_INTERNAL_TOKEN, ValueFrom: !Sub "${AppSecretArn}:AI_CORE_INTERNAL_TOKEN::"}
            - {Name: WEBHOOK_CREDENTIALS_KEY, ValueFrom: !Sub "${AppSecretArn}:WEBHOOK_CREDENTIALS_KEY::"}
            - !If
              - GnaniSpeechEnabled
              - {Name: GNANI_API_KEY, ValueFrom: !Sub "${AppSecretArn}:GNANI_API_KEY::"}
              - !Ref "AWS::NoValue"
            - !If
              - GoogleAuthEnabled
              - {Name: GOOGLE_CLIENT_ID, ValueFrom: !Sub "${AppSecretArn}:GOOGLE_CLIENT_ID::"}
              - !Ref "AWS::NoValue"
            - !If
              - GoogleAuthEnabled
              - {Name: GOOGLE_CLIENT_SECRET, ValueFrom: !Sub "${AppSecretArn}:GOOGLE_CLIENT_SECRET::"}
              - !Ref "AWS::NoValue"
          LogConfiguration:
            LogDriver: awslogs
            Options: {awslogs-group: !Ref LogGroup, awslogs-region: !Ref "AWS::Region", awslogs-stream-prefix: server}
  ServerService:
    Type: AWS::ECS::Service
    DependsOn: ApiRule
    Properties:
      Cluster: !Ref Cluster
      LaunchType: FARGATE
      DesiredCount: !Ref ServerDesiredCount
      TaskDefinition: !Ref ServerTask
      HealthCheckGracePeriodSeconds: 60
      DeploymentConfiguration:
        MinimumHealthyPercent: 100
        MaximumPercent: 200
        DeploymentCircuitBreaker: {Enable: true, Rollback: true}
      NetworkConfiguration:
        AwsvpcConfiguration: {AssignPublicIp: !Ref AssignPublicIp, Subnets: !Ref TaskSubnetIds, SecurityGroups: [!Ref AppSg]}
      LoadBalancers: [{ContainerName: server, ContainerPort: 3000, TargetGroupArn: !Ref ServerTg}]

  # ---- background worker ---------------------------------------------------------------
  WorkerTask:
    Type: AWS::ECS::TaskDefinition
    Properties:
      Family: !Sub ${AWS::StackName}-worker
      RequiresCompatibilities: [FARGATE]
      NetworkMode: awsvpc
      Cpu: "256"
      Memory: "512"
      ExecutionRoleArn: !GetAtt ExecutionRole.Arn
      TaskRoleArn: !GetAtt TaskRole.Arn
      ContainerDefinitions:
        - Name: worker
          Image: !Ref ServerImage
          Essential: true
          StopTimeout: 60
          Command: [node, dist/worker/worker.js]
          Environment:
            - {Name: NODE_ENV, Value: production}
            - {Name: ASYNC_JOBS_ENABLED, Value: "true"}
            - {Name: PYTHON_API_URL, Value: "http://ai-core.finwise.local:8001"}
            - {Name: REDIS_URL, Value: !Sub "redis://${Redis.PrimaryEndPoint.Address}:6379"}
          Secrets:
            - {Name: JWT_SECRET, ValueFrom: !Sub "${AppSecretArn}:JWT_SECRET::"}
            - {Name: MONGO_URI, ValueFrom: !Sub "${AppSecretArn}:MONGO_URI::"}
            - {Name: AI_CORE_INTERNAL_TOKEN, ValueFrom: !Sub "${AppSecretArn}:AI_CORE_INTERNAL_TOKEN::"}
            - {Name: WEBHOOK_CREDENTIALS_KEY, ValueFrom: !Sub "${AppSecretArn}:WEBHOOK_CREDENTIALS_KEY::"}
          LogConfiguration:
            LogDriver: awslogs
            Options: {awslogs-group: !Ref LogGroup, awslogs-region: !Ref "AWS::Region", awslogs-stream-prefix: worker}
  WorkerService:
    Type: AWS::ECS::Service
    Properties:
      Cluster: !Ref Cluster
      LaunchType: FARGATE
      DesiredCount: 1
      TaskDefinition: !Ref WorkerTask
      DeploymentConfiguration:
        MinimumHealthyPercent: 100
        MaximumPercent: 200
        DeploymentCircuitBreaker: {Enable: true, Rollback: true}
      NetworkConfiguration:
        AwsvpcConfiguration: {AssignPublicIp: !Ref AssignPublicIp, Subnets: !Ref TaskSubnetIds, SecurityGroups: [!Ref AppSg]}

  # ---- web (static SPA) --------------------------------------------------------------
  WebTask:
    Type: AWS::ECS::TaskDefinition
    Properties:
      Family: !Sub ${AWS::StackName}-web
      RequiresCompatibilities: [FARGATE]
      NetworkMode: awsvpc
      Cpu: "256"
      Memory: "512"
      ExecutionRoleArn: !GetAtt ExecutionRole.Arn
      ContainerDefinitions:
        - Name: web
          Image: !Ref WebImage
          Essential: true
          PortMappings: [{ContainerPort: 80}]
          LogConfiguration:
            LogDriver: awslogs
            Options: {awslogs-group: !Ref LogGroup, awslogs-region: !Ref "AWS::Region", awslogs-stream-prefix: web}
  WebService:
    Type: AWS::ECS::Service
    DependsOn: [HttpListener]
    Properties:
      Cluster: !Ref Cluster
      LaunchType: FARGATE
      DesiredCount: 2
      TaskDefinition: !Ref WebTask
      DeploymentConfiguration:
        MinimumHealthyPercent: 100
        MaximumPercent: 200
        DeploymentCircuitBreaker: {Enable: true, Rollback: true}
      NetworkConfiguration:
        AwsvpcConfiguration: {AssignPublicIp: !Ref AssignPublicIp, Subnets: !Ref TaskSubnetIds, SecurityGroups: [!Ref AppSg]}
      LoadBalancers: [{ContainerName: web, ContainerPort: 80, TargetGroupArn: !Ref WebTg}]

  # ---- autoscaling -----------------------------------------------------------------------
  ServerScalable:
    Type: AWS::ApplicationAutoScaling::ScalableTarget
    Properties:
      ServiceNamespace: ecs
      ScalableDimension: "ecs:service:DesiredCount"
      ResourceId: !Sub service/${Cluster}/${ServerService.Name}
      MinCapacity: !Ref ServerDesiredCount
      MaxCapacity: !Ref ServerMaxCount
  ServerScaling:
    Type: AWS::ApplicationAutoScaling::ScalingPolicy
    Properties:
      PolicyName: cpu-60
      PolicyType: TargetTrackingScaling
      ScalingTargetId: !Ref ServerScalable
      TargetTrackingScalingPolicyConfiguration:
        TargetValue: 60
        ScaleInCooldown: 300
        ScaleOutCooldown: 60
        PredefinedMetricSpecification: {PredefinedMetricType: ECSServiceAverageCPUUtilization}
  AiCoreScalable:
    Type: AWS::ApplicationAutoScaling::ScalableTarget
    Properties:
      ServiceNamespace: ecs
      ScalableDimension: "ecs:service:DesiredCount"
      ResourceId: !Sub service/${Cluster}/${AiCoreService.Name}
      MinCapacity: !Ref AiCoreDesiredCount
      MaxCapacity: !Ref AiCoreMaxCount
  AiCoreScaling:
    Type: AWS::ApplicationAutoScaling::ScalingPolicy
    Properties:
      PolicyName: cpu-60
      PolicyType: TargetTrackingScaling
      ScalingTargetId: !Ref AiCoreScalable
      TargetTrackingScalingPolicyConfiguration:
        TargetValue: 60
        ScaleInCooldown: 300
        ScaleOutCooldown: 60
        PredefinedMetricSpecification: {PredefinedMetricType: ECSServiceAverageCPUUtilization}

Outputs:
  AlbDnsName: {Value: !GetAtt Alb.DNSName}
  ClusterName: {Value: !Ref Cluster}
  LogGroupName: {Value: !Ref LogGroup}
```

## `deploy/aws/deploy.sh`

Snapshot SHA-256: `32e21c2a0f17b25591c56493eca0fc357ce0bc93128e6d4f7c50aebe442e3a88`.

```bash
#!/usr/bin/env bash
# Build, push and deploy FinWise to ECS Fargate using only the AWS CLI + Docker.
#
#   export AWS_REGION=ap-south-1 STACK=finwise-prod \
#          VPC_ID=vpc-... PUBLIC_SUBNETS=subnet-a,subnet-b TASK_SUBNETS=subnet-c,subnet-d \
#          APP_SECRET_ARN=arn:aws:secretsmanager:... PUBLIC_URL=https://app.example.com \
#          CERTIFICATE_ARN=arn:aws:acm:...            # optional (HTTPS)
#          ENABLE_GOOGLE_AUTH=true                    # optional; secret needs GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET
#          ENABLE_GNANI_SPEECH=true                   # optional; secret needs GNANI_API_KEY
#   deploy/aws/deploy.sh
set -euo pipefail

: "${AWS_REGION:?}" "${VPC_ID:?}" "${PUBLIC_SUBNETS:?}" "${TASK_SUBNETS:?}" "${APP_SECRET_ARN:?}" "${PUBLIC_URL:?}"
STACK="${STACK:-finwise-prod}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY_EXISTING_IMAGES="${DEPLOY_EXISTING_IMAGES:-false}"
if [[ "$DEPLOY_EXISTING_IMAGES" == "true" ]]; then
  : "${IMAGE_TAG:?Set IMAGE_TAG to an existing release tag}"
fi
TAG="${IMAGE_TAG:-$(git -C "$ROOT" rev-parse --short HEAD)-$(date -u +%Y%m%d%H%M%S)}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
REGISTRY="${ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com"

build_push() { # name context
  docker build -t "${REGISTRY}/finwise/$1:${TAG}" "$ROOT/$2"
  docker push "${REGISTRY}/finwise/$1:${TAG}"
}

if [[ "$DEPLOY_EXISTING_IMAGES" == "true" ]]; then
  for repo in web server ai-core; do
    aws ecr describe-images --repository-name "finwise/${repo}" --image-ids "imageTag=$TAG" --region "$AWS_REGION" >/dev/null
  done
else
  for repo in web server ai-core; do
    aws ecr describe-repositories --repository-names "finwise/${repo}" --region "$AWS_REGION" >/dev/null 2>&1 \
      || aws ecr create-repository --repository-name "finwise/${repo}" --region "$AWS_REGION" \
           --image-scanning-configuration scanOnPush=true >/dev/null
    if aws ecr describe-images --repository-name "finwise/${repo}" --image-ids "imageTag=$TAG" --region "$AWS_REGION" >/dev/null 2>&1; then
      printf 'Image finwise/%s:%s already exists. Choose a new IMAGE_TAG or deploy the existing release.\n' "$repo" "$TAG" >&2
      exit 1
    fi
  done
  aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REGISTRY"
  build_push web client
  build_push server server
  build_push ai-core server/AI_Core
fi

aws cloudformation deploy --region "$AWS_REGION" --stack-name "$STACK" \
  --template-file "$ROOT/deploy/aws/finwise.yaml" --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    VpcId="$VPC_ID" PublicSubnetIds="$PUBLIC_SUBNETS" TaskSubnetIds="$TASK_SUBNETS" \
    AssignPublicIp="${ASSIGN_PUBLIC_IP:-ENABLED}" AppSecretArn="$APP_SECRET_ARN" \
    PublicUrl="$PUBLIC_URL" CertificateArn="${CERTIFICATE_ARN:-}" \
    WebImage="${REGISTRY}/finwise/web:${TAG}" ServerImage="${REGISTRY}/finwise/server:${TAG}" \
    AiCoreImage="${REGISTRY}/finwise/ai-core:${TAG}" \
    LlmProvider="${LLM_PROVIDER:-gemini}" LlmModel="${LLM_MODEL:-}" \
    LlmRpm="${LLM_RPM:-10}" AiCoreDesiredCount="${AI_CORE_DESIRED:-1}" \
    EnableGoogleAuth="${ENABLE_GOOGLE_AUTH:-false}" EnableGnaniSpeech="${ENABLE_GNANI_SPEECH:-false}"

aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$STACK" \
  --query "Stacks[0].Outputs" --output table
```

## `deploy/aws/README.md`

Snapshot SHA-256: `2e62dafbe13021fa312bedbdfd081a10c4ac04933ddcbbb777aa2bf585d4f83e`.

````markdown
# Deploying FinWise to AWS (ECS Fargate, AWS CLI only)

For a single-host deployment with MongoDB, Redis and HTTPS on AWS, see [FinWise on EC2](EC2.md).

`finwise.yaml` creates: ECS cluster, four Fargate services (web, server, worker, ai-core), an ALB
(`/api/*` -> server, everything else -> web), Cloud Map DNS (`ai-core.finwise.local`), ElastiCache
Redis, log group, CPU autoscaling for server and ai-core, and rollback-on-failure deployments.

**Not created:** MongoDB. Use MongoDB Atlas (or another managed Mongo 7) and put its URI in the secret.

> Status: the template and script were linted locally (references resolve, YAML/bash parse) but have
> not been run against a live AWS account. Run the first deploy in a non-production account.

## 1. One-time setup

```bash
aws secretsmanager create-secret --name finwise/prod --secret-string "$(cat <<JSON
{
  "JWT_SECRET": "<32+ random chars>",
  "AI_CORE_INTERNAL_TOKEN": "<32+ random chars>",
  "WEBHOOK_CREDENTIALS_KEY": "<node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\">",
  "MONGO_URI": "mongodb+srv://...",
  "GEMINI_API_KEYS": "key1,key2"
}
JSON
)"
```

The default Gemini deployment requires the five keys shown. For Groq, set `LLM_PROVIDER=groq` and provide `GROQ_API_KEY` in place of `GEMINI_API_KEYS`. Set `LLM_MODEL` to override the selected provider's default.

For Bharat Voice and chat dictation, set `ENABLE_GNANI_SPEECH=true` and add `GNANI_API_KEY` to the same secret. The gateway receives the key when speech is enabled.

### Optional: Google sign-in

Add two more keys to the same secret, then deploy with `ENABLE_GOOGLE_AUTH=true`:

```bash
aws secretsmanager update-secret --secret-id finwise/prod --secret-string "$(...existing JSON plus...)"
#   "GOOGLE_CLIENT_ID": "<id>.apps.googleusercontent.com", "GOOGLE_CLIENT_SECRET": "<secret>"
```

With `EnableGoogleAuth=true` (template parameter, default `false`) the server task receives both secrets and
`GOOGLE_CALLBACK_URL=${PublicUrl}/api/auth/google/callback`. Because ECS fails task start when a referenced secret
key is missing, the keys are only wired in when you opt in. In Google Cloud Console add that exact URL
(`PublicUrl` without a trailing slash, HTTPS) to the OAuth client's **Authorized redirect URIs**.

## 2. Deploy

```bash
export AWS_REGION=ap-south-1 STACK=finwise-prod
export VPC_ID=vpc-... PUBLIC_SUBNETS=subnet-a,subnet-b TASK_SUBNETS=subnet-c,subnet-d
export APP_SECRET_ARN=arn:aws:secretsmanager:...:secret:finwise/prod-XXXX
export PUBLIC_URL=https://app.example.com CERTIFICATE_ARN=arn:aws:acm:...   # certificate optional
export ENABLE_GOOGLE_AUTH=true   # optional, see "Optional: Google sign-in" above
deploy/aws/deploy.sh
```

The script creates ECR repositories and pushes `web`, `server`, and `ai-core` with one release tag. The default tag combines the Git SHA and UTC timestamp. Keep that tag and the provider settings with the release record. Point DNS at the reported `AlbDnsName`.

To redeploy a previous release, run `DEPLOY_EXISTING_IMAGES=true IMAGE_TAG=<previous release tag> deploy/aws/deploy.sh` with its original configuration. The script verifies that all three images exist and deploys those tags without rebuilding or pushing. ECS also rolls back failed task deployments through its deployment circuit breaker.

## 3. Capacity and limits to know about

- **LLM budget is per AI Core task.** The token bucket (`LLM_RPM`) and the LLM cache's local LRU are
  per process; the Redis cache is shared. Keep `AiCoreMaxCount * LlmRpm` within the provider quota.
- **AI Core memory/session/checkpoint state now uses MongoDB** via `AI_CORE_MONGO_URI` (falls back to
  `MONGO_URI`), so replaced or additional AI Core tasks share state.
- Load shedding: each AI Core task admits `AI_CORE_MAX_INFLIGHT` heavy requests and answers `503` +
  `Retry-After` beyond that; the gateway queue and retries absorb the burst.
- Graceful drain: SIGTERM flips `/ready` (AI Core) and `/readyz` (server) to 503, then waits for
  in-flight work (`stopTimeout` 60-70s) before exit.
- Redis is a single node (no failover); it holds only cache, locks and counters, all rebuildable.
````

## `deploy/k8s/ai-core.yaml`

Snapshot SHA-256: `d8d2c4aa93eec792e7ba163732746b71f063bfbb9f2c5c97f01784c3e7906e85`.

```yaml
# OPTIONAL / UNVALIDATED against a cluster. Reference manifests for the FastAPI AI Core.
# The work gate, token bucket and LLM cache are PER PROCESS: in-flight capacity is
# replicas x uvicorn workers x AI_CORE_MAX_INFLIGHT, and the free-tier LLM budget (LLM_RPM)
# is per replica. Keep replicas x LLM_RPM within the provider quota, and do not let the HPA
# scale past that (hence the low maxReplicas).
apiVersion: apps/v1
kind: Deployment
metadata:
  name: finwise-ai-core
  labels: {app: finwise-ai-core}
spec:
  replicas: 2
  selector:
    matchLabels: {app: finwise-ai-core}
  strategy:
    type: RollingUpdate
    rollingUpdate: {maxUnavailable: 0, maxSurge: 1}
  template:
    metadata:
      labels: {app: finwise-ai-core}
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "8001"
        prometheus.io/path: /metrics
    spec:
      terminationGracePeriodSeconds: 70
      containers:
        - name: ai-core
          image: finwise-ai-core:latest   # replace with your registry image / digest
          ports:
            - {name: http, containerPort: 8001}
          envFrom:
            - configMapRef: {name: finwise-config}
            - secretRef: {name: finwise-secrets}
          env:
            - {name: NODE_ENV, value: production}
            - {name: AI_CORE_STATE_BACKEND, value: mongo}
            - {name: AI_CORE_MAX_INFLIGHT, value: "6"}
            - {name: LLM_CACHE_ENABLED, value: "1"}
          resources:
            requests: {cpu: "1", memory: 1Gi}
            limits: {cpu: "2", memory: 2Gi}
          startupProbe:
            httpGet: {path: /ready, port: http}
            periodSeconds: 5
            failureThreshold: 36
          # /ready drains (503) on SIGTERM; /health is plain liveness.
          readinessProbe:
            httpGet: {path: /ready, port: http}
            periodSeconds: 10
            timeoutSeconds: 3
          livenessProbe:
            httpGet: {path: /health, port: http}
            periodSeconds: 15
            timeoutSeconds: 3
            failureThreshold: 4
          lifecycle:
            preStop:
              exec: {command: ["sleep", "5"]}
---
apiVersion: v1
kind: Service
metadata:
  name: finwise-ai-core
  labels: {app: finwise-ai-core}
spec:
  selector: {app: finwise-ai-core}
  ports:
    - {name: http, port: 8001, targetPort: http}
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: finwise-ai-core
spec:
  scaleTargetRef: {apiVersion: apps/v1, kind: Deployment, name: finwise-ai-core}
  minReplicas: 2
  maxReplicas: 4
  metrics:
    - type: Resource
      resource:
        name: cpu
        target: {type: Utilization, averageUtilization: 70}
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 600
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: finwise-ai-core
spec:
  minAvailable: 1
  selector:
    matchLabels: {app: finwise-ai-core}
```

## `deploy/k8s/server.yaml`

Snapshot SHA-256: `28ccee6d4978e35db629f8bf4724fde5690bdefd1a96054a92be2da86e80725b`.

```yaml
# OPTIONAL / UNVALIDATED against a cluster. Reference manifests for the Express gateway.
# Config comes from ConfigMap `finwise-config` and Secret `finwise-secrets` (see README.md).
apiVersion: apps/v1
kind: Deployment
metadata:
  name: finwise-server
  labels: {app: finwise-server}
spec:
  replicas: 3
  selector:
    matchLabels: {app: finwise-server}
  strategy:
    type: RollingUpdate
    rollingUpdate: {maxUnavailable: 0, maxSurge: 1}
  template:
    metadata:
      labels: {app: finwise-server}
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
        prometheus.io/path: /api/metrics
    spec:
      # Longer than the gateway drain window so in-flight requests and SSE streams finish.
      terminationGracePeriodSeconds: 70
      containers:
        - name: server
          image: finwise-server:latest   # replace with your registry image / digest
          ports:
            - {name: http, containerPort: 3000}
          envFrom:
            - configMapRef: {name: finwise-config}
            - secretRef: {name: finwise-secrets}
          env:
            - {name: NODE_ENV, value: production}
            - {name: PORT, value: "3000"}
            - {name: TRUST_PROXY, value: "1"}
            - {name: ASYNC_JOBS_ENABLED, value: "true"}
            - {name: PYTHON_API_URL, value: "http://finwise-ai-core:8001"}
          resources:
            requests: {cpu: "500m", memory: 512Mi}
            limits: {cpu: "2", memory: 768Mi}
          startupProbe:
            httpGet: {path: /readyz, port: http}
            periodSeconds: 5
            failureThreshold: 24
          readinessProbe:
            httpGet: {path: /readyz, port: http}
            periodSeconds: 10
            timeoutSeconds: 3
          livenessProbe:
            httpGet: {path: /healthz, port: http}
            periodSeconds: 15
            timeoutSeconds: 3
            failureThreshold: 4
          lifecycle:
            # Give the Service/ingress time to drop the pod before SIGTERM drains.
            preStop:
              exec: {command: ["sleep", "5"]}
---
apiVersion: v1
kind: Service
metadata:
  name: finwise-server
  labels: {app: finwise-server}
spec:
  selector: {app: finwise-server}
  ports:
    - {name: http, port: 3000, targetPort: http}
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: finwise-server
spec:
  scaleTargetRef: {apiVersion: apps/v1, kind: Deployment, name: finwise-server}
  minReplicas: 3
  maxReplicas: 8
  metrics:
    - type: Resource
      resource:
        name: cpu
        target: {type: Utilization, averageUtilization: 65}
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: finwise-server
spec:
  minAvailable: 2
  selector:
    matchLabels: {app: finwise-server}
```

## `deploy/k8s/kustomization.yaml`

Snapshot SHA-256: `0b4fedae08c52bb63bb5027e9ef8b11a1581fadc13df7e9179c487e5bc4c26c7`.

```yaml
# OPTIONAL reference deployment. FinWise's supported deploy paths are compose.yaml and
# deploy/aws/ (ECS Fargate). These manifests have only been YAML-parsed, never applied.
#   kubectl apply -k deploy/k8s
# Prerequisites (not included): MongoDB replica set, Redis, an Ingress/edge doing what
# client/nginx.conf does (see docs/DEPLOYMENT.md), and the ConfigMap/Secret in README.md.
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - server.yaml
  - ai-core.yaml
```

## `deploy/k8s/README.md`

Snapshot SHA-256: `f79a8dd5499f0accef109f08d26670acebef8fb6fb54be67e4d58f137366231c`.

````markdown
# deploy/k8s (optional)

Reference Deployment/Service/HPA/PDB for the gateway (`server.yaml`) and AI Core
(`ai-core.yaml`). Supported deploy paths remain `compose.yaml` and `deploy/aws/`.
Nothing here has been applied to a cluster; it was only parsed as YAML.

Create the config the pods read (names are referenced via `envFrom`):

```bash
kubectl create configmap finwise-config \
  --from-literal=MONGO_URI='mongodb://...replicaSet=rs0' \
  --from-literal=AI_CORE_MONGO_URI='mongodb://...replicaSet=rs0' \
  --from-literal=REDIS_URL='redis://redis:6379' \
  --from-literal=CLIENT_URL='https://app.example.com' \
  --from-literal=CORS_ORIGINS='https://app.example.com' \
  --from-literal=METRICS_ENABLED=true
kubectl create secret generic finwise-secrets \
  --from-literal=JWT_SECRET="$(openssl rand -hex 32)" \
  --from-literal=AI_CORE_INTERNAL_TOKEN="$(openssl rand -hex 24)" \
  --from-literal=WEBHOOK_CREDENTIALS_KEY="$(openssl rand -base64 32)" \
  --from-literal=METRICS_TOKEN="$(openssl rand -hex 24)" \
  --from-literal=AI_CORE_METRICS_TOKEN="$(openssl rand -hex 24)" \
  --from-literal=GEMINI_API_KEY='...'
kubectl apply -k deploy/k8s
```

Caveats:

- The job worker (`node dist/worker/worker.js`, same image as the gateway) is intentionally
  not included. Run exactly one replica: there is no scheduler leader election.
- The AI Core HPA is capped at 4 because the LLM quota and work gate are per process.
- The ConfigMap is injected into AI Core too, so the shared keys (REDIS_URL) apply to both.
````
