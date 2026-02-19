export {};

declare global {
  namespace Express {
    interface Request {
      requestId: string;
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
