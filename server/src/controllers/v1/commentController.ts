/**
 * @fileoverview Comment Controller (v1)
 *
 * Threaded commenting system for financial resources (transactions, budgets,
 * goals, workflows, insights). Supports mentions, replies, and soft-delete.
 *
 * Routes served:
 *   GET    /api/v1/comments           - listComments (by resource_type + resource_id)
 *   POST   /api/v1/comments           - createComment
 *   PUT    /api/v1/comments/:id       - updateComment (author only)
 *   DELETE /api/v1/comments/:id       - deleteComment (soft; author or admin)
 *
 * Key patterns:
 *   - Comments are polymorphic: resource_type + resource_id identify the parent
 *   - Soft-delete via deletedAt timestamp (not hard delete)
 *   - Only the author can edit; author or admin can soft-delete
 *   - Mentions capped at 20 per comment
 *   - Valid resource types: transaction, budget, goal, workflow, insight
 *
 * @module controllers/v1/commentController
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";

import CommentModel from "../../models/commentModel";
import type { IUserDocument } from "../../models/userModel";
import { HttpError } from "../../middleware/httpError";

// ─── Helpers ────────────────────────────────────────────

const requireContext = (req: Request) => {
  if (!req.org) {
    throw new HttpError(401, "ORG_REQUIRED", "Organization context required");
  }
  const user = req.user as IUserDocument | undefined;
  if (!user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
  }
  return {
    orgId: new mongoose.Types.ObjectId(req.org.orgId),
    userId: user._id,
  };
};

const VALID_RESOURCE_TYPES = ["transaction", "budget", "goal", "workflow", "insight"];

// ─── List Comments ──────────────────────────────────────

export const listComments = async (req: Request, res: Response) => {
  const { orgId } = requireContext(req);

  const resourceType = String(req.query?.resource_type || "");
  const resourceId = String(req.query?.resource_id || "");

  if (!resourceType || !resourceId) {
    throw new HttpError(400, "MISSING_PARAMS", "resource_type and resource_id are required");
  }
  if (!VALID_RESOURCE_TYPES.includes(resourceType)) {
    throw new HttpError(400, "INVALID_RESOURCE_TYPE", `resource_type must be one of: ${VALID_RESOURCE_TYPES.join(", ")}`);
  }

  const comments = await CommentModel.find({
    orgId,
    resourceType,
    resourceId,
    deletedAt: { $exists: false },
  })
    .sort({ createdAt: 1 })
    .populate("userId", "displayName email avatar")
    .lean();

  res.json({
    org_id: orgId.toString(),
    resource_type: resourceType,
    resource_id: resourceId,
    comments: comments.map((c: any) => ({
      id: String(c._id),
      text: c.text,
      mentions: c.mentions || [],
      parent_id: c.parentId ? String(c.parentId) : null,
      edited_at: c.editedAt || null,
      created_at: c.createdAt,
      author: {
        id: String(c.userId?._id || c.userId),
        name: c.userId?.displayName || c.userId?.email || "Unknown",
        avatar: c.userId?.avatar || null,
      },
    })),
    request_id: req.requestId,
  });
};

// ─── Create Comment ─────────────────────────────────────

export const createComment = async (req: Request, res: Response) => {
  const { orgId, userId } = requireContext(req);

  const { resource_type, resource_id, text, mentions, parent_id } = req.body || {};

  if (!resource_type || !resource_id || !text?.trim()) {
    throw new HttpError(400, "MISSING_FIELDS", "resource_type, resource_id, and text are required");
  }
  if (!VALID_RESOURCE_TYPES.includes(resource_type)) {
    throw new HttpError(400, "INVALID_RESOURCE_TYPE", `resource_type must be one of: ${VALID_RESOURCE_TYPES.join(", ")}`);
  }
  if (text.trim().length > 2000) {
    throw new HttpError(400, "TEXT_TOO_LONG", "Comment text must be 2000 characters or less");
  }

  const comment = await CommentModel.create({
    orgId,
    userId,
    resourceType: resource_type,
    resourceId: resource_id,
    text: text.trim(),
    mentions: Array.isArray(mentions) ? mentions.slice(0, 20) : undefined,
    parentId: parent_id ? new mongoose.Types.ObjectId(parent_id) : undefined,
  });

  const populated = await CommentModel.findById(comment._id)
    .populate("userId", "displayName email avatar")
    .lean();

  res.status(201).json({
    org_id: orgId.toString(),
    comment: {
      id: String(populated!._id),
      text: populated!.text,
      mentions: populated!.mentions || [],
      parent_id: populated!.parentId ? String(populated!.parentId) : null,
      edited_at: null,
      created_at: populated!.createdAt,
      author: {
        id: String((populated as any).userId?._id || populated!.userId),
        name: (populated as any).userId?.displayName || "Unknown",
        avatar: (populated as any).userId?.avatar || null,
      },
    },
    request_id: req.requestId,
  });
};

// ─── Update Comment ─────────────────────────────────────

export const updateComment = async (req: Request, res: Response) => {
  const { orgId, userId } = requireContext(req);
  const commentId = req.params.id;

  const comment = await CommentModel.findOne({
    _id: commentId,
    orgId,
    deletedAt: { $exists: false },
  });

  if (!comment) {
    throw new HttpError(404, "COMMENT_NOT_FOUND", "Comment not found");
  }
  if (String(comment.userId) !== String(userId)) {
    throw new HttpError(403, "FORBIDDEN", "You can only edit your own comments");
  }

  const { text } = req.body || {};
  if (!text?.trim()) {
    throw new HttpError(400, "MISSING_TEXT", "Text is required");
  }

  comment.text = text.trim();
  comment.editedAt = new Date();
  await comment.save();

  res.json({
    org_id: orgId.toString(),
    comment: {
      id: String(comment._id),
      text: comment.text,
      edited_at: comment.editedAt,
    },
    request_id: req.requestId,
  });
};

// ─── Delete Comment (soft) ──────────────────────────────

export const deleteComment = async (req: Request, res: Response) => {
  const { orgId, userId } = requireContext(req);
  const commentId = req.params.id;

  const comment = await CommentModel.findOne({
    _id: commentId,
    orgId,
    deletedAt: { $exists: false },
  });

  if (!comment) {
    throw new HttpError(404, "COMMENT_NOT_FOUND", "Comment not found");
  }

  // Allow owner or org admin to delete
  const isOwner = String(comment.userId) === String(userId);
  const isAdmin = req.org && ["admin", "owner"].includes(req.org.role);
  if (!isOwner && !isAdmin) {
    throw new HttpError(403, "FORBIDDEN", "Only the author or an admin can delete comments");
  }

  comment.deletedAt = new Date();
  await comment.save();

  res.json({
    org_id: orgId.toString(),
    deleted: true,
    request_id: req.requestId,
  });
};
