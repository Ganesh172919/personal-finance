export class ApiError extends Error {
  status: number;
  code?: string;
  requestId?: string;
  details?: unknown;

  constructor(message: string, params: { status: number; code?: string; requestId?: string; details?: unknown }) {
    super(message);
    this.name = "ApiError";
    this.status = params.status;
    this.code = params.code;
    this.requestId = params.requestId;
    this.details = params.details;
  }
}

export async function parseApiError(res: Response): Promise<ApiError> {
  let errorData: any = null;

  try {
    errorData = await res.clone().json();
  } catch {
    errorData = null;
  }

  const message =
    (errorData && typeof errorData === "object" && "message" in errorData && String((errorData as any).message)) ||
    `Request failed with status: ${res.status}`;

  const requestId =
    (errorData && typeof errorData === "object" && ((errorData as any).request_id || (errorData as any).requestId)) ||
    res.headers.get("X-Request-Id") ||
    undefined;

  return new ApiError(message, {
    status: res.status,
    code: errorData && typeof errorData === "object" ? (errorData as any).code : undefined,
    requestId: requestId ? String(requestId) : undefined,
    details: errorData && typeof errorData === "object" ? (errorData as any).details : undefined,
  });
}

