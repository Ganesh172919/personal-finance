import { useId, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/Button";
import { evidenceFilePath } from "@/lib/fileReferences";
import type { EvidenceItem } from "@/types/evidence.types";

export function SourceEvidenceList({ items, returnTo }: { items: EvidenceItem[]; returnTo?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  if (!items.length) return null;
  // Put the cited passages ahead of general financial context, retaining every source.
  const priority = (item: EvidenceItem) => item.type === "retrieval_chunk" ? 0 : item.type === "file" ? 1 : 2;
  const ordered = [...items].sort((a, b) => priority(a) - priority(b));
  const visible = expanded ? ordered : ordered.slice(0, 4);

  return (
    <section aria-label="Evidence used" className="rounded-md border border-border bg-background/60 p-3">
      <h3 className="text-sm font-semibold text-foreground">Evidence used</h3>
      <ul id={listId} className="mt-2 space-y-2">
        {visible.map((item, index) => {
          const path = evidenceFilePath(item, returnTo);
          const label = item.label || item.type || "Source";
          return (
            <li key={item.id || `${label}-${index}`} className="break-words rounded-md border border-border/70 bg-background p-3">
              <div className="text-sm font-medium text-foreground">{label}</div>
              {item.snippet ? <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{item.snippet}</p> : null}
              {path ? (
                <Link href={path} aria-label={`Open source: ${label}`}
                  className="mt-2 inline-block text-sm font-medium text-primary underline underline-offset-4">
                  Open source{item.page_number && path.includes("&page=") ? ` · page ${item.page_number}` : ""}
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
      {items.length > 4 ? (
        <Button type="button" variant="outline" size="sm" className="mt-3"
          aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded(value => !value)}>
          {expanded ? "Show fewer sources" : `Show all ${items.length} sources`}
        </Button>
      ) : null}
    </section>
  );
}
