import { getEnv } from "../config/env";
import type { ToolCallInput } from "../schemas/v1/toolSchemas";
import type { ToolCatalogEntry } from "./toolCatalog";

export type ToolRisk = "low" | "medium" | "high";

const riskRank: Record<ToolRisk, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const maxRisk = (a: ToolRisk, b: ToolRisk): ToolRisk => {
  return riskRank[a] >= riskRank[b] ? a : b;
};

export type ToolPolicyDecision = {
  requires_confirmation: boolean;
  risk: ToolRisk;
  reasons: string[];
};

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

