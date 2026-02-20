import type { CreateWorkflowRequest, Workflow } from "@/lib/apiClient";

import type { WorkflowAction } from "@/types/apiTypes";

export type WorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  request: CreateWorkflowRequest;
};

const MAX_TEMPLATE_PARAM_LEN = 20_000;

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const safeJsonParse = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const base64UrlEncode = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const base64UrlDecode = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4;
  const padded = pad ? `${normalized}${"=".repeat(4 - pad)}` : normalized;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

export const parseWorkflowTemplateParam = (raw: string): CreateWorkflowRequest | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_TEMPLATE_PARAM_LEN) return null;

  let decoded = "";
  try {
    decoded = base64UrlDecode(trimmed);
  } catch {
    return null;
  }
  const parsed = safeJsonParse(decoded);
  if (!isObject(parsed)) return null;

  const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
  const trigger = (parsed as any).trigger;
  const actions = (parsed as any).actions;
  if (!name || !isObject(trigger) || !Array.isArray(actions)) return null;

  const enabled = typeof (parsed as any).enabled === "boolean" ? Boolean((parsed as any).enabled) : undefined;

  return { name, enabled, trigger: trigger as any, actions: actions as any };
};

export const buildWorkflowTemplateLink = (request: CreateWorkflowRequest): string => {
  const encoded = base64UrlEncode(JSON.stringify(request));
  const relative = `/workflows?template=${encoded}`;

  try {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return origin ? new URL(relative, origin).toString() : relative;
  } catch {
    return relative;
  }
};

const defaultPeriodKey = () => {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

export const workflowToTemplateRequest = (workflow: Workflow): CreateWorkflowRequest => {
  const safeActions = Array.isArray((workflow as any).actions) ? ((workflow as any).actions as WorkflowAction[]) : [];
  return {
    name: String(workflow.name || "Workflow template"),
    enabled: false,
    trigger: (workflow as any).trigger,
    actions: safeActions,
  };
};

export const builtinWorkflowTemplates = (): WorkflowTemplate[] => [
  {
    id: "weekly-check-in",
    name: "Weekly money check-in",
    description: "A recurring review habit that creates one weekly task to keep spending aligned.",
    request: {
      name: "Weekly money check-in",
      enabled: true,
      trigger: { type: "cron", cron: "0 9 * * 1" },
      actions: [
        {
          type: "create_task",
          bucket: 7,
          title: "Weekly money check-in",
          why: "Build a lightweight review habit and catch issues early.",
          steps: ["Scan transactions", "Adjust one category cap", "Set one action for next week"],
          priority: "medium",
          expected_impact: "Improves consistency and reduces overspending drift.",
          kind: "cashflow",
          due_days: 7,
        },
      ],
    },
  },
  {
    id: "subscription-audit",
    name: "Subscription audit",
    description: "Monthly task to review recurring charges and cancel unused subscriptions.",
    request: {
      name: "Subscription audit",
      enabled: true,
      trigger: { type: "cron", cron: "0 9 1 * *" },
      actions: [
        {
          type: "create_task",
          bucket: 30,
          title: "Subscription audit",
          why: "Subscriptions quietly inflate monthly burn. Audit and reduce.",
          steps: ["List top recurring merchants", "Cancel 1 unused subscription", "Negotiate 1 bill or switch plan"],
          priority: "high",
          expected_impact: "Reduces fixed monthly costs and increases savings rate.",
          kind: "budget",
          due_days: 30,
        },
      ],
    },
  },
  {
    id: "monthly-summary-pdf",
    name: "Monthly summary PDF",
    description: "Creates a monthly summary PDF export and sends an email notification.",
    request: {
      name: "Monthly summary export + email",
      enabled: false,
      trigger: { type: "manual" },
      actions: [
        {
          type: "export_report",
          export_type: "monthly_summary_pdf",
          params: { period_key: defaultPeriodKey() },
        },
        {
          type: "send_notification",
          channel: "email",
          subject: "FinWise monthly summary ready",
          message: "Your monthly summary PDF export has been generated.",
        },
      ],
    },
  },
];


