/**
 * @fileoverview AI Canary Controller
 *
 * REST endpoint handlers for the Continuous Production Canary Validation Engine.
 *
 * Routes served:
 *   GET  /api/ai/canary/number-safety, /api/ai-core/canary/number-safety
 *   POST /api/ai/canary/validate, /api/ai-core/canary/validate
 *   POST /api/ai/canary/run-probes, /api/ai-core/canary/run-probes
 *
 * @module controllers/v1/aiCanaryController
 */

import { Request, Response } from "express";
import {
  evaluateCanaryInvariants,
  fetchCanaryHealth,
  runCanaryProbeSuite,
} from "../../services/aiCanaryService";

// Fetches the real-time canary health telemetry including overall status and pass rates.
// Attaches the correlation request ID and returns the telemetry payload to the caller.
export const getCanaryStatusHandler = async (req: Request, res: Response) => {
  const result = await fetchCanaryHealth(req.requestId);
  res.json({
    status: "success",
    request_id: req.requestId,
    ...result,
  });
};

// Evaluates candidate numerical outputs against strict mathematical invariants to detect hallucinations.
// Rejects malformed payloads with a 400 error before passing valid inputs to the invariant evaluator.
export const validateCanaryInvariantsHandler = async (req: Request, res: Response) => {
  const body = req.body || {};
  const hasValidFields =
    (body.candidate !== undefined && body.reference !== undefined) ||
    (body.initial_allocations !== undefined && body.proposed_allocations !== undefined) ||
    (body.assets !== undefined && body.liabilities !== undefined && body.net_worth !== undefined) ||
    (body.income !== undefined && body.expenses !== undefined && body.net_cashflow !== undefined);

  if (!hasValidFields) {
    return res.status(400).json({
      message: "No valid invariant parameters provided (candidate/reference, initial_allocations/proposed_allocations, assets/liabilities/net_worth, or income/expenses/net_cashflow)",
      code: "INVALID_CANARY_PAYLOAD",
      request_id: req.requestId,
    });
  }

  const result = await evaluateCanaryInvariants(body, req.requestId);
  res.json({
    request_id: req.requestId,
    ...result,
  });
};

// Triggers an execution run of synthetic canary probes with an optional sample size override.
// Returns probe execution results, violation diagnostics, and aggregate performance metrics.
export const runCanaryProbesHandler = async (req: Request, res: Response) => {
  const sampleSize = req.body?.sample_size ? Number(req.body.sample_size) : undefined;
  const result = await runCanaryProbeSuite(sampleSize, req.requestId);
  res.json({
    request_id: req.requestId,
    ...result,
  });
};
