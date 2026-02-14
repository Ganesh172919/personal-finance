import { Router } from "express";
import passport from "passport";
import {
  processAICommand,
  processWhatIfScenario,
  getFinancialProfile,
  updateFinancialProfile,
  getAgentOutputs,
  getAgentOutputById,
  addInvestment
} from "../controllers/aiController";
import { validate } from "../middleware/validate";
import {
  addInvestmentBodySchema,
  processCommandBodySchema,
  updateFinancialProfileBodySchema,
  whatIfScenarioBodySchema
} from "../schemas/aiSchemas";
import { objectIdSchema, userIdParamSchema } from "../schemas/common";

const router = Router();

// All routes require authentication
router.use(passport.authenticate("jwt", { session: false }));

// AI processing routes
router.post("/process-command", validate({ body: processCommandBodySchema }), processAICommand);
router.post("/scenarios/what-if", validate({ body: whatIfScenarioBodySchema }), processWhatIfScenario);

router.post("/financial-profiles/investments", validate({ body: addInvestmentBodySchema }), addInvestment);

// Financial profile routes
router.get("/financial-profiles/me", getFinancialProfile);
router.put("/financial-profiles/me", validate({ body: updateFinancialProfileBodySchema }), updateFinancialProfile);

// Deprecated aliases (kept temporarily for backward compatibility)
router.get("/financial-profiles/:userId", validate({ params: userIdParamSchema }), getFinancialProfile);
router.put(
  "/financial-profiles/:userId",
  validate({ params: userIdParamSchema, body: updateFinancialProfileBodySchema }),
  updateFinancialProfile
);

// Agent outputs
router.get("/agent-outputs/:id", validate({ params: objectIdSchema }), getAgentOutputById);
router.get("/agent-outputs/user/:userId", validate({ params: userIdParamSchema }), getAgentOutputs);

export default router;
