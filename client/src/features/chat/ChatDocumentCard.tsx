import { Link } from "wouter";
import type { IChatAttachment, IChatMessageMetadata } from "@/types/chat.types";
import { buildApiUrl } from "@/lib/apiBase";
import { evidenceFilePath, isWorkspaceFileId } from "@/lib/fileReferences";

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
        {document.filename} · PDF · {Math.max(1, Math.ceil(document.sizeBytes / 1024))} KB
      </p>
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        <a
          data-testid={`btn-download-pdf-${document.fileId}`}
          className="text-primary underline underline-offset-4"
          href={buildApiUrl(`/files/rendered/${document.fileId}/download`)}
          download={document.filename}
        >
          Download PDF
        </a>
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
            Ask about this PDF
          </button>
        ) : null}
      </div>
    </section>
  );
}

