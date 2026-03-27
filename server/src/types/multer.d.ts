declare namespace Express {
  namespace Multer {
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

declare module "multer" {
  import type { RequestHandler } from "express";

  type StorageEngine = unknown;

  interface MulterFileFilterCallback {
    (error: any, acceptFile?: boolean): void;
  }

  interface Options {
    storage?: StorageEngine;
    limits?: { fileSize?: number };
    fileFilter?: (req: any, file: any, cb: MulterFileFilterCallback) => void;
  }

  interface MulterInstance {
    array(fieldName: string, maxCount?: number): RequestHandler;
    single(fieldName: string): RequestHandler;
  }

  function multer(options?: Options): MulterInstance;

  namespace multer {
    function memoryStorage(): StorageEngine;
  }

  export default multer;
}
