// This utility function is the central point for all API communication
// between your React frontend and your Node.js backend. It's a generic
// wrapper around the native `fetch` API to standardize requests and error handling.

import type { AiCoreStatusResponse, ProcessAICommandResponse } from "@/types/ai.types";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") || "/api";

const buildApiUrl = (endpoint: string) => {
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${API_BASE_URL}${normalizedEndpoint}`;
};

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // Set up the default headers for all outgoing requests.
  // We will primarily be working with JSON data, so we set this as a default.
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  // Configure the request. The 'credentials: "include"' option is the
  // most important part for our httpOnly cookie authentication strategy.
  // It tells the browser to automatically send any relevant cookies
  // (like our auth cookie) with this request. Without this, the backend
  // would never receive the authentication cookie.
  const config: RequestInit = {
    ...options,
    headers,
    credentials: "include",
  };

  // Construct the full API URL. The '/api' prefix is a common convention.
  // In `vite.config.ts`, we've set up a proxy to forward any request
  // starting with '/api' to our backend server (e.g., http://localhost:3000).
  const response = await fetch(buildApiUrl(endpoint), config);

  // This is our central error handling logic. It's crucial for a good user experience.
  // If the server responds with an error status (e.g., 401 Unauthorized, 404 Not Found),
  // we need to handle it gracefully instead of letting the application crash.
  if (!response.ok) {
    // We try to parse a JSON error message from the response body.
    // A well-designed backend will send a helpful message here (e.g., "Invalid password").
    // The .catch() block handles cases where the server sends a non-JSON error
    // (like a plain text "500 Internal Server Error"), preventing another crash.
    const errorData = await response.json().catch(() => ({
      message: `Request failed with status: ${response.status}`,
    }));

    // We throw a new Error with the message from the server. This allows our
    // React components (or hooks like `useAuth`) to use a try/catch block
    // to handle API errors and display appropriate messages to the user.
    throw new Error(errorData.message || "An unknown API error occurred");
  }

  // If the request was successful (status 200-299), we parse the JSON from the
  // response body and return it. The generic type <T> ensures that the caller
  // gets back a fully typed object, which provides great autocompletion and
  // prevents bugs in the rest of the application.
  return response.json();
}

// Add these helper functions to your existing apiClient.ts

export async function processAICommand(command: string): Promise<ProcessAICommandResponse> {
  return apiClient("/process-command", {
    method: "POST",
    body: JSON.stringify({ command }),
  });
}

export async function getAiCoreStatus(): Promise<AiCoreStatusResponse> {
  return apiClient("/ai-core/status");
}

export async function processScenario(parameters: any): Promise<any> {
  return apiClient("/scenarios/what-if", {
    method: "POST",
    body: JSON.stringify({ parameters }),
  });
}

export async function getFinancialProfile(_userId?: string): Promise<any> {
  return apiClient("/financial-profiles/me");
}

export async function getAgentOutputs(userId: string): Promise<any> {
  return apiClient(`/agent-outputs/user/${userId}`);
}

export type TransactionType = "income" | "expense" | "investment";

export interface TransactionPayload {
  amount: number;
  category: string;
  description: string;
  type: TransactionType;
  date?: string;
}

export interface TransactionsQuery {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  type?: TransactionType;
  category?: string;
}

export interface TransactionsResponse {
  transactions: Array<{
    id: string;
    amount: number;
    category: string;
    description: string;
    date: string;
    type: TransactionType;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function getTransactions(query: TransactionsQuery = {}): Promise<TransactionsResponse> {
  const params = new URLSearchParams();

  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.type) params.set("type", query.type);
  if (query.category) params.set("category", query.category);

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiClient(`/transactions${suffix}`);
}

export interface RecentTransactionsResponse {
  transactions: TransactionsResponse["transactions"];
}

export async function getRecentTransactions(limit = 5): Promise<RecentTransactionsResponse> {
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 5));
  return apiClient(`/transactions/recent?limit=${safeLimit}`);
}

export interface TransactionsSummaryResponse {
  period: {
    from: string; // YYYY-MM-DD
    to: string; // YYYY-MM-DD
    groupBy: string;
  };
  monthly: Array<{
    month: string; // YYYY-MM
    income: number;
    expense: number;
    net: number;
  }>;
  top_categories: Array<{
    category: string;
    amount: number;
    percentage: number;
  }>;
  top_categories_month: string; // YYYY-MM
  cache_hit?: boolean;
}

export async function getTransactionsSummary(params: {
  from: string;
  to: string;
  groupBy?: "month";
  topCategories?: number;
}): Promise<TransactionsSummaryResponse> {
  const groupBy = params.groupBy || "month";
  const top = Math.max(1, Math.min(20, Number(params.topCategories) || 6));
  const qs = new URLSearchParams({
    from: params.from,
    to: params.to,
    groupBy,
    topCategories: String(top)
  });
  return apiClient(`/transactions/summary?${qs.toString()}`);
}

export async function createTransaction(payload: TransactionPayload): Promise<any> {
  return apiClient("/transactions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateTransaction(id: string, payload: Partial<TransactionPayload>): Promise<any> {
  return apiClient(`/transactions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteTransaction(id: string): Promise<any> {
  return apiClient(`/transactions/${id}`, {
    method: "DELETE",
  });
}
