/**
 * @fileoverview Summary Capacity & Coordination Controller
 *
 * REST endpoint handlers for distributed coordination, generation-only accounting,
 * and staging capacity measurements of conversation summaries and narration.
 *
 * Routes served:
 *   GET  /api/chat/insights/coordination-metrics
 *   POST /api/chat/insights/capacity-benchmark
 *   POST /api/chat/insights/coordination-metrics/reset
 *
 * @module controllers/v1/summaryCapacityController
 */

import { Request, Response } from "express";
import { summaryCapacityService } from "../../services/summaryCapacityService";

// Retrieves live operational metrics for summary coordination, deduplication, and staging capacity.
// Packages the gathered metrics with the incoming request ID and returns a JSON success response.
export const getSummaryCoordinationMetricsHandler = async (req: Request, res: Response) => {
  const metrics = summaryCapacityService.getMetrics();
  res.json({
    status: "success",
    request_id: req.requestId,
    data: metrics,
  });
};

// Executes a synthetic benchmark test simulating concurrent summary generation and duplicate detection.
// Extracts concurrency, iteration, and duplicate ratio parameters and returns latency and throughput results.
export const runSummaryCapacityBenchmarkHandler = async (req: Request, res: Response) => {
  const { concurrency, iterations, duplicateRatio } = req.body || {};
  const result = await summaryCapacityService.runStagingCapacityBenchmark({
    concurrency: concurrency ? Number(concurrency) : undefined,
    iterations: iterations ? Number(iterations) : undefined,
    duplicateRatio: duplicateRatio !== undefined ? Number(duplicateRatio) : undefined,
  });

  res.json({
    status: "success",
    request_id: req.requestId,
    data: result,
  });
};

// Clears accumulated summary generation metrics and resets benchmark counters to baseline state.
// Emits a success confirmation payload containing the unique request identifier.
export const resetSummaryCoordinationMetricsHandler = async (req: Request, res: Response) => {
  summaryCapacityService.resetMetrics();
  res.json({
    status: "success",
    request_id: req.requestId,
    message: "Summary coordination metrics reset successfully",
  });
};
