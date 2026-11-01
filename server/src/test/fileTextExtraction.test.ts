import { describe, expect, it } from "vitest";

import { extractWorkspaceFileText } from "../services/fileTextExtraction";
import { chunkWorkspaceTextForRetrieval } from "../services/retrievalService";
import { createTextPdf } from "./pdfTestHelpers";

const extractPdf = async (pages: string[]) => extractWorkspaceFileText({
  buffer: await createTextPdf(pages), mimeType: "application/pdf", fileName: "loan.pdf", requestId: "pdf-pages-test",
});

describe("PDF text extraction", () => {
  it("retains physical page boundaries including leading, middle and trailing blank pages", async () => {
    const result = await extractPdf(["", "Income USD 7500", "", "Prepayment fee USD 25", ""]);
    expect(result.pageCount).toBe(5);
    const pages = result.text.split("\f");
    expect(pages).toHaveLength(5);
    expect(pages[0]).toBe("");
    expect(pages[2]).toBe("");
    expect(pages[4]).toBe("");
    expect(pages[1]).toContain("Income USD 7500");
    expect(pages[3]).toContain("Prepayment fee USD 25");
    expect(result.text).not.toMatch(/-- \d+ of \d+ --/);
    expect(result.preview).not.toContain("\f");
    expect(result.warnings.join(" ")).toContain("no selectable text");
    expect(chunkWorkspaceTextForRetrieval({ text: result.text, pageCount: result.pageCount })
      .map((chunk) => chunk.pageNumber)).toEqual([2, 4]);
  });

  it("gives an explicitly parsed single-page PDF page 1 without inventing pages for old text", async () => {
    const result = await extractPdf(["Loan repayment terms"]);
    expect(result.pageCount).toBe(1);
    expect(chunkWorkspaceTextForRetrieval({ text: result.text, pageCount: result.pageCount })[0]?.pageNumber).toBe(1);
    expect(chunkWorkspaceTextForRetrieval({ text: "Old flattened PDF text", fileName: "old.pdf" })[0]?.pageNumber).toBeUndefined();
  });

  it("does not turn a blank PDF into page-marker evidence", async () => {
    const result = await extractPdf(["", ""]);
    expect(result.pageCount).toBe(2);
    expect(result.text).toBe("\f");
    expect(result.preview).toBe("");
    expect(chunkWorkspaceTextForRetrieval({ text: result.text, pageCount: result.pageCount })).toEqual([]);
  });

  it("keeps extraction bounded and warns when later content is omitted", async () => {
    const result = await extractWorkspaceFileText({ buffer: Buffer.from("A".repeat(25_000)),
      mimeType: "text/plain", fileName: "long.txt", requestId: "truncation-test" });
    expect(result.text).toHaveLength(24_000);
    expect(result.preview).toHaveLength(1_800);
    expect(result.text.endsWith("...")).toBe(true);
    expect(result.warnings.join(" ")).toContain("Later content may be missing");
    expect(result.pageCount).toBeUndefined();
  });
});
