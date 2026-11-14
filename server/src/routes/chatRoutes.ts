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
import { idempotency } from "../middleware/idempotency";

// Initializes Express router instance for managing chat sessions and messages.
// Mounts session lifecycle, conversation history, and insight generation endpoints.
// Applies JWT authentication, idempotency protection, and Zod validation.
const router = Router();

// Reusable Passport authentication middleware enforcing JWT session verification.
// Validates bearer tokens on all incoming chat session and message requests.
// Populates request.user context or returns 401 Unauthorized upon failure.
// All routes require authentication
const requireAuth = passport.authenticate("jwt", { session: false });

// Session routes
// Creates a new AI conversation session for the authenticated user.
// Enforces JWT user authentication before initializing thread state.
// Delegates session creation to createSession controller wrapped in asyncRoute.
router.post("/sessions", requireAuth, asyncRoute(createSession));

// Lists all chat conversation sessions belonging to authenticated caller.
// Validates pagination query parameters including limit and cursor offsets.
// Invokes getSessions controller to retrieve active session threads.
router.get("/sessions", requireAuth, validate({ query: sessionListQuerySchema }), asyncRoute(getSessions));

// Retrieves metadata and summary information for a single chat session.
// Validates sessionId parameter format and verifies account ownership.
// Calls getSession controller handler returning session record details.
router.get("/sessions/:sessionId", requireAuth, validate({ params: sessionIdParamSchema }), asyncRoute(getSession));

// Permanently deletes an individual chat session along with message history.
// Validates path parameter schema against sessionIdParamSchema constraints.
// Dispatches deletion operation to deleteSession controller handler.
router.delete("/sessions/:sessionId", requireAuth, validate({ params: sessionIdParamSchema }), asyncRoute(deleteSession));

// Renames the title of an active chat session thread for better organization.
// Validates sessionId parameter and renameSessionBodySchema payload fields.
// Commits title changes via renameSession controller inside asyncRoute.
router.patch(
  "/sessions/:sessionId",
  requireAuth,
  validate({ params: sessionIdParamSchema, body: renameSessionBodySchema }),
  asyncRoute(renameSession)
);

// Message routes
// Retrieves historical messages belonging to a specified conversation session.
// Validates sessionId parameter and pagination filters for chronological paging.
// Invokes getMessages controller returning message history transcript.
router.get(
  "/sessions/:sessionId/messages",
  requireAuth,
  validate({ params: sessionIdParamSchema, query: getMessagesQuerySchema }),
  asyncRoute(getMessages)
);

// Extracts AI-generated insights, summaries, and action items from conversation.
// Requires authenticated user session to inspect user conversational context.
// Passes request handling to getConversationInsights controller logic.
router.get("/insights/conversation", requireAuth, asyncRoute(getConversationInsights));

// Posts a user prompt message to the AI conversation and streams response.
// Enforces Idempotency-Key validation to prevent duplicate execution charges.
// Dispatches message processing and agent tools via sendMessage controller.
router.post(
  "/sessions/:sessionId/messages",
  requireAuth,
  idempotency(), // opt-in via Idempotency-Key: a retried send replays instead of re-billing
  validate({ params: sessionIdParamSchema, body: sendMessageBodySchema }),
  asyncRoute(sendMessage)
);

// Exports configured chat router instance as module default export.
// Mounts into main Express application under the API routing structure.
// Provides complete REST interface for chat and conversation management.
export default router;
