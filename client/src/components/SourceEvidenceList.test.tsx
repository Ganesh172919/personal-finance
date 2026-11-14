import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SourceEvidenceList } from "./SourceEvidenceList";
import { readChatReturnPath, readSourcePage } from "@/lib/fileReferences";
import type { EvidenceItem } from "@/types/evidence.types";

afterEach(cleanup);
const fileId = "507f1f77bcf86cd799439011";

it("prioritizes a cited passage and makes every source available", () => {
  const items: EvidenceItem[] = Array.from({ length: 5 }, (_, index) => ({ id: String(index), type: "budget", label: `Budget ${index}` }));
  items.push({ id: "clause", type: "retrieval_chunk", label: "loan.pdf · page 4", entity_id: fileId,
    page_number: 4, snippet: "Prepayment fee USD 25" });
  render(<SourceEvidenceList items={items} />);
  const list = screen.getByRole("list");
  expect(within(list).getAllByRole("listitem")).toHaveLength(4);
  expect(within(list).getAllByRole("listitem")[0]).toHaveTextContent("loan.pdf");
  expect(screen.getByRole("link", { name: "Open source: loan.pdf · page 4" }))
    .toHaveAttribute("href", `/files?file=${fileId}&page=4`);
  fireEvent.click(screen.getByRole("button", { name: "Show all 6 sources" }));
  expect(within(list).getAllByRole("listitem")).toHaveLength(6);
  expect(screen.getByText("Budget 4")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Show fewer sources" }));
  expect(within(list).getAllByRole("listitem")).toHaveLength(4);
});

it("keeps non-file and malformed references as plain evidence", () => {
  render(<SourceEvidenceList items={[
    { type: "budget", entity_id: fileId, label: "Budget" },
    { type: "file", entity_id: "javascript:alert(1)", label: "Untrusted reference" },
    { type: "retrieval_chunk", entity_id: "../../settings", label: "Invalid reference" },
  ]} />);
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.getAllByRole("listitem")).toHaveLength(3);
});

it("opens legacy file references without guessing a page from their label", () => {
  render(<SourceEvidenceList items={[{ type: "file", entity_id: fileId, label: "loan.pdf · page 4" }]} />);
  expect(screen.getByRole("link")).toHaveAttribute("href", `/files?file=${fileId}`);
});

it("rejects malformed page query parameters", () => {
  for (const value of [null, "-1", "0", "1.5", "1e3", "9007199254740992", "https://example.com"]) {
    expect(readSourcePage(value)).toBe(1);
  }
  expect(readSourcePage("4")).toBe(4);
});

it("carries a safe conversation return path in source links", () => {
  const chatPath = `/chat/${fileId}`;
  render(<SourceEvidenceList returnTo={chatPath} items={[{
    type: "retrieval_chunk", entity_id: fileId, page_number: 4, label: "Loan terms",
  }]} />);
  const source = new URL(screen.getByRole("link").getAttribute("href")!, "http://localhost");
  expect(source.pathname).toBe("/files");
  expect(source.searchParams.get("page")).toBe("4");
  expect(source.searchParams.get("returnTo")).toBe(chatPath);
});

it("rejects external and unrelated return destinations", () => {
  for (const value of [undefined, null, "https://example.com", "//example.com", "javascript:alert(1)", "/settings", "/chat/invalid", `/chat/${fileId}?redirect=https://example.com`]) {
    expect(readChatReturnPath(value)).toBeNull();
  }
  render(<SourceEvidenceList returnTo="https://example.com" items={[{ type: "file", entity_id: fileId }]} />);
  expect(screen.getByRole("link")).toHaveAttribute("href", `/files?file=${fileId}`);
});
