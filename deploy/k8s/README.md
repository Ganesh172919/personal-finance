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
