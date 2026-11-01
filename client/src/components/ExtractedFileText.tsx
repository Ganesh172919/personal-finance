import { useId, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/TextArea";

export function ExtractedFileText({ text = "", pageCount, page, onPageChange }: {
  text?: string;
  pageCount?: number;
  page?: number;
  onPageChange?: (page: number) => void;
}) {
  const [localPage, setLocalPage] = useState(1);
  const textId = useId();
  const hasKnownPages = Number.isInteger(pageCount) && (pageCount ?? 0) > 0;
  const isPaged = hasKnownPages || text.includes("\f");
  const pages = isPaged ? text.split("\f") : [text];
  const requested = page ?? localPage;
  const requestedPage = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
  const changePage = (next: number) => onPageChange ? onPageChange(next) : setLocalPage(next);
  if (requestedPage > pages.length) {
    return (
      <section className="space-y-3" aria-label="Extracted file content">
        <p className="text-sm font-semibold">Extracted text</p>
        <p role="status" className="text-sm text-muted-foreground">
          Page {requestedPage} is not available in extracted text. Open the original file to review this citation.
        </p>
        <Button size="sm" variant="outline" onClick={() => changePage(1)}>Go to first extracted page</Button>
      </section>
    );
  }
  const currentPage = requestedPage - 1;
  const pageText = pages[currentPage].trim();

  return (
    <section className="space-y-3" aria-label="Extracted file content">
      <Label htmlFor={textId}>Extracted text</Label>
      {isPaged ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant="outline" aria-label="Previous extracted page"
            onClick={() => changePage(requestedPage - 1)} disabled={currentPage === 0}>
            Previous page
          </Button>
          <span role="status" className="text-sm text-muted-foreground">
            Page {currentPage + 1} of {pages.length}
          </span>
          <Button size="sm" variant="outline" aria-label="Next extracted page"
            onClick={() => changePage(requestedPage + 1)} disabled={currentPage === pages.length - 1}>
            Next page
          </Button>
        </div>
      ) : null}
      {hasKnownPages && pageCount! > pages.length ? (
        <p className="text-sm text-muted-foreground">
          Text is available for {pages.length} of {pageCount} PDF pages. Open the original to review the remaining pages.
        </p>
      ) : null}
      <Textarea id={textId} value={pageText} readOnly className="min-h-[220px]"
        aria-label={isPaged ? `Extracted text, page ${currentPage + 1}` : "Extracted text"} />
      {!pageText ? (
        <p className="text-sm text-muted-foreground">
          {isPaged
            ? "No selectable text was extracted from this page. It may be blank or scanned."
            : "No extracted text is available for this file yet."}
        </p>
      ) : null}
    </section>
  );
}
