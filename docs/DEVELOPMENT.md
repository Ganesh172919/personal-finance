# FinWise — Development Guide

> Guidelines, conventions, and workflows for developing FinWise.

---

## Project Structure

FinWise is organized as a monorepo-style repository with three main subsystems:

```
personal-finance/
├── client/                 # React frontend
├── server/                 # Express backend
│   └── AI_Core/            # Python AI service
├── packages/contracts/     # Shared OpenAPI specs
└── docs/                   # Documentation
```

Each subsystem has its own `package.json` (or `requirements.txt` for Python) and should be developed independently.

---

## Development Workflow

### 1. Branch Strategy

```
main (stable)
  └── develop (integration)
        └── feature/* (new features)
        └── fix/* (bug fixes)
        └── docs/* (documentation)
```

- **`main`**: Production-ready code, protected branch
- **`develop`**: Integration branch for features
- **`feature/*`**: New features (e.g., `feature/receipt-ocr`)
- **`fix/*`**: Bug fixes (e.g., `fix/chat-streaming`)
- **`docs/*`**: Documentation updates

### 2. Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
| Type | Description |
| ---- | ----------- |
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation |
| `style` | Formatting (no code change) |
| `refactor` | Code restructuring (no behavior change) |
| `test` | Test additions/modifications |
| `chore` | Maintenance tasks |

**Examples:**
```
feat(chat): add streaming support for AI responses
fix(auth): resolve JWT expiration edge case
docs(api): update endpoint documentation
refactor(services): extract transaction validation logic
test(workflows): add cron trigger tests
chore(deps): update Express to 5.2.1
```

### 3. Pull Request Process

1. Create feature branch from `develop`
2. Make changes with conventional commits
3. Run tests and type checks locally
4. Push branch and create PR to `develop`
5. Address review comments
6. Squash merge after approval

**PR Requirements:**
- At least 1 approval
- All tests passing
- No merge conflicts
- Conventional commit messages

---

## Code Conventions

### TypeScript (Server & Client)

- **Strict mode enabled** — no `any`, no implicit `any`
- **ESM modules** — use `import/export`, not `require`
- **Path aliases** — use `@/` for client imports
- **Zod validation** — all API inputs validated with Zod schemas
- **Error handling** — use `HttpError` class for API errors

```typescript
// Good: Typed, validated, error-handled
import { z } from "zod";
import { HttpError } from "../middleware/httpError.js";

const schema = z.object({
  amount: z.number().positive(),
  category: z.string().min(1),
});

export async function createTransaction(req, res) {
  const data = schema.parse(req.body);
  // ... implementation
}
```

### React (Client)

- **Functional components** with hooks
- **TypeScript interfaces** for all props
- **React Query** for server state, **Zustand** for client state
- **Radix UI primitives** for accessible components
- **Tailwind CSS** for styling (no inline styles)
- **Lazy loading** for all route-level pages

```tsx
// Good: Typed, lazy-loaded, using React Query
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";

interface TransactionListProps {
  accountId?: string;
}

export function TransactionList({ accountId }: TransactionListProps) {
  const { data, isLoading } = useTransactions(accountId);
  
  if (isLoading) return <LoadingSpinner />;
  
  return (
    <Card>
      {/* ... */}
    </Card>
  );
}
```

### Python (AI Core)

- **Type hints** on all functions
- **Pydantic models** for data validation
- **Async/await** for I/O operations
- **ruff** for linting and formatting

```python
# Good: Typed, validated, async
from pydantic import BaseModel

class UserProfile(BaseModel):
    annual_income: float
    monthly_expenses: float
    risk_tolerance: str

async def analyze_budget(profile: UserProfile) -> dict:
    # ... implementation
```

---

## Testing

### Server Tests

```bash
cd server
npm test                    # Run all tests
npm run test:ci             # CI mode (no watch)
npm test -- -t "auth"       # Run tests matching "auth"
```

- Uses **Vitest** with **Supertest** for HTTP testing
- **mongodb-memory-server** for isolated DB per test
- Test files: `server/src/test/*.test.ts`

### Client Tests

```bash
cd client
npm test                    # Run all tests
npm run test:watch          # Watch mode
```

- Uses **Vitest** with **Testing Library** for component testing
- **MSW** for API mocking
- Test files: co-located with components or in `client/src/test/`

### AI Core Tests

```bash
cd server/AI_Core
pytest tests/ -v            # Run all tests
pytest tests/ -v -k master  # Run tests matching "master"
```

- Uses **pytest** with fixtures
- Test files: `server/AI_Core/tests/test_*.py`

---

## Adding New Features

### 1. New API Endpoint

1. Define Zod schema in `server/src/schemas/`
2. Create/update controller in `server/src/controllers/`
3. Add route in appropriate route file (`server/src/routes/`)
4. Register in `routeRegistry.ts` if new route file
5. Add API client module in `client/src/lib/api/`
6. Write tests

### 2. New React Page

1. Create page component in `client/src/pages/`
2. Add route definition in `client/src/routes/routeDefinitions.tsx`
3. Add to navigation in `client/src/components/Sidebar.tsx`
4. Lazy-load the page component
5. Write tests

### 3. New AI Agent

1. Create agent module in `server/AI_Core/agents/`
2. Add to LangGraph workflow in `server/AI_Core/graph/workflow.py`
3. Update master agent routing logic
4. Add tests in `server/AI_Core/tests/`
5. Update AI Core documentation

### 4. New Mongoose Model

1. Create model file in `server/src/models/`
2. Define schema with TypeScript types
3. Add org-scoping plugin if needed
4. Create Zod validation schema
5. Add API routes and controllers
6. Write tests

---

## Debugging

### Server Debugging

```bash
# Run with verbose logging
LOG_LEVEL=debug npm run dev

# Type check without emitting
npm run check

# Run specific test file
npm test -- src/test/auth.test.ts
```

### Client Debugging

```bash
# Run with Vite debug
VITE_DEBUG=1 npm run dev

# Check TypeScript errors
npx tsc --noEmit

# Preview production build
npm run build && npm run preview
```

### AI Core Debugging

```bash
# Run with debug logging
LOG_LEVEL=DEBUG python api_service.py

# Run specific test
pytest tests/test_master_agent.py -v -s

# Test LLM provider directly
python -c "from utils.llm_wrapper import LLMWrapper; print(LLMWrapper().test())"
```

---

## Performance Tips

### Client
- Use React Query caching effectively (set appropriate `staleTime`)
- Lazy-load all route-level pages
- Use virtualized lists for large datasets (`useVirtualList`)
- Memoize expensive computations with `useMemo`
- Debounce search inputs with `useDebounce`

### Server
- Use response caching for frequently accessed data
- Implement pagination for list endpoints
- Use MongoDB indexes for common query patterns
- Offload heavy work to BullMQ workers
- Use circuit breaker for AI Core calls

### AI Core
- Cache responses for common queries
- Use deterministic routing (no LLM for classification)
- Implement provider failover for reliability
- Use streaming for long responses

---

## Common Patterns

### Org-Scoped Queries

All data queries should be scoped to the user's organization:

```typescript
// Good: Org-scoped query
const transactions = await Transaction.find({
  orgId: req.org.id,
  userId: req.user.id,
});
```

### Error Handling

Use `HttpError` for API errors:

```typescript
import { HttpError } from "../middleware/httpError.js";

throw new HttpError(404, "Transaction not found");
throw new HttpError(400, "Invalid amount", { field: "amount" });
```

### Zod Validation

Validate all inputs:

```typescript
import { validate } from "../middleware/validate.js";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

router.post("/register", validate(schema), registerHandler);
```

---

## Environment Setup

See [SETUP.md](./SETUP.md) for detailed environment configuration.

### Minimum Required Variables

**Server (`.env`):**
```
MONGO_URI=mongodb://localhost:27017/finwise
JWT_SECRET=your-secret-key-here
```

**Client (`.env`):**
```
VITE_API_BASE_URL=http://localhost:3000
```

**AI Core (`.env`):**
```
GEMINI_API_KEY=your-gemini-api-key
```

---

_See also_: [CONTRIBUTING.md](./CONTRIBUTING.md) · [SETUP.md](./SETUP.md) · [TESTING.md](./TESTING.md) · [ARCHITECTURE.md](./ARCHITECTURE.md)
