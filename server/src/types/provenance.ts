// Enumerates all recognized system sources that can trigger data mutations.
// Identifies whether an update stemmed from manual input, CSV import, OCR, or AI.
// Powers audit trails and provenance tracking across financial transactions.
export type MutationOrigin =
  | "manual"
  | "csv_import"
  | "receipt_ocr"
  | "journal"
  | "task_completion"
  | "ai_plan"
  | "voice_note"
  | "connector";

// Structured provenance metadata recorded alongside mutated entity state.
// Links modified records to originating request IDs, agent runs, receipts, and actors.
// Provides historical context for auditing financial edits and automated ledger adjustments.
export interface MutationSource {
  origin: MutationOrigin;
  request_id?: string;
  task_id?: string;
  agent_output_id?: string;
  receipt_id?: string;
  journal_entry_id?: string;
  action_link_id?: string;
  actor_type?: "user" | "system" | "agent";
  source_ref?: string;
  note?: string;
}
