import { describe, expect, it } from "vitest";

import { previewPdfRequestSections } from "../services/pdfRequestServer";
import { chunkWorkspaceTextForRetrieval } from "../services/retrievalService";

describe("retrievalService", () => {
  it("bounds unbroken OCR text and preserves its contents through overlapping windows", () => {
    const text = "a".repeat(20_000) + "FINAL_PAYMENT_CLAUSE";
    const chunks = chunkWorkspaceTextForRetrieval({ text });
    expect(chunks.length).toBeGreaterThan(10);
    expect(chunks.every((chunk) => chunk.text.length > 0 && chunk.text.length <= 1800)).toBe(true);
    expect(chunks.at(-1)?.text).toContain("FINAL_PAYMENT_CLAUSE");
    expect(chunks[0]!.text.slice(-260)).toBe(chunks[1]!.text.slice(0, 260));
  });

  it("does not create a redundant overlap chunk at the end of an exact window", () => {
    expect(chunkWorkspaceTextForRetrieval({ text: "a".repeat(1800) })).toHaveLength(1);
  });

  it("preserves page boundaries supplied by the extractor, including empty pages", () => {
    const chunks = chunkWorkspaceTextForRetrieval({ text: "# Loan terms\nPrepayment fee\f\f# Coverage\nDeductible" });
    expect(chunks.map((chunk) => chunk.pageNumber)).toEqual([1, 3]);
    expect(chunks[1]?.sectionTitle).toBe("Coverage");
    expect(chunkWorkspaceTextForRetrieval({ text: "\fLoan terms" })[0]?.pageNumber).toBe(2);
  });

  it("omits blank chunks and removes null bytes", () => {
    expect(chunkWorkspaceTextForRetrieval({ text: " \r\n\u0000\f " })).toEqual([]);
    expect(chunkWorkspaceTextForRetrieval({ text: "Loan" + " ".repeat(4000) + "terms" })
      .every((chunk) => chunk.text.length > 0)).toBe(true);
  });

  it("chunks long workspace text into multiple retrieval chunks", () => {
    const sample = Array.from({ length: 12 }, (_, index) =>
      `SECTION ${index + 1}\nThis is a detailed paragraph about recurring subscriptions, credit card payments, and monthly cash flow trends for period ${index + 1}. ` +
      "The section also includes extra notes about merchant variance, bill timing, emergency funding, and debt servicing cadence. ".repeat(8)
    ).join("\n\n");

    const chunks = chunkWorkspaceTextForRetrieval({
      text: sample,
      fileName: "statement.txt",
      sourceKind: "document",
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.sourceKind).toBe("document");
    expect(chunks[0]?.tokenCountEstimate).toBeGreaterThan(0);
  });
});

describe("pdfRequestServer", () => {
  it("extracts headings and body sections from prompt text", () => {
    const sections = previewPdfRequestSections(
      "# Monthly Review\n\n- Highlight budget drift\n- List next actions\n\nAUDIENCE\nTeam finance review"
    );

    expect(sections.length).toBeGreaterThanOrEqual(2);
    expect(sections[0]?.heading).toBe("Monthly Review");
    expect(sections.some((section) => section.heading === "AUDIENCE")).toBe(true);
  });
});
