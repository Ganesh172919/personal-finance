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
  FileSearch,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Search,
  Sparkles,
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
  analyzeWorkspaceFile,
  deleteWorkspaceFile,
  getWorkspaceFile,
  listWorkspaceFiles,
  uploadWorkspaceFiles,
} from "@/lib/api/files";
import { buildApiUrl } from "@/lib/apiBase";
import { isWorkspaceFileId, readChatReturnPath, readSourcePage } from "@/lib/fileReferences";

const EMPTY_FILES: Awaited<ReturnType<typeof listWorkspaceFiles>>["files"] = [];

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

const fileKindLabel: Record<string, string> = {
  archive: "Archive",
  code: "Code",
  data: "Data",
  document: "Document",
  image: "Image",
  other: "Other",
  spreadsheet: "Spreadsheet",
};

const fileKindIcon: Record<string, typeof FileText> = {
  archive: FolderOpen,
  code: FileText,
  data: FileSearch,
  document: FileText,
  image: ImageIcon,
  other: FileText,
  spreadsheet: FileSearch,
};

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
                          {file.extractedPreview || "Stored and ready. Open the file to inspect extracted content or run AI analysis."}
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
