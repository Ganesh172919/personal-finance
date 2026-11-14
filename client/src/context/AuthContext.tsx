/**
 * @fileoverview Authentication Context Provider
 *
 * This module provides React context for authentication state management.
 * It handles user login state, profile fetching, and logout functionality.
 *
 * AUTHENTICATION FLOW:
 * 1. App loads → AuthProvider mounts
 * 2. useEffect fires → fetches CSRF token, then checks auth status
 * 3. checkAuthStatus() calls GET /auth/profile with credentials
 * 4. If successful: sets user state
 * 5. If 401: clears user state (not logged in)
 * 6. loading=false → app renders with auth state
 *
 * CSRF TOKEN:
 * Before any authenticated request, a CSRF token is fetched and stored.
 * This token is included in state-changing requests (POST, PUT, DELETE)
 * as the X-CSRF-Token header for CSRF protection.
 *
 * CREDENTIALS: "include":
 * All auth requests use credentials: "include" to send HTTP-only cookies.
 * This is necessary because the JWT is stored in an HTTP-only cookie.
 *
 * @module context/AuthContext
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

import { ApiError, apiClient, fetchCsrfToken } from "@/services/api";
import { reportClientError, reportClientWarning } from "@/lib/runtimeLogger";
import { clearActiveOrgId } from "@/lib/orgContext";
import { retireRequestContext } from "@/lib/requestContext";

/**
 * User profile interface.
 * Matches the shape returned by GET /auth/profile.
 */
// Represents the authenticated user profile returned from the backend session endpoint.
// Encapsulates core identity properties, verification flags, and third-party auth providers.
// Consumed across client contexts, route guards, and personalized display components.
interface User {
  id: string;
  _id?: string;
  name: string;
  email: string;
  photoURL?: string;
  phoneNumber?: string;
  authProvider?: string;
  isEmailVerified?: boolean;
}

/**
 * Authentication context interface.
 * Provides user state, loading state, and auth methods.
 */
// Defines the shape of the global authentication context state and actions.
// Exposes the current user identity, session loading indicators, and error tracking.
// Provides asynchronous handlers for signing out and manual session revalidation.
interface AuthContextType {
  user: User | null;                    // Current user (null if not authenticated)
  loading: boolean;                     // True while checking auth status
  authError: string | null;
  logout: () => Promise<void>;          // Logout function
  checkAuthStatus: () => Promise<void>; // Re-check auth status
}

// Create context with undefined default (will throw if used outside provider)
// React Context instance holding the active user identity and auth handlers.
// Initialized to undefined to enforce consumer execution inside AuthProvider.
// Serves as the single source of truth for global authentication status.
const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Authentication context provider.
 *
 * Manages authentication state and provides auth methods to the component tree.
 * On mount, it fetches the CSRF token and checks the user's auth status.
 *
 * @param children - The component tree to provide auth context to
 */
// React Context Provider managing global user authentication lifecycle and state.
// Coordinates initial CSRF fetching, profile verification, and session refreshes.
// Gracefully handles rate limits, credential invalidation, and secure teardowns.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true); // Start as loading
  const [authError, setAuthError] = useState<string | null>(null);
  const authRevision = useRef(0);
  const identity = useRef<string | null>(null);
  const loggingOut = useRef(false);

  const rememberIdentity = (id: string | null) => {
    try {
      if (id) localStorage.setItem("userId", id);
      else localStorage.removeItem("userId");
    } catch {
      // Authentication itself must work when browser storage is unavailable.
    }
  };

  /**
   * Checks the current authentication status by fetching the user profile.
   * This is called on mount and can be called manually to refresh auth state.
   */
  /**
   * Checks the current authentication status by fetching the user profile.
   * This is called on mount and can be called manually to refresh auth state.
   *
   * Flow:
   * 1. Set loading=true (shows spinner in route guards)
   * 2. GET /auth/profile with JWT cookie
   * 3. On success: set user state, store userId for analytics
   * 4. On 401: clear user state (not authenticated)
   * 5. On transient errors: preserve verified identity and offer recovery
   * 6. Set loading=false (renders the app)
   */
  const checkAuthStatus = useCallback(async () => {
    if (loggingOut.current) return;
    const revision = ++authRevision.current;
    setLoading(true);
    setAuthError(null);

    try {
      // Fetch user profile (JWT cookie is sent automatically via credentials: "include")
      const profile = await apiClient<User>("/auth/profile", {
        method: "GET",
        credentials: "include", // Send HTTP-only cookie for authentication
      });

      if (revision !== authRevision.current) return;
      if (identity.current && identity.current !== profile.id) clearActiveOrgId();
      identity.current = profile.id;
      setUser(profile);

      // Store userId in localStorage for non-auth API calls (e.g., analytics)
      rememberIdentity(profile.id);

      // Log successful authentication (dev only)
      if (import.meta.env.DEV) {
        console.log(`[Auth] Authenticated as ${profile.email} (provider: ${profile.authProvider || "email"})`);
      }
    } catch (error: any) {
      if (revision !== authRevision.current) return;
      const status = error?.status ?? (error instanceof ApiError ? error.status : undefined);
      // 401 or 403 means not logged in (expected for unauthenticated users)
      if (status === 401 || status === 403 || (error instanceof ApiError && [401, 403].includes(error.status))) {
        identity.current = null;
        clearActiveOrgId();
        setUser(null);
        rememberIdentity(null);
        if (import.meta.env.DEV) {
          console.log("[Auth] Not authenticated (401/403)");
        }
        return;
      }

      const rateLimited = status === 429 || (error instanceof ApiError && error.status === 429);
      if (rateLimited) {
        // Expected throttling, already shown to the user with a retry path. Reporting it
        // as an error would re-dispatch it as an uncaught window error and POST another
        // client-error report to the API that is currently refusing requests.
        reportClientWarning("Sign-in check rate limited; keeping current identity", error);
      } else {
        // Other errors are unexpected — log them
        reportClientError("Failed to fetch user profile", error);
      }
      setAuthError(rateLimited
        ? "Sign-in checks are temporarily limited. Please wait a moment and try again."
        : "We could not check your sign-in. Check your connection and try again.");
    } finally {
      if (revision === authRevision.current) setLoading(false);
    }
  }, []);

  // On mount: fetch CSRF token, then check auth status
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        // Fetch CSRF token first (needed for state-changing requests)
        await fetchCsrfToken();
      } catch (error) {
        // Non-fatal: CSRF might be disabled
        reportClientWarning("Failed to fetch CSRF token", error);
      }

      // Check if user is authenticated
      if (active) await checkAuthStatus();
    })();
    return () => { active = false; };
  }, [checkAuthStatus]);

  /**
   * Logs out the current user.
   * Calls the logout endpoint, then clears local state regardless of success.
   */
  const logout = async () => {
    const revision = ++authRevision.current;
    retireRequestContext();
    loggingOut.current = true;
    setLoading(true);
    setAuthError(null);
    setUser(null);
    identity.current = null;
    rememberIdentity(null);
    clearActiveOrgId();
    try {
      await apiClient("/auth/logout", {
        method: "POST",
        credentials: "include", // Send JWT cookie for server-side invalidation
      });
    } catch (error) {
      // Log but don't throw — we clear local state regardless
      reportClientError("Logout failed", error);
    } finally {
      // Always clear local state (even if server call fails)
      loggingOut.current = false;
      if (revision === authRevision.current) setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, authError, logout, checkAuthStatus }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access authentication context.
 *
 * Must be used within an AuthProvider. Throws if used outside the provider.
 *
 * @returns Authentication context (user, loading, logout, checkAuthStatus)
 *
 * @example
 * const { user, loading, logout } = useAuth();
 * if (loading) return <Spinner />;
 * if (!user) return <Redirect to="/login" />;
 */
// Custom hook facilitating type-safe access to the global authentication context.
// Validates that calling components reside within an enclosing AuthProvider tree.
// Returns the authenticated user object, status flags, and logout dispatchers.
export function useAuth() {
  const context = useContext(AuthContext);

  // Guard: ensure hook is used within AuthProvider
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}

/**
 * ══════════════════════════════════════════════════════════════════════
 * END-OF-FILE SUMMARY
 * ══════════════════════════════════════════════════════════════════════
 *
 * KEY TAKEAWAYS:
 * ─────────────
 * 1. **Context + Hook Pattern**: createContext + useContext + custom hook
 *    provides type-safe, reusable access to auth state throughout the app.
 *
 * 2. **CSRF + JWT**: The app uses both CSRF tokens (for state-changing requests)
 *    and JWT cookies (for authentication). This is a defense-in-depth approach.
 *
 * 3. **Credentials Include**: All auth requests use credentials: "include"
 *    to send HTTP-only cookies. This is required for cookie-based auth.
 *
 * 4. **Loading State**: The loading flag prevents flash redirects during
 *    the initial auth check.
 *
 * 5. **Graceful Logout**: The logout function clears local state even if
 *    the server call fails, ensuring the user always gets logged out client-side.
 *
 * HOW THIS FITS INTO THE SYSTEM:
 * ─────────────────────────────
 * AuthContext → provided by AppProviders
 * useAuth() → used by route guards, pages, and components
 * AuthContext → calls /auth/profile and /auth/logout endpoints
 * ══════════════════════════════════════════════════════════════════════
 */
