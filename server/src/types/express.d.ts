import type { Logger } from "pino";

export {};

// Augments global namespace definitions to extend Express framework types.
// Merges custom application properties into core Express request lifecycles.
// Provides project-wide TypeScript declarations for HTTP middleware context.
declare global {
  namespace Express {
    // Extends standard Express Request interface with FinWise security and logging context.
    // Injects correlation IDs, contextual logger, tenant organization info, and API key scopes.
    // Ensures type safety across all authenticated and instrumented route controllers.
    interface Request {
      requestId: string;
      traceId: string;
      log: Logger;
      org?: {
        orgId: string;
        memberId: string;
        role: "owner" | "admin" | "member";
      };
      rawBody?: Buffer;
      apiKey?: {
        id: string;
        orgId: string;
        createdByUserId?: string;
        scopes: string[];
        keyPrefix: string;
      };
    }
  }
}
