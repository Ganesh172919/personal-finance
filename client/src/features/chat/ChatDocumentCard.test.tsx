import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatDocumentCard } from "./ChatDocumentCard";

afterEach(cleanup);
const document = { workspaceFileId: "507f1f77bcf86cd799439011", fileId: "507f1f77bcf86cd799439012", title: "Student budget", filename: "student_budget.pdf", mimeType: "application/pdf", sizeBytes: 2048 };

describe("created document card", () => {
  it("links downloads through the authenticated route and returns file review to its chat", () => {
    render(<ChatDocumentCard document={document} returnTo="/chat/507f1f77bcf86cd799439013" />);
    expect(screen.getByRole("link", { name: "Download PDF" })).toHaveAttribute("href", "/api/files/rendered/507f1f77bcf86cd799439012/download");
    expect(screen.getByRole("link", { name: "Open in Files" })).toHaveAttribute("href", "/files?file=507f1f77bcf86cd799439011&returnTo=%2Fchat%2F507f1f77bcf86cd799439013");
    expect(screen.getByRole("region")).toHaveTextContent("2 KB");
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
});
