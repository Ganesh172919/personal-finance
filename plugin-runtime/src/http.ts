export type JsonRecord = Record<string, unknown>;

export const json = (status: number, body: JsonRecord, headers: HeadersInit = {}) => {
  const h = new Headers(headers);
  if (!h.has("content-type")) {
    h.set("content-type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(body), { status, headers: h });
};

export const readJson = async (req: Request, { maxBytes = 256_000 } = {}): Promise<unknown> => {
  const contentType = String(req.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    throw new Error("Content-Type must be application/json");
  }

  const reader = req.body?.getReader();
  if (!reader) {
    return null;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      throw new Error("Request body too large");
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder().decode(merged);
  return JSON.parse(text);
};

export const getBearerToken = (req: Request): string => {
  const header = String(req.headers.get("authorization") || "");
  if (!header.startsWith("Bearer ")) return "";
  return header.slice("Bearer ".length).trim();
};

