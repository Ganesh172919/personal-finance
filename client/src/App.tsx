/**
 * @fileoverview Root Application Component
 *
 * This is the root component of the FinWise React application. It composes
 * two top-level concerns:
 * 1. AppProviders — provides global context (auth, theme, queries, toasts)
 * 2. AppRouter — defines all application routes
 *
 * SEPARATION OF CONCERNS:
 * - AppProviders: "How the app works" (context, state, effects)
 * - AppRouter: "What the app shows" (routing, layouts, pages)
 *
 * This separation makes it easy to:
 * - Test components in isolation (with mock providers)
 * - Change routing without affecting providers
 * - Add new providers without touching routes
 *
 * @module App
 */

import { AppProviders } from "@/app/providers/AppProviders"; // Global context providers
import { AppRouter } from "@/routes/AppRouter";               // Application router

/**
 * Root application component.
 *
 * Wraps the router with all necessary providers (auth, theme, queries, etc.)
 */
function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  );
}

export default App;
