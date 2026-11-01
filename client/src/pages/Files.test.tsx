import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import FilesPage from "./Files";

const api = vi.hoisted(() => ({ listWorkspaceFiles: vi.fn(), getWorkspaceFile: vi.fn() }));
vi.mock("@/lib/api/files", () => ({ ...api,
  analyzeWorkspaceFile: vi.fn(), deleteWorkspaceFile: vi.fn(), uploadWorkspaceFiles: vi.fn(),
}));
vi.mock("@/hooks/useToast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
const clients: QueryClient[] = [];
function showPage(path = "/files") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const location = memoryLocation({ path, record: true });
  render(<Router hook={location.hook}><QueryClientProvider client={client}><FilesPage /></QueryClientProvider></Router>);
  return location;
}
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.resetAllMocks(); });
const file = { id: "507f1f77bcf86cd799439011", originalName: "sample.pdf", kind: "document", status: "processed",
  fileId: "qa-media", sizeBytes: 1000, extractedPreview: "Income", extractedText: "Income\fPayment terms",
  extractedPageCount: 2, extractionWarnings: [] };
const list = { files: [file], pagination: { page: 1, totalPages: 1 } };

it("shows a recoverable list failure instead of claiming the workspace is empty", async () => {
  api.listWorkspaceFiles.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(list);
  showPage();
  expect(await screen.findByRole("alert")).toHaveTextContent("files could not be loaded");
  expect(screen.queryByText("No workspace files yet")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("button", { name: /sample.pdf/ })).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
});

it("recovers a failed detail request and exposes the stored PDF pages", async () => {
  api.listWorkspaceFiles.mockResolvedValue(list);
  api.getWorkspaceFile.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce({ file });
  showPage();
  fireEvent.click(await screen.findByRole("button", { name: /sample.pdf/ }));
  const dialog = await screen.findByRole("dialog");
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("File details could not be loaded");
  fireEvent.click(within(dialog).getByRole("button", { name: "Try again" }));
  expect(await within(dialog).findByRole("textbox", { name: "Extracted text, page 1" })).toHaveValue("Income");
  fireEvent.click(within(dialog).getByRole("button", { name: "Next extracted page" }));
  expect(within(dialog).getByRole("textbox", { name: "Extracted text, page 2" })).toHaveValue("Payment terms");
});

it("opens an exact file page from a citation, updates its URL and clears the selection on close", async () => {
  api.listWorkspaceFiles.mockResolvedValue(list);
  api.getWorkspaceFile.mockResolvedValue({ file });
  const location = showPage(`/files?file=${file.id}&page=2`);
  const dialog = await screen.findByRole("dialog");
  expect(await within(dialog).findByRole("textbox", { name: "Extracted text, page 2" })).toHaveValue("Payment terms");
  expect(api.getWorkspaceFile).toHaveBeenCalledWith(file.id);
  fireEvent.click(within(dialog).getByRole("button", { name: "Previous extracted page" }));
  expect(within(dialog).getByRole("textbox", { name: "Extracted text, page 1" })).toHaveValue("Income");
  expect(location.history.at(-1)).toBe(`/files?file=${file.id}&page=1`);
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(location.history.at(-1)).toBe("/files");
});

it("ignores an invalid file reference without making a detail request", async () => {
  api.listWorkspaceFiles.mockResolvedValue(list);
  showPage("/files?file=https%3A%2F%2Fexample.com&page=4");
  await screen.findByRole("button", { name: /sample.pdf/ });
  expect(api.getWorkspaceFile).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("keeps the conversation return path while paging and returns there when the source closes", async () => {
  const chatPath = "/chat/507f1f77bcf86cd799439022";
  api.listWorkspaceFiles.mockResolvedValue(list);
  api.getWorkspaceFile.mockResolvedValue({ file });
  const location = showPage(`/files?file=${file.id}&page=2&returnTo=${encodeURIComponent(chatPath)}`);
  const dialog = await screen.findByRole("dialog");
  expect(await within(dialog).findByRole("textbox", { name: "Extracted text, page 2" })).toHaveValue("Payment terms");
  expect(within(dialog).getByRole("link", { name: "Back to chat" })).toHaveAttribute("href", chatPath);
  fireEvent.click(within(dialog).getByRole("button", { name: "Previous extracted page" }));
  const pagedUrl = new URL(location.history.at(-1)!, "http://localhost");
  expect(pagedUrl.searchParams.get("returnTo")).toBe(chatPath);
  expect(pagedUrl.searchParams.get("page")).toBe("1");
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  expect(location.history.at(-1)).toBe(chatPath);
});

it("does not offer or follow an untrusted return destination", async () => {
  api.listWorkspaceFiles.mockResolvedValue(list);
  api.getWorkspaceFile.mockResolvedValue({ file });
  const location = showPage(`/files?file=${file.id}&returnTo=https%3A%2F%2Fexample.com`);
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByRole("textbox", { name: "Extracted text, page 1" });
  expect(within(dialog).queryByRole("link", { name: "Back to chat" })).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  expect(location.history.at(-1)).toBe("/files");
});
