/**
 * @fileoverview Media routes for serving uploaded files by their file ID.
 *
 * Endpoints:
 *   GET    /media/:fileId   - Retrieve a media file by its unique file ID (JWT required)
 *
 * Middleware:
 *   - Passport JWT authentication applied to all routes
 *   - Zod validation (common: fileIdParamSchema) on route params
 *
 * Controllers: mediaController
 */
import { Router } from "express";
import passport from "passport";
import { validate } from "../middleware/validate";
import { fileIdParamSchema } from "../schemas/common";
import { getMediaByFileId } from "../controllers/mediaController";
import { asyncRoute } from "../utils/asyncRoute";

// Initializes an Express router dedicated to media asset streaming and retrieval.
// Encapsulates media routing definitions to maintain modular endpoint segregation.
// Serves as the mounting target for secure binary file delivery endpoints.
const router = Router();

// Applies JWT authentication middleware to all incoming media delivery requests.
// Ensures that only authenticated users can access uploaded attachments and receipts.
// Guards private binary media assets against unauthorized external hotlinking.
router.use(passport.authenticate("jwt", { session: false }));

// Streams an uploaded media file identified by its MongoDB GridFS identifier.
// Validates the fileId URL parameter against the standardized UUID/ObjectId schema.
// Invokes the getMediaByFileId controller wrapped with asyncRoute for exception handling.
router.get("/media/:fileId", validate({ params: fileIdParamSchema }), asyncRoute(getMediaByFileId));

export default router;
