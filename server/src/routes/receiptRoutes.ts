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
