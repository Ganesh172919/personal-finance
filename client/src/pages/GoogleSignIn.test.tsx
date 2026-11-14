import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

import Login from "./Login";
import Register from "./Register";

const mocks = vi.hoisted(() => ({ apiClient: vi.fn(), checkAuthStatus: vi.fn() }));

vi.mock("@/lib/apiClient", () => ({
  apiClient: mocks.apiClient,
  ApiError: class extends Error {
    requestId?: string;
  },
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, loading: false, checkAuthStatus: mocks.checkAuthStatus }),
}));
vi.mock("@/hooks/useToast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const show = (ui: JSX.Element, path: string) => {
  const location = memoryLocation({ path });
  return render(
    <Router hook={location.hook} searchHook={location.searchHook}>
      {ui}
    </Router>
  );
};

const setProviders = (google: boolean) =>
  mocks.apiClient.mockImplementation(async (url: string) => {
    if (url === "/auth/providers") return { email: true, google };
    throw new Error(`unexpected request ${url}`);
  });

let originalLocation: Location;
beforeEach(() => {
  mocks.apiClient.mockReset();
  mocks.checkAuthStatus.mockReset();
  sessionStorage.clear();
  originalLocation = window.location;
  Object.defineProperty(window, "location", { configurable: true, value: { href: "http://localhost/login" } });
});
afterEach(() => {
  cleanup();
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
});

describe("Continue with Google (Login)", () => {
  it("is hidden when the server reports google:false", async () => {
    setProviders(false);
    show(<Login />, "/login");
    await waitFor(() => expect(mocks.apiClient).toHaveBeenCalledWith("/auth/providers", { method: "GET" }));
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
  });

  it("is shown when google:true and starts the server-side flow, keeping ?next=", async () => {
    setProviders(true);
    show(<Login />, "/login?next=%2Fanalytics");
    const button = await screen.findByRole("button", { name: "Continue with Google" });
    fireEvent.click(button);
    expect(window.location.href).toBe("/api/auth/google?next=%2Fanalytics");
  });

  it("drops an open-redirect next value", async () => {
    setProviders(true);
    show(<Login />, "/login?next=%2F%2Fevil.example.com");
    fireEvent.click(await screen.findByRole("button", { name: "Continue with Google" }));
    expect(window.location.href).toBe("/api/auth/google");
  });

  it("shows a clear banner for ?error= from a failed OAuth round trip", async () => {
    setProviders(true);
    show(<Login />, "/login?error=google_unverified_email");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/verified/i);
  });

  it("never reflects an unknown error value", async () => {
    setProviders(false);
    show(<Login />, "/login?error=%3Cb%3Eevil%3C%2Fb%3E");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Sign-in failed. Please try again.");
  });

  it("shows no banner without an error", async () => {
    setProviders(false);
    show(<Login />, "/login");
    await waitFor(() => expect(mocks.apiClient).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("waits for the second factor after a password-only response", async () => {
    mocks.apiClient.mockImplementation(async (url: string, options?: { body?: string }) => {
      if (url === "/auth/providers") return { email: true, google: false };
      if (url === "/auth/login") return options?.body?.includes("twoFactorCode") ? { id: "user" } : { two_factor_required: true };
      throw new Error(`unexpected request ${url}`);
    });
    show(<Login />, "/login");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Initial-Pass1" } });
    fireEvent.click(screen.getByRole("button", { name: "Login" }));
    const code = await screen.findByLabelText("Authentication code");
    expect(mocks.checkAuthStatus).not.toHaveBeenCalled();
    fireEvent.change(code, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    await waitFor(() => expect(mocks.checkAuthStatus).toHaveBeenCalledTimes(1));
    expect(mocks.apiClient).toHaveBeenCalledWith("/auth/login", expect.objectContaining({
      body: JSON.stringify({ email: "user@example.com", password: "Initial-Pass1", twoFactorCode: "123456" }),
    }));
  });

  it("completes Google MFA without asking for the Google account password", async () => {
    mocks.apiClient.mockImplementation(async (url: string) => {
      if (url === "/auth/providers") return { email: true, google: true };
      if (url === "/auth/2fa/complete") return { next: "/analytics" };
      throw new Error(`unexpected request ${url}`);
    });
    show(<Login />, "/login?mfa=required");
    expect(screen.queryByLabelText("Password")).toBeNull();
    fireEvent.change(screen.getByLabelText("Authentication code"), { target: { value: "ABCD-1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    await waitFor(() => expect(mocks.checkAuthStatus).toHaveBeenCalledTimes(1));
    expect(mocks.apiClient).toHaveBeenCalledWith("/auth/2fa/complete", {
      method: "POST", body: JSON.stringify({ code: "ABCD-1234" }),
    });
    expect(sessionStorage.getItem("finwise.post_auth_redirect")).toBe("/analytics");
  });
});

describe("Continue with Google (Register)", () => {
  it("is hidden when google:false", async () => {
    setProviders(false);
    show(<Register />, "/register");
    await waitFor(() => expect(mocks.apiClient).toHaveBeenCalledWith("/auth/providers", { method: "GET" }));
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
  });

  it("is shown when google:true and forwards the referral code", async () => {
    setProviders(true);
    show(<Register />, "/register?ref=8jq2k7m9pa");
    const button = await screen.findByRole("button", { name: "Continue with Google" });
    fireEvent.click(button);
    expect(window.location.href).toBe("/api/auth/google?ref=8JQ2K7M9PA");
  });
});
