export const DEFAULT_JSON_BODY_LIMIT = 64 * 1024;

function normalizedOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function allowedCorsOrigins(primaryUrl: string | undefined, extraOrigins = ""): Set<string> {
  const origins = new Set<string>();
  for (const value of [primaryUrl ?? "", ...extraOrigins.split(",")]) {
    const origin = normalizedOrigin(value);
    if (origin) origins.add(origin);
  }
  return origins;
}

export function corsHeadersForRequest(request: Request, allowedOrigins: Set<string>): { allowed: boolean; headers: Headers } {
  const origin = request.headers.get("Origin");
  const headers = new Headers({
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  });
  if (!origin) return { allowed: true, headers };
  const normalized = normalizedOrigin(origin);
  if (!normalized || !allowedOrigins.has(normalized)) return { allowed: false, headers };
  headers.set("Access-Control-Allow-Origin", normalized);
  return { allowed: true, headers };
}

export function jsonResponse(body: unknown, status = 200, corsHeaders?: Headers): Response {
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  return new Response(JSON.stringify(body), { status, headers });
}

export async function readJsonBodyWithLimit(request: Request, maximumBytes = DEFAULT_JSON_BODY_LIMIT): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") throw new Error("unsupported_media_type");
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) throw new Error("invalid_content_length");
    if (parsedLength > maximumBytes) throw new Error("body_too_large");
  }
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel("body_too_large");
        throw new Error("body_too_large");
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("invalid_json");
  }
}
