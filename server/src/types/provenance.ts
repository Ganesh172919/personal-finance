export type MutationOrigin =
  | "manual"
  | "csv_import"
  | "receipt_ocr"
  | "journal"
  | "task_completion"
  | "ai_plan";

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
