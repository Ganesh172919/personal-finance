import { Router } from "express";
import passport from "passport";
import { validate } from "../middleware/validate";
import { fileIdParamSchema } from "../schemas/common";
import { getMediaByFileId } from "../controllers/mediaController";
import { asyncRoute } from "../utils/asyncRoute";

const router = Router();

router.use(passport.authenticate("jwt", { session: false }));

router.get("/media/:fileId", validate({ params: fileIdParamSchema }), asyncRoute(getMediaByFileId));

export default router;
