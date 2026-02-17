import mongoose from "mongoose";
import type { GridFSFile } from "mongodb";
import { HttpError } from "../middleware/httpError";

const BUCKET_NAME = "uploads";

export type GridFsPurpose = "receipt" | "journal";

export type GridFsFileWithMetadata = GridFSFile & {
  metadata?: {
    userId?: string;
    purpose?: GridFsPurpose;
  };
};

const getBucket = () => {
  const db = mongoose.connection.db;
  if (!db) {
    throw new HttpError(503, "DB_NOT_READY", "Database not connected");
  }
  return new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET_NAME });
};

const parseObjectId = (value: string) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new HttpError(400, "INVALID_ID", "Invalid identifier format");
  }
  return new mongoose.Types.ObjectId(value);
};

export const uploadBufferToGridFs = async (params: {
  userId: string;
  purpose: GridFsPurpose;
  buffer: Buffer;
  filename: string;
  contentType: string;
}): Promise<mongoose.Types.ObjectId> => {
  const bucket = getBucket();
  const fileId = new mongoose.Types.ObjectId();

  await new Promise<void>((resolve, reject) => {
    const uploadStream = bucket.openUploadStreamWithId(fileId, params.filename, {
      contentType: params.contentType,
      metadata: {
        userId: params.userId,
        purpose: params.purpose,
      },
    });

    uploadStream.once("finish", () => resolve());
    uploadStream.once("error", err => reject(err));
    uploadStream.end(params.buffer);
  });

  return fileId;
};

export const findGridFsFileById = async (fileId: string): Promise<GridFsFileWithMetadata | null> => {
  const bucket = getBucket();
  const objectId = parseObjectId(fileId);
  const files = (await bucket.find({ _id: objectId }).limit(1).toArray()) as GridFsFileWithMetadata[];
  return files[0] || null;
};

export const openGridFsDownloadStream = (fileId: string) => {
  const bucket = getBucket();
  const objectId = parseObjectId(fileId);
  return bucket.openDownloadStream(objectId);
};

export const assertGridFsOwnership = async (params: {
  fileId: string;
  userId: string;
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

  return file;
};

export const deleteGridFsFile = async (fileId: string): Promise<void> => {
  const bucket = getBucket();
  const objectId = parseObjectId(fileId);

  const files = await bucket.find({ _id: objectId }).limit(1).toArray();
  if (!files.length) {
    return;
  }

  await bucket.delete(objectId);
};
