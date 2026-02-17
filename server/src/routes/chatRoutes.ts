import { Router } from "express";
import passport from "passport";
import {
  createSession,
  getSessions,
  getSession,
  deleteSession,
  renameSession,
  getMessages,
  sendMessage
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
router.post(
  "/sessions/:sessionId/messages",
  requireAuth,
  validate({ params: sessionIdParamSchema, body: sendMessageBodySchema }),
  asyncRoute(sendMessage)
);

export default router;
