export interface EvidenceItem {
  id?: string;
  type?: string;
  label?: string;
  snippet?: string;
  entity_id?: string;
  /** Verified physical PDF page; absent for legacy or unpaged sources. */
  page_number?: number;
}
