import { createHash, timingSafeEqual } from "node:crypto";

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
};

export type PlatformKey = "juwa" | "juwa2" | "gamevault";

export type JuwaCreds = {
  baseUrl: string;
  agentId: string;
  secretKey: string;
};

export async function getCreds(platform: PlatformKey): Promise<JuwaCreds | null> {
  if (platform === "juwa") {
    const baseUrl = process.env.JUWA_BASE_URL;
    const agentId = process.env.JUWA_AGENT_ID;
    const secretKey = process.env.JUWA_SECRET_KEY;
    if (!baseUrl || !agentId || !secretKey) return null;
    return { baseUrl, agentId, secretKey };
  }
  if (platform === "juwa2") {
    const baseUrl = process.env.JUWA2_BASE_URL;
    const agentId = process.env.JUWA2_AGENT_ID;
    const secretKey = process.env.JUWA2_SECRET_KEY;
    if (!baseUrl || !agentId || !secretKey) return null;
    return { baseUrl, agentId, secretKey };
  }
  if (platform === "gamevault") {
    const baseUrl = process.env.GAMEVAULT_BASE_URL;
    const agentId = process.env.GAMEVAULT_AGENT_ID;
    const secretKey = process.env.GAMEVAULT_SECRET_KEY;
    if (!baseUrl || !agentId || !secretKey) return null;
    return { baseUrl, agentId, secretKey };
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("platform_credentials" as never)
    .select("base_url, agent_id, secret_key")
    .eq("platform", platform)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { base_url: string; agent_id: string; secret_key: string };
  return { baseUrl: row.base_url, agentId: row.agent_id, secretKey: row.secret_key };
}

export function checkApiKey(request: Request): Response | null {
  let provided = request.headers.get("x-api-key");
  if (!provided) {
    const auth = request.headers.get("Authorization") ?? "";
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (match) provided = match[1];
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

export function jsonError(status: number, message: string, extra?: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

export function jsonOk(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

export async function juwaCall<T = Record<string, unknown>>(
  creds: JuwaCreds,
  path: string,
  fields: Record<string, string | number>,
): Promise<T> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const token = createHash("md5")
    .update(`${creds.agentId}:${timestamp}:${creds.secretKey}`)
    .digest("hex");

  const form = new FormData();
  form.append("agent_id", creds.agentId);
  form.append("timestamp", timestamp);
  form.append("token", token);
  for (const [k, v] of Object.entries(fields)) {
    form.append(k, String(v));
  }

  const url = creds.baseUrl.replace(/\/$/, "") + path;
  console.log("[juwa] →", url, {
    agent_id: creds.agentId,
    timestamp,
    token: "***",
    ...fields,
  });
  const res = await fetch(url, { method: "POST", body: form });
  const text = await res.text();
  console.log("[juwa] ←", res.status, text.slice(0, 500));
  let body: { code?: number; msg?: string; data?: T };
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Juwa non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }
  if (body.code !== 0) {
    let message = `Juwa error ${body.code}: ${body.msg ?? ""}`;
    if (body.code === 5) {
      message += ` — your server's outbound IP is not whitelisted by Juwa. Contact Juwa support to whitelist this site's egress IP.`;
    }
    const err = new Error(message);
    (err as Error & { code?: number; msg?: string }).code = body.code;
    (err as Error & { code?: number; msg?: string }).msg = body.msg;
    throw err;
  }
  return (body.data ?? ({} as T)) as T;
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const ALPHABET_ALNUM = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export function randomString(len: number): string {
  let s = "";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) s += ALPHABET[arr[i] % ALPHABET.length];
  return s;
}

export function randomAlnum(len: number): string {
  let s = "";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) s += ALPHABET_ALNUM[arr[i] % ALPHABET_ALNUM.length];
  return s;
}

export function randomOrderId(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomString(8)}`;
}
