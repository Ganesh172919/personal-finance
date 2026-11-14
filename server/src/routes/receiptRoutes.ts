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

// Creates an Express router instance dedicated to receipt ingestion and confirmation.
// Encapsulates receipt scanning, structured OCR parsing, and transaction conversion endpoints.
// Mounts into the primary server route tree under the receipts namespace.
const router = Router();

// Requires valid JWT credentials for all receipt handling and extraction operations.
// Restricts receipt upload and inspection access strictly to authenticated account holders.
// Attaches validated user authentication context for downstream ownership tracking.
router.use(passport.authenticate("jwt", { session: false }));

// Receives an uploaded receipt image and extracts merchant, date, and line-item totals via OCR.
// Buffers incoming multipart uploads via Multer and validates metadata against receiptParseBodySchema.
// Dispatches processing to the parseReceipt controller wrapped with asyncRoute.
router.post(
  "/receipts/parse",
  receiptUpload().single("file"),
  validate({ body: receiptParseBodySchema }),
  asyncRoute(parseReceipt)
);

// Confirms and persists extracted receipt details as an official financial transaction.
// Validates the target receipt ObjectId parameter and the structured confirmation payload.
// Executes the confirmReceipt controller to adjust transaction ledgers and finalize records.
router.post(
  "/receipts/:id/confirm",
  validate({ params: objectIdSchema, body: receiptConfirmBodySchema }),
  asyncRoute(confirmReceipt)
);

// Retrieves a paginated list of previously uploaded and scanned receipts for the user.
// Validates query parameters ensuring safe page offsets and maximum limit constraints.
// Delegates listing logic to listReceipts with standardized error handling.
router.get("/receipts", validate({ query: paginationQuerySchema }), asyncRoute(listReceipts));

// Fetches detailed metadata, raw OCR output, and status for an individual receipt.
// Enforces valid MongoDB ObjectId format on the receipt identifier parameter.
// Invokes the getReceiptById controller to return the receipt document.
router.get("/receipts/:id", validate({ params: objectIdSchema }), asyncRoute(getReceiptById));

// Deletes a specified receipt record and purges associated image binaries from storage.
// Validates the receipt identifier parameter to ensure proper ObjectId formatting.
// Invokes deleteReceipt to remove the record while enforcing tenant data ownership.
router.delete("/receipts/:id", validate({ params: objectIdSchema }), asyncRoute(deleteReceipt));

export default router;
