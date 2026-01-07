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

const router = Router();

// All routes require authentication
const requireAuth = passport.authenticate("jwt", { session: false });

// Session routes
router.post("/sessions", requireAuth, createSession);
router.get("/sessions", requireAuth, getSessions);
router.get("/sessions/:sessionId", requireAuth, getSession);
router.delete("/sessions/:sessionId", requireAuth, deleteSession);
router.patch("/sessions/:sessionId", requireAuth, renameSession);

// Message routes
router.get("/sessions/:sessionId/messages", requireAuth, getMessages);
router.post("/sessions/:sessionId/messages", requireAuth, sendMessage);

export default router;
