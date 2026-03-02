/**
 * Plugin Permission Enforcement Middleware
 *
 * Intercepts plugin tool execution requests and validates that
 * the plugin has been granted the required permissions before
 * allowing the action to proceed. Fail-closed: unknown tools
 * or missing permissions result in a 403.
 */

import type { RequestHandler } from "express";
import mongoose from "mongoose";
import PluginInstallModel from "../../models/pluginInstallModel";
import { checkToolPermission, validatePluginPermissions } from "./permissionSandbox";
import { logger } from "../../config/logger";

/**
 * Middleware that enforces plugin permissions on tool execution.
 *
 * Expects:
 *   req.body.tool — the tool name (e.g., "transactions.create")
 *   req.body.plugin_key — the executing plugin's key
 *   req.org.orgId — the org context
 */
export const enforcePluginPermissions: RequestHandler = async (req, res, next) => {
  const toolName = req.body?.tool;
  const pluginKey = req.body?.plugin_key;
  const orgCtx = (req as any).org;
  const orgId = orgCtx?.orgId;

  // If no plugin key, this isn't a plugin-originated call — skip
  if (!pluginKey) {
    return next();
  }

  if (!toolName) {
    return res.status(400).json({
      message: "Missing tool name in plugin execution request",
      code: "PLUGIN_TOOL_MISSING",
      request_id: req.requestId,
    });
  }

  if (!orgId || !mongoose.Types.ObjectId.isValid(orgId)) {
    return res.status(400).json({
      message: "Organization context required for plugin execution",
      code: "MISSING_ORG_CONTEXT",
      request_id: req.requestId,
    });
  }

  try {
    // Load the plugin installation record
    const install = await PluginInstallModel.findOne({
      orgId: new mongoose.Types.ObjectId(String(orgId)),
      pluginKey: String(pluginKey).toLowerCase().trim(),
      status: "installed",
    }).lean();

    if (!install) {
      return res.status(403).json({
        message: `Plugin '${pluginKey}' is not installed or is disabled`,
        code: "PLUGIN_NOT_INSTALLED",
        request_id: req.requestId,
      });
    }

    // Check permissions
    const result = checkToolPermission(toolName, install.permissionsGranted);

    if (!result.allowed) {
      logger.warn(
        "Plugin permission denied: plugin=%s tool=%s missing=%s orgId=%s",
        pluginKey,
        toolName,
        result.missing.join(","),
        orgId,
      );

      return res.status(403).json({
        message: result.reason || "Plugin lacks required permissions for this action",
        code: "PLUGIN_PERMISSION_DENIED",
        details: {
          plugin_key: pluginKey,
          tool: toolName,
          missing_permissions: result.missing,
        },
        request_id: req.requestId,
      });
    }

    // Attach plugin context for downstream handlers
    (req as any).pluginContext = {
      pluginKey: install.pluginKey,
      version: install.version,
      permissions: install.permissionsGranted,
    };

    next();
  } catch (err) {
    logger.error("Plugin permission check failed: %s", err);
    next(err);
  }
};

/**
 * Validation endpoint handler for plugin manifest permission review.
 * Used by the marketplace install flow to show users what a plugin wants.
 */
export const validatePluginManifest: RequestHandler = (req, res) => {
  const permissions = req.body?.permissions;

  if (!Array.isArray(permissions)) {
    return res.status(400).json({
      message: "permissions must be an array of strings",
      code: "INVALID_PERMISSIONS",
      request_id: req.requestId,
    });
  }

  const result = validatePluginPermissions(permissions);

  res.json({
    ...result,
    request_id: req.requestId,
  });
};
