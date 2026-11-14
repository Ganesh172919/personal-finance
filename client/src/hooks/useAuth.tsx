// Re-exports authentication context providers and consumption hooks from context.
// Provides global access to active session credentials, login routines, and user state.
// Simplifies import paths across client UI components requiring authentication data.
export { AuthProvider, useAuth } from "@/context/AuthContext";
