import { apiClient } from "./core";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  photoURL?: string;
};

export async function getMyAuthProfile(): Promise<AuthUser> {
  return apiClient("/auth/profile", { method: "GET" });
}

export async function logout(): Promise<{ message?: string }> {
  return apiClient("/auth/logout", { method: "POST" });
}

