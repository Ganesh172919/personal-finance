// Models verifiable factual citations and source snippets extracted by agents.
// References entity IDs, text excerpts, source types, and document page markers.
// Equips UI citation cards with traceability links back to underlying records.
export interface EvidenceItem {
  id?: string;
  type?: string;
  label?: string;
  snippet?: string;
  entity_id?: string;
  /** Verified physical PDF page; absent for legacy or unpaged sources. */
  page_number?: number;
}
