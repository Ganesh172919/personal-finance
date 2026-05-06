/**
 * @fileoverview Chat routes for managing AI chat sessions and messages.
 *
 * Endpoints:
 *   POST   /sessions                       - Create a new chat session
 *   GET    /sessions                       - List all chat sessions with pagination
 *   GET    /sessions/:sessionId            - Get a single session by ID
 *   DELETE /sessions/:sessionId            - Delete a chat session
 *   PATCH  /sessions/:sessionId            - Rename a chat session
 *   GET    /sessions/:sessionId/messages   - Get messages in a session with pagination
 *   GET    /insights/conversation          - Get AI-generated conversation insights
 *   POST   /sessions/:sessionId/messages   - Send a message to the AI in a session
 *
 * Middleware:
 *   - Passport JWT authentication applied to all routes
 *   - Zod validation (common, chatSchemas) on params, query, and body
 *
 * Controllers: chatController
 */
import { Router } from "express";
import passport from "passport";
import {
  createSession,
  getSessions,
  getSession,
  deleteSession,
  renameSession,
  getMessages,
  sendMessage,
  getConversationInsights
} from "../controllers/chatController";
import { validate } from "../middleware/validate";
import { sessionIdParamSchema } from "../schemas/common";
import {
  getMessagesQuerySchema,
  renameSessionBodySchema,
  sendMessageBodySchema,
  sessionListQuerySchema
} from "../schemas/chatSchemas";
import { asyncRoute } from "../utils/asyncRoute";

const router = Router();

// All routes require authentication
const requireAuth = passport.authenticate("jwt", { session: false });

// Session routes
router.post("/sessions", requireAuth, asyncRoute(createSession));
router.get("/sessions", requireAuth, validate({ query: sessionListQuerySchema }), asyncRoute(getSessions));
router.get("/sessions/:sessionId", requireAuth, validate({ params: sessionIdParamSchema }), asyncRoute(getSession));
router.delete("/sessions/:sessionId", requireAuth, validate({ params: sessionIdParamSchema }), asyncRoute(deleteSession));
router.patch(
  "/sessions/:sessionId",
  requireAuth,
  validate({ params: sessionIdParamSchema, body: renameSessionBodySchema }),
  asyncRoute(renameSession)
);

// Message routes
router.get(
  "/sessions/:sessionId/messages",
  requireAuth,
  validate({ params: sessionIdParamSchema, query: getMessagesQuerySchema }),
  asyncRoute(getMessages)
);
router.get("/insights/conversation", requireAuth, asyncRoute(getConversationInsights));
router.post(
  "/sessions/:sessionId/messages",
  requireAuth,
  validate({ params: sessionIdParamSchema, body: sendMessageBodySchema }),
  asyncRoute(sendMessage)
);

export default router;
