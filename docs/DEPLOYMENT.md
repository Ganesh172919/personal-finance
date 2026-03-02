# FinWise — Deployment & Production Guide

> How to build, deploy, and run FinWise in production environments.

---

## Production Build

### Client (Frontend)

```bash
cd client
npm run build
```

This outputs a static bundle to `client/dist/`. Serve it via any static file server (Nginx, Cloudflare Pages, Vercel, Netlify, etc.).

### Server (Backend)

```bash
cd server
npm run build          # Compiles TypeScript to dist/
npm start              # Runs the compiled server
```

### AI Core (Python)

```bash
cd server/AI_Core
pip install -r requirements.txt
python api_service.py  # Starts FastAPI on the configured port
```

---

## Production Environment Variables

> All environment variables should be set via your hosting provider's secrets management (e.g., Render EnvGroups, Railway Variables, AWS Secrets Manager).

### Server — Required

| Variable       | Description                                              |
| -------------- | -------------------------------------------------------- |
| `NODE_ENV`     | Set to `production`                                      |
| `PORT`         | Server listen port (default: `3000`)                     |
| `MONGO_URI`    | Production MongoDB connection string (Atlas recommended) |
| `JWT_SECRET`   | Strong, unique secret (min 64 chars)                     |
| `REDIS_URL`    | Production Redis connection URI                          |
| `CORS_ORIGINS` | Frontend domain (e.g., `https://app.finwise.io`)         |

### Server — External Services

| Variable                | Description                   |
| ----------------------- | ----------------------------- |
| `GOOGLE_CLIENT_ID`      | Google OAuth2 client ID       |
| `GOOGLE_CLIENT_SECRET`  | Google OAuth2 client secret   |
| `STRIPE_SECRET_KEY`     | Stripe live secret key        |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `EMAIL_HOST`            | Production SMTP host          |
| `EMAIL_PORT`            | SMTP port                     |
| `EMAIL_USER`            | SMTP sender email             |
| `EMAIL_PASSWORD`        | SMTP password                 |
| `EMAIL_FROM`            | Email "From" header           |
| `PYTHON_API_URL`        | URL of the AI Core service    |

### Client — Required

| Variable                | Description                                         |
| ----------------------- | --------------------------------------------------- |
| `VITE_API_BASE_URL`     | Production API URL (e.g., `https://api.finwise.io`) |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth2 client ID                             |

---

## Process Architecture

In production, run three separate processes:

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Express API     │  │  BullMQ Worker   │  │  AI Core (Py)    │
│  npm start       │  │  npm run         │  │  python           │
│  port: 3000      │  │  worker:start    │  │  api_service.py  │
│                  │  │                  │  │  port: 8001       │
└──────────────────┘  └──────────────────┘  └──────────────────┘
         │                    │                       │
         └────────────────────┴───────────────────────┘
                          │
                    ┌──────────────┐
                    │   MongoDB    │
                    │   Redis      │
                    └──────────────┘
```

---

## Docker (Optional)

### Example `Dockerfile` (Server)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --production
COPY server/ .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Example `Dockerfile` (AI Core)

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY server/AI_Core/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server/AI_Core/ .
EXPOSE 8001
CMD ["python", "api_service.py"]
```

### Example `docker-compose.yml`

```yaml
version: "3.9"
services:
  server:
    build:
      context: .
      dockerfile: Dockerfile.server
    ports:
      - "3000:3000"
    env_file: .env.production
    depends_on:
      - mongo
      - redis

  worker:
    build:
      context: .
      dockerfile: Dockerfile.server
    command: npm run worker:start
    env_file: .env.production
    depends_on:
      - mongo
      - redis

  ai-core:
    build:
      context: .
      dockerfile: Dockerfile.ai-core
    ports:
      - "8001:8001"
    env_file: .env.ai-core

  mongo:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  mongo-data:
```

---

## Health Checks

The Express server exposes:

| Endpoint           | Purpose                                                            |
| ------------------ | ------------------------------------------------------------------ |
| `GET /healthz`     | Liveness probe (returns `ok`)                                      |
| `GET /api/test`    | Returns greeting JSON (quick connectivity check)                   |
| `GET /api/metrics` | Prometheus metrics (via `prom-client`, guarded by `METRICS_TOKEN`) |

---

## Observability

### Logging

- **Pino** structured JSON logging in production
- HTTP request logging via `pino-http`
- Log level controlled via `LOG_LEVEL` env var

### Metrics

- **Prometheus** metrics exposed at `/api/metrics` via `prom-client` (requires `METRICS_TOKEN`)
- Tracks HTTP request durations, active connections, error rates

### Tracing

- **OpenTelemetry** auto-instrumentation configured in `config/telemetry.ts`
- Automatically traces HTTP, MongoDB, and Redis operations
- Export to any OTLP-compatible backend (Jaeger, Grafana Tempo, etc.)

---

## Security Checklist

- [x] **Helmet** — Sets security HTTP headers
- [x] **CORS** — Restricted to configured origins
- [x] **Rate Limiting** — `express-rate-limit` on all routes
- [x] **CSRF Protection** — Cookie-based CSRF tokens
- [x] **Mongo Sanitization** — `express-mongo-sanitize` prevents NoSQL injection
- [x] **Zod Validation** — All request payloads validated before processing
- [x] **JWT Auth** — Passport.js JWT strategy with configurable expiry
- [x] **API Key Auth** — Scoped API keys for programmatic access
- [x] **Stripe Webhook Verification** — Signature-based validation

---

## Scaling Recommendations

| Component         | Scaling Strategy                                                |
| ----------------- | --------------------------------------------------------------- |
| **Express API**   | Horizontal — run multiple instances behind a load balancer      |
| **BullMQ Worker** | Horizontal — each worker picks jobs from the shared Redis queue |
| **AI Core**       | Horizontal — stateless; scale replicas independently            |
| **MongoDB**       | Atlas M10+ with replica set; enable auto-scaling                |
| **Redis**         | Redis Cluster or managed Redis (ElastiCache, Upstash)           |

---

_See also_: [SETUP.md](./SETUP.md) · [ARCHITECTURE.md](./ARCHITECTURE.md)
