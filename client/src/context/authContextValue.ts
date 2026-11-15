import { createContext, type Context } from "react";

export interface User {
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
  authError: string | null;
  logout: () => Promise<void>;
  checkAuthStatus: () => Promise<void>;
}

// Preserve context identity when Vite refreshes the provider and consumers separately.
const hotData = import.meta.hot?.data;
export const AuthContext: Context<AuthContextType | undefined> =
  hotData?.authContext ?? createContext<AuthContextType | undefined>(undefined);

if (hotData) hotData.authContext = AuthContext;
