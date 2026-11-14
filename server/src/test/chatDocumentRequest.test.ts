import { describe, expect, it } from "vitest";
import { parseChatDocumentRequest } from "../services/chatDocuments";

describe("Chat document request titles", () => {
  it.each([
    ['"', '"'], ["'", "'"], ["“", "”"], ["‘", "’"],
  ])("ends a quoted title at %s…%s before following instructions", (open, close) => {
    const result = parseChatDocumentRequest(`Create a PDF document titled ${open}Saved-finances review - 8 November 2026${close} using only my saved financial profile and recorded transactions. Mark missing values as unavailable.`);
    expect(result).toEqual({ title: "Saved-finances review - 8 November 2026", content: "" });
  });

  it("preserves explicit content and quoted punctuation", () => {
    expect(parseChatDocumentRequest('Create a PDF named "Q4. Savings review" using my saved finances. Content:\n# Review\nConfirm balances.'))
      .toEqual({ title: "Q4. Savings review", content: "# Review\nConfirm balances." });
  });

  it("keeps existing unquoted title and format support", () => {
    expect(parseChatDocumentRequest("Create a report named Monthly Review --format=executive_brief. Content:Review recorded balances."))
      .toEqual({ title: "Monthly Review", content: "Review recorded balances.", format: "executive_brief" });
    expect(parseChatDocumentRequest("Explain how to create a PDF titled Example")).toBeNull();
  });
});
