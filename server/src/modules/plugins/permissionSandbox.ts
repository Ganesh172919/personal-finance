/**
 * Plugin Permission Sandbox
 *
 * Validates that a plugin's declared permissions cover the actions it tries to perform.
 * Acts as a policy enforcement layer between the plugin runtime and FinWise internals.
 *
 * Permission format: "resource:action"
 *   e.g. "transactions:read", "transactions:write", "goals:read", "budgets:write",
 *        "profile:read", "notifications:send", "workflows:create"
 */

export type PluginPermission = string;

/** All recognized permissions and their descriptions. */
export const PERMISSION_CATALOG: Record<PluginPermission, string> = {
  "transactions:read": "Read transaction history and summaries",
  "transactions:write": "Create, update, or delete transactions",
  "goals:read": "Read financial goals",
  "goals:write": "Create, update, or delete goals",
  "debts:read": "Read debt records",
  "debts:write": "Create, update, or delete debts",
  "budgets:read": "Read budget allocations and envelopes",
  "budgets:write": "Modify budget allocations",
  "profile:read": "Read the user's financial profile",
  "profile:write": "Modify the user's financial profile",
  "accounts:read": "Read linked financial accounts",
  "accounts:write": "Create or update financial accounts",
  "notifications:send": "Send notifications to the user",
  "workflows:create": "Create automated workflows",
  "workflows:execute": "Execute workflow actions",
  "exports:create": "Create data exports (CSV, PDF)",
  "ai:invoke": "Invoke AI/LLM endpoints",
  "integrations:sync": "Trigger integration data sync",
};

/** Permissions that are considered high-risk and require explicit user consent during install. */
export const HIGH_RISK_PERMISSIONS = new Set<PluginPermission>([
  "transactions:write",
  "debts:write",
  "profile:write",
  "accounts:write",
  "workflows:execute",
  "integrations:sync",
]);

/**
 * Map from tool name prefixes to the permissions they require.
 * Used to auto-validate plugin tool calls at runtime.
 */
const TOOL_PERMISSION_MAP: Record<string, PluginPermission[]> = {
  "transactions.create": ["transactions:write"],
  "transactions.update": ["transactions:write"],
  "transactions.delete": ["transactions:write"],
  "transactions.list": ["transactions:read"],
  "transactions.import": ["transactions:write"],
  "goals.create": ["goals:write"],
  "goals.update": ["goals:write"],
  "goals.delete": ["goals:write"],
  "debts.create": ["debts:write"],
  "debts.update": ["debts:write"],
  "debts.delete": ["debts:write"],
  "budgets.setAllocation": ["budgets:write"],
  "budgets.getEnvelopes": ["budgets:read"],
  "profile.get": ["profile:read"],
  "profile.update": ["profile:write"],
  "accounts.create": ["accounts:write"],
  "accounts.update": ["accounts:write"],
  "notifications.send": ["notifications:send"],
  "workflows.create": ["workflows:create"],
  "workflows.run": ["workflows:execute"],
  "exports.create": ["exports:create"],
  "ai.command": ["ai:invoke"],
  "integrations.sync": ["integrations:sync"],
};

export interface PermissionCheckResult {
  allowed: boolean;
  missing: PluginPermission[];
  reason?: string;
}

/**
 * Check whether a plugin's granted permissions cover a specific tool call.
 */
export function checkToolPermission(
  toolName: string,
  grantedPermissions: PluginPermission[],
): PermissionCheckResult {
  const requiredPermissions = TOOL_PERMISSION_MAP[toolName];

  if (!requiredPermissions) {
    // Unknown tools are denied by default (fail-closed)
    return {
      allowed: false,
      missing: [],
      reason: `Unknown tool '${toolName}' — no permission mapping exists. Denied by default.`,
    };
  }

  const grantedSet = new Set(grantedPermissions);
  const missing = requiredPermissions.filter((p) => !grantedSet.has(p));

  if (missing.length > 0) {
    return {
      allowed: false,
      missing,
      reason: `Plugin lacks required permissions: ${missing.join(", ")}`,
    };
  }

  return { allowed: true, missing: [] };
}

/**
 * Validate an entire plugin manifest's declared permissions.
 * Returns any unrecognized or suspicious permission requests.
 */
export function validatePluginPermissions(
  requestedPermissions: PluginPermission[],
): { valid: boolean; unrecognized: string[]; highRisk: string[]; warnings: string[] } {
  const unrecognized = requestedPermissions.filter((p) => !(p in PERMISSION_CATALOG));
  const highRisk = requestedPermissions.filter((p) => HIGH_RISK_PERMISSIONS.has(p));
  const warnings: string[] = [];

  if (highRisk.length > 0) {
    warnings.push(
      `Plugin requests ${highRisk.length} high-risk permission(s): ${highRisk.join(", ")}. User consent required during install.`,
    );
  }

  if (requestedPermissions.length > 10) {
    warnings.push(
      `Plugin requests ${requestedPermissions.length} permissions — unusually high. Review carefully.`,
    );
  }

  return {
    valid: unrecognized.length === 0,
    unrecognized,
    highRisk,
    warnings,
  };
}
