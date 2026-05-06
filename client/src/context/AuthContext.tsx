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
  type ReactNode,
} from "react";

import { ApiError, apiClient, fetchCsrfToken } from "@/services/api";
import { reportClientError, reportClientWarning } from "@/lib/runtimeLogger";

/**
 * User profile interface.
 * Matches the shape returned by GET /auth/profile.
 */
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
interface AuthContextType {
  user: User | null;                    // Current user (null if not authenticated)
  loading: boolean;                     // True while checking auth status
  logout: () => Promise<void>;          // Logout function
  checkAuthStatus: () => Promise<void>; // Re-check auth status
}

// Create context with undefined default (will throw if used outside provider)
const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Authentication context provider.
 *
 * Manages authentication state and provides auth methods to the component tree.
 * On mount, it fetches the CSRF token and checks the user's auth status.
 *
 * @param children - The component tree to provide auth context to
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true); // Start as loading

  /**
   * Checks the current authentication status by fetching the user profile.
   * This is called on mount and can be called manually to refresh auth state.
   */
  const checkAuthStatus = useCallback(async () => {
    setLoading(true);

    try {
      // Fetch user profile (JWT cookie is sent automatically)
      const profile = await apiClient<User>("/auth/profile", {
        method: "GET",
        credentials: "include", // Send HTTP-only cookie
      });

      setUser(profile);

      // Store userId in localStorage for non-auth API calls (e.g., analytics)
      if (profile.id) {
        localStorage.setItem("userId", profile.id);
      }
    } catch (error) {
      // 401 means not logged in (expected for unauthenticated users)
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        localStorage.removeItem("userId");
        return;
      }

      // Other errors are unexpected
      reportClientError("Failed to fetch user profile", error);
      setUser(null);
      localStorage.removeItem("userId");
    } finally {
      setLoading(false);
    }
  }, []);

  // On mount: fetch CSRF token, then check auth status
  useEffect(() => {
    void (async () => {
      try {
        // Fetch CSRF token first (needed for state-changing requests)
        await fetchCsrfToken();
      } catch (error) {
        // Non-fatal: CSRF might be disabled
        reportClientWarning("Failed to fetch CSRF token", error);
      }

      // Check if user is authenticated
      await checkAuthStatus();
    })();
  }, [checkAuthStatus]);

  /**
   * Logs out the current user.
   * Calls the logout endpoint, then clears local state regardless of success.
   */
  const logout = async () => {
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
      setUser(null);
      localStorage.removeItem("userId");
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout, checkAuthStatus }}>
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
