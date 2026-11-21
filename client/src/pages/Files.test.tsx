import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import FilesPage from "./Files";

const api = vi.hoisted(() => ({
  listWorkspaceFiles: vi.fn(),
  getWorkspaceFile: vi.fn(),
  searchWorkspaceChunks: vi.fn(),
  queryDocumentQA: vi.fn(),
  createAuthoredDocument: vi.fn(),
}));
vi.mock("@/lib/api/files", () => ({ ...api,
  analyzeWorkspaceFile: vi.fn(), deleteWorkspaceFile: vi.fn(), uploadWorkspaceFiles: vi.fn(),
}));
const unifiedApi = vi.hoisted(() => ({
  getUnifiedContext: vi.fn(),
  searchUnifiedContextPost: vi.fn(),
}));
vi.mock("@/lib/api/unifiedContext", () => ({ ...unifiedApi }));
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


const sampleAuthoredResult = {
  success: true,
  document: {
    workspaceFileId: "507f1f77bcf86cd799439011",
    fileId: "qa-media",
    title: "Executive Financial Advisory Brief - Q4 2026",
    filename: "executive_financial_advisory_brief.pdf",
    format: "executive_brief" as const,
    mimeType: "application/pdf",
    sizeBytes: 15400,
    pageCount: 2,
  },
};

const sampleDocQaResult = {
  success: true,
  question: "What is my total tax liability on Form 1040?",
  groundingScore: 0.85,
  isGrounded: true,
  passages: [
    {
      id: "chunk_tax_2",
      workspaceFileId: "507f1f77bcf86cd799439011",
      fileId: "qa-media",
      fileName: "sample.pdf",
      pageNumber: 2,
      chunkIndex: 1,
      modality: "table" as const,
      text: "Line 24: Total Tax Liability: $13,200.00\nLine 25a: Federal Income Tax Withheld: $15,000.00",
      snippet: "Line 24: Total Tax Liability: $13,200.00",
      citation: "[sample.pdf:p2:c1]",
      confidence: 0.85,
      isGrounded: true,
      entities: { amounts: [13200, 15000] },
    },
  ],
  directAnswer: 'According to Page 2 of sample.pdf: "Line 24: Total Tax Liability: $13,200.00". Identified amounts: $13,200.00, $15,000.00.',
  physicalPages: [2],
  total: 1,
  sourceFilesCount: 1,
  modalityBreakdown: { table: 1 },
};


it("shows a recoverable list failure instead of claiming the workspace is empty", async () => {
  api.listWorkspaceFiles.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(list);
  showPage();
  expect(await screen.findByRole("alert")).toHaveTextContent("files could not be loaded");
  expect(screen.queryByText("No workspace files yet")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("button", { name: /sample.pdf/ })).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
});

it("does not describe a file whose extraction failed as ready", async () => {
  api.listWorkspaceFiles.mockResolvedValue({ ...list, files: [{ ...file, id: "507f1f77bcf86cd799439012",
    originalName: "broken.pdf", status: "error", extractedPreview: "", extractedText: "" }] });
  showPage();
  const card = await screen.findByRole("button", { name: /broken\.pdf/ }, { timeout: 5000 });
  expect(card).toHaveTextContent("Text could not be extracted from this file");
  expect(card).not.toHaveTextContent("Stored and ready");
});

it("recovers a failed detail request and exposes the stored PDF pages", async () => {
  api.listWorkspaceFiles.mockResolvedValue(list);
  api.getWorkspaceFile.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce({ file });
  showPage();
  fireEvent.click(await screen.findByRole("button", { name: /sample.pdf/ }, { timeout: 5000 }));
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
  await screen.findByRole("button", { name: /sample.pdf/ }, { timeout: 5000 });
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

describe("Multi-Modal Grounded RAG Search Cockpit", () => {
  const sampleChunks = [
    {
      id: "chunk-table-1",
      workspaceFileId: file.id,
      fileId: file.fileId,
      chunkIndex: 0,
      text: "Date,Merchant,Category,Amount\n2026-03-01,Starbucks,Coffee,$5.50",
      snippet: "Date,Merchant,Category,Amount\n2026-03-01,Starbucks,Coffee,$5.50",
      score: 22.4,
      lexicalScore: 16,
      cosineSimilarity: 0.82,
      groundingConfidence: 0.88,
      isGrounded: true,
      citation: `[${file.id}:0]`,
      modality: "table" as const,
      entities: {
        merchants: ["STARBUCKS"],
        amounts: [5.5],
        dates: ["2026-03-01"],
      },
      sourceKind: "spreadsheet",
    },
    {
      id: "chunk-ocr-2",
      workspaceFileId: file.id,
      fileId: file.fileId,
      chunkIndex: 1,
      text: "STORE #102 COSTCO WHOLESALE\nTOTAL $263.50",
      snippet: "STORE #102 COSTCO WHOLESALE\nTOTAL $263.50",
      score: 18.2,
      lexicalScore: 12,
      cosineSimilarity: 0.74,
      groundingConfidence: 0.78,
      isGrounded: true,
      citation: `[${file.id}:1]`,
      modality: "image_ocr" as const,
      entities: {
        merchants: ["COSTCO"],
        amounts: [263.5],
      },
      sourceKind: "image",
    },
  ];

  it("switches to Multi-Modal Grounded RAG Search tab and renders search controls", async () => {
    api.listWorkspaceFiles.mockResolvedValue(list);
    showPage();

    const ragTabBtn = await screen.findByTestId("btn-tab-rag-search");
    fireEvent.click(ragTabBtn);

    expect(screen.getByTestId("card-rag-search-cockpit")).toBeInTheDocument();
    expect(screen.getByTestId("input-rag-search")).toBeInTheDocument();
    expect(screen.getByTestId("btn-rag-filter-all")).toBeInTheDocument();
    expect(screen.getByTestId("btn-rag-filter-table")).toBeInTheDocument();
    expect(screen.getByTestId("btn-rag-filter-image_ocr")).toBeInTheDocument();
    expect(screen.getByTestId("toggle-rag-grounded-only")).toBeInTheDocument();
  });

  it("triggers search and renders multi-modal chunks with citations, modality badges, and entities", async () => {
    api.listWorkspaceFiles.mockResolvedValue(list);
    api.searchWorkspaceChunks.mockResolvedValue({
      chunks: sampleChunks,
      total: 2,
      query: "Starbucks expenses",
      modality: "all",
    });

    showPage();
    fireEvent.click(await screen.findByTestId("btn-tab-rag-search"));

    const searchInput = screen.getByTestId("input-rag-search");
    fireEvent.change(searchInput, { target: { value: "Starbucks expenses" } });
    fireEvent.click(screen.getByTestId("btn-run-rag-search"));

    await waitFor(() => {
      expect(api.searchWorkspaceChunks).toHaveBeenCalledWith({
        query: "Starbucks expenses",
        modality: "all",
        minConfidence: undefined,
      });
    });

    expect(await screen.findByTestId("badge-modality-table")).toHaveTextContent(/Table/);
    expect(screen.getByTestId("badge-modality-image_ocr")).toHaveTextContent(/Receipt/);
    expect(screen.getByTestId(`badge-citation-chunk-table-1`)).toHaveTextContent(`[${file.id}:0]`);
    expect(screen.getByTestId(`badge-grounding-confidence-chunk-table-1`)).toHaveTextContent(/Grounded · 88%/);
    expect(screen.getAllByTestId("chip-entity-merchant")[0]).toHaveTextContent("STARBUCKS");
    expect(screen.getAllByTestId("chip-entity-amount")[0]).toHaveTextContent("$5.50");
  });

  it("filters search by modality button selection", async () => {
    api.listWorkspaceFiles.mockResolvedValue(list);
    api.searchWorkspaceChunks.mockResolvedValue({
      chunks: [sampleChunks[0]],
      total: 1,
      query: "Starbucks",
      modality: "table",
    });

    showPage();
    fireEvent.click(await screen.findByTestId("btn-tab-rag-search"));

    const searchInput = screen.getByTestId("input-rag-search");
    fireEvent.change(searchInput, { target: { value: "Starbucks" } });

    const tableFilterBtn = screen.getByTestId("btn-rag-filter-table");
    fireEvent.click(tableFilterBtn);

    await waitFor(() => {
      expect(api.searchWorkspaceChunks).toHaveBeenCalledWith({
        query: "Starbucks",
        modality: "table",
        minConfidence: undefined,
      });
    });

    expect(await screen.findByTestId("card-rag-chunk-chunk-table-1")).toBeInTheDocument();
  });

    const sampleUnifiedResults = [
    {
      id: "mem_rule_1",
      sourceType: "memory" as const,
      title: "Memory: dining_budget_rule",
      snippet: "Cap restaurant dining and take-out to $350 monthly.",
      score: 100,
      rrfScore: 0.021311,
      rank: 1,
      sourceScore: 28.5,
      citation: "memory:dining_budget_rule",
      metadata: {
        key: "dining_budget_rule",
        confidence: 0.95,
        source: "explicit",
      },
    },
    {
      id: "file_chunk_1",
      sourceType: "file" as const,
      title: "Bank_Statement_March.pdf (Discretionary)",
      snippet: "Monthly dining and entertainment expenditures reached $340.50 across 12 visits.",
      score: 85,
      rrfScore: 0.016393,
      rank: 2,
      sourceScore: 22.0,
      citation: "[file_1:0]",
      metadata: {
        workspaceFileId: "file_1",
        pageNumber: 2,
        modality: "text",
      },
    },
    {
      id: "txn_olive_garden",
      sourceType: "transaction" as const,
      title: "Olive Garden Italian (-$45.50)",
      snippet: "-$45.50 · Dining · 2026-10-25 · Family dinner meal",
      score: 72,
      rrfScore: 0.016129,
      rank: 3,
      sourceScore: 19.4,
      citation: "txn:garden",
      metadata: {
        amount: -45.5,
        currency: "USD",
        category: "Dining",
        merchantName: "Olive Garden Italian",
        date: "2026-10-25",
      },
    },
  ];

  describe("Unified Memory & Context Retrieval Cockpit", () => {
    it("switches to Unified Memory & Context tab and renders cockpit container", async () => {
      api.listWorkspaceFiles.mockResolvedValue(list);
      showPage();

      const unifiedTabBtn = await screen.findByTestId("btn-tab-unified-search");
      fireEvent.click(unifiedTabBtn);

      expect(screen.getByTestId("card-unified-context-cockpit")).toBeInTheDocument();
      expect(screen.getByTestId("input-unified-search")).toBeInTheDocument();
      expect(screen.getByTestId("btn-run-unified-search")).toBeInTheDocument();
      expect(screen.getByTestId("toggle-source-memory")).toBeInTheDocument();
      expect(screen.getByTestId("toggle-source-file")).toBeInTheDocument();
      expect(screen.getByTestId("toggle-source-transaction")).toBeInTheDocument();
    });

    it("triggers unified search and renders ranked items with RRF scores across memory, files, and transactions", async () => {
      api.listWorkspaceFiles.mockResolvedValue(list);
      unifiedApi.getUnifiedContext.mockResolvedValue({
        status: "success",
        query: "dining expenses",
        total: 3,
        breakdown: { memory: 1, file: 1, transaction: 1 },
        results: sampleUnifiedResults,
        groundedContextPrompt: "### UNIFIED RANKED CONTEXT (Query: dining expenses)...",
      });

      showPage();
      fireEvent.click(await screen.findByTestId("btn-tab-unified-search"));

      const searchInput = screen.getByTestId("input-unified-search");
      fireEvent.change(searchInput, { target: { value: "dining expenses" } });
      fireEvent.click(screen.getByTestId("btn-run-unified-search"));

      await waitFor(() => {
        expect(unifiedApi.getUnifiedContext).toHaveBeenCalledWith({
          query: "dining expenses",
          sources: expect.arrayContaining(["memory", "file", "transaction"]),
          limit: 15,
        });
      });

      expect(await screen.findByTestId("metric-unified-total")).toHaveTextContent("3 Unified Results");
      expect(screen.getByTestId("badge-count-memory")).toHaveTextContent("1 Memories");
      expect(screen.getByTestId("badge-count-file")).toHaveTextContent("1 Files");
      expect(screen.getByTestId("badge-count-transaction")).toHaveTextContent("1 Transactions");

      expect(screen.getByTestId("badge-source-memory")).toBeInTheDocument();
      expect(screen.getByTestId("badge-source-file")).toBeInTheDocument();
      expect(screen.getByTestId("badge-source-transaction")).toBeInTheDocument();

      expect(screen.getByTestId("badge-unified-rank-0")).toHaveTextContent("Rank #1");
      expect(screen.getByTestId("badge-unified-score-0")).toHaveTextContent("100% Match");
      expect(screen.getByText("Memory: dining_budget_rule")).toBeInTheDocument();
      expect(screen.getByText("Bank_Statement_March.pdf (Discretionary)")).toBeInTheDocument();
      expect(screen.getByText("Olive Garden Italian (-$45.50)")).toBeInTheDocument();
      expect(screen.getByTestId("btn-copy-unified-context")).toBeInTheDocument();
    });

    it("toggles source silos and filters retrieval scope", async () => {
      api.listWorkspaceFiles.mockResolvedValue(list);
      unifiedApi.getUnifiedContext.mockResolvedValue({
        status: "success",
        query: "restaurant",
        total: 1,
        breakdown: { memory: 1, file: 0, transaction: 0 },
        results: [sampleUnifiedResults[0]],
        groundedContextPrompt: "### UNIFIED RANKED CONTEXT...",
      });

      showPage();
      fireEvent.click(await screen.findByTestId("btn-tab-unified-search"));

      // Toggle off files and transactions
      fireEvent.click(screen.getByTestId("toggle-source-file"));
      fireEvent.click(screen.getByTestId("toggle-source-transaction"));

      const searchInput = screen.getByTestId("input-unified-search");
      fireEvent.change(searchInput, { target: { value: "restaurant" } });
      fireEvent.click(screen.getByTestId("btn-run-unified-search"));

      await waitFor(() => {
        expect(unifiedApi.getUnifiedContext).toHaveBeenCalledWith({
          query: "restaurant",
          sources: ["memory"],
          limit: 15,
        });
      });

      expect(await screen.findByTestId("badge-count-memory")).toHaveTextContent("1 Memories");
    });
  });

  describe("Document Q&A & Semantic Page Grounding Cockpit", () => {
    it("opens the source belonging to each passage even when two files cite the same page", async () => {
      api.listWorkspaceFiles.mockResolvedValue(list);
      const otherId = "507f1f77bcf86cd799439012";
      api.getWorkspaceFile.mockResolvedValue({ file: { ...file, id: otherId } });
      api.queryDocumentQA.mockResolvedValue({ ...sampleDocQaResult,
        passages: [sampleDocQaResult.passages[0], { ...sampleDocQaResult.passages[0],
          id: "other-chunk", workspaceFileId: otherId, fileName: "other.pdf" }],
      });
      const location = showPage();
      fireEvent.click(await screen.findByTestId("btn-tab-doc-qa"));
      fireEvent.change(screen.getByTestId("input-doc-qa-question"), { target: { value: "Payment terms" } });
      fireEvent.click(screen.getByTestId("btn-run-doc-qa"));
      fireEvent.click(await screen.findByTestId("btn-open-qa-source-1"));
      await screen.findByRole("dialog");
      expect(location.history.at(-1)).toBe(`/files?file=${otherId}&page=2`);
    });

    it("labels unpaginated source text without inventing a page or currency", async () => {
      api.listWorkspaceFiles.mockResolvedValue(list);
      api.queryDocumentQA.mockResolvedValue({ ...sampleDocQaResult, physicalPages: [],
        passages: [{ ...sampleDocQaResult.passages[0], pageNumber: undefined,
          text: "Invoice due EUR 545.50", entities: { amounts: [545.50] } }],
        directAnswer: 'Extracted text: "Invoice due EUR 545.50".',
      });
      showPage();
      fireEvent.click(await screen.findByTestId("btn-tab-doc-qa"));
      fireEvent.change(screen.getByTestId("input-doc-qa-question"), { target: { value: "Invoice due" } });
      fireEvent.click(screen.getByTestId("btn-run-doc-qa"));
      expect(await screen.findByTestId("badge-passage-page-0")).toHaveTextContent("Page unavailable");
      expect(screen.queryByText("$545.50")).not.toBeInTheDocument();
      expect(screen.getByTestId("btn-copilot-citation-0").closest("a")?.getAttribute("href")).not.toContain("undefined");
      expect(screen.getByTestId("btn-copilot-citation-0").closest("a")?.getAttribute("href")).toContain(`attachment=${sampleDocQaResult.passages[0].workspaceFileId}`);
    });
    it("renders the Document Q&A cockpit and asks questions with exact page citations", async () => {
      api.listWorkspaceFiles.mockResolvedValue(list);
      api.queryDocumentQA.mockResolvedValue(sampleDocQaResult);

      showPage();
      fireEvent.click(await screen.findByTestId("btn-tab-doc-qa"));

      const questionInput = screen.getByTestId("input-doc-qa-question");
      fireEvent.change(questionInput, { target: { value: "What is my total tax liability on Form 1040?" } });
      fireEvent.click(screen.getByTestId("btn-run-doc-qa"));

      await waitFor(() => {
        expect(api.queryDocumentQA).toHaveBeenCalledWith({
          question: "What is my total tax liability on Form 1040?",
          workspaceFileIds: undefined,
        });
      });

      expect(await screen.findByTestId("metric-doc-qa-total")).toHaveTextContent("1 Passages Matched");
      expect(screen.getByTestId("badge-grounding-confidence")).toHaveTextContent("85% match score");
      expect(screen.getByTestId("badge-grounded-status")).toHaveTextContent("Strong passage match");
      expect(screen.getByTestId("badge-physical-pages")).toHaveTextContent("Physical Pages Cited: 2");

      expect(screen.getByTestId("card-direct-answer")).toBeInTheDocument();
      expect(screen.getByTestId("text-direct-answer")).toHaveTextContent("13,200.00");
      expect(screen.getByTestId("pill-page-2")).toHaveTextContent("Page 2");

      expect(screen.getByTestId("card-qa-passage-0")).toBeInTheDocument();
      expect(screen.getByTestId("chip-citation-0")).toHaveTextContent("[sample.pdf:p2:c1]");
      expect(screen.getByTestId("badge-passage-page-0")).toHaveTextContent("Page 2");
      expect(screen.getByTestId("btn-copilot-citation-0")).toBeInTheDocument();
    });

    it("triggers preset inquiry and populates question input", async () => {
      api.listWorkspaceFiles.mockResolvedValue(list);
      api.queryDocumentQA.mockResolvedValue(sampleDocQaResult);

      showPage();
      fireEvent.click(await screen.findByTestId("btn-tab-doc-qa"));

      // Click preset inquiry button
      const presetBtn = screen.getByRole("button", { name: /What is my total tax liability on Form 1040\?/ });
      fireEvent.click(presetBtn);

      await waitFor(() => {
        expect(api.queryDocumentQA).toHaveBeenCalledWith({
          question: "What is my total tax liability on Form 1040?",
          workspaceFileIds: undefined,
        });
      });

      expect(await screen.findByTestId("metric-doc-qa-total")).toHaveTextContent("1 Passages Matched");
    });
  });

  describe("Document Authorship & Studio Tab", () => {
    it("preserves custom notes and metrics across format changes and allows profile data to be excluded", async () => {
      api.listWorkspaceFiles.mockResolvedValue(list);
      api.createAuthoredDocument.mockResolvedValue(sampleAuthoredResult);
      showPage();
      fireEvent.click(await screen.findByTestId("btn-tab-doc-authorship"));
      fireEvent.change(screen.getByTestId("input-authored-title"), { target: { value: "My verified notes" } });
      fireEvent.change(screen.getByTestId("textarea-authored-content"), { target: { value: "Invoice due EUR 545.50" } });
      fireEvent.click(screen.getByTestId("btn-format-tax_prep_summary"));
      expect(screen.getByTestId("input-authored-title")).toHaveValue("My verified notes");
      expect(screen.getByTestId("textarea-authored-content")).toHaveValue("Invoice due EUR 545.50");
      fireEvent.click(screen.getByRole("checkbox", { name: "Include saved financial profile" }));
      fireEvent.click(screen.getByTestId("btn-generate-authored-pdf"));
      await waitFor(() => expect(api.createAuthoredDocument).toHaveBeenCalledWith(expect.objectContaining({
        title: "My verified notes", content: "Invoice due EUR 545.50", includeProfileData: false,
      })));
    });
    it("switches to Document Authorship tab and loads format presets", async () => {
      api.listWorkspaceFiles.mockResolvedValue(list);

      showPage();
      const tabBtn = await screen.findByTestId("btn-tab-doc-authorship");
      fireEvent.click(tabBtn);

      expect(screen.getByTestId("card-doc-authorship-studio")).toBeInTheDocument();
      expect(screen.getByTestId("btn-format-executive_brief")).toBeInTheDocument();
      expect(screen.getByTestId("btn-format-tax_prep_summary")).toBeInTheDocument();

      // Click Tax Prep Summary format button
      fireEvent.click(screen.getByTestId("btn-format-tax_prep_summary"));

      const titleInput = screen.getByTestId("input-authored-title") as HTMLInputElement;
      expect(titleInput.value).toBe("Tax preparation notes");
      expect(screen.getByTestId("textarea-authored-content")).toHaveValue("");
      expect(screen.queryByTestId("chip-kpi-0")).not.toBeInTheDocument();
      expect(screen.queryByText("$50,000.00")).not.toBeInTheDocument();
    });

    it("allows adding and removing custom KPIs", async () => {
      api.listWorkspaceFiles.mockResolvedValue(list);

      showPage();
      fireEvent.click(await screen.findByTestId("btn-tab-doc-authorship"));

      // Reset form to clear initial KPIs
      fireEvent.click(screen.getByTestId("btn-reset-authored-form"));
      expect(screen.queryByTestId("chip-kpi-0")).not.toBeInTheDocument();

      // Add custom KPI
      const labelInput = screen.getByTestId("input-kpi-label");
      const valueInput = screen.getByTestId("input-kpi-value");
      const subtextInput = screen.getByTestId("input-kpi-subtext");
      const addBtn = screen.getByTestId("btn-add-kpi");

      fireEvent.change(labelInput, { target: { value: "Liquid Reserve" } });
      fireEvent.change(valueInput, { target: { value: "$55,000.00" } });
      fireEvent.change(subtextInput, { target: { value: "Fully Liquid" } });
      fireEvent.click(addBtn);

      expect(screen.getByTestId("chip-kpi-0")).toHaveTextContent("Liquid Reserve");
      expect(screen.getByTestId("chip-kpi-0")).toHaveTextContent("$55,000.00");

      // Remove the KPI
      fireEvent.click(screen.getByTestId("btn-remove-kpi-0"));
      expect(screen.queryByTestId("chip-kpi-0")).not.toBeInTheDocument();
    });

    it("generates authored PDF document and displays success result card", async () => {
      api.listWorkspaceFiles.mockResolvedValue(list);
      api.createAuthoredDocument.mockResolvedValue(sampleAuthoredResult);

      showPage();
      fireEvent.click(await screen.findByTestId("btn-tab-doc-authorship"));

      const generateBtn = screen.getByTestId("btn-generate-authored-pdf");
      fireEvent.click(generateBtn);

      await waitFor(() => {
        expect(api.createAuthoredDocument).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Financial overview",
            format: "executive_brief",
            includeProfileData: true,
          })
        );
      });

      expect(await screen.findByTestId("card-generated-doc-result")).toBeInTheDocument();
      expect(screen.getByTestId("badge-generated-doc-format")).toHaveTextContent("executive_brief");
      expect(screen.getByTestId("badge-generated-doc-pages")).toHaveTextContent("2 page(s)");
      expect(screen.getByTestId("btn-download-authored-pdf")).toBeInTheDocument();
      expect(screen.getByTestId("btn-open-authored-file")).toBeInTheDocument();
    });
  });
});
