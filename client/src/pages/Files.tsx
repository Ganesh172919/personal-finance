/**
 * @fileoverview Workspace file management page with upload, search, and AI analysis.
 *
 * Provides a paginated file browser for the workspace with upload,
 * preview, AI-powered analysis, and delete capabilities.  Files are
 * displayed as cards with kind-specific icons (document, image,
 * spreadsheet, archive, etc.) and size formatting.
 *
 * Key data flows:
 * - listWorkspaceFiles({ page, limit, search }) loads the file list
 *   with server-side search and pagination.
 * - uploadWorkspaceFiles() handles multi-file upload via a hidden
 *   input element (useRef).
 * - analyzeWorkspaceFile(id, prompt?) sends a file to the AI service
 *   for content analysis; results are rendered as markdown.
 * - deleteWorkspaceFile(id) removes a file after confirmation.
 *
 * A detail sheet shows file metadata, a preview link (via buildApiUrl),
 * the AI analysis textarea, and the delete action.
 *
 * Accessible from the sidebar under "Files" for authenticated users.
 *
 * MINDMAP FLOW
 * ------------
 * ```
 * Files Workspace Page
 * ├── 1. File Listing & Pagination (listWorkspaceFiles)
 * │   ├── Filter by Search Keyword & Document Kind
 * │   └── Display File Cards (document, spreadsheet, image, receipt, archive)
 * ├── 2. Upload Management (uploadWorkspaceFiles)
 * │   ├── Multi-file file input picker
 * │   ├── Progress indicator & toast notification
 * │   └── Triggers server-side text extraction & RAG chunking
 * ├── 3. File Detail Sheet & Preview
 * │   ├── Metadata display (size, type, upload timestamp, chunk count)
 * │   ├── Direct GridFS preview link (buildApiUrl)
 * │   └── Generate PDF action for text files
 * ├── 4. AI Document Analysis (analyzeWorkspaceFile)
 * │   ├── Custom prompt input (e.g., "Extract summary", "Audit expenses")
 * │   └── Markdown result display with copy and cite capabilities
 * └── 5. Deletion & Cleanup (deleteWorkspaceFile)
 *     ├── Confirmation prompt
 *     └── Cascade cleanup of file & knowledge chunks
 * ```
 *
 * ASCII FLOW
 * ----------
 * ```
 *   +---------------------------------------------------------------+
 *   |                     Files Page Mounts                         |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |    useQuery(['workspaceFiles', page, search])                 |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |                   Render Workspace File Grid                  |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *            +----------------------+----------------------+
 *            |                      |                      |
 *            v                      v                      v
 *     [Upload Files]         [Select File]          [Delete File]
 *     POST /workspace-files  Open Detail Sheet      DELETE /workspace-files
 *            |                      |                      |
 *            v                      v                      v
 *     Triggers chunking      [Run AI Analysis]      Cascade delete chunks
 *     & invalidates cache    POST /analyze          & invalidate cache
 *   +---------------------------------------------------------------+
 * ```
 *
 * @module pages/Files
 */

import { useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowUpDown,
  BookOpen,
  Brain,
  CheckCircle2,
  Copy,
  Database,
  ExternalLink,
  FileSearch,
  FileText,
  HelpCircle,
  MessageSquare,
  Filter,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Receipt,
  Search,
  ShieldCheck,
  Sparkles,
  Table as TableIcon,
  Trash2,
  Upload,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Badge } from "@/components/ui/Badge";
import { ExtractedFileText } from "@/components/ExtractedFileText";
import { SourceEvidenceList } from "@/components/SourceEvidenceList";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/Sheet";
import { Textarea } from "@/components/ui/TextArea";
import { useToast } from "@/hooks/useToast";
import {
  type ChunkModality,
  type RetrievedKnowledgeChunk,
  analyzeWorkspaceFile,
  deleteWorkspaceFile,
  getWorkspaceFile,
  listWorkspaceFiles,
  queryDocumentQA,
  searchWorkspaceChunks,
  type DocumentQAResponse,
  uploadWorkspaceFiles,
  createAuthoredDocument,
  type AuthoredDocumentFormat,
  type AuthoredDocumentResult,
  type DocumentKPI,
} from "@/lib/api/files";
import { buildApiUrl } from "@/lib/apiBase";
import { getUnifiedContext, type UnifiedRetrievedItem, type UnifiedSourceType } from "@/lib/api/unifiedContext";
import { isWorkspaceFileId, readChatReturnPath, readSourcePage } from "@/lib/fileReferences";

// Empty array constant representing fallback workspace files list.
// Prevents unnecessary array allocations during empty query states.
// Preserves referential stability for memoized list calculations.
const EMPTY_FILES: Awaited<ReturnType<typeof listWorkspaceFiles>>["files"] = [];

// Formats byte count values into human-readable metric file sizes.
// Converts values progressively across B, KB, MB, and GB thresholds.
// Returns zero bytes placeholder when input numbers are invalid or zero.
const formatBytes = (sizeBytes: number) => {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = sizeBytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
};

// Maps normalized file category kinds to user-facing category labels.
// Used across file listing cards, filter dialogs, and detail inspectors.
// Provides descriptive fallback titles for diverse workspace uploads.
const fileKindLabel: Record<string, string> = {
  archive: "Archive",
  code: "Code",
  data: "Data",
  document: "Document",
  image: "Image",
  other: "Other",
  spreadsheet: "Spreadsheet",
};

// Associates specific Lucide iconography with distinct workspace file types.
// Assigns dedicated visual indicators for archives, data, images, and documents.
// Enhances visual recognition in file browsers and modal previews.
const fileKindIcon: Record<string, typeof FileText> = {
  archive: FolderOpen,
  code: FileText,
  data: FileSearch,
  document: FileText,
  image: ImageIcon,
  other: FileText,
  spreadsheet: FileSearch,
};

// Manages workspace file assets, multi-modal search, and document intelligence.
// Supports multi-file uploads, document authoring, and grounded RAG querying.
// Coordinates file detail side-sheets, chunk previews, and AI-driven document QA.
export default function FilesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [detailParams, setDetailParams] = useSearchParams();
  const [, navigate] = useLocation();
  const requestedFileId = detailParams.get("file");
  const selectedId = isWorkspaceFileId(requestedFileId) ? requestedFileId : null;
  const selectedPage = readSourcePage(detailParams.get("page"));
  const returnToChat = readChatReturnPath(detailParams.get("returnTo"));
  const setSelectedId = (id: string | null) => id
    ? setDetailParams({ file: id })
    : navigate(returnToChat || "/files", { replace: true });
  const setSourcePage = (fileId: string, nextPage: number) => setDetailParams({
    file: fileId, page: String(nextPage), ...(returnToChat ? { returnTo: returnToChat } : {}),
  }, { replace: true });
  const [analysisPrompt, setAnalysisPrompt] = useState("");

  // Multi-Modal Grounded RAG Search State
  const [activeTab, setActiveTab] = useState<"browse" | "rag-search" | "unified-context" | "doc-qa" | "doc-authorship">("browse");

  // Document Authorship & Layout Studio State
  const [authoredFormat, setAuthoredFormat] = useState<AuthoredDocumentFormat>("executive_brief");
  const [authoredTitle, setAuthoredTitle] = useState("Financial overview");
  const [authoredContent, setAuthoredContent] = useState("");
  const [authoredKpis, setAuthoredKpis] = useState<DocumentKPI[]>([]);
  const [includeProfileData, setIncludeProfileData] = useState(true);
  const [newKpiLabel, setNewKpiLabel] = useState("");
  const [newKpiValue, setNewKpiValue] = useState("");
  const [newKpiSubtext, setNewKpiSubtext] = useState("");
  const [isGeneratingDoc, setIsGeneratingDoc] = useState(false);
  const [generatedDocResult, setGeneratedDocResult] = useState<AuthoredDocumentResult | null>(null);
  const formatTitles: Record<AuthoredDocumentFormat, string> = {
    executive_brief: "Financial overview",
    tax_prep_summary: "Tax preparation notes",
    cash_flow_audit: "Cash flow review",
    debt_payoff_schedule: "Debt inventory",
    net_worth_statement: "Saved assets and liabilities",
    standard: "Financial report",
  };
  const handleSelectFormat = (fmt: AuthoredDocumentFormat) => {
    setAuthoredFormat(fmt);
    setAuthoredTitle(title => title === formatTitles[authoredFormat] ? formatTitles[fmt] : title);
  };

  const handleAddKpi = () => {
    if (!newKpiLabel.trim() || !newKpiValue.trim()) return;
    setAuthoredKpis(prev => [...prev, { label: newKpiLabel.trim(), value: newKpiValue.trim(), subtext: newKpiSubtext.trim() || undefined }]);
    setNewKpiLabel("");
    setNewKpiValue("");
    setNewKpiSubtext("");
  };

  const handleRemoveKpi = (idx: number) => {
    setAuthoredKpis(prev => prev.filter((_, i) => i !== idx));
  };

  const handleGenerateAuthoredPdf = async () => {
    if (!authoredTitle.trim()) {
      toast({ title: "Title required", description: "Please enter a document title.", variant: "destructive" });
      return;
    }
    setIsGeneratingDoc(true);
    try {
      const res = await createAuthoredDocument({
        title: authoredTitle.trim(),
        format: authoredFormat,
        content: authoredContent.trim() || undefined,
        kpis: authoredKpis.length ? authoredKpis : undefined,
        includeProfileData,
      });
      setGeneratedDocResult(res.document);
      toast({
        title: "Document Created!",
        description: `Successfully authored ${res.document.filename} (${res.document.pageCount} pages). Saved in Files.`,
      });
      void filesQuery.refetch();
    } catch (err: any) {
      toast({
        title: "Failed to generate document",
        description: err?.message || "An error occurred while creating the PDF.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingDoc(false);
    }
  };
  const [ragQuery, setRagQuery] = useState("");
  const [ragModality, setRagModality] = useState<"all" | ChunkModality>("all");
  const [groundedOnly, setGroundedOnly] = useState(false);
  const [ragResults, setRagResults] = useState<RetrievedKnowledgeChunk[]>([]);
  const [isSearchingRag, setIsSearchingRag] = useState(false);
  const [hasSearchedRag, setHasSearchedRag] = useState(false);

  // Unified Memory & Context Retrieval State
  const [unifiedQuery, setUnifiedQuery] = useState("");
  const [unifiedSources, setUnifiedSources] = useState<Set<UnifiedSourceType>>(
    new Set(["memory", "file", "transaction"])
  );
  const [unifiedResults, setUnifiedResults] = useState<UnifiedRetrievedItem[]>([]);
  const [unifiedBreakdown, setUnifiedBreakdown] = useState<{ memory: number; file: number; transaction: number }>({
    memory: 0,
    file: 0,
    transaction: 0,
  });
  const [unifiedTotal, setUnifiedTotal] = useState(0);
  const [groundedPrompt, setGroundedPrompt] = useState("");
  const [isSearchingUnified, setIsSearchingUnified] = useState(false);
  const [hasSearchedUnified, setHasSearchedUnified] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);


  // Document Q&A State
  const [docQaQuestion, setDocQaQuestion] = useState("");
  const [docQaSelectedFileId, setDocQaSelectedFileId] = useState<string>("all");
  const [docQaResult, setDocQaResult] = useState<DocumentQAResponse | null>(null);
  const [isAskingDocQa, setIsAskingDocQa] = useState(false);
  const [hasAskedDocQa, setHasAskedDocQa] = useState(false);

  const handleAskDocQa = async (overrideQuestion?: string) => {
    const q = (overrideQuestion !== undefined ? overrideQuestion : docQaQuestion).trim();
    if (!q) {
      setDocQaResult(null);
      setHasAskedDocQa(false);
      return;
    }
    setIsAskingDocQa(true);
    setHasAskedDocQa(true);
    try {
      const res = await queryDocumentQA({
        question: q,
        workspaceFileIds: docQaSelectedFileId !== "all" ? [docQaSelectedFileId] : undefined,
      });
      setDocQaResult(res);
    } catch {
      toast({
        title: "Document Q&A query failed",
        description: "Could not answer question from documents. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAskingDocQa(false);
    }
  };

  const handleUnifiedSearch = async (overrideQuery?: string) => {
    const q = (overrideQuery !== undefined ? overrideQuery : unifiedQuery).trim();
    if (!q) {
      setUnifiedResults([]);
      setHasSearchedUnified(false);
      return;
    }
    setIsSearchingUnified(true);
    setHasSearchedUnified(true);
    try {
      const res = await getUnifiedContext({
        query: q,
        sources: Array.from(unifiedSources),
        limit: 15,
      });
      setUnifiedResults(res.results || []);
      setUnifiedBreakdown(res.breakdown || { memory: 0, file: 0, transaction: 0 });
      setUnifiedTotal(res.total || 0);
      setGroundedPrompt(res.groundedContextPrompt || "");
    } catch (err) {
      toast({
        title: "Unified retrieval failed",
        description: err instanceof Error ? err.message : "Unable to retrieve unified context",
        variant: "destructive",
      });
    } finally {
      setIsSearchingUnified(false);
    }
  };

  const toggleUnifiedSource = (src: UnifiedSourceType) => {
    setUnifiedSources((prev) => {
      const next = new Set(prev);
      if (next.has(src)) {
        if (next.size > 1) next.delete(src);
      } else {
        next.add(src);
      }
      return next;
    });
  };

  const copyGroundedPrompt = () => {
    if (!groundedPrompt) return;
    navigator.clipboard.writeText(groundedPrompt);
    setCopiedPrompt(true);
    toast({
      title: "Context copied to clipboard",
      description: "Grounded prompt context ready to paste into chat or AI agents.",
    });
    setTimeout(() => setCopiedPrompt(false), 2500);
  };

  const handleRagSearch = async (overrideQuery?: string, overrideModality?: "all" | ChunkModality) => {
    const q = (overrideQuery !== undefined ? overrideQuery : ragQuery).trim();
    if (!q) {
      setRagResults([]);
      setHasSearchedRag(false);
      return;
    }
    setIsSearchingRag(true);
    setHasSearchedRag(true);
    try {
      const targetMod = overrideModality !== undefined ? overrideModality : ragModality;
      const res = await searchWorkspaceChunks({
        query: q,
        modality: targetMod,
        minConfidence: groundedOnly ? 0.70 : undefined,
      });
      setRagResults(res.chunks || []);
    } catch (err) {
      toast({
        title: "Search failed",
        description: err instanceof Error ? err.message : "Unable to perform semantic retrieval",
        variant: "destructive",
      });
    } finally {
      setIsSearchingRag(false);
    }
  };
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const filesQuery = useQuery({
    queryKey: ["/api/files", page, search],
    queryFn: () => listWorkspaceFiles({ page, limit: 18, search: search.trim() || undefined }),
  });

  const detailQuery = useQuery({
    queryKey: ["/api/files", selectedId, "detail"],
    queryFn: () => getWorkspaceFile(String(selectedId)),
    enabled: Boolean(selectedId),
  });

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => uploadWorkspaceFiles(files),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      if (data.files[0]) {
        setSelectedId(data.files[0].id);
      }
      toast({
        title: "Files uploaded",
        description: `${data.files.length} file${data.files.length === 1 ? "" : "s"} added to your workspace.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message || "Could not upload the selected files.",
        variant: "destructive",
      });
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: (payload: { id: string; prompt?: string }) => analyzeWorkspaceFile(payload.id, payload.prompt),
    onSuccess: async (data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/files"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/files", variables.id, "detail"] }),
      ]);
      queryClient.setQueryData(["/api/files", variables.id, "detail"], data);
      toast({
        title: "Analysis ready",
        description: "The AI finished reviewing your file.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Analysis failed",
        description: error.message || "Could not analyze the file.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteWorkspaceFile(id),
    onSuccess: async (_data, id) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.removeQueries({ queryKey: ["/api/files", id, "detail"] });
      setSelectedId(null);
      toast({
        title: "File removed",
        description: "The file was deleted from your workspace.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message || "Could not remove the file.",
        variant: "destructive",
      });
    },
  });

  const selectedFile = detailQuery.data?.file;

  const files = filesQuery.data?.files ?? EMPTY_FILES;
  const totalPages = filesQuery.data?.pagination.totalPages || 1;

  const stats = useMemo(() => {
    const total = files.length;
    const processed = files.filter((file) => file.status === "processed").length;
    const analyzed = files.filter((file) => Boolean(file.lastAnalyzedAt)).length;

    return { total, processed, analyzed };
  }, [files]);

  const openFilePicker = () => fileInputRef.current?.click();

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (!selectedFiles.length) return;
    uploadMutation.mutate(selectedFiles);
    event.target.value = "";
  };

  return (
    <div className="flex-1 overflow-auto bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[calc(var(--radius)+10px)] border border-border/70 surface-panel p-6"
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Workspace files
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">Files</h1>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Upload documents, spreadsheets, images, code, and notes. The app stores them in your workspace,
                  extracts useful text when possible, and lets you run AI analysis or attach them to conversations.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button className="rounded-2xl" onClick={openFilePicker} disabled={uploadMutation.isPending}>
                {uploadMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Upload files
              </Button>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelection} />
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Card className="rounded-[calc(var(--radius)-6px)] border-border/70 p-4">
              <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Visible now</div>
              <div className="mt-2 text-2xl font-semibold text-foreground">{stats.total}</div>
            </Card>
            <Card className="rounded-[calc(var(--radius)-6px)] border-border/70 p-4">
              <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Text extracted</div>
              <div className="mt-2 text-2xl font-semibold text-foreground">{stats.processed}</div>
            </Card>
            <Card className="rounded-[calc(var(--radius)-6px)] border-border/70 p-4">
              <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">AI analyzed</div>
              <div className="mt-2 text-2xl font-semibold text-foreground">{stats.analyzed}</div>
            </Card>
          </div>
        </motion.section>

        {/* View Switcher Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={activeTab === "browse" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("browse")}
              data-testid="btn-tab-browse-files"
              className="rounded-xl text-xs font-medium"
            >
              <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
              Workspace Files ({stats.total})
            </Button>
            <Button
              type="button"
              variant={activeTab === "rag-search" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("rag-search")}
              data-testid="btn-tab-rag-search"
              className="rounded-xl text-xs font-medium"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5 text-primary" />
              Search documents
            </Button>
            <Button
              type="button"
              variant={activeTab === "unified-context" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("unified-context")}
              data-testid="btn-tab-unified-search"
              className="rounded-xl text-xs font-medium"
            >
              <Brain className="mr-1.5 h-3.5 w-3.5 text-purple-500" />
              Search workspace
            </Button>
            <Button
              type="button"
              variant={activeTab === "doc-qa" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("doc-qa")}
              data-testid="btn-tab-doc-qa"
              className="rounded-xl text-xs font-medium"
            >
              <HelpCircle className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
              Document Q&A
            </Button>
            <Button
              type="button"
              variant={activeTab === "doc-authorship" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("doc-authorship")}
              data-testid="btn-tab-doc-authorship"
              className="rounded-xl text-xs font-medium"
            >
              <BookOpen className="mr-1.5 h-3.5 w-3.5 text-blue-500" />
              Create PDF
            </Button>
          </div>
          <div className="text-xs text-muted-foreground hidden sm:block">
            Find matching source text and open the original to check context.
          </div>
        </div>

        {activeTab === "rag-search" ? (
          <div className="space-y-6" data-testid="card-rag-search-cockpit">
            {/* Search Controls Card */}
            <Card className="rounded-[calc(var(--radius)+6px)] border-border/70 p-6 shadow-sm">
              <div className="flex flex-col gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <h2 className="text-lg font-semibold text-foreground">Multi-Modal Grounded Retrieval</h2>
                    <Badge variant="outline" className="border-primary/40 text-primary text-xs">Dense Vector 64-D</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground sm:text-sm">
                    Query across all indexed workspace documents, spreadsheets, scanned receipts, and structured payloads with unified hybrid semantic retrieval.
                  </p>
                </div>

                {/* Search Bar Input */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={ragQuery}
                      onChange={(e) => setRagQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          void handleRagSearch();
                        }
                      }}
                      placeholder="Search text clauses, table cells, receipt merchants, amounts..."
                      aria-label="Multi-modal RAG search query"
                      data-testid="input-rag-search"
                      className="pl-9"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={() => void handleRagSearch()}
                    disabled={isSearchingRag || !ragQuery.trim()}
                    data-testid="btn-run-rag-search"
                    className="rounded-xl px-5"
                  >
                    {isSearchingRag ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Retrieving...
                      </>
                    ) : (
                      <>
                        <FileSearch className="mr-2 h-4 w-4" />
                        Search Chunks
                      </>
                    )}
                  </Button>
                </div>

                {/* Modality Filters & Grounding Gate */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/50">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground mr-1 flex items-center gap-1">
                      <Filter className="h-3 w-3" /> Modality:
                    </span>
                    {(["all", "text", "table", "image_ocr", "structured_data"] as const).map((mod) => (
                      <Button
                        key={mod}
                        type="button"
                        variant={ragModality === mod ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => {
                          setRagModality(mod);
                          if (ragQuery.trim()) {
                            void handleRagSearch(undefined, mod);
                          }
                        }}
                        data-testid={`btn-rag-filter-${mod}`}
                        className="h-7 rounded-lg text-xs px-2.5"
                      >
                        {mod === "all" && "All Modalities"}
                        {mod === "text" && "Text Prose"}
                        {mod === "table" && "Tables & Sheets"}
                        {mod === "image_ocr" && "Receipts & OCR"}
                        {mod === "structured_data" && "JSON / Data"}
                      </Button>
                    ))}
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
                    <input
                      type="checkbox"
                      checked={groundedOnly}
                      onChange={(e) => {
                        setGroundedOnly(e.target.checked);
                      }}
                      data-testid="toggle-rag-grounded-only"
                      className="rounded border-border text-primary focus:ring-primary"
                    />
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                    High Grounding Only ($G \ge 0.70$)
                  </label>
                </div>

                {/* Preset Suggestions */}
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                  <span className="text-[11px] uppercase tracking-wider font-semibold">Try querying:</span>
                  {[
                    "Early loan prepayment penalty",
                    "Starbucks coffee expenses",
                    "Costco receipt total tax",
                    "Emergency reserves policy",
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setRagQuery(preset);
                        void handleRagSearch(preset);
                      }}
                      className="rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-xs text-foreground/80 hover:bg-muted/80 transition-colors"
                    >
                      "{preset}"
                    </button>
                  ))}
                </div>
              </div>
            </Card>

            {/* Results Stream */}
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                <span data-testid="rag-search-results-count" className="font-medium text-foreground">
                  {isSearchingRag
                    ? "Searching vector indexes..."
                    : hasSearchedRag
                    ? `Retrieved ${ragResults.length} grounded passage${ragResults.length === 1 ? "" : "s"}`
                    : "Enter a query or select a preset to search indexed knowledge"}
                </span>
                {ragResults.length > 0 && (
                  <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Verifiable Citations Ready
                  </span>
                )}
              </div>

              {isSearchingRag ? (
                <div className="rounded-[calc(var(--radius)-4px)] border border-border/70 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-primary" />
                  Calculating dense semantic cosine similarities and lexical alignments...
                </div>
              ) : hasSearchedRag && ragResults.length === 0 ? (
                <div className="rounded-[calc(var(--radius)-4px)] border border-dashed border-border/70 bg-muted/20 p-8 text-center">
                  <FileSearch className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
                  <div className="text-sm font-semibold text-foreground">No matching knowledge chunks found</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Try broadening your query, selecting "All Modalities", or disabling the $G \ge 0.70$ filter.
                  </div>
                </div>
              ) : (
                <div className="grid gap-3">
                  {ragResults.map((chunk, idx) => {
                    const isHighConfidence = (chunk.groundingConfidence || 0) >= 0.70;
                    return (
                      <Card
                        key={chunk.id || `chunk-${idx}`}
                        data-testid={`card-rag-chunk-${chunk.id || idx}`}
                        className="rounded-[calc(var(--radius)-4px)] border border-border/70 bg-background/80 p-4 transition-all hover:border-primary/30 hover:shadow-sm"
                      >
                        {/* Header metadata row */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Modality Badge */}
                            {chunk.modality === "table" && (
                              <Badge className="bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/30 gap-1 text-[11px]" data-testid={`badge-modality-${chunk.modality}`}>
                                <TableIcon className="h-3 w-3" /> Table / Sheet
                              </Badge>
                            )}
                            {chunk.modality === "image_ocr" && (
                              <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 gap-1 text-[11px]" data-testid={`badge-modality-${chunk.modality}`}>
                                <Receipt className="h-3 w-3" /> Receipt OCR
                              </Badge>
                            )}
                            {chunk.modality === "structured_data" && (
                              <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 gap-1 text-[11px]" data-testid={`badge-modality-${chunk.modality}`}>
                                <Database className="h-3 w-3" /> Structured JSON
                              </Badge>
                            )}
                            {chunk.modality === "text" && (
                              <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30 gap-1 text-[11px]" data-testid={`badge-modality-${chunk.modality}`}>
                                <FileText className="h-3 w-3" /> Text Document
                              </Badge>
                            )}

                            {/* Section or Page */}
                            {chunk.pageNumber && (
                              <Badge variant="outline" className="text-[10px]" data-testid={`badge-page-num-${chunk.pageNumber}`}>
                                Page {chunk.pageNumber}
                              </Badge>
                            )}
                            {chunk.sectionTitle && (
                              <span className="text-xs font-semibold text-foreground truncate max-w-xs">
                                {chunk.sectionTitle}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Citation Pill */}
                            <span
                              data-testid={`badge-citation-${chunk.id || idx}`}
                              className="font-mono text-[11px] rounded bg-muted/60 px-2 py-0.5 text-muted-foreground border border-border/50"
                            >
                              {chunk.citation || `[${chunk.workspaceFileId}:${chunk.chunkIndex}]`}
                            </span>

                            {/* Grounding Confidence Badge */}
                            <Badge
                              data-testid={`badge-grounding-confidence-${chunk.id || idx}`}
                              className={`text-[10px] ${
                                isHighConfidence
                                  ? "bg-emerald-600 text-white dark:bg-emerald-500/20 dark:text-emerald-300"
                                  : "bg-amber-600 text-white dark:bg-amber-500/20 dark:text-amber-300"
                              }`}
                            >
                              {isHighConfidence ? "Grounded" : "Candidate"} · {((chunk.groundingConfidence || 0) * 100).toFixed(0)}%
                            </Badge>
                          </div>
                        </div>

                        {/* Passage Text Snippet */}
                        <div
                          data-testid={`snippet-rag-chunk-${chunk.id || idx}`}
                          className="mt-3 text-xs leading-relaxed text-foreground/90 font-mono bg-muted/20 rounded-md p-3 border border-border/40 whitespace-pre-wrap"
                        >
                          {chunk.snippet || chunk.text}
                        </div>

                        {/* Extracted Entities Row */}
                        {chunk.entities && (
                          <div className="mt-3 flex flex-wrap items-center gap-2 pt-2 border-t border-border/40 text-[11px]">
                            <span className="text-muted-foreground font-medium">Entities:</span>
                            {chunk.entities.merchants?.map((m) => (
                              <Badge key={m} variant="secondary" className="text-[10px] bg-primary/10 text-primary border-primary/20" data-testid="chip-entity-merchant">
                                {m}
                              </Badge>
                            ))}
                            {chunk.entities.amounts?.map((a) => (
                              <Badge key={a} variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30" data-testid="chip-entity-amount">
                                ${a.toFixed(2)}
                              </Badge>
                            ))}
                            {chunk.entities.dates?.map((d) => (
                              <Badge key={d} variant="outline" className="text-[10px]" data-testid="chip-entity-date">
                                {d}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {/* Action Footer */}
                        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground pt-2">
                          <div className="flex items-center gap-3">
                            <span>Score: <strong>{chunk.score}</strong></span>
                            {chunk.cosineSimilarity !== undefined && (
                              <span>Cosine Sim: <strong>{(chunk.cosineSimilarity * 100).toFixed(0)}%</strong></span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs px-2"
                              onClick={() => {
                                if (chunk.pageNumber) {
                                  setSourcePage(chunk.workspaceFileId, chunk.pageNumber);
                                } else {
                                  setSelectedId(chunk.workspaceFileId);
                                }
                              }}
                            >
                              <ExternalLink className="mr-1 h-3 w-3" />
                              View in Document
                            </Button>
                            <Link
                              href={`/chat?prompt=${encodeURIComponent(`Explain this excerpt from my workspace file: "${chunk.snippet.slice(0, 100)}..."`)}`}
                              className="inline-flex items-center text-xs text-primary hover:underline font-medium"
                            >
                              <Sparkles className="mr-1 h-3 w-3" />
                              Ask Copilot
                            </Link>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : activeTab === "unified-context" ? (
          <div className="space-y-6" data-testid="card-unified-context-cockpit">
            {/* Header & Controls Card */}
            <Card className="rounded-[calc(var(--radius)+6px)] border-border/70 p-6 shadow-sm">
              <div className="flex flex-col gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Brain className="h-5 w-5 text-purple-500" />
                    <h2 className="text-lg font-semibold text-foreground">Unified Ranked Memory & Context Retrieval</h2>
                    <Badge variant="outline" className="border-purple-500/40 text-purple-600 dark:text-purple-400 text-xs">
                      RRF Fusion (k=60)
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground sm:text-sm">
                    Query across your user memory facts & rules, workspace file knowledge, and financial ledger transactions with Reciprocal Rank Fusion.
                  </p>
                </div>

                {/* Search Bar Input */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={unifiedQuery}
                      onChange={(e) => setUnifiedQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          void handleUnifiedSearch();
                        }
                      }}
                      placeholder="Search memory rules, document clauses, transactions, amounts..."
                      aria-label="Unified context search query"
                      data-testid="input-unified-search"
                      className="pl-9"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={() => void handleUnifiedSearch()}
                    disabled={isSearchingUnified || !unifiedQuery.trim()}
                    data-testid="btn-run-unified-search"
                    className="rounded-xl px-5"
                  >
                    {isSearchingUnified ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Retrieving...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Retrieve Context
                      </>
                    )}
                  </Button>
                </div>

                {/* Source Filter Pills */}
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50">
                  <span className="text-xs font-medium text-muted-foreground mr-1 flex items-center gap-1">
                    <Filter className="h-3 w-3" /> Filter Silos:
                  </span>
                  <Button
                    type="button"
                    variant={unifiedSources.has("memory") ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleUnifiedSource("memory")}
                    data-testid="toggle-source-memory"
                    className="h-7 text-xs rounded-lg px-2.5"
                  >
                    <Brain className="mr-1 h-3 w-3" />
                    User Memory Facts
                  </Button>
                  <Button
                    type="button"
                    variant={unifiedSources.has("file") ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleUnifiedSource("file")}
                    data-testid="toggle-source-file"
                    className="h-7 text-xs rounded-lg px-2.5"
                  >
                    <FileText className="mr-1 h-3 w-3" />
                    Document Chunks
                  </Button>
                  <Button
                    type="button"
                    variant={unifiedSources.has("transaction") ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleUnifiedSource("transaction")}
                    data-testid="toggle-source-transaction"
                    className="h-7 text-xs rounded-lg px-2.5"
                  >
                    <Receipt className="mr-1 h-3 w-3" />
                    Ledger Transactions
                  </Button>
                </div>
              </div>
            </Card>

            {/* Results Summary Bar */}
            {hasSearchedUnified && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-foreground" data-testid="metric-unified-total">
                    {unifiedTotal} Unified Results
                  </span>
                  <span className="text-muted-foreground">•</span>
                  <Badge variant="outline" className="border-purple-500/30 text-purple-600 dark:text-purple-400 gap-1 text-[11px]" data-testid="badge-count-memory">
                    <Brain className="h-3 w-3" /> {unifiedBreakdown.memory} Memories
                  </Badge>
                  <Badge variant="outline" className="border-blue-500/30 text-blue-600 dark:text-blue-400 gap-1 text-[11px]" data-testid="badge-count-file">
                    <FileText className="h-3 w-3" /> {unifiedBreakdown.file} Files
                  </Badge>
                  <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 dark:text-emerald-400 gap-1 text-[11px]" data-testid="badge-count-transaction">
                    <Receipt className="h-3 w-3" /> {unifiedBreakdown.transaction} Transactions
                  </Badge>
                  {unifiedResults[0] && (
                    <span className="text-muted-foreground ml-2 hidden sm:inline" data-testid="metric-top-rrf">
                      Top RRF: {unifiedResults[0].rrfScore.toFixed(5)}
                    </span>
                  )}
                </div>

                {groundedPrompt && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={copyGroundedPrompt}
                    data-testid="btn-copy-unified-context"
                    className="h-8 text-xs rounded-xl"
                  >
                    {copiedPrompt ? (
                      <>
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                        Copied Prompt Context
                      </>
                    ) : (
                      <>
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                        Copy Grounded Context
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}

            {/* Results List */}
            <div className="space-y-3" data-testid="list-unified-results">
              {isSearchingUnified ? (
                <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" />
                  Running Reciprocal Rank Fusion across Memory, Documents, and Transactions...
                </div>
              ) : hasSearchedUnified && unifiedResults.length === 0 ? (
                <div className="rounded-[calc(var(--radius)-4px)] border border-dashed border-border/70 bg-muted/20 p-8 text-center">
                  <Brain className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
                  <div className="text-sm font-semibold text-foreground">No matching unified context found</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Try broadening your query keywords or ensuring all three silos are enabled.
                  </div>
                </div>
              ) : (
                <div className="grid gap-3">
                  {unifiedResults.map((item, idx) => (
                    <Card
                      key={item.id || `unified-${idx}`}
                      data-testid={`card-unified-result-${idx}`}
                      className="rounded-[calc(var(--radius)-4px)] border border-border/70 bg-background/80 p-4 transition-all hover:border-purple-500/40 hover:shadow-sm"
                    >
                      {/* Metadata Row */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Source Type Badge */}
                          {item.sourceType === "memory" && (
                            <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30 gap-1 text-[11px]" data-testid="badge-source-memory">
                              <Brain className="h-3 w-3" /> Memory Fact
                            </Badge>
                          )}
                          {item.sourceType === "file" && (
                            <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30 gap-1 text-[11px]" data-testid="badge-source-file">
                              <FileText className="h-3 w-3" /> Document
                            </Badge>
                          )}
                          {item.sourceType === "transaction" && (
                            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 gap-1 text-[11px]" data-testid="badge-source-transaction">
                              <Receipt className="h-3 w-3" /> Transaction
                            </Badge>
                          )}

                          {/* Global Rank */}
                          <Badge variant="outline" className="text-[11px]" data-testid={`badge-unified-rank-${idx}`}>
                            Rank #{item.rank}
                          </Badge>

                          {/* Citation */}
                          {item.citation && (
                            <Badge variant="secondary" className="font-mono text-[10px]">
                              {item.citation}
                            </Badge>
                          )}
                        </div>

                        {/* Relevance Score Pill */}
                        <Badge
                          variant="secondary"
                          className="bg-primary/10 text-primary font-semibold text-xs"
                          data-testid={`badge-unified-score-${idx}`}
                        >
                          {item.score}% Match
                        </Badge>
                      </div>

                      {/* Content Body */}
                      <div className="mt-3">
                        <div className="font-medium text-sm text-foreground">
                          {item.title}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                          {item.snippet}
                        </p>
                      </div>

                      {/* Footer Info */}
                      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/40">
                        <div className="flex items-center gap-3">
                          <span>RRF: <strong>{item.rrfScore.toFixed(5)}</strong></span>
                          {item.metadata.confidence !== undefined && (
                            <span>Confidence: <strong>{(item.metadata.confidence * 100).toFixed(0)}%</strong></span>
                          )}
                          {item.metadata.amount !== undefined && (
                            <span>Amount: <strong>${Math.abs(item.metadata.amount).toFixed(2)}</strong></span>
                          )}
                          {item.metadata.date && (
                            <span>Date: {item.metadata.date}</span>
                          )}
                        </div>
                        <Link
                          href={`/chat?prompt=${encodeURIComponent(`Based on this retrieved ${item.sourceType}: "${item.snippet}", what recommendations do you have?`)}`}
                          className="inline-flex items-center text-xs text-purple-600 dark:text-purple-400 hover:underline font-medium"
                        >
                          <Sparkles className="mr-1 h-3 w-3" />
                          Ask Copilot
                        </Link>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : activeTab === "doc-qa" ? (
          <div className="space-y-6" data-testid="card-doc-qa-cockpit">
            {/* Header & Controls Card */}
            <Card className="rounded-[calc(var(--radius)+6px)] border-border/70 p-6 shadow-sm">
              <div className="flex flex-col gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <HelpCircle className="h-5 w-5 text-emerald-500" />
                    <h2 className="text-lg font-semibold text-foreground">Ask your documents</h2>
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-xs">
                      Physical Page Retention
                    </Badge>
                    <Badge variant="outline" className="border-primary/40 text-primary text-xs">
                      Passage matching
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground sm:text-sm">
                    Ask natural language questions across your tax returns (1040/W-2), brokerage statements, invoices, and scanned OCR receipts with verified citations.
                  </p>
                </div>

                {/* Filter and Search Bar */}
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="w-full sm:w-64">
                      <select
                        aria-label="Filter documents by file"
                        value={docQaSelectedFileId}
                        onChange={(e) => setDocQaSelectedFileId(e.target.value)}
                        data-testid="select-doc-qa-file"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-medium shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="all">All Documents ({files.length})</option>
                        {files.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.originalName} ({f.kind})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={docQaQuestion}
                        onChange={(e) => setDocQaQuestion(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleAskDocQa();
                          }
                        }}
                        placeholder="e.g. What is my total tax liability? What were the deductible expenses?"
                        aria-label="Document question"
                        data-testid="input-doc-qa-question"
                        className="pl-9 text-xs sm:text-sm"
                      />
                    </div>

                    <Button
                      type="button"
                      onClick={() => void handleAskDocQa()}
                      disabled={isAskingDocQa || !docQaQuestion.trim()}
                      data-testid="btn-run-doc-qa"
                      className="shrink-0 text-xs font-medium"
                    >
                      {isAskingDocQa ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Grounding...
                        </>
                      ) : (
                        <>
                          <HelpCircle className="mr-2 h-4 w-4" />
                          Ask Document
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Preset Question Chips */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] font-medium text-muted-foreground mr-1">Suggested inquiries:</span>
                    {[
                      "What is my total tax liability on Form 1040?",
                      "What was the prescription co-pay amount?",
                      "What are the payment terms and total amount due?",
                      "What were the dividend reinvestments?",
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setDocQaQuestion(preset);
                          void handleAskDocQa(preset);
                        }}
                        data-testid={`preset-${preset.split(" ")[2] || "query"}`}
                        className="rounded-full border border-border/80 bg-muted/40 px-2.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* Document Q&A Results Section */}
            <div className="space-y-4">
              {isAskingDocQa ? (
                <div className="flex flex-col items-center justify-center rounded-[calc(var(--radius)+6px)] border border-border/60 bg-muted/20 py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mb-3" />
                  <p className="text-sm font-medium text-foreground">Finding matching passages...</p>
                  <p className="text-xs text-muted-foreground mt-1">Searching the extracted text and available page locations.</p>
                </div>
              ) : hasAskedDocQa && docQaResult ? (
                <div className="space-y-4">
                  {/* Summary Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-card px-4 py-2.5 shadow-sm text-xs">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-semibold text-foreground" data-testid="metric-doc-qa-total">
                        {docQaResult.total} Passages Matched
                      </span>
                      <span className="text-muted-foreground">•</span>
                      <Badge
                        variant="outline"
                        data-testid="badge-grounding-confidence"
                        className={`text-xs ${
                          docQaResult.isGrounded
                            ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                            : "border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10"
                        }`}
                      >
                        {(docQaResult.groundingScore * 100).toFixed(0)}% match score
                      </Badge>
                      <Badge
                        variant="secondary"
                        data-testid="badge-grounded-status"
                        className="text-xs"
                      >
                        {docQaResult.isGrounded ? "Strong passage match" : "Candidate passage"}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground" data-testid="badge-physical-pages">
                        Physical Pages Cited: {docQaResult.physicalPages.length > 0 ? docQaResult.physicalPages.join(", ") : "None"}
                      </span>
                    </div>
                  </div>

                  {/* Direct Answer Card */}
                  <Card className="rounded-[calc(var(--radius)+6px)] border-emerald-500/30 bg-emerald-500/5 p-5 shadow-sm" data-testid="card-direct-answer">
                    <div className="flex items-start gap-3">
                      <Sparkles className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                      <div className="min-w-0 space-y-2 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-300">
                            Quoted passage
                          </h3>
                          {docQaResult.isGrounded && (
                            <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px]">
                              Matches extracted text
                            </Badge>
                          )}
                        </div>
                        <p className="break-words text-sm text-foreground leading-relaxed font-medium" data-testid="text-direct-answer">
                          {docQaResult.directAnswer}
                        </p>

                        {/* Physical Page Jump Chips */}
                        {docQaResult.physicalPages.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-emerald-500/20">
                            <span className="text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
                              Jump to physical page in viewer:
                            </span>
                            {docQaResult.physicalPages.map((pg) => {
                              const targetFile = docQaResult.passages.find((p) => p.pageNumber === pg);
                              return (
                                <Button
                                  key={pg}
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    if (targetFile) {
                                      setSourcePage(targetFile.workspaceFileId, pg);
                                    }
                                  }}
                                  data-testid={`pill-page-${pg}`}
                                  className="h-6 px-2 text-[11px] font-medium border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15"
                                >
                                  {targetFile?.fileName} · Page {pg}
                                </Button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>

                  {/* Ranked Passages List */}
                  <div className="space-y-3 pt-2">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      Retrieved Document Passages ({docQaResult.passages.length})
                    </h3>

                    {docQaResult.passages.length === 0 ? (
                      <Card className="p-8 text-center text-muted-foreground text-sm">
                        No passages matched your question with sufficient confidence.
                      </Card>
                    ) : (
                      <div className="grid gap-3">
                        {docQaResult.passages.map((passage, idx) => (
                          <Card
                            key={passage.id || `passage-${idx}`}
                            data-testid={`card-qa-passage-${idx}`}
                            className="rounded-[calc(var(--radius)+4px)] border-border/70 p-4 shadow-sm hover:border-border transition-colors"
                          >
                            <div className="flex flex-col gap-3">
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className="border-primary/40 text-primary font-mono text-[11px]"
                                    data-testid={`chip-citation-${idx}`}
                                  >
                                    {passage.citation}
                                  </Badge>

                                  <Badge
                                    variant="secondary"
                                    className="text-[11px] font-medium"
                                    data-testid={`badge-passage-page-${idx}`}
                                  >
                                    {passage.pageNumber ? `Page ${passage.pageNumber}` : "Page unavailable"}
                                  </Badge>

                                  <Badge
                                    variant="outline"
                                    className="text-[11px] text-muted-foreground"
                                    data-testid={`badge-passage-modality-${idx}`}
                                  >
                                    {passage.modality}
                                  </Badge>

                                  <span className="text-xs text-muted-foreground font-medium">
                                    {passage.fileName}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className={`text-[11px] font-mono ${
                                      passage.isGrounded
                                        ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                                        : "border-border text-muted-foreground"
                                    }`}
                                    data-testid={`badge-passage-confidence-${idx}`}
                                  >
                                    {(passage.confidence * 100).toFixed(0)}% Match
                                  </Badge>

                                  <Link
                                    href={`/chat?attachment=${passage.workspaceFileId}&message=${encodeURIComponent(
                                      `According to ${passage.fileName} (${passage.pageNumber ? `Page ${passage.pageNumber}` : "page unavailable"}, citation ${passage.citation}): "${passage.snippet.slice(0, 120)}..." What should I do next?`
                                    )}`}
                                  >
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      data-testid={`btn-copilot-citation-${idx}`}
                                      className="h-7 px-2 text-xs text-primary hover:text-primary/80 gap-1"
                                    >
                                      <MessageSquare className="h-3 w-3" />
                                      Ask Copilot
                                    </Button>
                                  </Link>
                                  <Button type="button" size="sm" variant="outline"
                                    data-testid={`btn-open-qa-source-${idx}`}
                                    onClick={() => passage.pageNumber
                                      ? setSourcePage(passage.workspaceFileId, passage.pageNumber)
                                      : setSelectedId(passage.workspaceFileId)}>
                                    Open source
                                  </Button>
                                </div>
                              </div>

                              <p
                                className="break-words text-xs text-foreground font-mono bg-muted/30 p-2.5 rounded-md leading-relaxed whitespace-pre-wrap"
                                data-testid={`text-passage-snippet-${idx}`}
                              >
                                {passage.text}
                              </p>

                              {passage.entities && (passage.entities.amounts?.length || passage.entities.merchants?.length) ? (
                                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                                  <span className="font-medium">Detected entities:</span>
                                  {passage.entities.amounts?.map((amt, i) => (
                                    <span key={`amt-${i}`} className="rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 font-mono">
                                      Amount {amt.toFixed(2)}
                                    </span>
                                  ))}
                                  {passage.entities.merchants?.map((m, i) => (
                                    <span key={`merch-${i}`} className="rounded bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 px-1.5 py-0.5">
                                      {m}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <Card className="rounded-[calc(var(--radius)+6px)] border-dashed border-border/70 p-12 text-center">
                  <div className="mx-auto flex max-w-md flex-col items-center gap-3">
                    <div className="rounded-full bg-emerald-500/10 p-3 text-emerald-600 dark:text-emerald-400">
                      <HelpCircle className="h-6 w-6" />
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">Ask Any Financial Document Question</h3>
                    <p className="text-xs text-muted-foreground">
                      FinWise uses hybrid dense 64-D semantic embeddings and exact physical page markers (\\f) to quote matching excerpts before planning.
                    </p>
                  </div>
                </Card>
              )}
            </div>
          </div>
        ) : activeTab === "doc-authorship" ? (
          <div className="space-y-6" data-testid="card-doc-authorship-studio">
            {/* Header Card */}
            <Card className="rounded-[calc(var(--radius)+6px)] border-border/70 p-6 shadow-sm">
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-blue-500" />
                      <h2 className="text-lg font-semibold text-foreground">Create a document</h2>
                      <Badge variant="outline" className="border-blue-500/40 text-blue-600 dark:text-blue-400 text-xs">
                        Saved records and your notes
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Create a PDF from your notes and saved profile. Profile figures are added when you generate the PDF. Missing data stays empty; tax rules and valuations require source records.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={includeProfileData}
                        onChange={event => setIncludeProfileData(event.target.checked)} />
                      Include saved financial profile
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAuthoredTitle("");
                        setAuthoredContent("");
                        setAuthoredKpis([]);
                        setIncludeProfileData(false);
                        setNewKpiLabel(""); setNewKpiValue(""); setNewKpiSubtext("");
                        setGeneratedDocResult(null);
                      }}
                      data-testid="btn-reset-authored-form"
                      className="text-xs"
                    >
                      Clear
                    </Button>
                  </div>
                </div>

                {/* Format Selector Grid */}
                <div className="space-y-2 pt-2 border-t border-border/50">
                  <div className="text-xs font-medium text-foreground">Select Financial Document Format:</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                    {[
                      { key: "executive_brief" as const, label: "Executive Brief", icon: FileText, desc: "C-Level briefing & KPIs" },
                      { key: "tax_prep_summary" as const, label: "Tax Prep Summary", icon: Receipt, desc: "Deductions & W-2 audit" },
                      { key: "cash_flow_audit" as const, label: "Cash Flow Audit", icon: ArrowUpDown, desc: "Envelope burn velocity" },
                      { key: "debt_payoff_schedule" as const, label: "Debt Amortization", icon: ShieldCheck, desc: "Avalanche acceleration" },
                      { key: "net_worth_statement" as const, label: "Net Worth Statement", icon: Database, desc: "Assets - Liabilities" },
                      { key: "standard" as const, label: "Custom Free-Form", icon: Sparkles, desc: "Markdown & rich blocks" },
                    ].map(fmt => {
                      const isSelected = authoredFormat === fmt.key;
                      const Icon = fmt.icon;
                      return (
                        <button
                          key={fmt.key}
                          type="button"
                          onClick={() => handleSelectFormat(fmt.key)}
                          data-testid={`btn-format-${fmt.key}`}
                          className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all ${
                            isSelected
                              ? "border-primary bg-primary/10 shadow-sm"
                              : "border-border/60 bg-muted/20 hover:bg-muted/40"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 w-full">
                            <Icon className={`h-3.5 w-3.5 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                            <span className="text-xs font-semibold text-foreground truncate">{fmt.label}</span>
                          </div>
                          <span className="mt-1 text-[10px] text-muted-foreground line-clamp-1">{fmt.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Card>

            {/* Studio Workspace: Editor + Live Preview */}
            <div className="grid gap-6 lg:grid-cols-12">
              {/* Left Column: Form Editor (7 cols) */}
              <div className="lg:col-span-7 space-y-4">
                <Card className="rounded-[calc(var(--radius)+6px)] border-border/70 p-5 space-y-4 shadow-sm">
                  <div className="space-y-1.5">
                    <Label htmlFor="authored-doc-title" className="text-xs font-medium">Document Title</Label>
                    <Input
                      id="authored-doc-title"
                      data-testid="input-authored-title"
                      value={authoredTitle}
                      onChange={e => setAuthoredTitle(e.target.value)}
                      placeholder="e.g. Executive Financial Advisory Brief - Q4 2026"
                      className="text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="authored-doc-content" className="text-xs font-medium">Executive Content & Recommendations</Label>
                    <Textarea
                      id="authored-doc-content"
                      data-testid="textarea-authored-content"
                      value={authoredContent}
                      onChange={e => setAuthoredContent(e.target.value)}
                      placeholder="Enter executive narrative, bullet points, markdown headings, or tables..."
                      className="min-h-[140px] text-xs font-mono"
                    />
                  </div>

                  {/* KPI Cards Builder */}
                  <div className="space-y-3 pt-2 border-t border-border/50" data-testid="section-kpi-builder">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-foreground">Top KPI Highlight Cards ({authoredKpis.length}/4)</Label>
                      <span className="text-[11px] text-muted-foreground">Side-by-side executive metrics</span>
                    </div>

                    {/* Existing KPIs */}
                    <div className="grid grid-cols-2 gap-2">
                      {authoredKpis.map((kpi, idx) => (
                        <div
                          key={`kpi-${idx}`}
                          data-testid={`chip-kpi-${idx}`}
                          className="flex items-center justify-between p-2 rounded-md border border-border/60 bg-muted/20 text-xs"
                        >
                          <div className="overflow-hidden pr-2">
                            <div className="text-[10px] uppercase font-bold text-muted-foreground truncate">{kpi.label}</div>
                            <div className="font-semibold text-foreground">{kpi.value}</div>
                            {kpi.subtext ? <div className="text-[10px] text-emerald-600 dark:text-emerald-400 truncate">{kpi.subtext}</div> : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveKpi(idx)}
                            data-testid={`btn-remove-kpi-${idx}`}
                            className="text-muted-foreground hover:text-destructive p-1"
                            aria-label={`Remove ${kpi.label} metric`}
                            title="Remove KPI"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Add New KPI */}
                    {authoredKpis.length < 4 ? (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Input
                          aria-label="Metric label"
                          placeholder="Label (e.g. Net Surplus)"
                          value={newKpiLabel}
                          onChange={e => setNewKpiLabel(e.target.value)}
                          data-testid="input-kpi-label"
                          className="h-8 text-xs flex-1 min-w-[100px]"
                        />
                        <Input
                          aria-label="Metric value"
                          placeholder="Value with currency or unit"
                          value={newKpiValue}
                          onChange={e => setNewKpiValue(e.target.value)}
                          data-testid="input-kpi-value"
                          className="h-8 text-xs flex-1 min-w-[100px]"
                        />
                        <Input
                          aria-label="Metric description"
                          placeholder="Subtext (optional)"
                          value={newKpiSubtext}
                          onChange={e => setNewKpiSubtext(e.target.value)}
                          data-testid="input-kpi-subtext"
                          className="h-8 text-xs flex-1 min-w-[100px]"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleAddKpi}
                          data-testid="btn-add-kpi"
                          className="h-8 text-xs px-2.5"
                        >
                          <Sparkles className="mr-1 h-3 w-3" />
                          Add KPI
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  <div className="pt-2">
                    <Button
                      type="button"
                      onClick={handleGenerateAuthoredPdf}
                      disabled={isGeneratingDoc || !authoredTitle.trim()}
                      data-testid="btn-generate-authored-pdf"
                      className="w-full text-xs font-semibold py-2.5"
                    >
                      {isGeneratingDoc ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating PDF...
                        </>
                      ) : (
                        <>
                          <BookOpen className="mr-2 h-4 w-4" />
                          Create and save PDF
                        </>
                      )}
                    </Button>
                  </div>
                </Card>
              </div>

              {/* Right Column: Live Layout Preview & Result (5 cols) */}
              <div className="lg:col-span-5 space-y-4">
                {/* Live Preview Card */}
                <Card className="rounded-[calc(var(--radius)+6px)] border-border/70 p-4 space-y-3 shadow-sm bg-card" data-testid="card-authored-live-preview">
                  <div className="flex items-center justify-between pb-2 border-b border-border/50">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-primary" />
                      Document preview
                    </span>
                    <Badge variant="outline" className="text-[10px]" data-testid="preview-badge-format">
                      {authoredFormat.replace(/_/g, " ").toUpperCase()}
                    </Badge>
                  </div>

                  {/* Document Simulated Canvas */}
                  <div className="rounded border border-border/80 bg-background p-4 space-y-3 font-sans text-foreground text-xs shadow-inner">
                    {/* Simulated Header Banner */}
                    <div className="rounded bg-slate-900 text-white p-3 space-y-0.5">
                      <div className="text-[10px] tracking-wider font-bold">FINWISE FINANCIAL INTELLIGENCE</div>
                      <div className="text-[8px] text-blue-300 font-medium uppercase tracking-widest">
                        {authoredFormat.replace(/_/g, " ")} • DRAFT PREVIEW
                      </div>
                    </div>

                    {/* Metadata & Title */}
                    <div className="space-y-1">
                      <div className="text-[9px] text-muted-foreground">
                        Layout preview • Saved figures are added during generation
                      </div>
                      <div className="text-sm font-bold text-foreground leading-snug" data-testid="preview-title">
                        {authoredTitle || "Untitled Financial Document"}
                      </div>
                    </div>

                    {/* Simulated KPI Grid */}
                    {authoredKpis.length > 0 ? (
                      <div className="grid grid-cols-2 gap-1.5 pt-1">
                        {authoredKpis.slice(0, 4).map((kpi, idx) => (
                          <div
                            key={`preview-kpi-${idx}`}
                            data-testid={`preview-kpi-${idx}`}
                            className="rounded border border-border/70 bg-muted/30 p-2 space-y-0.5"
                          >
                            <div className="text-[8px] uppercase font-bold text-muted-foreground">{kpi.label}</div>
                            <div className="text-xs font-bold text-foreground">{kpi.value}</div>
                            {kpi.subtext ? <div className="text-[8px] text-emerald-600 dark:text-emerald-400">{kpi.subtext}</div> : null}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {/* Simulated Content Lines */}
                    <div className="space-y-1 pt-1 text-[10px] text-muted-foreground line-clamp-4">
                      {authoredContent || "Document content and strategic recommendations will render here."}
                    </div>

                    {includeProfileData && (
                      <p className="rounded border border-border/70 p-2 text-[10px] text-muted-foreground">
                        The generated PDF will include available figures from your saved profile.
                      </p>
                    )}

                    {/* Footer */}
                    <div className="pt-2 border-t border-border/50 text-[8px] text-muted-foreground text-center">
                      Preview only • Download the generated PDF to check final pages
                    </div>
                  </div>
                </Card>

                {/* Generated Result Output Card */}
                {generatedDocResult ? (
                  <Card
                    data-testid="card-generated-doc-result"
                    className="rounded-[calc(var(--radius)+6px)] border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-xs font-semibold text-foreground">Document Generated & Saved!</span>
                    </div>
                    <div className="text-xs text-foreground font-medium truncate">{generatedDocResult.filename}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[10px]" data-testid="badge-generated-doc-format">
                        {generatedDocResult.format}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]" data-testid="badge-generated-doc-pages">
                        {generatedDocResult.pageCount} page(s)
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">{formatBytes(generatedDocResult.sizeBytes)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 pt-2 text-xs">
                      <a
                        data-testid="btn-download-authored-pdf"
                        className="text-primary font-semibold underline underline-offset-4"
                        href={buildApiUrl(`/files/rendered/${generatedDocResult.fileId}/download`)}
                        download={generatedDocResult.filename}
                      >
                        Download PDF
                      </a>
                      <button
                        type="button"
                        data-testid="btn-open-authored-file"
                        className="text-primary font-semibold underline underline-offset-4"
                        onClick={() => setSelectedId(generatedDocResult.workspaceFileId)}
                      >
                        Inspect in Files
                      </button>
                      <Link
                        data-testid="btn-ask-authored-pdf"
                        className="text-primary font-semibold underline underline-offset-4"
                        href={`/chat?attachment=${generatedDocResult.workspaceFileId}`}
                      >
                        Ask Copilot about this PDF
                      </Link>
                    </div>
                  </Card>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="rounded-[calc(var(--radius)+6px)] border-border/70 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => {
                    setPage(1);
                    setSearch(event.target.value);
                  }}
                  placeholder="Search by file name or extracted preview"
                  aria-label="Search workspace files"
                  className="pl-9"
                />
              </div>
              <div className="text-xs text-muted-foreground">
                Use this page to keep reusable context ready for chat.
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {filesQuery.isLoading ? (
                <div className="col-span-full rounded-[calc(var(--radius)-6px)] border border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
                  Loading your files...
                </div>
              ) : filesQuery.isError ? (
                <div role="alert" className="col-span-full rounded-lg border border-destructive/30 p-6">
                  <p className="text-sm">Your files could not be loaded. Try again to view your workspace.</p>
                  <Button className="mt-3" variant="outline" onClick={() => void filesQuery.refetch()}>Try again</Button>
                </div>
              ) : files.length === 0 ? (
                <div className="col-span-full rounded-[calc(var(--radius)-6px)] border border-dashed border-border/70 bg-muted/20 p-8 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <FolderOpen className="h-5 w-5" />
                  </div>
                  <div className="text-base font-semibold text-foreground">No workspace files yet</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Upload files here or attach them from chat to start building reusable AI context.
                  </div>
                </div>
              ) : (
                files.map((file, index) => {
                  const Icon = fileKindIcon[file.kind] || FileText;

                  return (
                    <motion.button
                      key={file.id}
                      type="button"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      onClick={() => setSelectedId(file.id)}
                      className="rounded-[calc(var(--radius)-6px)] border border-border/70 bg-background/60 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_18px_34px_-30px_rgba(15,23,42,0.55)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                          <Icon className="h-5 w-5" />
                        </div>
                        <Badge variant="outline">{file.status}</Badge>
                      </div>

                      <div className="mt-4 space-y-2">
                        <div className="line-clamp-2 text-sm font-semibold text-foreground">{file.originalName}</div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{fileKindLabel[file.kind] || "File"}</span>
                          <span>{formatBytes(file.sizeBytes)}</span>
                        </div>
                        <div className="line-clamp-4 text-sm leading-6 text-muted-foreground">
                          {file.extractedPreview || (file.status === "error"
                            ? "Text could not be extracted from this file. Open it to see the extraction notes."
                            : "Stored and ready. Open the file to inspect extracted content or run AI analysis.")}
                        </div>
                        {file.analysis?.summary ? (
                          <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-xs text-foreground">
                            {file.analysis.summary}
                          </div>
                        ) : null}
                      </div>
                    </motion.button>
                  );
                })
              )}
            </div>

            <div className="mt-5 flex items-center justify-between">
              <Button variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>
                Previous
              </Button>
              <div className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </div>
              <Button variant="outline" onClick={() => setPage((current) => current + 1)} disabled={page >= totalPages}>
                Next
              </Button>
            </div>
          </Card>

          <Card className="rounded-[calc(var(--radius)+6px)] border-border/70 p-5">
            <div className="space-y-4">
              <div>
                <div className="text-sm font-semibold text-foreground">How it works</div>
                <div className="mt-1 text-sm leading-6 text-muted-foreground">
                  Each upload is stored in your workspace, text is extracted when possible, and the AI can use that
                  content for summaries, action plans, and richer chat answers.
                </div>
              </div>

              <div className="space-y-3">
                {[
                  "Upload PDFs, spreadsheets, images, notes, and code.",
                  "Review extracted text before sending the file into AI analysis.",
                  "Attach uploaded files in chat to ground the conversation in real context.",
                ].map((item) => (
                  <div key={item} className="rounded-[calc(var(--radius)-8px)] border border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </section>
        )}
      </div>

      <Sheet open={Boolean(selectedId)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle className="break-words pr-6">{selectedFile?.originalName || "Workspace file"}</SheetTitle>
            <SheetDescription>Inspect extracted content, open the original file, and run AI analysis.</SheetDescription>
          </SheetHeader>

          {returnToChat ? (
            <Button asChild variant="outline" className="mt-4">
              <Link href={returnToChat}>Back to chat</Link>
            </Button>
          ) : null}

          {detailQuery.isError ? (
            <div role="alert" className="mt-6 space-y-3">
              <p className="text-sm">File details could not be loaded.</p>
              <Button variant="outline" onClick={() => void detailQuery.refetch()}>Try again</Button>
            </div>
          ) : !selectedFile ? (
            <div className="mt-6 text-sm text-muted-foreground">
              {detailQuery.isLoading ? "Loading file details..." : "Select a file to inspect it."}
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{fileKindLabel[selectedFile.kind] || selectedFile.kind}</Badge>
                <Badge variant="outline">{selectedFile.status}</Badge>
                <Badge variant="outline">{formatBytes(selectedFile.sizeBytes)}</Badge>
              </div>

              <ExtractedFileText key={selectedFile.id} text={selectedFile.extractedText}
                pageCount={selectedFile.extractedPageCount} page={selectedPage}
                onPageChange={(next) => setSourcePage(selectedFile.id, next)} />

              {selectedFile.kind === "image" ? (
                <div className="overflow-hidden rounded-[calc(var(--radius)-8px)] border border-border/70">
                  <img
                    src={buildApiUrl(`/media/${selectedFile.fileId}`)}
                    alt={selectedFile.originalName}
                    className="h-auto w-full"
                  />
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <Button asChild variant="outline">
                <a
                  href={buildApiUrl(`/media/${selectedFile.fileId}`)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex"
                >
                  Open original
                </a>
                </Button>
                <Button
                  onClick={() =>
                    analyzeMutation.mutate({
                      id: selectedFile.id,
                      prompt: analysisPrompt.trim() || undefined,
                    })
                  }
                  disabled={analyzeMutation.isPending}
                >
                  {analyzeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Analyze with AI
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteMutation.mutate(selectedFile.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="analysis-prompt">Optional focus prompt</Label>
                <Textarea
                  id="analysis-prompt"
                  value={analysisPrompt}
                  onChange={(event) => setAnalysisPrompt(event.target.value)}
                  placeholder="Example: Extract payment obligations, due dates, and what I should do next."
                  className="min-h-[110px]"
                />
              </div>

              {selectedFile.extractionWarnings.length ? (
                <div className="rounded-[calc(var(--radius)-8px)] border border-border/70 bg-muted/20 p-4">
                  <div className="text-sm font-semibold text-foreground">Extraction notes</div>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {selectedFile.extractionWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {selectedFile.analysis?.response ? (
                <Card className="rounded-[calc(var(--radius)-8px)] border-border/70 p-4">
                  {selectedFile.analysis.fallbackUsed ? (
                    <p role="status" className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-foreground">
                      AI narration is unavailable. This is a fallback financial plan; review the extracted text to verify file details.
                    </p>
                  ) : null}
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">Latest AI analysis</div>
                      <div className="text-xs text-muted-foreground">
                        {(selectedFile.analysis.agentsInvolved || []).join(", ") || "AI strategist"}
                      </div>
                    </div>
                    {selectedFile.analysis.updatedAt ? (
                      <div className="text-xs text-muted-foreground">
                        {new Date(selectedFile.analysis.updatedAt).toLocaleString()}
                      </div>
                    ) : null}
                  </div>

                  <div className="prose prose-sm max-w-none text-foreground dark:prose-invert">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {selectedFile.analysis.response}
                    </ReactMarkdown>
                  </div>
                  {selectedFile.analysis.evidence?.length ? (
                    <div className="mt-4"><SourceEvidenceList items={selectedFile.analysis.evidence} returnTo={returnToChat} /></div>
                  ) : null}
                </Card>
              ) : null}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
