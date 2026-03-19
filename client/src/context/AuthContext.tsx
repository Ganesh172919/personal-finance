import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

import { apiClient, fetchCsrfToken } from "@/services/api";
import { reportClientError, reportClientWarning } from "@/lib/runtimeLogger";

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

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  checkAuthStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuthStatus = useCallback(async () => {
    setLoading(true);

    try {
      const profile = await apiClient<User>("/auth/profile", {
        method: "GET",
        credentials: "include",
      });

      setUser(profile);

      if (profile.id) {
        localStorage.setItem("userId", profile.id);
      }
    } catch (error) {
      reportClientError("Failed to fetch user profile", error);
      setUser(null);
      localStorage.removeItem("userId");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await fetchCsrfToken();
      } catch (error) {
        reportClientWarning("Failed to fetch CSRF token", error);
      }

      await checkAuthStatus();
    })();
  }, [checkAuthStatus]);

  const logout = async () => {
    try {
      await apiClient("/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      reportClientError("Logout failed", error);
    } finally {
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

export function useAuth() {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
