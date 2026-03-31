# FinWise — Troubleshooting Guide

> Common issues, error messages, and their solutions.

---

## Quick Diagnostics

### Health Check Endpoints

```bash
# Server liveness
curl http://localhost:3000/healthz

# Server test endpoint
curl http://localhost:3000/api/test

# AI Core health
curl http://localhost:3000/api/python-health

# Prometheus metrics (requires token)
curl -H "Authorization: Bearer $METRICS_TOKEN" http://localhost:3000/api/metrics
```

### Log Locations

| Service | Log Location |
| ------- | ------------ |
| Server | Console output (Pino JSON) |
| AI Core | Console output + `server/AI_Core/personal-finance.log` |
| Client | Browser console + Vite dev server output |

---

## Server Issues

### ECONNREFUSED on Port 27017 (MongoDB)

**Symptom:** `MongoServerSelectionError: connect ECONNREFUSED 127.0.0.1:27017`

**Causes:**
- MongoDB is not running
- Wrong connection string in `.env`

**Solutions:**
```bash
# Check if MongoDB is running
# Windows:
Get-Service MongoDB
# macOS/Linux:
systemctl status mongod

# Start MongoDB
# Windows:
net start MongoDB
# macOS:
brew services start mongodb-community
# Linux:
sudo systemctl start mongod

# Or use Docker:
docker run -d -p 27017:27017 --name mongodb mongo:7

# Verify connection string in server/.env:
MONGO_URI=mongodb://localhost:27017/finwise
```

### ECONNREFUSED on Port 6379 (Redis)

**Symptom:** `Error: connect ECONNREFUSED 127.0.0.1:6379`

**Solutions:**
```bash
# Start Redis
# Windows (using WSL or Docker):
docker run -d -p 6379:6379 --name redis redis:7

# macOS:
brew services start redis

# Linux:
sudo systemctl start redis-server

# Verify in server/.env:
REDIS_URL=redis://localhost:6379
```

### Port Already in Use

**Symptom:** `Error: listen EADDRINUSE: address already in use :::3000`

**Solutions:**
```bash
# Find process using the port
# Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# macOS/Linux:
lsof -i :3000
kill -9 <PID>

# Or use a different port:
PORT=3001 npm run dev
```

### JWT Secret Missing

**Symptom:** `Error: Invalid environment configuration: JWT_SECRET: Required`

**Solution:**
```bash
# Generate a secure random secret
# Windows PowerShell:
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})

# macOS/Linux:
openssl rand -base64 64

# Add to server/.env:
JWT_SECRET=<generated-secret>
```

### CSRF Errors on POST/PUT/PATCH

**Symptom:** `403 Forbidden - CSRF token missing or invalid`

**Solutions:**
- For local development, set `CSRF_ENABLED=false` in `server/.env`
- In production, ensure the client sends the CSRF token in the `X-CSRF-Token` header
- The CSRF token is available at `GET /api/v1/auth/csrf-token`

### TypeScript Errors

**Symptom:** `npm run check` fails with type errors

**Solutions:**
```bash
# Clear and reinstall
rm -rf node_modules
npm install

# Check for circular dependencies
npx madge --circular src/

# Verify TypeScript version matches package.json
npx tsc --version
```

---

## Client Issues

### Vite Port Conflict

**Symptom:** `Port 5173 is already in use`

**Solutions:**
```bash
# Kill existing Vite process
# Windows:
taskkill /F /IM node.exe

# Or use a different port:
npm run dev -- --port 5174
```

### API Requests Failing

**Symptom:** Network errors or 404s when calling API

**Solutions:**
1. Verify server is running on port 3000
2. Check `VITE_API_BASE_URL` in `client/.env`:
   ```
   VITE_API_BASE_URL=http://localhost:3000
   ```
3. Check browser network tab for actual request URLs
4. Verify CORS configuration in `server/.env`:
   ```
   CORS_ORIGINS=http://localhost:5173
   ```

### White Screen / Blank Page

**Symptom:** App loads but shows blank page

**Solutions:**
1. Check browser console for JavaScript errors
2. Verify all environment variables are set
3. Check if the API is returning valid responses
4. Clear browser cache and reload
5. Check for React Error Boundary catches

### Build Failures

**Symptom:** `npm run build` fails

**Solutions:**
```bash
# Check TypeScript errors first
npx tsc --noEmit

# Check for unused imports/variables
npm run lint

# Clear Vite cache
rm -rf node_modules/.vite

# Increase Node memory if needed
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

---

## AI Core Issues

### AI Core Not Starting

**Symptom:** `python api_service.py` fails

**Solutions:**
```bash
# Verify Python version (3.11+ required)
python --version

# Recreate virtual environment
cd server/AI_Core
rm -rf .venv
python -m venv .venv
.venv\Scripts\activate  # Windows
pip install -r requirements.txt

# Check for missing dependencies
pip check
```

### No LLM Providers Available

**Symptom:** `No LLM providers available` or `All providers failed`

**Solutions:**
1. Set at least one API key in `server/AI_Core/.env`:
   ```
   GEMINI_API_KEY=your-key-here
   # or
   OPENROUTER_API_KEY=your-key-here
   ```
2. Verify API key is valid and has quota remaining
3. Check network connectivity to provider APIs
4. Review AI Core logs for specific provider errors

### OCR Not Working

**Symptom:** Receipt/handwriting parsing fails

**Solutions:**
1. Verify PaddleOCR is installed:
   ```bash
   pip list | grep paddle
   ```
2. PaddleOCR requires Python < 3.13
3. Check image format (JPEG, PNG, WebP supported)
4. Verify image size is within limits (8MB for receipts)

### AI Core Connection Refused

**Symptom:** Server logs `ECONNREFUSED` when calling AI Core

**Solutions:**
1. Verify AI Core is running:
   ```bash
   curl http://localhost:8001/health
   ```
2. Check `PYTHON_API_URL` in `server/.env`:
   ```
   PYTHON_API_URL=http://localhost:8001
   ```
3. Verify no firewall blocking port 8001
4. Check AI Core logs for startup errors

---

## Database Issues

### Migration Failures

**Symptom:** `npm run migrate:transactions` fails

**Solutions:**
```bash
# Verify MongoDB connection
mongosh mongodb://localhost:27017/finwise

# Check existing data
mongosh --eval "db.transactions.countDocuments()"

# Run migration with verbose output
NODE_ENV=development npm run migrate:transactions
```

### Data Not Appearing

**Symptom:** Seeded data not showing in app

**Solutions:**
```bash
# Run seed scripts
cd server
npm run seed:content

# Verify data in MongoDB
mongosh --eval "db.blogs.countDocuments()"
mongosh --eval "db.growthStories.countDocuments()"
```

### MongoDB Authentication Errors

**Symptom:** `Authentication failed` when connecting to MongoDB

**Solutions:**
1. Verify credentials in `MONGO_URI`:
   ```
   MONGO_URI=mongodb://username:password@localhost:27017/finwise
   ```
2. For local development, use unauthenticated connection:
   ```
   MONGO_URI=mongodb://localhost:27017/finwise
   ```
3. For MongoDB Atlas, whitelist your IP address

---

## Authentication Issues

### Login Fails

**Symptom:** `401 Unauthorized` on login

**Solutions:**
1. Verify user exists in database
2. Check email verification status
3. Verify password is correct
4. Check server logs for specific error messages
5. If 2FA is enabled, ensure TOTP code is correct

### Google OAuth Fails

**Symptom:** `redirect_uri_mismatch` or `invalid_client`

**Solutions:**
1. Verify Google OAuth credentials in `server/.env`:
   ```
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   ```
2. Add callback URL to Google Cloud Console:
   ```
   http://localhost:3000/api/v1/auth/google/callback
   ```
3. Enable Google+ API in Google Cloud Console
4. Verify `VITE_GOOGLE_CLIENT_ID` in `client/.env`

### JWT Token Expired

**Symptom:** `401 Unauthorized` on API requests after some time

**Solutions:**
- Tokens expire after a configured duration (check server config)
- Re-login to get a fresh token
- For development, consider increasing token expiration

---

## Performance Issues

### Slow API Responses

**Solutions:**
1. Check MongoDB query performance:
   ```javascript
   // In mongosh
   db.transactions.find().explain("executionStats")
   ```
2. Add indexes for frequently queried fields
3. Enable response caching where appropriate
4. Check AI Core response times
5. Monitor Redis connection health

### High Memory Usage

**Solutions:**
1. Check for memory leaks in long-running processes
2. Monitor MongoDB memory usage
3. Check Redis memory usage:
   ```bash
   redis-cli info memory
   ```
4. Reduce BullMQ job retention period
5. Consider increasing Node.js heap size:
   ```bash
   NODE_OPTIONS="--max-old-space-size=4096" npm run dev
   ```

### Slow Client Load Time

**Solutions:**
1. Verify code splitting is working (check network tab for chunked JS)
2. Optimize image sizes
3. Enable PWA caching (already configured)
4. Check for large dependencies in bundle:
   ```bash
   npm run build
   npx vite-bundle-visualizer
   ```

---

## Common Error Messages

| Error | Cause | Solution |
| ----- | ----- | -------- |
| `Invalid environment configuration` | Missing required env var | Check `.env` files against [ENV_VARIABLES.md](./ENV_VARIABLES.md) |
| `Circuit breaker open` | AI Core failing repeatedly | Check AI Core health, wait for reset (30s) |
| `Rate limit exceeded` | Too many requests | Wait for window to reset (60s default) |
| `Payment required` | Feature limit hit | Check usage ledger, upgrade plan |
| `Forbidden` | Insufficient permissions | Check user role and org membership |
| `Not found` | Resource doesn't exist | Verify ID, check org scoping |
| `Validation error` | Invalid input | Check request body against Zod schema |
| `Internal server error` | Unexpected error | Check server logs, report bug |

---

## Getting Help

1. Check this troubleshooting guide
2. Review [SETUP.md](./SETUP.md) for configuration details
3. Check server and AI Core logs for specific errors
4. Search existing issues in the repository
5. Create a new issue with:
   - Error message and stack trace
   - Steps to reproduce
   - Environment details (OS, Node version, etc.)
   - Relevant log output

---

_See also_: [SETUP.md](./SETUP.md) · [ENV_VARIABLES.md](./ENV_VARIABLES.md) · [OBSERVABILITY.md](./OBSERVABILITY.md)
