import { createHash, createHmac, timingSafeEqual } from "node:crypto";

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

async function getStoredCreds(platform: string): Promise<JuwaCreds | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("platform_credentials" as never)
    .select("base_url, agent_id, secret_key")
    .eq("platform", platform)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { base_url?: string | null; agent_id?: string | null; secret_key?: string | null };
  if (!row.base_url?.trim() || !row.agent_id?.trim() || !row.secret_key?.trim()) return null;
  return {
    baseUrl: row.base_url.trim(),
    agentId: row.agent_id.trim(),
    secretKey: row.secret_key.trim(),
  };
}

export async function getCreds(platform: PlatformKey): Promise<JuwaCreds | null> {
  if (platform === "juwa") {
    const baseUrl = (process.env.JUWA_BASE_URL ?? process.env.JUWA_API_URL)?.trim();
    const agentId = process.env.JUWA_AGENT_ID?.trim();
    const secretKey = process.env.JUWA_SECRET_KEY?.trim();
    if (!baseUrl || !agentId || !secretKey) return getStoredCreds(platform);
    return { baseUrl, agentId, secretKey };
  }
  if (platform === "juwa2") {
    const baseUrl = (process.env.JUWA2_BASE_URL ?? process.env.JUWA2_API_URL)?.trim();
    const agentId = process.env.JUWA2_AGENT_ID?.trim();
    const secretKey = process.env.JUWA2_SECRET_KEY?.trim();
    if (!baseUrl || !agentId || !secretKey) return getStoredCreds(platform);
    return { baseUrl, agentId, secretKey };
  }
  if (platform === "gamevault") {
    const baseUrl = (process.env.GAMEVAULT_BASE_URL ?? process.env.GAMEVAULT_API_URL)?.trim();
    const agentId = process.env.GAMEVAULT_AGENT_ID?.trim();
    const secretKey = process.env.GAMEVAULT_SECRET_KEY?.trim();
    if (!baseUrl || !agentId || !secretKey) return getStoredCreds(platform);
    return { baseUrl, agentId, secretKey };
  }
  return getStoredCreds(platform);
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
  const sentFields = Object.fromEntries(form.entries());
  if (path === "/api/external/addUser") {
    console.log("[juwa addUser] outgoing form:", sentFields);
  } else {
    console.error("[juwa] →", url, JSON.stringify(sentFields));
  }
  const relayUrl = process.env.RELAY_URL?.trim();
  const relaySecret = process.env.RELAY_SECRET?.trim();
  let res: Response;
  if (relayUrl && relaySecret) {
    const payload = JSON.stringify({ url, fields: sentFields });
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = createHmac("sha256", relaySecret)
      .update(`${ts}.${payload}`)
      .digest("hex");
    res = await fetch(relayUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-relay-timestamp": ts,
        "x-relay-signature": sig,
      },
      body: payload,
    });
  } else {
    res = await fetch(url, { method: "POST", body: form });
  }
  const text = await res.text();
  if (path === "/api/external/addUser") {
    console.log("[juwa addUser] raw response:", res.status, text);
  } else {
    console.error("[juwa] ←", res.status, text);
  }
  let body: { code?: number; msg?: string; data?: T };
  try {
    body = JSON.parse(text);
  } catch {
    const err = new Error(`Juwa non-JSON response (${res.status}): ${text.slice(0, 200)}`);
    (err as Error & { status?: number; body?: string; sent?: Record<string, string> }).status = res.status;
    (err as Error & { status?: number; body?: string; sent?: Record<string, string> }).body = text;
    (err as Error & { status?: number; body?: string; sent?: Record<string, string> }).sent = sentFields as Record<string, string>;
    throw err;
  }
  if (body.code !== 0) {
    let message = `Juwa error ${body.code}: ${body.msg ?? ""}`;
    if (body.code === 5) {
      message += ` — your server's outbound IP is not whitelisted by Juwa. Contact Juwa support to whitelist this site's egress IP.`;
    }
    const err = new Error(message);
    type JuwaErr = Error & { code?: number; msg?: string; status?: number; body?: string; sent?: Record<string, string> };
    (err as JuwaErr).code = body.code;
    (err as JuwaErr).msg = body.msg;
    (err as JuwaErr).status = res.status;
    (err as JuwaErr).body = text;
    (err as JuwaErr).sent = sentFields as Record<string, string>;
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
  const marker = prefix === "wd" ? "2" : "1";
  const random = crypto.getRandomValues(new Uint32Array(1))[0] % 1000;
  return `${marker}${Date.now()}${random.toString().padStart(3, "0")}`;
}
