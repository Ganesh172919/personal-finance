# 08 — Deployment

> Production-grade deployment guide for the FinWise personal finance platform. Covers Docker, cloud platforms, reverse proxies, monitoring, scaling, and disaster recovery.

---

## Table of Contents

- [1. Deployment Overview](#1-deployment-overview)
- [2. Services & Ports](#2-services--ports)
- [3. Environment Configuration](#3-environment-configuration)
- [4. Build Instructions](#4-build-instructions)
- [5. Deployment Options](#5-deployment-options)
- [6. Docker Configuration](#6-docker-configuration)
- [7. CI/CD Pipeline](#7-cicd-pipeline)
- [8. Production Checklist](#8-production-checklist)
- [9. Database Management](#9-database-management)
- [10. SSL/TLS Configuration](#10-ssltls-configuration)
- [11. Reverse Proxy Configuration](#11-reverse-proxy-configuration)
- [12. Monitoring Setup](#12-monitoring-setup)
- [13. Backup & Recovery](#13-backup--recovery)
- [14. Scaling](#14-scaling)
- [15. Deployment Commands Reference](#15-deployment-commands-reference)

---

## 1. Deployment Overview

### Deployment Philosophy

FinWise follows a **service-oriented architecture** deployed as three independently deployable services backed by two infrastructure datastores. The deployment strategy prioritizes:

- **Reproducibility** — Docker-based deployments ensure identical environments across dev, staging, and production.
- **Zero-downtime updates** — Rolling deployments with health checks and graceful shutdowns.
- **Stateless application services** — Client, Server, and AI Core hold no persistent state; all state is externalized to MongoDB, Redis, and GridFS.
- **Infrastructure as code** — All configuration managed through environment variables and version-controlled compose files.
- **Defense in depth** — Multiple security layers at the proxy, application, and database tiers.

### Target Environments

| Environment | Purpose | Infrastructure | Domain Pattern |
|---|---|---|---|
| **Development** | Local development | Docker Compose (MongoDB + Redis) | `localhost` |
| **Staging** | Pre-production validation | Single VPS or PaaS | `staging.finwise.app` |
| **Production** | Live user-facing service | Multi-node cluster or managed PaaS | `finwise.app` |

### Architecture at a Glance

```
                    ┌──────────────────┐
                    │   Reverse Proxy  │
                    │  Nginx / Caddy   │
                    │   (TLS / 443)    │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
       ┌──────▼──────┐ ┌────▼─────┐ ┌──────▼──────┐
       │   Client    │ │  Server  │ │  AI Core    │
       │  Static     │ │ Express  │ │  FastAPI    │
       │  Files      │ │  :3000   │ │  :8001      │
       └─────────────┘ └────┬─────┘ └──────┬──────┘
                            │              │
                     ┌──────▼──────┐       │
                     │  MongoDB    │       │
                     │  :27017     │       │
                     └─────────────┘       │
                     ┌──────▼──────┐       │
                     │   Redis     │       │
                     │  :6379      │       │
                     └─────────────┘       │
                            └──────────────┘
```

---

## 2. Services & Ports

### Complete Service Matrix

| Service | Technology | Dev Port | Prod Port | Protocol | Description |
|---|---|---|---|---|---|
| **Client** | React 18 + Vite 7 | 5173 | Served as static files | HTTP/HTTPS | Single-page application with PWA support |
| **Server** | Express 5 + TypeScript | 3000 | 3000 (internal) | HTTP | REST API, authentication, SSE, background workers |
| **AI Core** | FastAPI + LangGraph | 8001 | 8001 (internal) | HTTP | Multi-agent LLM orchestration, OCR, file analysis |
| **MongoDB** | MongoDB 7 | 27017 | 27017 (internal) | TCP | Primary datastore (49 models, GridFS) |
| **Redis** | Redis 7 | 6379 | 6379 (internal) | TCP | Rate limiting, BullMQ queues, response caching |

### Port Exposure Guidelines

| Environment | Exposed Ports | Notes |
|---|---|---|
| **Development** | 5173, 3000, 8001, 27017, 6379 | All ports accessible on `localhost` |
| **Staging** | 443 (HTTPS only) | Reverse proxy routes to internal services |
| **Production** | 443 (HTTPS only) | Only the reverse proxy port is public-facing |

> **Critical:** In production, MongoDB (27017) and Redis (6379) must **never** be exposed to the public internet. Bind them to `127.0.0.1` or internal Docker networks only.

### Inter-Service Communication

| Source | Destination | Port | Purpose |
|---|---|---|---|
| Client → Server | `/api/*` | 3000 | All REST API calls, SSE streams |
| Server → AI Core | `PYTHON_API_URL` | 8001 | AI analysis, chat, OCR, file processing |
| Server → MongoDB | `MONGO_URI` | 27017 | All database operations |
| Server → Redis | `REDIS_URL` | 6379 | Rate limiting, queues, caching |
| AI Core → MongoDB | `MONGO_URI` (if configured) | 27017 | Memory persistence (optional) |

---

## 3. Environment Configuration

### Server Production Environment Variables

Create `server/.env.production` with the following variables. Values shown are **templates** — replace with production-specific values.

```env
# ─── Server ───────────────────────────────────────────────
PORT=3000
NODE_ENV=production

# ─── Database ─────────────────────────────────────────────
# Use MongoDB Atlas or a managed replica set in production
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/finwise?retryWrites=true&w=majority&readPreference=secondaryPreferred

# ─── Authentication ───────────────────────────────────────
# Generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=<64+ char hex string — unique per environment>
COOKIE_SECRET=<64+ char hex string — unique per environment>

# ─── Google OAuth ─────────────────────────────────────────
GOOGLE_CLIENT_ID=<production Google OAuth client ID>
GOOGLE_CLIENT_SECRET=<production Google OAuth client secret>
GOOGLE_CALLBACK_URL=https://finwise.app/api/auth/google/callback

# ─── Email (SMTP) ─────────────────────────────────────────
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=finwise.app.service@gmail.com
EMAIL_FROM=FinWise <finwise.app.service@gmail.com>
EMAIL_PASSWORD=<app-specific password or SMTP credential>

# ─── AI Core ──────────────────────────────────────────────
# Internal Docker network URL or VPC-private endpoint
PYTHON_API_URL=http://ai-core:8001

# ─── CORS ─────────────────────────────────────────────────
CLIENT_URL=https://finwise.app
CORS_ORIGINS=https://finwise.app

# ─── Redis ────────────────────────────────────────────────
REDIS_URL=redis://redis:6379
# For authenticated Redis:
# REDIS_URL=redis://:<password>@redis:6379

# ─── Stripe (if billing is enabled) ───────────────────────
STRIPE_SECRET_KEY=<Stripe live secret key>
STRIPE_WEBHOOK_SECRET=<Stripe webhook signing secret>

# ─── LLM Provider Keys ────────────────────────────────────
# Set at least one. The AI Core also needs these (or its own set).
GEMINI_API_KEY=<Google Gemini API key>
OPENROUTER_API_KEY=<OpenRouter API key>
GROQ_API_KEY=<Groq API key>
XAI_API_KEY=<xAI (Grok) API key>
TOGETHER_API_KEY=<Together AI API key>
LLM_PROVIDER=gemini
```

### Client Production Environment Variables

Create `client/.env.production`:

```env
# In production, the API is served from the same origin via the reverse proxy
VITE_API_BASE_URL=/api

# Not used in production build (dev-only)
# VITE_API_PROXY_TARGET is only used by Vite's dev server proxy

VITE_APP_NAME=FinWise

# Production API URL if served from a different domain
# VITE_API_URL=https://finwise.app/api
```

> **Note:** `VITE_API_PROXY_TARGET` is only used during development by Vite's dev server proxy. In production, the reverse proxy (Nginx/Caddy) handles routing, so `VITE_API_BASE_URL` should be set to `/api` for same-origin requests.

### AI Core Production Environment Variables

Create `server/AI_Core/.env.production`:

```env
# ─── LLM Provider Keys ────────────────────────────────────
GEMINI_API_KEY=<Google Gemini API key>
OPENROUTER_API_KEY=<OpenRouter API key>
GROQ_API_KEY=<Groq API key>
XAI_API_KEY=<xAI (Grok) API key>
TOGETHER_API_KEY=<Together AI API key>

# ─── Provider Selection ───────────────────────────────────
LLM_PROVIDER=gemini
LLM_PROVIDER_PRIORITY=gemini,openrouter,groq,grok,together
LLM_MODEL=

# ─── LLM Parameters ──────────────────────────────────────
LLM_TEMPERATURE=0.1
LLM_MAX_TOKENS=4096
LLM_TIMEOUT_SECONDS=30
LLM_MAX_RETRIES=0

# ─── Vision / OCR ─────────────────────────────────────────
VISION_MAX_IMAGE_BYTES=10485760
VISION_LANG_ALLOWED=en
VISION_LANG_DEFAULT=en

# ─── Memory ───────────────────────────────────────────────
FINWISE_MEMORY_DB_PATH=/data/memory.db
FINWISE_MEMORY_TOP_K=8

# ─── Logging ──────────────────────────────────────────────
LOG_LEVEL=WARNING
```

### Secret Management Recommendations

| Method | Best For | Implementation |
|---|---|---|
| **Environment variables** | Small deployments, PaaS | `.env` files or platform secret managers |
| **Docker secrets** | Docker Swarm | Mount secrets as files, read at startup |
| **AWS Secrets Manager** | AWS deployments | Fetch secrets at container startup via SDK |
| **GCP Secret Manager** | GCP deployments | Use `gcloud` CLI or client library |
| **Azure Key Vault** | Azure deployments | Managed identity authentication |
| **HashiCorp Vault** | Self-hosted, enterprise | Dynamic secrets, encryption as a service |
| **SOPS + age** | GitOps workflows | Encrypted env files committed to Git |

**Production secret rotation policy:**

| Secret Type | Rotation Interval | Notes |
|---|---|---|
| `JWT_SECRET` | Every 90 days | Requires all users to re-authenticate |
| `COOKIE_SECRET` | Every 90 days | Invalidates existing sessions |
| `STRIPE_SECRET_KEY` | On compromise only | Rotate via Stripe dashboard |
| LLM API Keys | Every 180 days | Rotate via provider dashboards |
| MongoDB credentials | Every 90 days | Use IAM auth where possible |
| Redis password | Every 90 days | Update `REDIS_URL` simultaneously |

---

## 4. Build Instructions

### Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | 18.x LTS or later | Client and Server build |
| npm | 9.x or later | Package management |
| Python | 3.10+ | AI Core dependencies |
| Docker | 24+ (optional) | Container builds |

### Frontend Build (Client)

```bash
cd client

# Install dependencies
npm install

# Type-check and build
npm run build
```

This executes `tsc && vite build`, which:

1. Runs TypeScript type-checking (fails on type errors)
2. Bundles the application with Vite (Tree-shaking, code splitting, minification)
3. Generates optimized assets in `client/dist/`
4. Creates a service worker via `vite-plugin-pwa` for offline support

**Build output structure:**

```
client/dist/
├── index.html                 # Entry point with asset hashes
├── assets/
│   ├── index-<hash>.js        # Application bundle (code-split)
│   ├── index-<hash>.css       # Styles (code-split)
│   └── vendor-<hash>.js       # Third-party dependencies
├── manifest.webmanifest       # PWA manifest
├── sw.js                      # Service worker
└── workbox-<hash>.js          # Workbox runtime
```

**Production preview:**

```bash
npm run preview
```

### Backend Build (Server)

```bash
cd server

# Install dependencies (production only)
npm install --omit=dev

# TypeScript compilation
npm run build
```

This executes `tsc`, compiling TypeScript to JavaScript in `server/dist/`. The compiled output is executed with `tsx` in production:

```bash
# Start production server
npm run start
```

**Alternative: Run compiled output directly** (if `tsconfig.json` outputs to `dist/`):

```bash
node dist/server.js
```

**Background worker:**

```bash
# Start the BullMQ worker in production
npm run worker:start
```

### AI Core Setup (Python)

```bash
cd server/AI_Core

# Create virtual environment
python -m venv .venv

# Activate (Windows)
.venv\Scripts\activate

# Activate (macOS/Linux)
source .venv/bin/activate

# Install dependencies
pip install --no-cache-dir -r requirements.txt

# Verify installation
python -c "import fastapi; print(fastapi.__version__)"
```

**Start the AI Core:**

```bash
# Development
python api_service.py

# Production with Uvicorn (multiple workers)
uvicorn main:app --host 0.0.0.0 --port 8001 --workers 4 --log-level warning
```

### Complete Build Script

For automated builds (CI/CD or deployment scripts):

```bash
#!/bin/bash
set -euo pipefail

echo "=== Building FinWise ==="

# 1. Client
echo "--- Building Client ---"
cd client
npm ci
npm run build
cd ..

# 2. Server
echo "--- Building Server ---"
cd server
npm ci
npm run build
cd ..

# 3. AI Core
echo "--- Setting up AI Core ---"
cd server/AI_Core
python -m venv .venv
source .venv/bin/activate
pip install --no-cache-dir -r requirements.txt
cd ../..

echo "=== Build Complete ==="
```

---

## 5. Deployment Options

### Option A: Docker Compose (All Services)

Recommended for single-host deployments, staging environments, and small-scale production.

**docker-compose.prod.yml:**

```yaml
services:
  # ─── Reverse Proxy ──────────────────────────────────────
  proxy:
    image: nginx:1.25-alpine
    container_name: finwise-proxy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./certs:/etc/nginx/certs:ro
      - client-dist:/usr/share/nginx/html:ro
    depends_on:
      - server
      - client-builder

  # ─── Client Build ───────────────────────────────────────
  client-builder:
    build:
      context: ./client
      dockerfile: Dockerfile
    container_name: finwise-client-builder
    volumes:
      - client-dist:/app/dist

  # ─── Server ─────────────────────────────────────────────
  server:
    build:
      context: ./server
      dockerfile: Dockerfile
      target: production
    container_name: finwise-server
    restart: unless-stopped
    expose:
      - "3000"
    env_file:
      - ./server/.env.production
    environment:
      - NODE_ENV=production
      - MONGO_URI=mongodb://mongo:27017/finwise
      - REDIS_URL=redis://redis:6379
      - PYTHON_API_URL=http://ai-core:8001
      - CLIENT_URL=https://finwise.app
      - CORS_ORIGINS=https://finwise.app
    depends_on:
      mongo:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # ─── Background Worker ──────────────────────────────────
  worker:
    build:
      context: ./server
      dockerfile: Dockerfile
      target: production
    container_name: finwise-worker
    restart: unless-stopped
    command: ["tsx", "src/worker/worker.ts"]
    env_file:
      - ./server/.env.production
    environment:
      - NODE_ENV=production
      - MONGO_URI=mongodb://mongo:27017/finwise
      - REDIS_URL=redis://redis:6379
    depends_on:
      mongo:
        condition: service_healthy
      redis:
        condition: service_healthy

  # ─── AI Core ────────────────────────────────────────────
  ai-core:
    build:
      context: ./server/AI_Core
      dockerfile: Dockerfile
    container_name: finwise-ai-core
    restart: unless-stopped
    expose:
      - "8001"
    env_file:
      - ./server/AI_Core/.env.production
    environment:
      - FINWISE_MEMORY_DB_PATH=/data/memory.db
    volumes:
      - ai-memory:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

  # ─── MongoDB ────────────────────────────────────────────
  mongo:
    image: mongo:7
    container_name: finwise-mongo
    restart: unless-stopped
    expose:
      - "27017"
    volumes:
      - mongo-data:/data/db
      - ./mongo/init.js:/docker-entrypoint-initdb.d/init.js:ro
    environment:
      MONGO_INITDB_DATABASE: finwise
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  # ─── Redis ──────────────────────────────────────────────
  redis:
    image: redis:7-alpine
    container_name: finwise-redis
    restart: unless-stopped
    expose:
      - "6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  client-dist:
  mongo-data:
  redis-data:
  ai-memory:
```

**Deploy:**

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### Option B: Individual Service Deployment

Deploy services independently on separate machines or containers.

#### Server Deployment

```bash
# On the server host
cd server
npm ci --omit=dev
npm run build

# Create systemd service
sudo tee /etc/systemd/system/finwise-server.service > /dev/null << 'EOF'
[Unit]
Description=FinWise API Server
After=network.target mongod.service redis.service

[Service]
Type=simple
User=finwise
WorkingDirectory=/opt/finwise/server
Environment=NODE_ENV=production
ExecStart=/usr/bin/tsx src/server.ts
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable finwise-server
sudo systemctl start finwise-server
```

#### AI Core Deployment

```bash
# On the AI Core host
cd server/AI_Core
python -m venv /opt/finwise/ai-core/.venv
source /opt/finwise/ai-core/.venv/bin/activate
pip install --no-cache-dir -r requirements.txt

# Create systemd service
sudo tee /etc/systemd/system/finwise-ai-core.service > /dev/null << 'EOF'
[Unit]
Description=FinWise AI Core
After=network.target

[Service]
Type=simple
User=finwise
WorkingDirectory=/opt/finwise/server/AI_Core
Environment=PATH=/opt/finwise/ai-core/.venv/bin:/usr/bin
ExecStart=/opt/finwise/ai-core/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8001 --workers 4 --log-level warning
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable finwise-ai-core
sudo systemctl start finwise-ai-core
```

### Option C: Cloud Platform Deployments

#### AWS (ECS + RDS + ElastiCache)

**Architecture:**
- **Frontend:** S3 + CloudFront (static hosting)
- **Server:** ECS Fargate (containerized Express)
- **AI Core:** ECS Fargate or SageMaker endpoint
- **Database:** MongoDB Atlas on AWS or DocumentDB
- **Cache:** ElastiCache for Redis
- **Load Balancer:** Application Load Balancer (ALB)

**Infrastructure (Terraform outline):**

```hcl
# ECS Cluster
resource "aws_ecs_cluster" "finwise" {
  name = "finwise-production"
}

# Server Task Definition
resource "aws_ecs_task_definition" "server" {
  family                   = "finwise-server"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "1024"
  memory                   = "2048"

  container_definitions = jsonencode([{
    name  = "server"
    image = "${aws_ecr_repository.server.repository_url}:latest"
    portMappings = [{
      containerPort = 3000
      protocol      = "tcp"
    }]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "MONGO_URI", value = var.mongo_uri },
      { name = "REDIS_URL", value = var.redis_url },
    ]
    secrets = [
      { name = "JWT_SECRET", valueFrom = aws_secretsmanager_secret.jwt.arn },
      { name = "COOKIE_SECRET", valueFrom = aws_secretsmanager_secret.cookie.arn },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/finwise-server"
        "awslogs-region"        = "us-east-1"
        "awslogs-stream-prefix" = "server"
      }
    }
  }])
}

# CloudFront for static frontend
resource "aws_cloudfront_distribution" "frontend" {
  origin {
    domain_name = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id   = "finwise-frontend"
  }
  # ... additional configuration
}
```

**Deployment commands:**

```bash
# Build and push Docker images
docker build -t finwise-server ./server
docker tag finwise-server:latest <account>.dkr.ecr.<region>.amazonaws.com/finwise-server:latest
docker push <account>.dkr.ecr.<region>.amazonaws.com/finwise-server:latest

# Deploy to ECS
aws ecs update-service --cluster finwise-production --service finwise-server --force-new-deployment
```

#### GCP (Cloud Run + Firestore + Memorystore)

**Architecture:**
- **Frontend:** Firebase Hosting or Cloud Storage + Cloud CDN
- **Server:** Cloud Run (containerized)
- **AI Core:** Cloud Run (separate service)
- **Database:** MongoDB Atlas on GCP or Firestore
- **Cache:** Memorystore for Redis

**Deployment:**

```bash
# Build container
gcloud builds submit --tag gcr.io/$PROJECT_ID/finwise-server ./server

# Deploy to Cloud Run
gcloud run deploy finwise-server \
  --image gcr.io/$PROJECT_ID/finwise-server \
  --platform managed \
  --region us-central1 \
  --set-env-vars NODE_ENV=production,MONGO_URI=$MONGO_URI,REDIS_URL=$REDIS_URL \
  --set-secrets JWT_SECRET=jwt-secret:latest,COOKIE_SECRET=cookie-secret:latest \
  --min-instances 1 \
  --max-instances 10 \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300
```

#### Azure (Container Apps + Cosmos DB + Cache for Redis)

**Architecture:**
- **Frontend:** Azure Static Web Apps or Blob Storage + CDN
- **Server:** Azure Container Apps
- **AI Core:** Azure Container Apps (separate app)
- **Database:** Azure Cosmos DB for MongoDB vCore
- **Cache:** Azure Cache for Redis

**Deployment:**

```bash
# Deploy to Container Apps
az containerapp create \
  --name finwise-server \
  --resource-group finwise-rg \
  --environment finwise-env \
  --image finwiseregistry.azurecr.io/finwise-server:latest \
  --target-port 3000 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 5 \
  --secrets jwt-secret=$JWT_SECRET cookie-secret=$COOKIE_SECRET \
  --env-vars NODE_ENV=production MONGO_URI=$MONGO_URI REDIS_URL=$REDIS_URL \
  --secret-env-vars JWT_SECRET=jwt-secret COOKIE_SECRET=cookie-secret
```

#### Railway

Railway provides the simplest deployment path with automatic service discovery.

**Setup:**

1. Connect your GitHub repository to Railway
2. Add three services: `client`, `server`, `ai-core`
3. Add MongoDB and Redis from the Railway marketplace
4. Configure environment variables in the Railway dashboard
5. Set build commands:

**Railway `railway.toml` (server):**

```toml
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "npm run start"
healthcheckPath = "/api/health"
healthcheckTimeout = 100
restartPolicyType = "ON_FAILURE"
```

**Railway `railway.toml` (AI Core):**

```toml
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "uvicorn main:app --host 0.0.0.0 --port $PORT --workers 4"
healthcheckPath = "/health"
healthcheckTimeout = 100
```

#### Render

**render.yaml:**

```yaml
services:
  - type: web
    name: finwise-server
    env: node
    buildCommand: cd server && npm ci && npm run build
    startCommand: cd server && npm run start
    envVars:
      - key: NODE_ENV
        value: production
      - key: MONGO_URI
        sync: false
      - key: JWT_SECRET
        generateValue: true
      - key: PYTHON_API_URL
        fromService:
          name: finwise-ai-core
          type: web
          envVarKey: RENDER_EXTERNAL_URL
    healthCheckPath: /api/health

  - type: web
    name: finwise-ai-core
    env: python
    buildCommand: cd server/AI_Core && pip install -r requirements.txt
    startCommand: cd server/AI_Core && uvicorn main:app --host 0.0.0.0 --port $PORT --workers 4
    envVars:
      - key: LLM_PROVIDER
        value: gemini
    healthCheckPath: /health

  - type: web
    name: finwise-client
    env: static
    buildCommand: cd client && npm ci && npm run build
    staticPublishPath: ./client/dist
    routes:
      - type: rewrite
        source: /api/*
        destination: https://finwise-server.onrender.com/api/*
```

### Option D: VPS Deployment (DigitalOcean, Linode, Hetzner)

**Server specification (minimum production):**

| Component | Specification |
|---|---|
| CPU | 4 cores |
| RAM | 8 GB |
| Storage | 80 GB SSD |
| OS | Ubuntu 22.04 LTS or Debian 12 |

**Setup script:**

```bash
#!/bin/bash
set -euo pipefail

# 1. System updates
sudo apt update && sudo apt upgrade -y

# 2. Install runtime dependencies
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx certbot python3-certbot-nginx

# 3. Install Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER

# 4. Create application user
sudo useradd --system --create-home finwise

# 5. Create application directory
sudo mkdir -p /opt/finwise
sudo chown finwise:finwise /opt/finwise

# 6. Deploy application (as finwise user)
sudo -u finwise bash << 'DEPLOY'
cd /opt/finwise
git clone <repository-url> .
cd server && npm ci --omit=dev && npm run build && cd ..
cd client && npm ci && npm run build && cd ..
cd server/AI_Core
python3 -m venv .venv
source .venv/bin/activate
pip install --no-cache-dir -r requirements.txt
DEPLOY

# 7. Configure Nginx (see Section 11)
# 8. Configure SSL with Certbot
# 9. Set up systemd services (see Option B)
```

---

## 6. Docker Configuration

### Development Docker Compose

`docker-compose.yml` at repository root:

```yaml
services:
  mongo:
    image: mongo:7
    container_name: finwise-mongo
    restart: unless-stopped
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db
    environment:
      MONGO_INITDB_DATABASE: finwise

  redis:
    image: redis:7-alpine
    container_name: finwise-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes

volumes:
  mongo-data:
  redis-data:
```

**Usage:**

```bash
# Start infrastructure
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f mongo
docker compose logs -f redis

# Stop (preserves data)
docker compose down

# Stop and remove data
docker compose down -v
```

### Dockerfile: Server (Multi-Stage Build)

`server/Dockerfile`:

```dockerfile
# ─── Stage 1: Dependencies ────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ─── Stage 2: Build ───────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ─── Stage 3: Production ──────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Install curl for healthchecks
RUN apk add --no-cache curl

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy compiled output
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/src ./src

# Non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["tsx", "src/server.ts"]
```

### Dockerfile: Client (Multi-Stage Build)

`client/Dockerfile`:

```dockerfile
# ─── Stage 1: Build ───────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL=/api
ARG VITE_APP_NAME=FinWise
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_APP_NAME=${VITE_APP_NAME}
RUN npm run build

# ─── Stage 2: Serve ───────────────────────────────────────
FROM nginx:1.25-alpine AS production
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

`client/nginx.conf` (for serving the SPA):

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback — all routes serve index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets aggressively
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Service worker must not be cached
    location /sw.js {
        add_header Cache-Control "no-cache";
    }

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    gzip_min_length 1000;
}
```

### Dockerfile: AI Core (Multi-Stage Build)

`server/AI_Core/Dockerfile`:

```dockerfile
# ─── Stage 1: Dependencies ────────────────────────────────
FROM python:3.11-slim AS deps
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# ─── Stage 2: Production ──────────────────────────────────
FROM python:3.11-slim AS production
WORKDIR /app

# Install system dependencies for OCR
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy Python dependencies
COPY --from=deps /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin

# Copy application code
COPY . .

# Create data directory for memory DB
RUN mkdir -p /data && chown -R nobody:nogroup /data

# Non-root user
USER nobody

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:8001/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "4", "--log-level", "warning"]
```

### Volume Management

| Volume | Service | Purpose | Backup Strategy |
|---|---|---|---|
| `mongo-data` | MongoDB | Database files | `mongodump` + snapshots |
| `redis-data` | Redis | AOF persistence | Periodic `BGSAVE` |
| `ai-memory` | AI Core | SQLite memory DB | File copy |
| `client-dist` | Client | Build artifacts | Rebuildable (no backup needed) |

**Volume inspection:**

```bash
# List volumes
docker volume ls | grep finwise

# Inspect a volume
docker volume inspect finwise_mongo-data

# Backup a volume
docker run --rm -v finwise_mongo-data:/data -v $(pwd):/backup alpine tar czf /backup/mongo-data.tar.gz -C /data .

# Restore a volume
docker run --rm -v finwise_mongo-data:/data -v $(pwd):/backup alpine tar xzf /backup/mongo-data.tar.gz -C /data
```

---

## 7. CI/CD Pipeline

### Pipeline Architecture

```
Push to Branch
     │
     ▼
┌─────────────┐
│   Lint      │  ESLint (client + server), Ruff (AI Core)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Type Check│  tsc --noEmit (client + server)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Test      │  Vitest (client + server), pytest (AI Core)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Build     │  Vite build, tsc, pip install
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Docker    │  Build and push images to registry
│   Images    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Deploy    │  Rolling update to target environment
│   (main)    │
└─────────────┘
```

### GitHub Actions Workflow

`.github/workflows/ci.yml`:

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: "20"
  PYTHON_VERSION: "3.11"

jobs:
  # ─── Lint ───────────────────────────────────────────────
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Install client dependencies
        working-directory: client
        run: npm ci

      - name: Lint client
        working-directory: client
        run: npm run lint

      - name: Install server dependencies
        working-directory: server
        run: npm ci

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}

      - name: Install AI Core dependencies
        working-directory: server/AI_Core
        run: |
          python -m venv .venv
          source .venv/bin/activate
          pip install -r requirements.txt

      - name: Lint AI Core
        working-directory: server/AI_Core
        run: |
          source .venv/bin/activate
          ruff check .

  # ─── Type Check ─────────────────────────────────────────
  typecheck:
    name: Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Install client dependencies
        working-directory: client
        run: npm ci

      - name: Type-check client
        working-directory: client
        run: npx tsc --noEmit

      - name: Install server dependencies
        working-directory: server
        run: npm ci

      - name: Type-check server
        working-directory: server
        run: npm run check

  # ─── Test ───────────────────────────────────────────────
  test:
    name: Test
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Install server dependencies
        working-directory: server
        run: npm ci

      - name: Run server tests
        working-directory: server
        run: npm run test:ci
        env:
          REDIS_URL: redis://localhost:6379

      - name: Install client dependencies
        working-directory: client
        run: npm ci

      - name: Run client tests
        working-directory: client
        run: npm test

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}

      - name: Install AI Core dependencies
        working-directory: server/AI_Core
        run: |
          python -m venv .venv
          source .venv/bin/activate
          pip install -r requirements.txt

      - name: Run AI Core tests
        working-directory: server/AI_Core
        run: |
          source .venv/bin/activate
          pytest

  # ─── Build ──────────────────────────────────────────────
  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [lint, typecheck, test]
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Build client
        working-directory: client
        run: npm ci && npm run build

      - name: Build server
        working-directory: server
        run: npm ci && npm run build

      - name: Upload client dist
        uses: actions/upload-artifact@v4
        with:
          name: client-dist
          path: client/dist/

      - name: Upload server dist
        uses: actions/upload-artifact@v4
        with:
          name: server-dist
          path: server/dist/

  # ─── Docker Build & Push ────────────────────────────────
  docker:
    name: Build Docker Images
    runs-on: ubuntu-latest
    needs: [build]
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push server
        uses: docker/build-push-action@v5
        with:
          context: ./server
          push: true
          tags: ghcr.io/${{ github.repository }}/server:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build and push client
        uses: docker/build-push-action@v5
        with:
          context: ./client
          push: true
          tags: ghcr.io/${{ github.repository }}/client:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build and push AI Core
        uses: docker/build-push-action@v5
        with:
          context: ./server/AI_Core
          push: true
          tags: ghcr.io/${{ github.repository }}/ai-core:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ─── Deploy ─────────────────────────────────────────────
  deploy:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: [docker]
    if: github.ref == 'refs/heads/main'
    environment: production
    steps:
      - uses: actions/checkout@v4

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PROD_HOST }}
          username: ${{ secrets.PROD_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /opt/finwise
            docker compose -f docker-compose.prod.yml pull
            docker compose -f docker-compose.prod.yml up -d --remove-orphans
            docker system prune -af --volumes
```

### Deployment Triggers

| Event | Action | Target |
|---|---|---|
| Push to `develop` | Lint, type-check, test, build artifacts | Staging |
| Push to `main` | Full pipeline + Docker build + deploy | Production |
| Pull request | Lint, type-check, test | N/A (validation only) |
| Tag `v*` | Full pipeline + Docker build + tagged release | Production |

### Rollback Strategy

**Docker Compose rollback:**

```bash
# Rollback to previous image tag
docker compose -f docker-compose.prod.yml up -d \
  --no-deps \
  server=ghcr.io/org/finwise-server:<previous-sha>

# Or simply revert the git commit and redeploy
git revert HEAD
git push origin main
```

**Cloud Run rollback:**

```bash
# List revisions
gcloud run revisions list --service=finwise-server --region=us-central1

# Rollback to previous revision
gcloud run services update-traffic finwise-server \
  --to-revisions=<previous-revision-id>=100 \
  --region=us-central1
```

**ECS rollback:**

```bash
# Rollback to previous task definition
aws ecs update-service \
  --cluster finwise-production \
  --service finwise-server \
  --task-definition finwise-server:<previous-revision>
```

---

## 8. Production Checklist

Complete this checklist before every production deployment.

### Pre-Deployment

- [ ] **All tests pass** — `npm run test:ci` (server), `npm test` (client), `pytest` (AI Core)
- [ ] **Type checking passes** — `tsc --noEmit` (client and server)
- [ ] **Linting passes** — ESLint (client + server), Ruff (AI Core)
- [ ] **Build succeeds** — `npm run build` (client + server)
- [ ] **Environment variables verified** — All production `.env` values set and validated
- [ ] **Secrets rotated** — JWT_SECRET, COOKIE_SECRET, API keys are current
- [ ] **Database migrations run** — Migration scripts executed against production database
- [ ] **Dependencies audited** — `npm audit` and `pip audit` show no critical vulnerabilities
- [ ] **Docker images built and tagged** — Images pushed to container registry
- [ ] **Rollback plan documented** — Previous version identified and ready

### Infrastructure

- [ ] **SSL/TLS configured** — Valid certificate installed, HTTPS enforced
- [ ] **Reverse proxy configured** — Nginx/Caddy routing, rate limiting, compression
- [ ] **CORS configured** — Only production origins allowed
- [ ] **Rate limiting enabled** — Server-side and proxy-level limits active
- [ ] **Security headers set** — Helmet, CSP, HSTS, X-Frame-Options
- [ ] **Cookie secure flags** — `secure`, `httpOnly`, `sameSite` set correctly
- [ ] **Firewall rules** — Only ports 80/443 exposed publicly
- [ ] **Database access** — MongoDB and Redis bound to internal network only

### Database

- [ ] **MongoDB replica set** — At least 3 nodes for production
- [ ] **Indexes created** — All model indexes applied
- [ ] **Backup configured** — Automated backups scheduled and tested
- [ ] **Connection pooling** — Pool size configured for expected load
- [ ] **Migration scripts** — All pending migrations applied

### Monitoring & Observability

- [ ] **Health checks configured** — All services have health endpoints
- [ ] **Prometheus metrics** — `/metrics` endpoint accessible
- [ ] **Log aggregation** — Centralized logging (ELK, Loki, CloudWatch)
- [ ] **Alerts configured** — CPU, memory, error rate, response time thresholds
- [ ] **Uptime monitoring** — External monitoring (UptimeRobot, Pingdom)
- [ ] **OpenTelemetry tracing** — Distributed tracing enabled

### Performance

- [ ] **CDN configured** — Static assets served from edge locations
- [ ] **Gzip/Brotli compression** — Enabled at proxy level
- [ ] **Cache headers** — Static assets cached, API responses controlled
- [ ] **Connection keep-alive** — Enabled at proxy and application level
- [ ] **Database indexes** — Verified with query analysis

### Security

- [ ] **No secrets in code** — `.env` files in `.gitignore`, no hardcoded keys
- [ ] **Dependency versions pinned** — `package-lock.json` and `requirements.txt` committed
- [ ] **CSP headers** — Content Security Policy configured
- [ ] **HSTS enabled** — HTTP Strict Transport Security active
- [ ] **CSRF protection** — Enabled for state-changing operations
- [ ] **NoSQL injection protection** — `express-mongo-sanitize` active
- [ ] **File upload validation** — Type checking, size limits enforced

---

## 9. Database Management

### MongoDB Production Setup

#### Replica Set Configuration

Production MongoDB should run as a replica set for high availability:

```yaml
# docker-compose.mongo-rs.yml
services:
  mongo1:
    image: mongo:7
    command: ["--replSet", "rs0", "--bind_ip_all", "--keyFile", "/data/keyfile"]
    ports:
      - "27017:27017"
    volumes:
      - mongo1-data:/data/db
      - ./mongo/keyfile:/data/keyfile:ro
    environment:
      MONGO_INITDB_ROOT_USERNAME: <admin-user>
      MONGO_INITDB_ROOT_PASSWORD: <admin-password>

  mongo2:
    image: mongo:7
    command: ["--replSet", "rs0", "--bind_ip_all", "--keyFile", "/data/keyfile"]
    volumes:
      - mongo2-data:/data/db
      - ./mongo/keyfile:/data/keyfile:ro

  mongo3:
    image: mongo:7
    command: ["--replSet", "rs0", "--bind_ip_all", "--keyFile", "/data/keyfile"]
    volumes:
      - mongo3-data:/data/db
      - ./mongo/keyfile:/data/keyfile:ro

volumes:
  mongo1-data:
  mongo2-data:
  mongo3-data:
```

**Initialize the replica set:**

```bash
docker exec -it mongo1 mongosh -u <admin-user> -p <admin-password> --eval '
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "mongo1:27017", priority: 2 },
    { _id: 1, host: "mongo2:27017", priority: 1 },
    { _id: 2, host: "mongo3:27017", priority: 1 }
  ]
})
'
```

**Connection string for replica set:**

```
mongodb://<user>:<password>@mongo1:27017,mongo2:27017,mongo3:27017/finwise?replicaSet=rs0&readPreference=secondaryPreferred
```

#### Managed MongoDB Options

| Service | Recommended For | Connection |
|---|---|---|
| **MongoDB Atlas** | Most deployments | `mongodb+srv://` connection string |
| **AWS DocumentDB** | AWS-native deployments | MongoDB-compatible API |
| **Azure Cosmos DB** | Azure-native deployments | MongoDB vCore API |

### Migration Scripts

FinWise includes migration scripts in `server/src/scripts/`:

| Script | Purpose | Command |
|---|---|---|
| `migrateTransactions.ts` | Transaction schema migrations | `npm run migrate:transactions` |
| `migrateOrgIds.ts` | Organization ID refactoring | `npm run migrate:orgids` |
| `seedMockContent.ts` | Development data seeding | `npm run seed:content` |

**Running migrations in production:**

```bash
# Connect to the production server
ssh deploy@production-host

# Navigate to the server directory
cd /opt/finwise/server

# Run migrations (always backup first)
npm run migrate:transactions
npm run migrate:orgids
```

**Migration best practices:**

1. Always backup before running migrations
2. Run migrations during low-traffic windows
3. Test migrations on staging first
4. Make migrations idempotent (safe to run multiple times)
5. Log migration progress and results

### Index Management

Indexes are defined in Mongoose schemas. Verify indexes in production:

```javascript
// Check existing indexes
db.transactions.getIndexes()
db.users.getIndexes()
db.organizations.getIndexes()

// Rebuild indexes if needed
db.transactions.reIndex()
```

**Critical indexes for production performance:**

```javascript
// Transactions — queried by user, date, and category
db.transactions.createIndex({ userId: 1, date: -1 })
db.transactions.createIndex({ userId: 1, categoryId: 1 })
db.transactions.createIndex({ organizationId: 1, date: -1 })

// Users — queried by email for authentication
db.users.createIndex({ email: 1 }, { unique: true })

// Chat sessions — queried by user
db.chatsessions.createIndex({ userId: 1, createdAt: -1 })

// API keys — queried by hash
db.apikeys.createIndex({ keyHash: 1 }, { unique: true })
```

### Backup Strategy

See [Section 13: Backup & Recovery](#13-backup--recovery) for detailed backup procedures.

---

## 10. SSL/TLS Configuration

### Certificate Options

| Option | Cost | Automation | Best For |
|---|---|---|---|
| **Let's Encrypt** | Free | Automatic (Certbot) | Most deployments |
| **Cloudflare Origin** | Free | Automatic | Cloudflare users |
| **AWS ACM** | Free | Automatic | AWS deployments |
| **Commercial (DigiCert, etc.)** | Paid | Manual | Enterprise compliance |

### Let's Encrypt with Certbot

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate (standalone mode — Nginx must be stopped)
sudo certbot certonly --standalone -d finwise.app -d www.finwise.app

# Or with Nginx plugin (Nginx must be running)
sudo certbot --nginx -d finwise.app -d www.finwise.app

# Auto-renewal (Certbot sets up a cron job automatically)
sudo certbot renew --dry-run
```

### Nginx SSL Configuration

```nginx
# /etc/nginx/conf.d/finwise.app.conf
server {
    listen 80;
    server_name finwise.app www.finwise.app;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name finwise.app www.finwise.app;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/finwise.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/finwise.app/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # HSTS (63072000 seconds = 2 years)
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    # Security headers
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # OCSP Stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 8.8.8.8 8.8.4.4 valid=300s;

    # ... proxy configuration (see Section 11)
}
```

### Cookie Security Requirements

In production, all cookies must have the following flags:

| Flag | Value | Purpose |
|---|---|---|
| `secure` | `true` | Only sent over HTTPS |
| `httpOnly` | `true` | Not accessible via JavaScript |
| `sameSite` | `'strict'` or `'lax'` | CSRF protection |
| `domain` | `.finwise.app` | Subdomain access if needed |
| `path` | `/` | Available across the application |

**Server-side cookie configuration (Express):**

```typescript
app.use(session({
  secret: process.env.COOKIE_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));
```

---

## 11. Reverse Proxy Configuration

### Nginx Configuration

Complete production Nginx configuration routing to all FinWise services:

```nginx
# /etc/nginx/nginx.conf
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Logging
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for" '
                    'rt=$request_time';
    access_log /var/log/nginx/access.log main;

    # Performance
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;

    # Compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 1000;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml
        application/xml+rss
        application/x-javascript
        image/svg+xml;

    # Rate limiting zones
    limit_req_zone $binary_remote_addr zone=general:10m rate=30r/s;
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;
    limit_req_zone $binary_remote_addr zone=sse:10m rate=1r/s;

    # Upstream definitions
    upstream finwise_server {
        server 127.0.0.1:3000;
        # For multiple instances:
        # server 127.0.0.1:3001;
        # server 127.0.0.1:3002;
    }

    upstream finwise_ai_core {
        server 127.0.0.1:8001;
    }

    # ─── HTTP → HTTPS Redirect ────────────────────────────
    server {
        listen 80;
        server_name finwise.app www.finwise.app;
        return 301 https://$host$request_uri;
    }

    # ─── HTTPS Server ─────────────────────────────────────
    server {
        listen 443 ssl http2;
        server_name finwise.app www.finwise.app;

        # SSL
        ssl_certificate /etc/letsencrypt/live/finwise.app/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/finwise.app/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;

        # Security headers
        add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
        add_header X-Frame-Options DENY always;
        add_header X-Content-Type-Options nosniff always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;

        # ─── Static Files (Client Build) ──────────────────
        root /opt/finwise/client/dist;
        index index.html;

        # SPA fallback
        location / {
            try_files $uri $uri/ /index.html;

            # Cache static assets
            location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
                expires 1y;
                add_header Cache-Control "public, immutable";
            }

            # Service worker — must not be cached
            location = /sw.js {
                add_header Cache-Control "no-cache";
            }

            # PWA manifest
            location = /manifest.webmanifest {
                add_header Content-Type "application/manifest+json";
            }
        }

        # ─── API Proxy ────────────────────────────────────
        location /api/ {
            limit_req zone=api burst=20 nodelay;

            proxy_pass http://finwise_server;
            proxy_http_version 1.1;

            # Preserve original request info
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # Cookie forwarding
            proxy_set_header Cookie $http_cookie;
            proxy_pass_header Set-Cookie;

            # Timeouts
            proxy_connect_timeout 30s;
            proxy_send_timeout 30s;
            proxy_read_timeout 30s;

            # Buffering
            proxy_buffering on;
            proxy_buffer_size 4k;
            proxy_buffers 8 4k;
        }

        # ─── Auth Endpoints (stricter rate limiting) ──────
        location /api/v1/auth/ {
            limit_req zone=auth burst=5 nodelay;

            proxy_pass http://finwise_server;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Cookie $http_cookie;
            proxy_pass_header Set-Cookie;
        }

        # ─── SSE / Streaming ──────────────────────────────
        location /api/v1/ai/stream {
            limit_req zone=sse burst=5 nodelay;

            proxy_pass http://finwise_server;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Cookie $http_cookie;

            # SSE specific settings
            proxy_set_header Connection '';
            proxy_http_version 1.1;
            chunked_transfer_encoding off;
            proxy_buffering off;
            proxy_cache off;
            proxy_read_timeout 300s;
        }

        # ─── AI Core Proxy ────────────────────────────────
        location /ai/ {
            # Strip /ai/ prefix and forward to AI Core
            rewrite ^/ai/(.*)$ /$1 break;

            limit_req zone=api burst=10 nodelay;

            proxy_pass http://finwise_ai_core;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # AI requests may take longer
            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 120s;
        }

        # ─── Health Check Endpoint ────────────────────────
        location /health {
            access_log off;
            proxy_pass http://finwise_server/api/health;
        }

        # ─── Metrics Endpoint (restrict to internal) ──────
        location /metrics {
            allow 127.0.0.1;
            allow 10.0.0.0/8;
            allow 172.16.0.0/12;
            allow 192.168.0.0/16;
            deny all;

            proxy_pass http://finwise_server/metrics;
        }

        # ─── Deny Access to Hidden Files ──────────────────
        location ~ /\. {
            deny all;
            access_log off;
            log_not_found off;
        }
    }
}
```

### Caddy Configuration

Caddy provides automatic HTTPS with zero configuration:

```caddyfile
# Caddyfile
finwise.app {
    # Automatic HTTPS via Let's Encrypt
    encode gzip zstd

    # Security headers
    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
    }

    # Static files (client build)
    root * /opt/finwise/client/dist
    try_files {path} /index.html
    file_server

    # Cache static assets
    @static path *.js *.css *.png *.jpg *.jpeg *.gif *.ico *.svg *.woff *.woff2
    header @static Cache-Control "public, max-age=31536000, immutable"

    # API proxy
    reverse_proxy /api/* localhost:3000 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }

    # AI Core proxy
    reverse_proxy /ai/* localhost:8001 {
        strip_prefix /ai
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }

    # Health check
    reverse_proxy /health localhost:3000 {
        uri strip_prefix /health
        uri path_regexp ^ /api/health
    }
}
```

### WebSocket and SSE Support

FinWise uses Server-Sent Events (SSE) for real-time notifications and AI response streaming. Both Nginx and Caddy configurations above include the necessary settings:

| Setting | Purpose |
|---|---|
| `proxy_buffering off` | Disables response buffering for streaming |
| `proxy_read_timeout 300s` | Allows long-lived connections |
| `chunked_transfer_encoding off` | Ensures proper SSE formatting |
| `Connection ''` | Clears connection header for HTTP/1.1 keep-alive |

---

## 12. Monitoring Setup

### Prometheus Configuration

The FinWise server exposes metrics at `/metrics` via `prom-client`. Configure Prometheus to scrape these endpoints.

`prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  # FinWise Server metrics
  - job_name: 'finwise-server'
    static_configs:
      - targets: ['server:3000']
    metrics_path: '/metrics'
    scrape_interval: 10s

  # FinWise AI Core metrics (if FastAPI exposes Prometheus)
  - job_name: 'finwise-ai-core'
    static_configs:
      - targets: ['ai-core:8001']
    metrics_path: '/metrics'
    scrape_interval: 15s

  # Node exporter (system metrics)
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']

  # MongoDB exporter
  - job_name: 'mongodb'
    static_configs:
      - targets: ['mongo-exporter:9216']

  # Redis exporter
  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']
```

### OpenTelemetry Configuration

The FinWise server includes OpenTelemetry instrumentation (`@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`).

**Server-side OTel setup** (already integrated in the codebase):

```typescript
// src/config/otel.ts (or similar)
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://otel-collector:4318/v1/traces',
  }),
  instrumentations: [getNodeAutoInstrumentations()],
  serviceName: 'finwise-server',
});

sdk.start();
```

**Environment variables for OTel:**

```env
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_SERVICE_NAME=finwise-server
OTEL_RESOURCE_ATTRIBUTES=deployment.environment=production
```

### OpenTelemetry Collector Configuration

`otel-collector-config.yaml`:

```yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
      grpc:
        endpoint: 0.0.0.0:4317

processors:
  batch:
    timeout: 10s
    send_batch_size: 1000

exporters:
  prometheus:
    endpoint: 0.0.0.0:8889

  otlp/jaeger:
    endpoint: jaeger:4317
    tls:
      insecure: true

  logging:
    loglevel: debug

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp/jaeger, logging]
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [prometheus, logging]
```

### Log Aggregation

#### Pino JSON Logs

The server uses Pino for structured JSON logging. Configure log shipping:

**Docker logging driver (to Loki):**

```yaml
services:
  server:
    logging:
      driver: loki
      options:
        loki-url: "http://loki:3100/loki/api/v1/push"
        loki-external-labels: "job=finwise-server,environment=production"
```

**Grafana Loki configuration:**

```yaml
# loki-config.yaml
auth_enabled: false

server:
  http_listen_port: 3100

common:
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

schema_config:
  configs:
    - from: 2024-01-01
      store: boltdb-shipper
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 24h

limits_config:
  reject_old_samples: true
  reject_old_samples_max_age: 168h
```

### Alert Configuration

**Prometheus alert rules:**

```yaml
# alert-rules.yml
groups:
  - name: finwise-alerts
    rules:
      # High error rate
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate on {{ $labels.instance }}"
          description: "Error rate is {{ $value | humanizePercentage }} for the last 5 minutes."

      # High response time
      - alert: HighResponseTime
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High response time on {{ $labels.instance }}"
          description: "95th percentile response time is {{ $value }}s."

      # Service down
      - alert: ServiceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service {{ $labels.job }} is down"
          description: "{{ $labels.instance }} has been unreachable for 1 minute."

      # MongoDB connection pool exhausted
      - alert: MongoDBPoolExhausted
        expr: mongodb_connections{state="available"} < 5
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "MongoDB connection pool nearly exhausted"
          description: "Only {{ $value }} connections available."

      # Redis memory high
      - alert: RedisMemoryHigh
        expr: redis_memory_used_bytes / redis_memory_max_bytes > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Redis memory usage above 80%"
          description: "Redis is using {{ $value | humanizePercentage }} of max memory."

      # Disk space low
      - alert: DiskSpaceLow
        expr: node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"} < 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Disk space low on {{ $labels.instance }}"
          description: "Only {{ $value | humanizePercentage }} disk space remaining."
```

**Alertmanager configuration:**

```yaml
# alertmanager.yml
global:
  smtp_smarthost: 'smtp.gmail.com:587'
  smtp_from: 'finwise-alerts@example.com'
  smtp_auth_username: 'finwise-alerts@example.com'
  smtp_auth_password: '<app-password>'

route:
  receiver: 'email-notifications'
  group_by: ['alertname', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h

receivers:
  - name: 'email-notifications'
    email_configs:
      - to: 'ops-team@example.com'
        send_resolved: true
```

---

## 13. Backup & Recovery

### MongoDB Backup Strategies

#### Automated mongodump Script

```bash
#!/bin/bash
# /opt/finwise/scripts/backup-mongo.sh
set -euo pipefail

BACKUP_DIR="/opt/finwise/backups/mongo"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="${BACKUP_DIR}/${TIMESTAMP}"
RETENTION_DAYS=30

# Create backup directory
mkdir -p "${BACKUP_PATH}"

# Run mongodump
mongodump \
  --uri="${MONGO_URI}" \
  --out="${BACKUP_PATH}" \
  --gzip \
  --archive="${BACKUP_PATH}/finwise-${TIMESTAMP}.gz"

# Verify backup
if [ -f "${BACKUP_PATH}/finwise-${TIMESTAMP}.gz" ]; then
  echo "Backup successful: ${BACKUP_PATH}/finwise-${TIMESTAMP}.gz"
  echo "$(du -h "${BACKUP_PATH}/finwise-${TIMESTAMP}.gz")"
else
  echo "Backup FAILED!" >&2
  exit 1
fi

# Clean up old backups
find "${BACKUP_DIR}" -maxdepth 1 -type d -mtime +${RETENTION_DAYS} -exec rm -rf {} \;

echo "Old backups cleaned (retention: ${RETENTION_DAYS} days)"
```

**Cron schedule (daily at 2 AM):**

```cron
0 2 * * * /opt/finwise/scripts/backup-mongo.sh >> /var/log/finwise-backup.log 2>&1
```

#### MongoDB Atlas Automated Backups

If using MongoDB Atlas, automated backups are built in:

1. Navigate to **Database Deployments** → **Backup**
2. Enable **Cloud Backup**
3. Configure backup schedule:
   - **Snapshot frequency:** Every 6 hours
   - **Retention:** 7 days for recent, 30 days for weekly
4. Enable **Point-in-Time Recovery** (oplog-based)

#### Docker Volume Snapshots

For Docker-based deployments:

```bash
# Create a snapshot of the MongoDB volume
docker run --rm \
  -v finwise_mongo-data:/source:ro \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/mongo-snapshot-$(date +%Y%m%d).tar.gz -C /source .

# Restore from snapshot
docker run --rm \
  -v finwise_mongo-data:/target \
  -v $(pwd)/backups:/backup \
  alpine tar xzf /backup/mongo-snapshot-20250101.tar.gz -C /target
```

### Redis Persistence

Redis is configured with AOF (Append Only File) for durability:

```yaml
# docker-compose.yml
redis:
  command: redis-server \
    --appendonly yes \
    --appendfsync everysec \
    --maxmemory 256mb \
    --maxmemory-policy allkeys-lru
  volumes:
    - redis-data:/data
```

**Redis backup:**

```bash
# Trigger a background save
docker exec finwise-redis redis-cli BGSAVE

# Copy the RDB file
docker cp finwise-redis:/data/dump.rdb ./backups/redis-dump-$(date +%Y%m%d).rdb
```

### GridFS File Backup

Uploaded files (receipts, exports, documents) are stored in MongoDB GridFS. These are included in the MongoDB backup automatically. For additional redundancy:

```bash
# Export GridFS files to filesystem
mongofiles --uri="${MONGO_URI}" list > /opt/finwise/backups/gridfs-manifest.txt

# Download all files (for off-site backup)
mongofiles --uri="${MONGO_URI}" get-all /opt/finwise/backups/gridfs-files/
```

### Recovery Procedures

#### Full Database Recovery

```bash
# 1. Stop the application
docker compose -f docker-compose.prod.yml stop server worker

# 2. Restore from mongodump
mongorestore \
  --uri="${MONGO_URI}" \
  --gzip \
  --archive=/opt/finwise/backups/mongo/20250101_020000/finwise-20250101_020000.gz \
  --drop

# 3. Verify restoration
mongosh "${MONGO_URI}" --eval "db.getCollectionNames()"

# 4. Restart services
docker compose -f docker-compose.prod.yml start server worker
```

#### Point-in-Time Recovery (MongoDB Atlas)

1. Go to **Database Deployments** → **Backup** → **Snapshots**
2. Select the desired snapshot or point in time
3. Click **Restore** → **Restore to a new cluster** or **Restore in place**
4. Monitor the restoration progress

#### Redis Recovery

```bash
# Stop Redis
docker stop finwise-redis

# Remove current data
docker run --rm -v finwise_redis-data:/data alpine rm -rf /data/*

# Restore from RDB backup
docker run --rm -v finwise_redis-data:/data -v $(pwd)/backups:/backup alpine \
  cp /backup/redis-dump-20250101.rdb /data/dump.rdb

# Start Redis
docker start finwise-redis
```

#### Recovery Testing Schedule

| Test Type | Frequency | Procedure |
|---|---|---|
| Full restore test | Monthly | Restore backup to staging, verify data integrity |
| Point-in-time recovery | Quarterly | Test oplog-based recovery on Atlas |
| Disaster recovery drill | Semi-annually | Full environment rebuild from backups |

---

## 14. Scaling

### Horizontal Scaling

#### Adding API Server Instances

The Express server is stateless and can be scaled horizontally behind a load balancer:

**Nginx load balancing:**

```nginx
upstream finwise_server {
    least_conn;
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
    server 127.0.0.1:3003;
    keepalive 32;
}
```

**Docker Compose scaling:**

```bash
# Scale server to 4 instances
docker compose -f docker-compose.prod.yml up -d --scale server=4
```

**ECS auto-scaling:**

```hcl
resource "aws_appautoscaling_target" "server" {
  max_capacity       = 10
  min_capacity       = 2
  resource_id        = "service/finwise-production/finwise-server"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "server_cpu" {
  name               = "finwise-server-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.server.resource_id
  scalable_dimension = aws_appautoscaling_target.server.scalable_dimension
  service_namespace  = aws_appautoscaling_target.server.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = 70.0
  }
}
```

**Session management with Redis:**

When scaling the server horizontally, sessions must be shared via Redis:

```env
# All server instances connect to the same Redis
REDIS_URL=redis://redis:6379
```

The rate limiter and BullMQ queues automatically work across instances when sharing Redis.

### Database Scaling

#### MongoDB Read Replicas

```
MONGO_URI=mongodb://user:pass@primary:27017,secondary1:27017,secondary2:27017/finwise?replicaSet=rs0&readPreference=secondaryPreferred
```

| Operation | Target |
|---|---|
| Reads (queries, analytics) | Secondary replicas |
| Writes (creates, updates) | Primary node |

#### Sharding (for very large datasets)

If the transactions collection grows beyond a single shard's capacity:

```javascript
// Enable sharding on the database
sh.enableSharding("finwise")

// Shard the transactions collection
sh.shardCollection("finwise.transactions", { organizationId: 1, date: -1 })
```

### Redis Scaling

| Strategy | When to Use | Implementation |
|---|---|---|
| **Increase maxmemory** | Single instance, moderate load | `--maxmemory 1gb` |
| **Redis Sentinel** | High availability | 3 Sentinel nodes monitoring master |
| **Redis Cluster** | High throughput, large dataset | 6 nodes (3 masters + 3 replicas) |

**Redis Sentinel configuration:**

```yaml
services:
  redis-sentinel:
    image: redis:7-alpine
    command: redis-sentinel /usr/local/etc/redis/sentinel.conf
    volumes:
      - ./redis/sentinel.conf:/usr/local/etc/redis/sentinel.conf
```

### AI Core Scaling

The AI Core is CPU-bound (LLM API calls are I/O-bound but Python processing is CPU-bound). Scale with multiple Uvicorn workers:

```bash
# Number of workers = (2 * CPU cores) + 1
uvicorn main:app --host 0.0.0.0 --port 8001 --workers 9 --log-level warning
```

**Docker Compose scaling:**

```bash
docker compose -f docker-compose.prod.yml up -d --scale ai-core=3
```

**Nginx load balancing for AI Core:**

```nginx
upstream finwise_ai_core {
    least_conn;
    server 127.0.0.1:8001;
    server 127.0.0.1:8002;
    server 127.0.0.1:8003;
}
```

### Scaling Guidelines

| Metric | Threshold | Action |
|---|---|---|
| CPU usage | > 70% sustained | Add server instances |
| Memory usage | > 80% | Increase instance size or add instances |
| Response time (p95) | > 2s | Scale horizontally, check database queries |
| Error rate | > 1% | Investigate root cause before scaling |
| MongoDB connections | > 80% of pool | Increase pool size or add replicas |
| Redis memory | > 80% of maxmemory | Increase maxmemory or add cluster nodes |
| Queue depth (BullMQ) | > 1000 pending jobs | Add worker instances |

---

## 15. Deployment Commands Reference

### Quick Reference Card

#### Local Development

```bash
# Start infrastructure (MongoDB + Redis)
docker compose up -d

# Start all services
npm run dev                          # If root script available
# Or individually:
cd server && npm run dev             # Terminal 1
cd client && npm run dev             # Terminal 2
cd server/AI_Core && python api_service.py  # Terminal 3

# Start background worker
cd server && npm run worker:dev
```

#### Building

```bash
# Build all workspaces
npm run build --workspace=client
npm run build --workspace=server

# Build individual
cd client && npm run build           # TypeScript + Vite
cd server && npm run build           # TypeScript compilation
cd server/AI_Core && pip install -r requirements.txt  # Python deps
```

#### Testing

```bash
# Server tests
cd server && npm run test:ci

# Client tests
cd client && npm test

# AI Core tests
cd server/AI_Core && pytest

# Type checking
cd server && npm run check           # tsc --noEmit
cd client && npx tsc --noEmit
```

#### Docker

```bash
# Start infrastructure
docker compose up -d

# Build and start all services (production)
docker compose -f docker-compose.prod.yml up -d --build

# Scale services
docker compose -f docker-compose.prod.yml up -d --scale server=4

# View logs
docker compose logs -f server
docker compose logs -f ai-core

# Stop all services
docker compose -f docker-compose.prod.yml down

# Stop and remove volumes
docker compose -f docker-compose.prod.yml down -v

# Rebuild a single service
docker compose -f docker-compose.prod.yml build server
docker compose -f docker-compose.prod.yml up -d --no-deps server
```

#### Deployment

```bash
# Deploy via Docker Compose (VPS)
ssh deploy@production
cd /opt/finwise
git pull
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --remove-orphans
docker system prune -af

# Deploy to Cloud Run
gcloud run deploy finwise-server --image gcr.io/$PROJECT_ID/finwise-server --platform managed

# Deploy to ECS
aws ecs update-service --cluster finwise-production --service finwise-server --force-new-deployment

# Deploy to Railway
railway up

# Deploy to Render
# Triggered automatically on git push (if connected)
```

#### Database

```bash
# Backup MongoDB
mongodump --uri="$MONGO_URI" --gzip --archive=backup-$(date +%Y%m%d).gz

# Restore MongoDB
mongorestore --uri="$MONGO_URI" --gzip --archive=backup-20250101.gz --drop

# Run migrations
cd server && npm run migrate:transactions
cd server && npm run migrate:orgids

# Check indexes
mongosh "$MONGO_URI" --eval "db.transactions.getIndexes()"

# Check collection sizes
mongosh "$MONGO_URI" --eval "db.getCollectionNames().forEach(c => print(c + ': ' + db[c].stats().size))"
```

#### Monitoring

```bash
# Check server health
curl https://finwise.app/api/health

# Check AI Core health
curl https://finwise.app/ai/health

# View Prometheus metrics
curl https://finwise.app/metrics

# Check server status (systemd)
sudo systemctl status finwise-server
sudo systemctl status finwise-ai-core

# View recent logs
journalctl -u finwise-server --since "1 hour ago" --no-pager
journalctl -u finwise-ai-core --since "1 hour ago" --no-pager
```

#### SSL/TLS

```bash
# Obtain/renew Let's Encrypt certificate
sudo certbot renew --dry-run

# Force renewal
sudo certbot renew --force-renewal

# Check certificate expiry
echo | openssl s_client -servername finwise.app -connect finwise.app:443 2>/dev/null | openssl x509 -noout -dates
```

#### Emergency

```bash
# Rollback to previous Docker image
docker compose -f docker-compose.prod.yml up -d server=ghcr.io/org/finwise-server:<previous-tag>

# Emergency stop
docker compose -f docker-compose.prod.yml stop

# Restart a single service
docker compose -f docker-compose.prod.yml restart server

# Clear Redis cache (emergency memory relief)
docker exec finwise-redis redis-cli FLUSHALL

# Force MongoDB re-election (if primary is down)
docker exec mongo1 mongosh --eval "rs.stepDown()"
```

---

*Previous: [07 — Performance](./07-performance.md) | Next: [09 — Testing](./09-testing.md)*
