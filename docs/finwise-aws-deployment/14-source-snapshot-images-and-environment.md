# Deployment source snapshot

Snapshot date: 23 November 2026. Check the current AWS console, live host and GitHub run before acting.

[Documentation index](00-START-HERE.md) · [Production runbook](../../deploy/aws/PRODUCTION_RUNBOOK.md)

This appendix preserves selected version-controlled files from release-branch commit `f1ed41a5fdf5ba354ebfda199c0e69cebda1f369`.
It is a historical reference; compare against the current files before using commands or configuration.
The example environment files contain placeholders and defaults, not the live secret values.

## `client/Dockerfile`

Snapshot SHA-256: `89ac7e013ed70909de4a423a17909c24e2e2d99bbb44cb63437a221a4a33aead`.

```text
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV VITE_API_BASE_URL=/api
RUN npm run build

FROM nginx:1.28-alpine AS runtime
COPY nginx-main.conf /etc/nginx/nginx.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
```

## `client/nginx.conf`

Snapshot SHA-256: `cfb9522fda638a516bdd1b00100bcb6b565b38d27f60693a4d11baec1eb50ac4`.

```nginx
# FinWise web tier (nginx 1.28 open source) -- static SPA + /api reverse proxy.
#
# Installed as /etc/nginx/conf.d/default.conf (http context). The matching
# top-level nginx.conf (worker_connections 4096) is client/nginx-main.conf.
#
# Scaling model: compose runs N `server` replicas behind Docker's embedded DNS
# name `server`. Open-source nginx resolves names inside `upstream {}` blocks
# only at startup, so this file uses the resolver + variable pattern instead:
# `set $upstream http://server:3000; proxy_pass $upstream;` makes nginx
# re-resolve every `valid=` seconds and round-robin across all A records.
# That keeps up with `docker compose up --scale server=N` and restarts, but it
# cannot do least_conn or upstream keepalive. If you need those, use the static
# upstream alternative in client/nginx.upstream.conf.example (and read its
# caveats). Behind a cloud load balancer the balancing is done there instead.

map $http_x_forwarded_proto $forwarded_proto {
    default $scheme;
    https https;
}

map $http_upgrade $api_connection {
    default upgrade;
    "" "";
}

# Reuse the caller's X-Request-Id when present, otherwise mint one so every
# request is traceable from the edge. The gateway re-validates the value
# (server/src/observability/tracing.ts) and forwards it to AI Core.
map $http_x_request_id $req_id {
    default $http_x_request_id;
    ""      $request_id;
}

map $uri $logged_path {
    ~*^(?<token_route>/api/(?:v1/)?(?:tasks/webhook|workflows/webhook|newsletter/unsubscribe|public/shares/financial-story))/ $token_route/:token;
    default $uri;
}

log_format finwise '$remote_addr [$time_local] "$request_method $logged_path $server_protocol" '
                   '$status $body_bytes_sent '
                   'rid=$req_id rt=$request_time urt=$upstream_response_time';
access_log /var/log/nginx/access.log finwise;

# Coarse per-client-IP flood guard in front of the (authoritative) gateway
# rate limiter. Sized well above nominal load (about 50 rps for the whole
# fleet, 100 rps at 2x peak) so it only trips on abuse. NOTE: behind another
# proxy/LB $binary_remote_addr is the LB address; set real_ip_header /
# set_real_ip_from for your network before relying on per-client limits.
# Tune rate/burst together with docs/CAPACITY_AND_SLOS.md.
limit_req_zone $binary_remote_addr zone=finwise_api:10m rate=200r/s;
limit_req_zone $binary_remote_addr zone=finwise_auth:10m rate=10r/s;
limit_req_status 429;

# Docker's embedded DNS: re-resolve so scaled/restarted replicas are picked up.
resolver 127.0.0.11 valid=10s ipv6=off;

gzip on;
gzip_comp_level 5;
gzip_min_length 1024;
gzip_types text/css application/javascript application/json image/svg+xml text/plain;

server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    client_max_body_size 30m;
    server_tokens off;

    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Frame-Options "DENY" always;

    # Proxy defaults. They are inherited by every /api location below, which
    # therefore must not declare their own proxy_set_header.
    proxy_http_version 1.1;
    proxy_set_header Connection $api_connection;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $forwarded_proto;
    proxy_set_header X-Request-Id $req_id;
    proxy_connect_timeout 5s;
    # Non-streaming default: 60s. Streams override this below.
    proxy_read_timeout 60s;
    proxy_send_timeout 60s;
    # Retry the next replica when one is draining, not started, or unreachable.
    # nginx never retries a request that was already sent upstream when the
    # method is non-idempotent (POST/PATCH/LOCK) unless `non_idempotent` is
    # listed, and it is deliberately NOT listed: a retried POST could create
    # a duplicate transaction. GET/HEAD/PUT/DELETE retry; POST/PATCH only on
    # connect failures where nothing was sent.
    proxy_next_upstream error timeout http_503;
    proxy_next_upstream_tries 2;
    proxy_next_upstream_timeout 10s;

    location = /healthz {
        access_log off;
        default_type text/plain;
        return 200 'ok';
    }

    # Prometheus endpoints are internal-only: scrape the server/ai-core
    # containers directly (deploy/observability/prometheus.yml), never through
    # the public edge. Matches /api/metrics and /api/v1/metrics.
    location ~ ^/api/(v1/)?metrics/?$ {
        access_log off;
        return 404;
    }

    # Streaming endpoints (SSE token streams, event feed): no buffering, long
    # read timeout, never retried (a replayed POST would double-spend LLM
    # quota). There is deliberately no per-IP limit_conn here: offices and
    # mobile carriers NAT many users behind one IP, and the gateway already
    # caps in-flight AI streams per user (AI_QUEUE_MAX_PER_USER).
    #   POST /api/ai/process/stream, POST /api/v1/ai/stream,
    #   GET  /api/v1/events/stream, and any other */stream endpoint.
    location ~ ^/api/(v1/)?(.+/)?stream/?$ {
        limit_req zone=finwise_api burst=400 nodelay;
        set $upstream http://server:3000;
        proxy_pass $upstream;
        proxy_buffering off;
        proxy_cache off;
        proxy_request_buffering off;
        proxy_next_upstream off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        # add_header in a location replaces the server-level headers, so the
        # security headers are repeated here.
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header X-Frame-Options "DENY" always;
        # Tell any intermediate proxy not to buffer either.
        add_header X-Accel-Buffering "no" always;
        add_header Cache-Control "no-store" always;
        gzip off;
    }

    # Credential endpoints: much tighter limit than the general API zone.
    location ~ ^/api/(v1/)?auth/ {
        limit_req zone=finwise_auth burst=20 nodelay;
        set $upstream http://server:3000;
        proxy_pass $upstream;
        proxy_buffering on;
    }

    location /api/ {
        limit_req zone=finwise_api burst=400 nodelay;
        set $upstream http://server:3000;
        proxy_pass $upstream;
        # Responses are bounded JSON/file downloads; let nginx buffer them so a
        # slow client cannot pin a Node worker.
        proxy_buffering on;
    }

    location /assets/ {
        try_files $uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable";
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header X-Frame-Options "DENY" always;
    }

    location / {
        add_header Cache-Control "no-cache" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header X-Frame-Options "DENY" always;
        try_files $uri $uri/ /index.html;
    }
}
```

## `server/Dockerfile`

Snapshot SHA-256: `a057cae89d410d6fd7e12d52b9f3f3320dcd8bfc598045c670b25b4603d32cc3`.

```text
# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY scripts/build.mjs scripts/build.mjs
COPY src src
RUN npm run build

FROM node:24-bookworm-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# tini as PID 1 so SIGTERM reaches node (graceful drain) and zombies are reaped.
RUN apt-get update && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*
COPY --chown=node:node package.json package-lock.json ./
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/server.js"]
```

## `server/AI_Core/Dockerfile`

Snapshot SHA-256: `83a381d3b10ce22074ded23c14e97dc7a11e0702f31c14f32d5515ec5e64cde2`.

```text
# syntax=docker/dockerfile:1.7
# ---- builder: resolve wheels into an isolated venv ------------------------------
FROM python:3.11-slim AS builder
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
WORKDIR /build
COPY requirements.txt ./
RUN pip install -r requirements.txt

# ---- runtime ----------------------------------------------------------------------
FROM python:3.11-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    FINWISE_MEMORY_DB_PATH=/app/data/memory.sqlite3 \
    AI_CORE_MAX_INFLIGHT=6
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 libgl1 libglib2.0-0 zlib1g \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 finwise \
    && mkdir -p /app/data && chown finwise:finwise /app/data
COPY --from=builder /opt/venv /opt/venv
WORKDIR /app
COPY --chown=finwise:finwise . .
USER finwise
# PaddlePaddle 2.6 exports zlib symbols. Resolve them against Debian's libz
# before Paddle loads, so Python and PyClipper use the same implementation.
ENV LD_PRELOAD=libz.so.1
EXPOSE 8001
# Liveness only: /health never touches the work gate. Orchestrators route on /ready.
HEALTHCHECK --interval=15s --timeout=4s --start-period=60s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/health', timeout=3)"
# One process per container (the work gate, rate limiter and LLM cache are per
# process); scale with replicas. SIGTERM -> lifespan drains in-flight work.
CMD ["uvicorn", "api_service:app", "--host", "0.0.0.0", "--port", "8001", "--proxy-headers", "--timeout-keep-alive", "65", "--timeout-graceful-shutdown", "60"]
```

## `server/.env.example`

Snapshot SHA-256: `30d329a81a858ea5ba50b258acaaff93a434a77fb5add64ba3146e2e3ea6cb0c`.

```text
# ══════════════════════════════════════════════════════════════════════
# FinWise Server — Environment Configuration
# ══════════════════════════════════════════════════════════════════════
# Copy this file to .env and fill in the values.
# Variables marked [REQUIRED] must be set before the server starts.
# All others have sensible defaults.
# ══════════════════════════════════════════════════════════════════════

# ── Server ───────────────────────────────────────────────────────────
# Application environment: development | test | production
NODE_ENV=development

# Port the Express server listens on
PORT=3000

# Trust proxy headers (true in production behind a reverse proxy)
# Accepts: true/false/1/0/yes/no or a non-negative integer
# Default: true in production, false otherwise
# TRUST_PROXY=true

# ── Database ─────────────────────────────────────────────────────────
# MongoDB connection URI [REQUIRED in production; uses in-memory server in dev/test]
# MONGO_URI=mongodb://localhost:27017/finwise

# ── Authentication ───────────────────────────────────────────────────
# Secret for signing JWT tokens [REQUIRED]
JWT_SECRET=change-me-to-a-random-secret-at-least-32-chars

# Secret for signing cookies (optional; falls back to JWT_SECRET)
# COOKIE_SECRET=change-me-to-a-random-cookie-secret

# ── CORS ─────────────────────────────────────────────────────────────
# Enable only for a local development server backed by a synthetic database.
# DEMO_EVALUATOR_ENABLED=false

# Comma-separated list of allowed origins
CORS_ORIGINS=http://localhost:5173

# Client URL (used for CORS aliasing and cookie domain)
CLIENT_URL=http://localhost:5173

# Cookie security settings
# COOKIE_SECURE=true           # Send cookies only over HTTPS (auto-set in production)
# COOKIE_SAME_SITE=lax         # Cookie SameSite: strict | lax | none
# COOKIE_DOMAIN=.example.com   # Cookie domain (optional)

# ── Rate Limiting ────────────────────────────────────────────────────
# General API rate limit
RATE_LIMIT_WINDOW_MS=60000     # Window in milliseconds
RATE_LIMIT_MAX=200             # Max requests per window

# Auth endpoint rate limit (tighter)
AUTH_RATE_LIMIT_WINDOW_MS=60000
AUTH_RATE_LIMIT_MAX=20

# ── CSRF Protection ──────────────────────────────────────────────────
# Enable CSRF token validation (auto-enabled in production)
# CSRF_ENABLED=true
CSRF_COOKIE_NAME=csrf_token

# ── Request Size ─────────────────────────────────────────────────────
# Maximum request body size
REQUEST_SIZE_LIMIT=1mb

# ── AI Core Service ──────────────────────────────────────────────────
# URL of the Python AI Core service
PYTHON_API_URL=http://localhost:8001

# Gnani speech API (optional). Set a dashboard key to enable live speech.
# GNANI_API_KEY=your-gnani-api-key
# GNANI_STT_URL=https://api.vachana.ai/stt/v3
# GNANI_TTS_URL=https://api.vachana.ai/api/v1/tts/inference
# Optional OpenAI-compatible Evon deployment.
# GNANI_REASONING_URL=http://127.0.0.1:8003/v1
# GNANI_REASONING_API_KEY=your-reasoning-service-key
# GNANI_MODEL=gnani/gnani-evon-v3.3-30B-A3B

# Shared token for authenticating with AI Core
# AI_CORE_INTERNAL_TOKEN=your-internal-token-min-16-chars
# Use the same AI_CORE_INTERNAL_TOKEN in server/AI_Core/.env.
# AI_CORE_TOOLS_TOKEN is a separate credential for internal tool-host access.
# WEBHOOK_CREDENTIALS_KEY=base64-encoded-32-byte-key # encrypts saved webhook Authorization values

# Concurrency limits
AI_CORE_MAX_CONCURRENCY=8
AI_CORE_MAX_CONCURRENCY_PER_USER=2

# Timeouts (milliseconds)
AI_CORE_STATUS_TIMEOUT_MS=2500
AI_CORE_TIMEOUT_MS=45000
AI_CORE_HEALTH_TIMEOUT_MS=2500

# Circuit breaker
AI_CORE_CIRCUIT_FAILURE_THRESHOLD=3
AI_CORE_CIRCUIT_OPEN_MS=30000
AI_CORE_HEALTH_CACHE_MS=5000
# Reuse dashboard summaries for unchanged user/workspace context (0 disables).
# Explicit Refresh bypasses this cache. Degraded replies expire within 15 seconds.
CONVERSATION_INSIGHTS_CACHE_TTL_MS=120000

# ── Billing / Stripe ─────────────────────────────────────────────────
# Billing provider: stub | stripe (auto-detected from STRIPE_SECRET_KEY)
# BILLING_PROVIDER=stripe

# STRIPE_SECRET_KEY=sk_test_...
# STRIPE_WEBHOOK_SECRET=whsec_...
# STRIPE_PRICE_PRO_MONTHLY=price_...
# STRIPE_PRICE_TEAM_SEAT=price_...
# STRIPE_PRICE_ENTERPRISE=price_...

# ── Usage Events ─────────────────────────────────────────────────────
# Internal token for usage event ingestion
# USAGE_EVENTS_INTERNAL_TOKEN=your-internal-token-min-8-chars

# ── Feature Flags ────────────────────────────────────────────────────
RECEIPTS_OCR_ENABLED=true
JOURNAL_ENABLED=true
TASKS_ENABLED=false           # Auto-enabled in development
MONETIZATION_ENABLED=true     # Auto-disabled in production

# ── File Uploads ─────────────────────────────────────────────────────
UPLOAD_ALLOWED_MIME=image/jpeg,image/png,image/webp
RECEIPT_UPLOAD_MAX_BYTES=8388608     # 8MB
JOURNAL_UPLOAD_MAX_BYTES=4194304     # 4MB
FILE_UPLOAD_MAX_BYTES=26214400       # 25MB
CSV_UPLOAD_ALLOWED_MIME=text/csv,application/vnd.ms-excel,application/csv
CSV_UPLOAD_MAX_BYTES=15728640        # 15MB

# ── Monitoring ───────────────────────────────────────────────────────
# Enable Prometheus metrics endpoint at /api/metrics
# METRICS_ENABLED=true
# METRICS_TOKEN=bearer-token-for-metrics-scrape

# OpenTelemetry tracing (disabled if not set)
# OTEL_ENDPOINT=http://localhost:4318

# ── Email ────────────────────────────────────────────────────────────
# EMAIL_USER=your-email@gmail.com
# EMAIL_PASSWORD=your-app-password
# EMAIL_FROM=noreply@finwise.app
# EMAIL_SERVICE=gmail           # Nodemailer service name
# EMAIL_HOST=smtp.gmail.com     # Or use custom SMTP
# EMAIL_PORT=587
# EMAIL_SECURE=false
# EMAIL_REQUIRE_TLS=true

# DIGEST_EMAIL_DAYS_BACK=7

# ── Google OAuth ─────────────────────────────────────────────────────
# "Continue with Google" is a server-side flow: only the server needs these (no VITE_ variable).
# Create an OAuth 2.0 Web client in Google Cloud Console (APIs & Services > Credentials), then add the
# callback below to its "Authorized redirect URIs". See docs/SETUP.md ("Set up Google sign-in").
# Sign-in is enabled when BOTH id and secret are set; GET /api/auth/providers reports {"google": true}.
# GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
# GOOGLE_CLIENT_SECRET=your-google-client-secret
# Optional. Default: <CLIENT_URL origin>/api/auth/google/callback, i.e. http://localhost:5173/api/auth/google/callback
# in dev (the Vite proxy forwards /api to this server). Set it only if the browser reaches the API on another origin.
# GOOGLE_CALLBACK_URL=http://localhost:5173/api/auth/google/callback

# ── Async Jobs ───────────────────────────────────────────────────────
# Shared secret for Node -> AI Core calls; must match the AI Core value.
# AI_CORE_INTERNAL_TOKEN=generate-a-random-secret-at-least-32-chars
# ASYNC_JOBS_ENABLED=false
# WORKER_CONCURRENCY=4
# WORKER_POLL_INTERVAL_MS=1000

# Domain event fanout
# DOMAIN_EVENT_FANOUT_ENABLED=true
# DOMAIN_EVENT_FANOUT_MODE=auto     # auto | poll | change_stream
# DOMAIN_EVENT_FANOUT_POLL_INTERVAL_MS=1000

# ── Plugin Runtime ───────────────────────────────────────────────────
# PLUGIN_RUNTIME_TIMEOUT_MS=15000
# PLUGIN_RUNTIME_ALLOW_INSECURE=false
# PLUGIN_RUNTIME_ALLOW_LOCALHOST=false
# PLUGIN_RUNTIME_URL=http://plugin-runner:8002
# PLUGIN_RUNTIME_TOKEN=your-plugin-runtime-token

# ── API Key ──────────────────────────────────────────────────────────
# Pepper for API key hashing (optional additional entropy)
# API_KEY_PEPPER=your-api-key-pepper

# ── Tool Policy ──────────────────────────────────────────────────────
# Transaction confirmation threshold amount
TOOL_POLICY_TX_CONFIRM_ABOVE=200

# ── Infrastructure ───────────────────────────────────────────────────
# Redis URL (optional; used for caching and sessions)
# REDIS_URL=redis://localhost:6379
```

## `server/AI_Core/.env.example`

Snapshot SHA-256: `c45ea1980bf1d89d085b76afc0a7aba98307c9eb89e08875f689a2bd8f2b0207`.

```text
# ══════════════════════════════════════════════════════════════════════
# FinWise AI Core — Environment Configuration
# ══════════════════════════════════════════════════════════════════════
# Copy this file to .env and fill in the values.
# Set at least ONE LLM API key to enable AI features.
# The system degrades gracefully to deterministic-only mode without keys.
#
# Configuration precedence (highest priority first):
#   1. OS environment variables
#   2. server/.env   (project-level)
#   3. AI_Core/.env  (service-level)
#   4. Hardcoded defaults in config/settings.py
# ══════════════════════════════════════════════════════════════════════


# ┌─────────────────────────────────────────────────────────────────────┐
# │ LLM Provider Selection                                              │
# └─────────────────────────────────────────────────────────────────────┘
# Which provider to use. Options: gemini, openrouter, groq, openai,
# deepseek, grok, together, mistral.
# If not set, auto-detects from the first configured API key.
LLM_PROVIDER=gemini
# Only configured providers are tried. Keep the verified backup next.
LLM_PROVIDER_PRIORITY=gemini,groq,openrouter,fireworks,grok,together,mistral


# ┌─────────────────────────────────────────────────────────────────────┐
# │ API Keys (set at least one)                                         │
# └─────────────────────────────────────────────────────────────────────┘
# Each key enables a specific LLM provider. Multiple keys can be set
# simultaneously for automatic failover across providers.

# GEMINI_API_KEY=your-gemini-api-key
# OPENROUTER_API_KEY=your-openrouter-api-key
# GROQ_API_KEY=your-groq-api-key
# Set LLM_PROVIDER=gnani to use Evon for Finance Chat.
# GNANI_REASONING_URL=https://your-evon-host.example/v1
# GNANI_REASONING_API_KEY=your-reasoning-service-key
# GNANI_MODEL=gnani/gnani-evon-v3.3-30B-A3B
# OPENAI_API_KEY=your-openai-api-key
# DEEPSEEK_API_KEY=your-deepseek-api-key
# XAI_API_KEY=your-xai-api-key
# TOGETHER_API_KEY=your-together-api-key
# FIREWORKS_API_KEY=your-fireworks-api-key
# MISTRAL_API_KEY=your-mistral-api-key


# ┌─────────────────────────────────────────────────────────────────────┐
# │ Model Configuration                                                 │
# └─────────────────────────────────────────────────────────────────────┘
# Override the provider's default model.
LLM_MODEL=gemini-3.5-flash-lite

# Comma-separated fallback model candidates (tried in order when the
# primary model fails with 404 or other errors).
MODEL_CANDIDATES=gemini-3.5-flash-lite

# Temperature: 0.0 = fully deterministic, 1.0 = most creative.
# Lower values produce more consistent, repeatable outputs.
LLM_TEMPERATURE=0.1

# Maximum tokens per LLM response.
LLM_MAX_TOKENS=4096


# ┌─────────────────────────────────────────────────────────────────────┐
# │ Cost Estimation (USD per 1,000 tokens)                              │
# └─────────────────────────────────────────────────────────────────────┘
# Used for telemetry cost tracking. Defaults to 0 for local/dev.
# Set these to the actual rates of your provider for accurate cost
# reporting in /api/ai/status.

# LLM_COST_USD_PER_1K_INPUT_TOKENS=0
# LLM_COST_USD_PER_1K_OUTPUT_TOKENS=0


# ┌─────────────────────────────────────────────────────────────────────┐
# │ Rate Limiting / Retry Behaviour                                     │
# └─────────────────────────────────────────────────────────────────────┘
# LLM request timeout in seconds per attempt.
LLM_TIMEOUT_SECONDS=12

# Budget for bounded chat synthesis and education calls, in seconds.
# Keep below the Express AI_CORE_TIMEOUT_MS to leave room for request setup.
LLM_INTERACTIVE_BUDGET_SECONDS=28

# Max retries per LLM request (0 = no retry, handled by decorator).
LLM_MAX_RETRIES=0


# ┌─────────────────────────────────────────────────────────────────────┐
# │ Per-User Rate Limiting                                              │
# └─────────────────────────────────────────────────────────────────────┘
# Max requests per user per minute on AI endpoints (enforced in
# api_service.py). Default: 30 requests/minute.
# Adjust if your frontend makes concurrent requests.


# ┌─────────────────────────────────────────────────────────────────────┐
# │ Internal Authentication                                             │
# └─────────────────────────────────────────────────────────────────────┘
# Token for authenticating requests from the Node.js backend server.
# Must match the server's AI_CORE_INTERNAL_TOKEN value.
# If not set, all requests are allowed (for local development).

# AI_CORE_INTERNAL_TOKEN=your-internal-token-min-16-chars


# ┌─────────────────────────────────────────────────────────────────────┐
# │ CORS                                                                │
# └─────────────────────────────────────────────────────────────────────┘
# Comma-separated allowed origins for the FastAPI service.
# Default: http://localhost:3000

# AI_CORE_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173


# ┌─────────────────────────────────────────────────────────────────────┐
# │ Vision (OCR + Handwriting Recognition)                              │
# └─────────────────────────────────────────────────────────────────────┘
# Default OCR language (ISO 639-1 code).
VISION_LANG_DEFAULT=en

# Comma-separated allowed languages for OCR.
VISION_LANG_ALLOWED=en

# Max image size in bytes (default 10 MB).
# Larger images are rejected with HTTP 413.
VISION_MAX_IMAGE_BYTES=10485760


# ┌─────────────────────────────────────────────────────────────────────┐
# │ Memory Store (SQLite)                                               │
# └─────────────────────────────────────────────────────────────────────┘
# Local-first memory store for user preferences and facts.
# Set to a custom path to override the default SQLite location.
# FINWISE_MEMORY_DB_PATH=/path/to/memory.sqlite3

# Number of memories to retrieve per query (top-K retrieval).
FINWISE_MEMORY_TOP_K=8


# ┌─────────────────────────────────────────────────────────────────────┐
# │ Tool Integration (FinWise Server)                                   │
# └─────────────────────────────────────────────────────────────────────┘
# When set, tool calls are validated against the FinWise server for
# RBAC compliance and eligibility checks.

# URL of the FinWise Node.js server.
# FINWISE_SERVER_URL=http://localhost:3000

# Token for authenticating tool calls to the FinWise server.
# FINWISE_TOOLS_TOKEN=your-tools-token


# ┌─────────────────────────────────────────────────────────────────────┐
# │ Prometheus Metrics                                                  │
# └─────────────────────────────────────────────────────────────────────┘
# Bearer token for /metrics endpoint authentication.
# If not set, the /metrics endpoint returns 404 (disabled).

# AI_CORE_METRICS_TOKEN=bearer-token-for-metrics-scrape


# ┌─────────────────────────────────────────────────────────────────────┐
# │ Logging                                                             │
# └─────────────────────────────────────────────────────────────────────┘
# Log level: DEBUG, INFO, WARNING, ERROR, CRITICAL
# Default: INFO

# LOG_LEVEL=INFO
```
