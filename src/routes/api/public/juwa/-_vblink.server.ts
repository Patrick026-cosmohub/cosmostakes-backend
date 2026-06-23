import { createHash } from "node:crypto";

export type VblinkConfig = {
  baseUrl: string;
  appid: string;
  appsecret: string;
};

export type VblinkResponse<T = unknown> = {
  code?: number;
  msg?: string;
  message?: string;
  data?: T;
};

export async function getVblinkConfig(): Promise<VblinkConfig | null> {
  const envBase = (process.env.VBLINK_BASE_URL ?? process.env.VBLINK_API_URL)?.trim();
  const envAppid = (process.env.VBLINK_APP_ID ?? process.env.VBLINK_APPID)?.trim();
  const envSecret = (process.env.VBLINK_APP_SECRET ?? process.env.VBLINK_APPSECRET)?.trim();
  if (envBase && envAppid && envSecret) {
    return { baseUrl: envBase, appid: envAppid, appsecret: envSecret };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("platform_credentials" as never)
    .select("base_url, agent_id, secret_key")
    .eq("platform", "vblink")
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { base_url?: string | null; agent_id?: string | null; secret_key?: string | null };
  if (!row.base_url || !row.agent_id || !row.secret_key) return null;
  return { baseUrl: row.base_url, appid: row.agent_id, appsecret: row.secret_key };
}

export function makeVblinkRequestId(prefix: string): string {
  const safePrefix = prefix.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "cosmo";
  const bytes = new Uint32Array(4);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes, (value) => value.toString(36)).join("").replace(/[^a-zA-Z0-9]/g, "");
  return `${safePrefix}${Date.now().toString(36)}${random}`.slice(0, 64);
}

function sign(params: Record<string, string>, appsecret: string): string {
  const text = Object.entries(params)
    .filter(([key]) => key !== "sign")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return createHash("md5").update(text + appsecret).digest("hex");
}

export async function vblinkCall<T = unknown>(
  config: VblinkConfig,
  path: string,
  fields: Record<string, string | number>,
): Promise<VblinkResponse<T>> {
  const params: Record<string, string> = {
    requestid: makeVblinkRequestId(path),
    appid: config.appid,
    timestamp: Date.now().toString(),
  };
  for (const [key, value] of Object.entries(fields)) {
    params[key] = String(value);
  }
  params.sign = sign(params, config.appsecret);

  const url = `${config.baseUrl.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const text = await res.text();
  let body: VblinkResponse<T>;
  try {
    body = JSON.parse(text);
  } catch {
    const err = new Error(`Vblink non-JSON response (${res.status}): ${text.slice(0, 200)}`);
    (err as Error & { status?: number; body?: string; sent?: Record<string, string> }).status = res.status;
    (err as Error & { status?: number; body?: string; sent?: Record<string, string> }).body = text;
    (err as Error & { status?: number; body?: string; sent?: Record<string, string> }).sent = params;
    throw err;
  }

  if (body.code !== 200 && body.code !== 1) {
    const message = body.message ?? body.msg ?? "";
    const err = new Error(`Vblink error ${body.code}: ${message}`);
    type VblinkErr = Error & { code?: number; msg?: string; status?: number; body?: string; sent?: Record<string, string> };
    (err as VblinkErr).code = body.code;
    (err as VblinkErr).msg = message;
    (err as VblinkErr).status = res.status;
    (err as VblinkErr).body = text;
    (err as VblinkErr).sent = params;
    throw err;
  }

  return body;
}

