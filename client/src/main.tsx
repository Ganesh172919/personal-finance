/**
 * @fileoverview React Application Entry Point
 *
 * This is the entry point for the FinWise React SPA (Single Page Application).
 * It bootstraps the React rendering pipeline and sets up global error handling.
 *
 * RENDERING PIPELINE:
 * 1. errorReporting.install() — catches unhandled errors/rejections globally
 * 2. createRoot() — creates the React 18 concurrent root
 * 3. StrictMode — enables React's strict mode checks (double-renders in dev)
 * 4. AppErrorBoundary — catches React rendering errors (prevents white screen)
 * 5. App — the root application component
 *
 * WHY ERROR BOUNDARY + GLOBAL HANDLER?
 * - errorReporting.install(): Catches non-React errors (async, event handlers)
 * - AppErrorBoundary: Catches React rendering errors (component tree crashes)
 * Together, they provide comprehensive error coverage.
 *
 * VITE ENTRY POINT:
 * This file is specified in index.html as the entry script. Vite processes it
 * during build, handling TypeScript compilation, CSS imports, and asset bundling.
 *
 * @module main
 */

import { StrictMode } from "react";                              // React strict mode (development checks)
import { createRoot } from "react-dom/client";                   // React 18 concurrent root API
import "./index.css";                                            // Global CSS styles
import App from "./App.tsx";                                     // Root application component
import { AppErrorBoundary } from "./components/AppErrorBoundary.tsx"; // Error boundary
import { errorReporting } from "./services/errorReporting.ts";   // Global error reporting

// Install global error listeners BEFORE React renders
// This catches unhandled errors and promise rejections that React doesn't see
errorReporting.install();

// Create React 18 concurrent root and render the application
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* AppErrorBoundary catches React rendering errors (prevents white screen) */}
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);

/**
 * ══════════════════════════════════════════════════════════════════════
 * END-OF-FILE SUMMARY
 * ══════════════════════════════════════════════════════════════════════
 *
 * KEY TAKEAWAYS:
 * ─────────────
 * 1. **React 18 Concurrent Root**: createRoot() enables concurrent features
 *    like automatic batching and Suspense. The old ReactDOM.render() is legacy.
 *
 * 2. **StrictMode**: In development, React double-renders components to detect
 *    side effects. This has zero cost in production.
 *
 * 3. **Error Boundary Hierarchy**: AppErrorBoundary wraps the entire app so
 *    that any rendering error shows a fallback UI instead of a blank screen.
 *
 * 4. **Global Error Reporting**: Installed before React to catch errors that
 *    happen outside the React lifecycle (e.g., in event handlers, async code).
 *
 * HOW THIS FITS INTO THE SYSTEM:
 * ─────────────────────────────
 * main.tsx → App.tsx → AppProviders + AppRouter
 * main.tsx → errorReporting (global error handler)
 * main.tsx → AppErrorBoundary (React error boundary)
 * ══════════════════════════════════════════════════════════════════════
 */
