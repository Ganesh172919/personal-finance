export type Role = "member" | "admin" | "owner";
export type Risk = "low" | "medium" | "high";

export type ToolCallInput = {
  id: string;
  title: string;
  description: string;
  tool: string;
  args: Record<string, unknown>;
  requires_confirmation: boolean;
  risk: Risk;
};

