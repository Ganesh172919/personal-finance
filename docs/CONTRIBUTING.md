# FinWise — Contributing Guidelines

> How to contribute to the FinWise project, including coding standards, branching strategy, and PR process.

---

## Getting Started

1. **Fork** the repository (or create a branch if you have write access)
2. Set up the development environment — see [SETUP.md](./SETUP.md)
3. Create a feature branch from `main`
4. Make your changes
5. Run tests and linting
6. Open a Pull Request

---

## Branching Strategy

```
main                    ← Production-ready code
├── develop             ← Integration branch (optional)
├── feature/xyz         ← New features
├── fix/xyz             ← Bug fixes
├── refactor/xyz        ← Code refactoring
└── docs/xyz            ← Documentation updates
```

**Branch naming**: Use descriptive names like `feature/add-budget-reports`, `fix/receipt-ocr-timeout`, `refactor/transaction-service`.

---

## Commit Conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]
```

### Types

| Type       | Use for                                 |
| ---------- | --------------------------------------- |
| `feat`     | New feature                             |
| `fix`      | Bug fix                                 |
| `refactor` | Code restructuring (no behavior change) |
| `docs`     | Documentation changes                   |
| `test`     | Adding or updating tests                |
| `chore`    | Build config, CI, dependencies          |
| `style`    | Formatting, whitespace (no code change) |
| `perf`     | Performance improvements                |

### Scopes

Use the subsystem name: `client`, `server`, `ai-core`, `docs`, `ci`.

### Examples

```
feat(server): add recurring transaction rules API
fix(client): resolve chart rendering on mobile
docs(ai-core): document master agent routing logic
test(server): add unit tests for billing service
```

---

## Code Style

### TypeScript (Client & Server)

- **Strict Mode**: `strict: true` in all `tsconfig.json` files
- **Imports**: Use path aliases (`@/components/...` for client, relative for server)
- **Naming**:
  - `camelCase` for variables, functions, and file names
  - `PascalCase` for React components, classes, types, and interfaces
  - `UPPER_SNAKE_CASE` for constants and environment variables
- **Functions**: Prefer arrow functions for inline callbacks; named functions for top-level exports
- **Error Handling**: Always use typed errors; never `catch` and ignore
- **Validation**: Use Zod schemas for all API request/response validation

### React Conventions

- **Functional Components** only (no class components)
- **Hooks** over HOCs or render props
- **Co-location**: Keep component-specific styles, tests, and types near the component
- **Memoization**: Use `useMemo` and `useCallback` for expensive computations and callback stability, but don't over-optimize

### Python (AI Core)

- **Formatter**: `ruff format` (Black-compatible)
- **Linter**: `ruff check`
- **Type Hints**: Required on all function signatures
- **Naming**: `snake_case` for everything except class names (`PascalCase`)
- **Docstrings**: Google style
- **Models**: Pydantic `BaseModel` for all data structures

---

## Project Structure Rules

| Rule                                            | Why                                               |
| ----------------------------------------------- | ------------------------------------------------- |
| API client modules go in `client/src/lib/api/`  | Single source of truth for HTTP calls             |
| Business logic goes in `server/src/services/`   | Controllers stay thin — orchestration only        |
| Validation schemas go in `server/src/schemas/`  | Co-located with routes, shared across controllers |
| New models go in `server/src/models/`           | One file per Mongoose model                       |
| New pages go in `client/src/pages/`             | Lazy-loaded in `App.tsx`                          |
| Reusable UI goes in `client/src/components/ui/` | Follow shadcn/ui patterns                         |

---

## Testing

### Server (Vitest)

```bash
cd server
npm test              # Run all tests
npm run test:watch    # Watch mode
```

- Tests live in `server/src/test/`
- Use `mongodb-memory-server` for database tests (no external DB needed)
- Use `supertest` for HTTP integration tests
- Mock external services (Stripe, SMTP, Gemini) in tests

### Client

```bash
cd client
npm run lint          # ESLint
```

### AI Core (Pytest)

```bash
cd server/AI_Core
pytest tests/ -v
```

---

## Pull Request Process

1. **Title**: Use the conventional commit format (e.g., `feat(server): add budget reports API`)
2. **Description**: Explain what changed and why; link related issues
3. **Checklist**:
   - [ ] Tests pass locally
   - [ ] Linting passes with no new warnings
   - [ ] TypeScript compiles without errors (`npm run check` in server)
   - [ ] New API endpoints have corresponding Zod schemas
   - [ ] New models have migration scripts if modifying existing data
   - [ ] Documentation updated (if applicable)
4. **Review**: At least one approval required before merging
5. **Merge**: Squash merge to `main` to keep history clean

---

## Adding a New Feature — Checklist

- [ ] **Model**: Create Mongoose model in `server/src/models/`
- [ ] **Schema**: Add Zod validation schema in `server/src/schemas/`
- [ ] **Service**: Add business logic in `server/src/services/`
- [ ] **Controller**: Add thin controller in `server/src/controllers/`
- [ ] **Route**: Register endpoint in appropriate `server/src/routes/` file
- [ ] **API Client**: Add client-side API module in `client/src/lib/api/`
- [ ] **Page / Component**: Add UI in `client/src/pages/` or `client/src/components/`
- [ ] **Route**: Register in `client/src/App.tsx` with lazy loading
- [ ] **Tests**: Add server-side tests; verify client renders correctly
- [ ] **Docs**: Update relevant docs in `docs/`

---

## Reporting Issues

When filing a bug:

1. **Title**: Clear, concise description
2. **Steps to Reproduce**: Numbered step-by-step
3. **Expected vs Actual**: What you expected vs what happened
4. **Environment**: OS, Node version, Browser, relevant env config
5. **Screenshots / Logs**: Include if applicable

---

## Code of Conduct

Be respectful, constructive, and collaborative. All contributors are expected to uphold a welcoming and inclusive environment.

---

_See also_: [SETUP.md](./SETUP.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [FRONTEND.md](./FRONTEND.md)
