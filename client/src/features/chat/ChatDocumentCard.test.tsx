import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatDocumentCard } from "./ChatDocumentCard";
import { downloadAuthenticatedFile, triggerBrowserDownload } from "@/lib/api/v1/exports";

vi.mock("@/lib/api/v1/exports", () => ({ downloadAuthenticatedFile: vi.fn(), triggerBrowserDownload: vi.fn() }));

afterEach(cleanup);
const document = { workspaceFileId: "507f1f77bcf86cd799439011", fileId: "507f1f77bcf86cd799439012", title: "Student budget", filename: "student_budget.pdf", mimeType: "application/pdf", sizeBytes: 2048 };

describe("created document card", () => {
  it("links downloads through the authenticated route and returns file review to its chat", () => {
    render(<ChatDocumentCard document={document} returnTo="/chat/507f1f77bcf86cd799439013" />);
    expect(screen.getByRole("link", { name: "Download PDF" })).toHaveAttribute("href", "/api/files/rendered/507f1f77bcf86cd799439012/download");
    expect(screen.getByRole("link", { name: "Open in Files" })).toHaveAttribute("href", "/files?file=507f1f77bcf86cd799439011&returnTo=%2Fchat%2F507f1f77bcf86cd799439013");
    expect(screen.getByRole("region")).toHaveTextContent("2 KB");
  });
  it("fetches the generated file through the authenticated download helper", async () => {
    const file = { blob: new Blob(["%PDF-"]), filename: "student_budget.pdf", contentType: "application/pdf" };
    vi.mocked(downloadAuthenticatedFile).mockResolvedValueOnce(file);
    render(<ChatDocumentCard document={document} returnTo="/chat/cloud/507f1f77bcf86cd799439013" />);
    fireEvent.click(screen.getByRole("link", { name: "Download PDF" }));
    await waitFor(() => expect(triggerBrowserDownload).toHaveBeenCalledWith(file));
    expect(downloadAuthenticatedFile).toHaveBeenCalledWith(`/files/rendered/${document.fileId}/download`, document.filename);
    expect(screen.getByRole("status")).toHaveTextContent("Sent to browser downloads");
    expect(screen.getByRole("link", { name: "Open in Files" }).getAttribute("href")).toContain("returnTo=%2Fchat%2Fcloud%2F");
  });
  it("does not render malformed file references from persisted metadata", () => {
    render(<ChatDocumentCard document={{ ...document, fileId: "https://example.com" }} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
  it("selects the saved document for a follow-up question without downloading it", () => {
    const onUseDocument = vi.fn();
    render(<ChatDocumentCard document={document} onUseDocument={onUseDocument} />);
    fireEvent.click(screen.getByRole("button", { name: "Ask about this PDF" }));
    expect(onUseDocument).toHaveBeenCalledWith({ workspaceFileId: document.workspaceFileId, fileId: document.fileId, originalName: document.filename, mimeType: "application/pdf", sizeBytes: 2048 });
  });
  it("does not change selected context while a message is sending", () => {
    render(<ChatDocumentCard document={document} onUseDocument={vi.fn()} disabled />);
    expect(screen.getByRole("button", { name: "Ask about this PDF" })).toBeDisabled();
  });
  it("renders format badge and page count badge when provided", () => {
    render(
      <ChatDocumentCard
        document={{
          ...document,
          format: "executive_brief",
          pageCount: 3,
        }}
      />
    );
    expect(screen.getByTestId("badge-doc-format-507f1f77bcf86cd799439012")).toHaveTextContent("Executive Brief");
    expect(screen.getByTestId("badge-doc-pages-507f1f77bcf86cd799439012")).toHaveTextContent("3 pages");
  });
});
