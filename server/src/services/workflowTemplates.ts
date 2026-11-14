import type mongoose from "mongoose";

import PluginInstallModel from "../models/pluginInstallModel";

// Defines the structural shape of a workflow creation request payload.
// Encapsulates workflow title, enabled status, trigger configuration, and actions.
// Used by pre-configured workflow templates to instantiate automation recipes.
type CreateWorkflowRequestLike = {
  name: string;
  enabled?: boolean;
  trigger: { type: "manual" | "cron" | "event"; cron?: string; event_type?: string };
  actions: unknown[];
};

// Specification defining a reusable workflow template bundled with a plugin.
// Maps unique template identifiers to parent plugin keys and descriptions.
// Houses the pre-configured creation payload for 1-click workflow deployment.
export type WorkflowTemplate = {
  template_key: string;
  plugin_key: string;
  name: string;
  description: string;
  request: CreateWorkflowRequestLike;
};

// Static registry mapping plugin keys to their bundled workflow recipe templates.
// Supplies out-of-the-box cron and event triggers tailored to each plugin.
// Helps organizations deploy tested automations immediately upon installing plugins.
const PLUGIN_WORKFLOW_TEMPLATES: Record<string, Omit<WorkflowTemplate, "plugin_key">[]> = {
  "finwise.connector.bank_stub": [
    {
      template_key: "bank_stub.weekly-sync-checkin",
      name: "Bank sync weekly check-in (stub)",
      description: "Creates a weekly task to run your bank sync and review new transactions.",
      request: {
        name: "Bank sync weekly check-in (stub)",
        enabled: true,
        trigger: { type: "cron", cron: "0 9 * * 1" },
        actions: [
          {
            type: "create_task",
            bucket: 7,
            title: "Run bank sync + review spending",
            why: "Keeping data fresh improves insights and prevents drift.",
            steps: [
              "Go to Organization → Integrations and run Bank Connector (Stub) sync",
              "Review top categories for the last 7 days",
              "Apply or dismiss one high-impact task from AI",
            ],
            priority: "medium",
            expected_impact: "Improves data freshness and execution consistency.",
            kind: "cashflow",
            due_days: 7,
          },
        ],
      },
    },
    {
      template_key: "bank_stub.new-transaction-review",
      name: "New transaction review (event)",
      description: "Creates a short review task when a new transaction is created.",
      request: {
        name: "New transaction review",
        enabled: true,
        trigger: { type: "event", event_type: "TransactionCreated" },
        actions: [
          {
            type: "create_task",
            bucket: 7,
            title: "Review your latest transaction",
            why: "Quick checks reduce category drift and improve data quality.",
            steps: ["Confirm category and amount", "If avoidable, set a cap for that category this week"],
            priority: "low",
            expected_impact: "Improves categorization and spending awareness.",
            kind: "budget",
            due_days: 2,
          },
        ],
      },
    },
  ],
};

// Discovers available workflow automation templates for installed organization plugins.
// Queries active plugin installations and matches against the template registry.
// Returns ready-to-deploy workflow recipes annotated with installed plugin versions.
export const listWorkflowTemplatesForOrg = async (params: { orgId: mongoose.Types.ObjectId }) => {
  const installs = await PluginInstallModel.find({ orgId: params.orgId, status: "installed" })
    .select({ pluginKey: 1, version: 1, status: 1 })
    .lean();

  const byKey = new Map(installs.map((row: any) => [String(row.pluginKey), String(row.version || "")]));

  const templates: Array<WorkflowTemplate & { plugin_version: string | null }> = [];

  for (const [pluginKey, pluginVersion] of byKey.entries()) {
    const entries = PLUGIN_WORKFLOW_TEMPLATES[pluginKey];
    if (!entries || entries.length === 0) continue;
    for (const entry of entries) {
      templates.push({
        ...entry,
        plugin_key: pluginKey,
        plugin_version: pluginVersion || null,
      });
    }
  }

  return templates;
};

