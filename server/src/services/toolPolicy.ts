import { getEnv } from "../config/env";
import type { ToolCallInput } from "../schemas/v1/toolSchemas";
import type { ToolCatalogEntry } from "./toolCatalog";

// Defines discrete risk tiers assigned to AI tool execution actions.
// Ranges from low-impact lookups to high-risk mutating workflows.
// Governs human-in-the-loop confirmation requirements and auditing rules.
export type ToolRisk = "low" | "medium" | "high";

// Maps tool risk tier labels to ordinal numeric ranking weights.
// Used for comparing and escalating risk levels across policy rules.
// Ensures higher-severity risk rankings take precedence during evaluation.
const riskRank: Record<ToolRisk, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

// Compares two risk levels and returns the more severe classification.
// Leverages numeric risk ranks to determine relative escalation hierarchy.
// Guarantees safety policies never demote a tool's baseline risk rating.
const maxRisk = (a: ToolRisk, b: ToolRisk): ToolRisk => {
  return riskRank[a] >= riskRank[b] ? a : b;
};

// Represents the computed policy evaluation outcome for a tool call.
// Details mandatory confirmation flags, assigned risk tiers, and triggers.
// Supplies human-readable audit reason codes explaining policy decisions.
export type ToolPolicyDecision = {
  requires_confirmation: boolean;
  risk: ToolRisk;
  reasons: string[];
};

// Evaluates security policies and risk levels for an incoming tool invocation.
// Factors in catalog defaults, tool payload values, and financial thresholds.
// Enforces mandatory user confirmations for high-value or high-risk mutations.
export const evaluateToolPolicy = (params: { toolCall: ToolCallInput; catalog: ToolCatalogEntry }): ToolPolicyDecision => {
  const reasons: string[] = [];

  let requires_confirmation = Boolean(params.toolCall.requires_confirmation || params.catalog.requires_confirmation_default);
  if (params.catalog.requires_confirmation_default && !params.toolCall.requires_confirmation) {
    reasons.push("catalog_requires_confirmation");
  }

  let risk = maxRisk(String(params.catalog.risk_default) as ToolRisk, String(params.toolCall.risk) as ToolRisk);
  if (params.catalog.risk_default !== params.toolCall.risk) {
    reasons.push("catalog_risk_floor");
  }

  const env = getEnv();

  if (params.toolCall.tool === "transactions.create") {
    const amountRaw = Number((params.toolCall.args as any)?.amount);
    const amount = Number.isFinite(amountRaw) ? Math.abs(amountRaw) : 0;
    if (amount >= env.TOOL_POLICY_TX_CONFIRM_ABOVE) {
      if (!requires_confirmation) {
        reasons.push("tx_amount_requires_confirmation");
      }
      requires_confirmation = true;
      risk = maxRisk(risk, "medium");
    }
  }

  return { requires_confirmation, risk, reasons };
};

