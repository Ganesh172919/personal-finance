# Quick Start Guide

Get Personal Finance running locally in 5 minutes.

## Prerequisites

Ensure you have these installed:

- **Node.js** 18+ and npm 9+
- **MongoDB** 6+ (running locally or connection URI)
- **Redis** 7+ (running locally)
- **Python** 3.11+ (for AI features)

## Quick Setup

### 1. Clone and Install

```bash
# Clone the repository
git clone <repository-url>
cd personal-finance

# Install client dependencies
cd client
npm install

# Install server dependencies
cd ../server
npm install

# Install AI Core dependencies (optional)
cd AI_Core
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate
pip install -r requirements.txt
cd ../..
```

### 2. Configure Environment Variables

**Server** (`server/.env`):

```bash
# Required
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://localhost:27017/personal-finance
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key-here

# Optional: AI Core
AI_CORE_URL=http://localhost:8001
```

**Client** (`client/.env`):

```bash
VITE_API_BASE_URL=http://localhost:3000
```

**AI Core** (`server/AI_Core/.env`):

```bash
# Optional: For full AI features
GOOGLE_API_KEY=your-gemini-api-key
OPENAI_API_KEY=your-openai-api-key
```

### 3. Start Services

Open **three terminal windows**:

**Terminal 1 - Client:**
```bash
cd client
npm run dev
# Runs on http://localhost:5173
```

**Terminal 2 - Server:**
```bash
cd server
npm run dev
# Runs on http://localhost:3000
```

**Terminal 3 - AI Core (optional):**
```bash
cd server/AI_Core
.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # macOS/Linux
python api_service.py
# Runs on http://localhost:8001
```

### 4. Verify Installation

1. Open browser to **http://localhost:5173**
2. You should see the Personal Finance app
3. Create an account or sign in
4. Try creating a transaction to verify database connectivity

## Optional: Background Worker

For background jobs and scheduled tasks:

```bash
cd server
npm run worker:dev
```

## Troubleshooting

**MongoDB connection failed:**
- Ensure MongoDB is running: `mongod --version`
- Check connection URI in `server/.env`

**Redis connection failed:**
- Ensure Redis is running: `redis-cli ping` (should return PONG)
- Check connection URI in `server/.env`

**Port already in use:**
- Change `PORT` in `server/.env`
- Change `server.port` in `client/vite.config.ts` proxy settings

**AI features not working:**
- AI Core is optional; app works without it
- Check AI_CORE_URL in `server/.env`
- Verify Python service is running on port 8001

## Next Steps

- [Complete Setup Guide](./SETUP.md) - Detailed setup with all features
- [Architecture Overview](./ARCHITECTURE.md) - Understand the system design
- [API Documentation](./API.md) - Available API endpoints
- [Development Workflows](./DEVELOPER_WORKFLOWS.md) - Common dev tasks

## Build for Production

**Client:**
```bash
cd client
npm run build
# Outputs to client/dist/
```

**Server:**
```bash
cd server
npm run build
npm start
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment guide.
