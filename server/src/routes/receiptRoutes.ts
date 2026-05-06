/**
 * @fileoverview Receipt management routes for scanning, parsing, confirming, and listing receipts.
 *
 * Endpoints:
 *   POST   /receipts/parse        - Upload and OCR-parse a receipt image (file + body validated)
 *   POST   /receipts/:id/confirm  - Confirm/edit parsed receipt data before saving as transaction
 *   GET    /receipts              - List all receipts with pagination
 *   GET    /receipts/:id          - Get a single receipt by ID
 *   DELETE /receipts/:id          - Delete a receipt
 *
 * Middleware:
 *   - Passport JWT authentication applied to all routes
 *   - Multer file upload (receiptUpload) on parse endpoint
 *   - Zod validation (common, receiptSchemas) on params, query, and body
 *
 * Controllers: receiptController
 */
import { Router } from "express";
import passport from "passport";
import { validate } from "../middleware/validate";
import { objectIdSchema, paginationQuerySchema } from "../schemas/common";
import { receiptConfirmBodySchema, receiptParseBodySchema } from "../schemas/receiptSchemas";
import {
  confirmReceipt,
  deleteReceipt,
  getReceiptById,
  listReceipts,
  parseReceipt,
} from "../controllers/receiptController";
import { receiptUpload } from "../middleware/uploads";
import { asyncRoute } from "../utils/asyncRoute";

const router = Router();

router.use(passport.authenticate("jwt", { session: false }));

router.post(
  "/receipts/parse",
  receiptUpload().single("file"),
  validate({ body: receiptParseBodySchema }),
  asyncRoute(parseReceipt)
);

router.post(
  "/receipts/:id/confirm",
  validate({ params: objectIdSchema, body: receiptConfirmBodySchema }),
  asyncRoute(confirmReceipt)
);

router.get("/receipts", validate({ query: paginationQuerySchema }), asyncRoute(listReceipts));
router.get("/receipts/:id", validate({ params: objectIdSchema }), asyncRoute(getReceiptById));
router.delete("/receipts/:id", validate({ params: objectIdSchema }), asyncRoute(deleteReceipt));

export default router;
