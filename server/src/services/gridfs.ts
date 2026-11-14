import mongoose from "mongoose";
import type { GridFSFile } from "mongodb";
import { HttpError } from "../middleware/httpError";

const BUCKET_NAME = "uploads";

// Categorizes the intended storage domain for GridFS binary assets.
// Distinguishes receipts, journal attachments, export files, and workspaces.
// Ensures uniform lifecycle management and scoped access controls.
export type GridFsPurpose = "receipt" | "journal" | "export" | "workspace_file";

// Metadata schema attached to stored GridFS file objects.
// Records tenancy, origin user, classification, and tracking identifiers.
// Facilitates tenant isolation and cross-service file traceability.
export type GridFsMetadata = {
  userId?: string;
  orgId?: string;
  purpose?: GridFsPurpose;
  exportJobId?: string;
  format?: string;
  requestId?: string;
};

// Extends MongoDB GridFS file structure with structured application metadata.
// Enriches raw file records with ownership, organization, and job attributes.
// Provides strong typing across retrieval, download, and audit routines.
export type GridFsFileWithMetadata = GridFSFile & {
  metadata?: GridFsMetadata;
};

// Retrieves the active GridFS bucket instance for binary uploads.
// Verifies that the underlying MongoDB connection is active and healthy.
// Throws a service unavailable error if the database connection is absent.
const getBucket = () => {
  const db = mongoose.connection.db;
  if (!db) {
    throw new HttpError(503, "DB_NOT_READY", "Database not connected");
  }
  return new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET_NAME });
};

// Validates and constructs a MongoDB ObjectId from an incoming string.
// Enforces standard 24-character hexadecimal identifier specifications.
// Rejects malformed identifiers with a standardized client bad request error.
const parseObjectId = (value: string) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new HttpError(400, "INVALID_ID", "Invalid identifier format");
  }
  return new mongoose.Types.ObjectId(value);
};

// Initializes a write stream for streaming file uploads directly into GridFS.
// Accepts optional pre-generated identifiers, MIME types, and file metadata.
// Returns the file identifier along with the writable GridFS upload stream.
export const openGridFsUploadStream = (params: {
  fileId?: mongoose.Types.ObjectId;
  filename: string;
  contentType: string;
  metadata: GridFsMetadata;
}) => {
  const bucket = getBucket();
  const fileId = params.fileId || new mongoose.Types.ObjectId();

  const uploadStream = bucket.openUploadStreamWithId(fileId, params.filename, {
    contentType: params.contentType,
    metadata: params.metadata,
  });

  return { fileId, uploadStream };
};

// Writes an in-memory binary buffer directly to GridFS storage.
// Pipes buffer contents through an upload stream and awaits completion.
// Resolves with the newly assigned MongoDB ObjectId upon successful storage.
export const uploadBufferToGridFs = async (params: {
  userId: string;
  orgId?: string;
  purpose: GridFsPurpose;
  exportJobId?: string;
  buffer: Buffer;
  filename: string;
  contentType: string;
}): Promise<mongoose.Types.ObjectId> => {
  const { fileId, uploadStream } = openGridFsUploadStream({
    filename: params.filename,
    contentType: params.contentType,
    metadata: {
      userId: params.userId,
      orgId: params.orgId,
      purpose: params.purpose,
      exportJobId: params.exportJobId,
    },
  });

  await new Promise<void>((resolve, reject) => {
    uploadStream.once("finish", () => resolve());
    uploadStream.once("error", (err) => reject(err));
    uploadStream.end(params.buffer);
  });

  return fileId;
};

// Queries GridFS metadata collections for a single file by identifier.
// Validates the identifier and retrieves corresponding file headers.
// Returns the enriched file descriptor or null if no record exists.
export const findGridFsFileById = async (fileId: string): Promise<GridFsFileWithMetadata | null> => {
  const bucket = getBucket();
  const objectId = parseObjectId(fileId);
  const files = (await bucket.find({ _id: objectId }).limit(1).toArray()) as GridFsFileWithMetadata[];
  return files[0] || null;
};

// Opens a readable binary stream for streaming stored file contents.
// Converts string identifiers to ObjectIds and binds to the bucket stream.
// Enables progressive streaming responses directly to HTTP clients.
export const openGridFsDownloadStream = (fileId: string) => {
  const bucket = getBucket();
  const objectId = parseObjectId(fileId);
  return bucket.openDownloadStream(objectId);
};

// Verifies that a requested GridFS asset matches expected user and org scopes.
// Prevents cross-tenant file access and silent unauthorized discovery.
// Returns the validated file descriptor or throws an access rejection error.
export const assertGridFsOwnership = async (params: {
  fileId: string;
  userId: string;
  orgId?: string;
  purpose?: GridFsPurpose;
}): Promise<GridFsFileWithMetadata> => {
  const file = await findGridFsFileById(params.fileId);
  if (!file) {
    throw new HttpError(404, "NOT_FOUND", "File not found");
  }

  const owner = file.metadata?.userId;
  if (!owner || owner !== params.userId) {
    // Avoid leaking existence across users.
    throw new HttpError(404, "NOT_FOUND", "File not found");
  }

  const orgId = params.orgId;
  if (orgId && file.metadata?.orgId !== orgId) {
    throw new HttpError(404, "NOT_FOUND", "File not found");
  }

  const purpose = params.purpose;
  if (purpose && file.metadata?.purpose !== purpose) {
    throw new HttpError(404, "NOT_FOUND", "File not found");
  }

  return file;
};

// Deletes a binary file and its constituent data chunks from GridFS.
// Performs safe existence verification before triggering deletion routines.
// Guarantees clean cleanup of storage space without leaking missing errors.
export const deleteGridFsFile = async (fileId: string): Promise<void> => {
  const bucket = getBucket();
  const objectId = parseObjectId(fileId);

  const files = await bucket.find({ _id: objectId }).limit(1).toArray();
  if (!files.length) {
    return;
  }

  await bucket.delete(objectId);
};
