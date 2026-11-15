import { Link } from "wouter";
import { useState, type ReactNode } from "react";
import type { IChatAttachment, IChatMessageMetadata } from "@/types/chat.types";
import { buildApiUrl } from "@/lib/apiBase";
import { evidenceFilePath, isWorkspaceFileId } from "@/lib/fileReferences";
import { downloadAuthenticatedFile, triggerBrowserDownload } from "@/lib/api/v1/exports";

export function ChatFileDownloadLink({ path, filename, children, testId }: {
  path: string; filename: string; children: ReactNode; testId?: string;
}) {
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string>();
  return <span className="inline-flex flex-wrap items-baseline gap-2">
    <a data-testid={testId} className="text-primary underline underline-offset-4"
      href={buildApiUrl(path)} download={filename} aria-busy={pending}
      onClick={async event => {
        event.preventDefault();
        if (pending) return;
        setPending(true);
        setStatus(undefined);
        try {
          const file = await downloadAuthenticatedFile(path, filename);
          if (!file.blob.size || !/^(application\/pdf|text\/plain)(?:;|$)/i.test(file.contentType)) {
            throw new Error("Unexpected file response");
          }
          triggerBrowserDownload(file);
          setStatus("Sent to browser downloads.");
        } catch {
          setStatus("The download is unavailable. Try again.");
        } finally {
          setPending(false);
        }
      }}>{pending ? "Preparing download…" : children}</a>
    {status && <span role="status" className="text-xs text-muted-foreground">{status}</span>}
  </span>;
}

// Lookup dictionary mapping document format enum keys to human-readable labels.
// Translates raw document identifiers into formatted UI badge descriptors.
// Ensures consistent presentation across generated financial statement summaries.
const FORMAT_DISPLAY_NAMES: Record<string, string> = {
  executive_brief: "Executive Brief",
  tax_prep_summary: "Tax Prep Summary",
  cash_flow_audit: "Cash Flow Audit",
  debt_payoff_schedule: "Debt Amortization",
  net_worth_statement: "Net Worth Statement",
  standard: "Financial Report",
};

// Renders an embedded preview card for documents generated during chat conversations.
// Displays document metadata, format classifications, file size, and page counts.
// Supplies action links for direct PDF download, file viewing, and prompt reuse.
export function ChatDocumentCard({ document, returnTo, onUseDocument, disabled }: {
  document: NonNullable<IChatMessageMetadata["generatedDocuments"]>[number]; returnTo?: string;
  onUseDocument?: (file: IChatAttachment) => void; disabled?: boolean;
}) {
  const path = evidenceFilePath({ type: "file", entity_id: document.workspaceFileId }, returnTo);
  if (!path || !isWorkspaceFileId(document.fileId)) return null;

  const formatLabel = document.format ? (FORMAT_DISPLAY_NAMES[document.format] || document.format) : undefined;
  const fileType = document.mimeType === "text/plain" ? "TXT" : "PDF";

  return (
    <section
      data-testid={`card-chat-doc-${document.fileId}`}
      aria-label={`Created document: ${document.title}`}
      className="mt-3 w-full rounded-md border border-border bg-background p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="break-words text-sm font-semibold">{document.title}</h3>
        <div className="flex items-center gap-1.5">
          {formatLabel ? (
            <span
              data-testid={`badge-doc-format-${document.fileId}`}
              className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary"
            >
              {formatLabel}
            </span>
          ) : null}
          {document.pageCount && document.pageCount > 1 ? (
            <span
              data-testid={`badge-doc-pages-${document.fileId}`}
              className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              {document.pageCount} pages
            </span>
          ) : null}
        </div>
      </div>
      <p className="mt-1 break-all text-xs text-muted-foreground">
        {document.filename} · {fileType} · {Math.max(1, Math.ceil(document.sizeBytes / 1024))} KB
      </p>
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        <ChatFileDownloadLink testId={`btn-download-pdf-${document.fileId}`}
          path={`/files/rendered/${document.fileId}/download`} filename={document.filename}>
          Download {fileType}
        </ChatFileDownloadLink>
        <Link
          data-testid={`link-open-files-${document.fileId}`}
          className="text-primary underline underline-offset-4"
          href={path}
        >
          Open in Files
        </Link>
        {onUseDocument ? (
          <button
            data-testid={`btn-ask-about-pdf-${document.fileId}`}
            type="button"
            disabled={disabled}
            className="text-primary underline underline-offset-4 disabled:opacity-50"
            onClick={() =>
              onUseDocument({
                workspaceFileId: document.workspaceFileId,
                fileId: document.fileId,
                originalName: document.filename,
                mimeType: document.mimeType,
                sizeBytes: document.sizeBytes,
              })
            }
          >
            Ask about this {fileType === "PDF" ? "PDF" : "file"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

