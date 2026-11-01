import { Link } from "wouter";
import type { IChatAttachment, IChatMessageMetadata } from "@/types/chat.types";
import { buildApiUrl } from "@/lib/apiBase";
import { evidenceFilePath, isWorkspaceFileId } from "@/lib/fileReferences";

export function ChatDocumentCard({ document, returnTo, onUseDocument, disabled }: {
  document: NonNullable<IChatMessageMetadata["generatedDocuments"]>[number]; returnTo?: string;
  onUseDocument?: (file: IChatAttachment) => void; disabled?: boolean;
}) {
  const path = evidenceFilePath({ type: "file", entity_id: document.workspaceFileId }, returnTo);
  if (!path || !isWorkspaceFileId(document.fileId)) return null;
  return (
    <section aria-label={`Created document: ${document.title}`} className="mt-3 w-full rounded-md border border-border bg-background p-3">
      <h3 className="break-words text-sm font-semibold">{document.title}</h3>
      <p className="mt-1 break-all text-xs text-muted-foreground">{document.filename} · PDF · {Math.max(1, Math.ceil(document.sizeBytes / 1024))} KB</p>
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        <a className="text-primary underline underline-offset-4" href={buildApiUrl(`/files/rendered/${document.fileId}/download`)} download={document.filename}>Download PDF</a>
        <Link className="text-primary underline underline-offset-4" href={path}>Open in Files</Link>
        {onUseDocument ? <button type="button" disabled={disabled} className="text-primary underline underline-offset-4 disabled:opacity-50" onClick={() => onUseDocument({
          workspaceFileId: document.workspaceFileId, fileId: document.fileId, originalName: document.filename,
          mimeType: document.mimeType, sizeBytes: document.sizeBytes,
        })}>Ask about this PDF</button> : null}
      </div>
    </section>
  );
}
