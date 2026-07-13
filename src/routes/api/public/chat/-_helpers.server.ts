import { timingSafeEqual } from "node:crypto";

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
};

export function checkApiKey(request: Request): Response | null {
  let provided = request.headers.get("x-api-key");
  if (!provided) {
    const auth = request.headers.get("Authorization") ?? "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m) provided = m[1];
  }
  const expected = process.env.COSMO_ADMIN_API_KEY;
  let ok = false;
  if (expected && provided) {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length === b.length) ok = timingSafeEqual(a, b);
  }
  if (!ok) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json", ...CORS_HEADERS },
    });
  }
  return null;
}

export function jsonOk(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

export function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

export function cors204(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
