import { Router } from "express";
import passport from "passport";
import {
  processAICommand,
  processWhatIfScenario,
  getFinancialProfile,
  updateFinancialProfile,
  getAgentOutputs,
  getRecentAgentOutputs,
  getAgentOutputById,
  submitAgentOutputFeedback,
  addInvestment
} from "../controllers/aiController";
import { getAiCoreStatus } from "../controllers/aiStatusController";
import { validate } from "../middleware/validate";
import {
  addInvestmentBodySchema,
  agentOutputFeedbackBodySchema,
  processCommandBodySchema,
  recentAgentOutputsQuerySchema,
  updateFinancialProfileBodySchema,
  whatIfScenarioBodySchema
} from "../schemas/aiSchemas";
import { objectIdSchema, userIdParamSchema } from "../schemas/common";
import { asyncRoute } from "../utils/asyncRoute";

const router = Router();

// All routes require authentication
router.use(passport.authenticate("jwt", { session: false }));

// AI processing routes
router.post("/process-command", validate({ body: processCommandBodySchema }), asyncRoute(processAICommand));
router.post("/scenarios/what-if", validate({ body: whatIfScenarioBodySchema }), asyncRoute(processWhatIfScenario));
router.get("/ai-core/status", asyncRoute(getAiCoreStatus));

router.post("/financial-profiles/investments", validate({ body: addInvestmentBodySchema }), asyncRoute(addInvestment));

// Financial profile routes
router.get("/financial-profiles/me", asyncRoute(getFinancialProfile));
router.put("/financial-profiles/me", validate({ body: updateFinancialProfileBodySchema }), asyncRoute(updateFinancialProfile));

// Deprecated aliases (kept temporarily for backward compatibility)
router.get("/financial-profiles/:userId", validate({ params: userIdParamSchema }), asyncRoute(getFinancialProfile));
router.put(
  "/financial-profiles/:userId",
  validate({ params: userIdParamSchema, body: updateFinancialProfileBodySchema }),
  asyncRoute(updateFinancialProfile)
);

// Agent outputs
router.get("/agent-outputs/recent", validate({ query: recentAgentOutputsQuerySchema }), asyncRoute(getRecentAgentOutputs));
router.get("/agent-outputs/:id", validate({ params: objectIdSchema }), asyncRoute(getAgentOutputById));
router.post(
  "/agent-outputs/:id/feedback",
  validate({ params: objectIdSchema, body: agentOutputFeedbackBodySchema }),
  asyncRoute(submitAgentOutputFeedback)
);
router.get("/agent-outputs/user/:userId", validate({ params: userIdParamSchema }), asyncRoute(getAgentOutputs));

export default router;
