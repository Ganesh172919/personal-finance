# FinWise — Environment Variables Reference

> Complete reference for every environment variable across all FinWise subsystems. Derived from the Zod schema in `server/src/config/env.ts`.

---

## Server (`server/.env`)

### Core

| Variable     | Required | Description                           | Default       | Example                                      |
| ------------ | -------- | ------------------------------------- | ------------- | -------------------------------------------- |
| `PORT`       | No       | Express server listen port            | `3000`        | `3000`                                       |
| `NODE_ENV`   | No       | Environment mode                      | `development` | `development`, `production`, `test`          |
| `MONGO_URI`  | **Yes**  | MongoDB connection string             | —             | `mongodb://localhost:27017/personal-finance` |
| `JWT_SECRET` | **Yes**  | Secret for signing JWT tokens         | —             | (random 64-char string)                      |
| `REDIS_URL`  | No\*     | Redis connection URI (BullMQ + cache) | —             | `redis://localhost:6379`                     |

> \* Required for background jobs, caching, and rate limiting in production.

---

### Cookies & Trust

| Variable             | Required | Description                 | Default | Example                 |
| -------------------- | -------- | --------------------------- | ------- | ----------------------- |
| `COOKIE_SECRET`      | No       | Secret for signed cookies   | —       | (random string)         |
| `COOKIE_SECURE`      | No       | Set cookie Secure flag      | auto\*  | `true`                  |
| `COOKIE_SAME_SITE`   | No       | Cookie SameSite attribute   | `lax`   | `strict`, `lax`, `none` |
| `COOKIE_DOMAIN`      | No       | Cookie Domain attribute     | —       | `.personal-finance.io`  |
| `TRUST_PROXY`        | No       | Express trust proxy setting | auto\*  | `true`, `1`             |
| `REQUEST_SIZE_LIMIT` | No       | Max HTTP request body size  | `1mb`   | `5mb`                   |

> \* `COOKIE_SECURE` defaults to `true` in production with HTTPS `CLIENT_URL`. `TRUST_PROXY` defaults to `true` in production.

---

### Authentication & OAuth

| Variable               | Required | Description                 | Example                                             |
| ---------------------- | -------- | --------------------------- | --------------------------------------------------- |
| `GOOGLE_CLIENT_ID`     | No\*     | Google OAuth2 client ID     | (from GCP console)                                  |
| `GOOGLE_CLIENT_SECRET` | No\*     | Google OAuth2 client secret | (from GCP console)                                  |
| `GOOGLE_CALLBACK_URL`  | No\*     | Google OAuth2 callback URL  | `http://localhost:3000/api/v1/auth/google/callback` |

> \* Required only if Google OAuth sign-in is enabled.

---

### URL & CORS

| Variable       | Required | Description                            | Default                 | Example                           |
| -------------- | -------- | -------------------------------------- | ----------------------- | --------------------------------- |
| `CLIENT_URL`   | No       | Frontend URL (for email links, etc.)   | `http://localhost:5173` | `https://app.personal-finance.io` |
| `CORS_ORIGINS` | No       | Allowed CORS origins (comma-separated) | `http://localhost:5173` | `https://app.personal-finance.io` |

---

### CSRF Protection

| Variable           | Required | Description                          | Default      | Example      |
| ------------------ | -------- | ------------------------------------ | ------------ | ------------ |
| `CSRF_ENABLED`     | No       | Enable CSRF double-submit protection | auto\*       | `true`       |
| `CSRF_COOKIE_NAME` | No       | Name of the CSRF cookie              | `csrf_token` | `csrf_token` |

> \* Defaults to `true` in production, `false` in development.

---

### Rate Limiting

| Variable                    | Required | Description                          | Default | Example |
| --------------------------- | -------- | ------------------------------------ | ------- | ------- |
| `RATE_LIMIT_WINDOW_MS`      | No       | General rate limit window (ms)       | `60000` | `60000` |
| `RATE_LIMIT_MAX`            | No       | Max requests per window              | `200`   | `100`   |
| `AUTH_RATE_LIMIT_WINDOW_MS` | No       | Auth endpoint rate limit window (ms) | `60000` | `60000` |
| `AUTH_RATE_LIMIT_MAX`       | No       | Max auth requests per window         | `20`    | `10`    |

---

### Email (SMTP)

| Variable            | Required | Description             | Example                                  |
| ------------------- | -------- | ----------------------- | ---------------------------------------- |
| `EMAIL_HOST`        | No\*     | SMTP server host        | `smtp.gmail.com`                         |
| `EMAIL_PORT`        | No\*     | SMTP server port        | `587`                                    |
| `EMAIL_USER`        | No\*     | Sender email address    | `noreply@example.com`                    |
| `EMAIL_PASSWORD`    | No\*     | SMTP password           | (app-specific password)                  |
| `EMAIL_FROM`        | No\*     | "From" header value     | `Personal Finance <noreply@example.com>` |
| `EMAIL_SERVICE`     | No       | Nodemailer service name | `gmail`                                  |
| `EMAIL_SECURE`      | No       | Use TLS for SMTP        | `true`                                   |
| `EMAIL_REQUIRE_TLS` | No       | Require TLS connection  | `true`                                   |

> \* `EMAIL_USER`, `EMAIL_PASSWORD`, and `EMAIL_FROM` must all be set together. `EMAIL_PORT` is required when `EMAIL_HOST` is configured.

---

### Payments (Stripe)

| Variable                   | Required | Description                       | Example       |
| -------------------------- | -------- | --------------------------------- | ------------- |
| `BILLING_PROVIDER`         | No       | Billing backend (`stub`/`stripe`) | auto\*        |
| `STRIPE_SECRET_KEY`        | No\*     | Stripe API secret key             | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET`    | No       | Stripe webhook signing secret     | `whsec_...`   |
| `STRIPE_PRICE_PRO_MONTHLY` | No       | Stripe Price ID for Pro plan      | `price_...`   |
| `STRIPE_PRICE_TEAM_SEAT`   | No       | Stripe Price ID for Team seats    | `price_...`   |
| `STRIPE_PRICE_ENTERPRISE`  | No       | Stripe Price ID for Enterprise    | `price_...`   |

> \* `BILLING_PROVIDER` defaults to `stripe` when `STRIPE_SECRET_KEY` is set, otherwise `stub`.

---

### AI Core Integration

| Variable                            | Required | Description                                  | Default                 | Example          |
| ----------------------------------- | -------- | -------------------------------------------- | ----------------------- | ---------------- |
| `PYTHON_API_URL`                    | No       | URL of the Python AI Core service            | `http://localhost:8001` | `http://ai:8001` |
| `AI_CORE_TOOLS_TOKEN`               | No       | Shared token for AI Core ↔ Server tool calls | —                       | (min 16 chars)   |
| `AI_CORE_MAX_CONCURRENCY`           | No       | Global max concurrent AI requests            | `8`                     | `16`             |
| `AI_CORE_MAX_CONCURRENCY_PER_USER`  | No       | Per-user max concurrent AI requests          | `2`                     | `4`              |
| `AI_CORE_STATUS_TIMEOUT_MS`         | No       | AI Core status check timeout                 | `2500`                  | `5000`           |
| `AI_CORE_TIMEOUT_MS`                | No       | AI Core request timeout                      | `45000`                 | `60000`          |
| `AI_CORE_HEALTH_TIMEOUT_MS`         | No       | AI Core health check timeout                 | `2500`                  | `5000`           |
| `AI_CORE_CIRCUIT_FAILURE_THRESHOLD` | No       | Failures before circuit breaker opens        | `3`                     | `5`              |
| `AI_CORE_CIRCUIT_OPEN_MS`           | No       | Duration circuit stays open                  | `30000`                 | `60000`          |
| `AI_CORE_HEALTH_CACHE_MS`           | No       | Health check response cache duration         | `5000`                  | `10000`          |

---

### Feature Toggles

| Variable                      | Required | Description                              | Default | Example |
| ----------------------------- | -------- | ---------------------------------------- | ------- | ------- |
| `RECEIPTS_OCR_ENABLED`        | No       | Enable receipt OCR processing            | `true`  | `false` |
| `JOURNAL_ENABLED`             | No       | Enable financial journaling              | `true`  | `false` |
| `TASKS_ENABLED`               | No       | Enable AI-generated tasks                | auto\*  | `true`  |
| `MONETIZATION_ENABLED`        | No       | Enable billing and monetization features | auto\*  | `true`  |
| `ORG_LEGACY_BACKFILL_ENABLED` | No       | Enable org ID backfill for legacy data   | auto\*  | `false` |

> \* `TASKS_ENABLED` and `MONETIZATION_ENABLED` default to `true` in non-production, `false` in production. `ORG_LEGACY_BACKFILL_ENABLED` defaults to `true` in non-production.

---

### Uploads

| Variable                   | Required | Description                    | Default                           | Example    |
| -------------------------- | -------- | ------------------------------ | --------------------------------- | ---------- |
| `UPLOAD_ALLOWED_MIME`      | No       | Allowed MIME types for uploads | `image/jpeg,image/png,image/webp` | —          |
| `RECEIPT_UPLOAD_MAX_BYTES` | No       | Max receipt upload size        | `8388608` (8 MB)                  | `16777216` |
| `JOURNAL_UPLOAD_MAX_BYTES` | No       | Max journal attachment size    | `4194304` (4 MB)                  | `8388608`  |
| `CSV_UPLOAD_ALLOWED_MIME`  | No       | Allowed MIME types for CSV     | `text/csv,...`                    | —          |
| `CSV_UPLOAD_MAX_BYTES`     | No       | Max CSV upload size            | `15728640` (15 MB)                | `31457280` |

---

### Domain Events

| Variable                               | Required | Description                    | Default | Example                 |
| -------------------------------------- | -------- | ------------------------------ | ------- | ----------------------- |
| `DOMAIN_EVENT_FANOUT_ENABLED`          | No       | Enable domain event fanout     | `true`  | `false`                 |
| `DOMAIN_EVENT_FANOUT_MODE`             | No       | Fanout mode                    | `auto`  | `poll`, `change_stream` |
| `DOMAIN_EVENT_FANOUT_POLL_INTERVAL_MS` | No       | Poll interval for event fanout | `1000`  | `5000`                  |

---

### Background Jobs

| Variable                  | Required | Description                      | Default | Example |
| ------------------------- | -------- | -------------------------------- | ------- | ------- |
| `ASYNC_JOBS_ENABLED`      | No       | Enable BullMQ background workers | `false` | `true`  |
| `WORKER_CONCURRENCY`      | No       | Worker concurrent job slots      | `4`     | `8`     |
| `WORKER_POLL_INTERVAL_MS` | No       | Worker queue poll interval (ms)  | `1000`  | `2000`  |

---

### Plugin Runtime

| Variable                         | Required | Description                             | Default | Example                      |
| -------------------------------- | -------- | --------------------------------------- | ------- | ---------------------------- |
| `PLUGIN_RUNTIME_TIMEOUT_MS`      | No       | Plugin HTTP request timeout             | `15000` | `30000`                      |
| `PLUGIN_RUNTIME_ALLOW_INSECURE`  | No       | Allow HTTP (non-HTTPS) plugin URLs      | auto\*  | `true`                       |
| `PLUGIN_RUNTIME_ALLOW_LOCALHOST` | No       | Allow localhost plugin URLs             | auto\*  | `true`                       |
| `PLUGIN_RUNTIME_URL`             | No       | Base URL for the plugin runtime service | —       | `http://plugin-runtime:9000` |
| `PLUGIN_RUNTIME_TOKEN`           | No       | Auth token for plugin runtime           | —       | (min 8 chars)                |

> \* Both default to `true` in non-production, `false` in production.

---

### Monetization

| Variable                       | Required | Description                           | Default | Example         |
| ------------------------------ | -------- | ------------------------------------- | ------- | --------------- |
| `USAGE_EVENTS_INTERNAL_TOKEN`  | No       | Token for internal usage event APIs   | —       | (min 8 chars)   |
| `DIGEST_EMAIL_DAYS_BACK`       | No       | Days of data included in email digest | `7`     | `14`            |
| `API_KEY_PEPPER`               | No       | Pepper for API key hashing            | —       | (random string) |
| `TOOL_POLICY_TX_CONFIRM_ABOVE` | No       | Transaction amount requiring confirm  | `200`   | `500`           |

---

### Observability

| Variable          | Required | Description                                 | Default | Example                  |
| ----------------- | -------- | ------------------------------------------- | ------- | ------------------------ |
| `LOG_LEVEL`       | No       | Pino log level                              | `info`  | `debug`, `warn`, `error` |
| `METRICS_ENABLED` | No       | Enable Prometheus metrics at `/api/metrics` | `false` | `true`                   |
| `METRICS_TOKEN`   | No\*     | Bearer token to access metrics endpoint     | —       | `my-metrics-secret`      |
| `OTEL_ENDPOINT`   | No       | OpenTelemetry OTLP exporter endpoint        | —       | `http://localhost:4318`  |

> \* Required when `METRICS_ENABLED=true`.

---

## Client (`client/.env`)

| Variable                | Required | Description             | Example                 |
| ----------------------- | -------- | ----------------------- | ----------------------- |
| `VITE_API_BASE_URL`     | **Yes**  | Backend API base URL    | `http://localhost:3000` |
| `VITE_GOOGLE_CLIENT_ID` | No\*     | Google OAuth2 client ID | (from GCP console)      |

> \* Required if Google OAuth sign-in is enabled.
>
> **Note:** All client env vars must be prefixed with `VITE_` to be exposed to the browser bundle by Vite.

---

## AI Core (`server/AI_Core/.env`)

| Variable         | Required | Description           | Default | Example   |
| ---------------- | -------- | --------------------- | ------- | --------- |
| `GEMINI_API_KEY` | **Yes**  | Google Gemini API key | —       | `AIza...` |
| `LOG_LEVEL`      | No       | Python logging level  | `INFO`  | `DEBUG`   |

---

## Example `.env` Files

Both `client/` and `server/` ship with `.env.example` files. Copy and customize:

```bash
# Server
cp server/.env.example server/.env

# Client
cp client/.env.example client/.env

# AI Core (create manually)
echo "GEMINI_API_KEY=your-key-here" > server/AI_Core/.env
```

---

## Production Notes

- **Never commit `.env` files** — they are `.gitignore`d
- **Use secrets management** in production (Render EnvGroups, Railway Variables, AWS Secrets Manager, etc.)
- **`JWT_SECRET`** must be a strong, unique string (minimum 64 characters)
- **`NODE_ENV=production`** enables security headers (HSTS), optimized logging, CSRF protection, and disables dev-only features
- **`COOKIE_SAME_SITE=none`** requires `COOKIE_SECURE=true` (or production HTTPS `CLIENT_URL`)

---

_See also_: [SETUP.md](./SETUP.md) · [DEPLOYMENT.md](./DEPLOYMENT.md) · [SECURITY.md](./SECURITY.md)
