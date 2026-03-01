# FinWise — Environment Setup & Configuration

> Step-by-step guide to get the development environment running locally.

---

## Prerequisites

| Tool        | Minimum Version | Notes                                         |
| ----------- | --------------- | --------------------------------------------- |
| **Node.js** | 18+             | LTS recommended; check with `node -v`         |
| **npm**     | 9+              | Ships with Node.js                            |
| **MongoDB** | 6+              | Local install **or** MongoDB Atlas (cloud)    |
| **Redis**   | 7+              | Required for BullMQ background jobs & caching |
| **Python**  | 3.11+           | Only needed for the AI Core agent system      |
| **Git**     | 2.30+           | Source control                                |

---

## 1. Clone the Repository

```bash
git clone <repository-url>
cd personal-finance
```

---

## 2. Server Setup

### Install Dependencies

```bash
cd server
npm install
```

### Environment Variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Key variables:

| Variable                | Description                          | Example                             |
| ----------------------- | ------------------------------------ | ----------------------------------- |
| `PORT`                  | Server listen port                   | `3000`                              |
| `MONGODB_URI`           | Mongo connection string              | `mongodb://localhost:27017/finwise` |
| `JWT_SECRET`            | Secret for signing JWTs              | (random 64-char string)             |
| `JWT_EXPIRY`            | Token lifetime                       | `7d`                                |
| `GOOGLE_CLIENT_ID`      | Google OAuth2 client ID              | (from GCP console)                  |
| `GOOGLE_CLIENT_SECRET`  | Google OAuth2 client secret          | (from GCP console)                  |
| `REDIS_URL`             | Redis connection URI                 | `redis://localhost:6379`            |
| `STRIPE_SECRET_KEY`     | Stripe API secret key                | `sk_test_...`                       |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret        | `whsec_...`                         |
| `SMTP_HOST`             | Email SMTP host                      | `smtp.gmail.com`                    |
| `SMTP_PORT`             | Email SMTP port                      | `587`                               |
| `SMTP_USER`             | Email sender address                 | `noreply@example.com`               |
| `SMTP_PASS`             | Email sender password / app password | (app-specific password)             |
| `AI_CORE_URL`           | AI Core Python service URL           | `http://localhost:8000`             |
| `GEMINI_API_KEY`        | Google Gemini API key                | (from AI Studio)                    |

### Start the Server

```bash
npm run dev          # Express API (watch mode, port 3000)
npm run worker:dev   # Background worker (watch mode)
```

---

## 3. Client Setup

### Install Dependencies

```bash
cd ../client
npm install
```

### Environment Variables

```bash
cp .env.example .env
```

| Variable                | Description                              | Example                 |
| ----------------------- | ---------------------------------------- | ----------------------- |
| `VITE_API_BASE_URL`     | Backend API URL                          | `http://localhost:3000` |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth2 client ID (same as server) | (from GCP console)      |

### Start the Client

```bash
npm run dev          # Vite dev server (port 5173)
```

Open **http://localhost:5173** in your browser.

---

## 4. AI Core Setup (Python)

> The AI Core is **optional** for basic functionality but required for AI chat, insights, and receipt OCR.

```bash
cd ../server/AI_Core

# Create a virtual environment
python -m venv .venv

# Activate it
# Windows:
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Environment Variables

Create `server/AI_Core/.env`:

```env
GEMINI_API_KEY=<your-gemini-api-key>
LOG_LEVEL=DEBUG
```

### Run the AI Core

```bash
python main.py
```

---

## 5. Database Seeding (Optional)

Populate the database with sample blogs, growth stories, and demo data:

```bash
cd server
npm run seed:content
```

### Migration Scripts

```bash
npm run migrate:transactions   # Migrate transaction schema changes
npm run migrate:orgids          # Backfill organization IDs
```

---

## 6. Running Tests

### Server Tests

```bash
cd server
npm test              # Run Vitest suite (uses mongodb-memory-server)
npm run test:watch    # Watch mode
npm run test:ci       # Single run for CI
```

### AI Core Tests

```bash
cd server/AI_Core
pytest tests/
```

---

## Common Troubleshooting

| Issue                       | Solution                                                               |
| --------------------------- | ---------------------------------------------------------------------- |
| `ECONNREFUSED` on MongoDB   | Ensure `mongod` is running or Atlas URI is correct                     |
| `ECONNREFUSED` on Redis     | Start Redis: `redis-server` or `docker run -p 6379:6379 redis`         |
| Port 5173 already in use    | Kill the existing Vite process or change the port in `vite.config.ts`  |
| AI Core returns 500         | Check `GEMINI_API_KEY` is set and valid; inspect `AI_Core/finwise.log` |
| Google OAuth redirect error | Ensure callback URLs match between GCP console and `.env`              |
| `MODULE_NOT_FOUND`          | Run `npm install` in both `client/` and `server/`                      |

---

_See also_: [ARCHITECTURE.md](./ARCHITECTURE.md) · [API.md](./API.md) · [DEPLOYMENT.md](./DEPLOYMENT.md)
