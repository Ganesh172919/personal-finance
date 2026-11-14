// Declares Express namespace extensions for Multer file attachment structures.
// Integrates uploaded file object typings into Express request scope.
// Ensures uniform handling for multipart/form-data upload handlers.
declare namespace Express {
  namespace Multer {
    // Interface describing uploaded file metadata and raw byte content buffer.
    // Encapsulates field name, original filename, encoding, MIME type, and file size.
    // Facilitates type safety when processing uploaded receipts and documents in memory.
    interface File {
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    }
  }
}

// Ambient module declaration providing TypeScript type definitions for the Multer library.
// Exposes middleware factory functions, storage engine interfaces, and Multer error classes.
// Supplies custom type coverage where official package declarations are omitted.
declare module "multer" {
  import type { RequestHandler } from "express";

  // Type alias representing Multer storage engine implementation instances.
  // Serves as opaque type for storage strategies such as memory or disk storage.
  // Compatible with custom storage engine drivers.
  type StorageEngine = unknown;

  // Callback signature invoked by custom file filter evaluation predicates.
  // Notifies Multer engine whether to accept incoming files or reject with errors.
  // Allows conditional MIME type validation before buffering upload payloads.
  interface MulterFileFilterCallback {
    (error: any, acceptFile?: boolean): void;
  }

  // Configuration options supplied when configuring a Multer middleware instance.
  // Specifies custom storage engine, file size byte limits, and file filter predicates.
  // Governs file reception constraints for multipart upload routes.
  interface Options {
    storage?: StorageEngine;
    limits?: { fileSize?: number };
    fileFilter?: (req: any, file: any, cb: MulterFileFilterCallback) => void;
  }

  // Interface providing Express route middleware hooks for single and multi-file uploads.
  // Generates request handlers processing individual file or multi-file field streams.
  // Attaches parsed file artifacts to Express request objects for route handlers.
  interface MulterInstance {
    array(fieldName: string, maxCount?: number): RequestHandler;
    single(fieldName: string): RequestHandler;
  }

  // Factory function creating a configured Multer middleware instance.
  // Accepts upload options including storage engines and maximum file size constraints.
  // Produces instance capable of binding upload middleware to route handlers.
  function multer(options?: Options): MulterInstance;

  // Companion namespace providing built-in storage engines and custom Multer error types.
  // Houses in-memory storage constructor and standardized exception hierarchy.
  // Mirrors runtime exports provided by the underlying Multer library.
  namespace multer {
    // Creates a memory storage engine keeping uploaded files in Node.js Buffer instances.
    // Avoids persisting uploaded multipart files directly to host disk storage.
    // Ideal for ephemeral processing such as OCR parsing and temporary hashing.
    function memoryStorage(): StorageEngine;
    // Error subclass thrown when upload parsing encounters limits or protocol violations.
    // Carries standardized error codes such as LIMIT_FILE_SIZE or LIMIT_UNEXPECTED_FILE.
    // Enables route error handlers to distinguish upload failures from server exceptions.
    class MulterError extends Error {
      constructor(code: string, field?: string);
      code: string;
      field?: string;
    }
  }

  export default multer;
}
