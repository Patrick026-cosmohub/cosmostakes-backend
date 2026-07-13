import { createHash } from "node:crypto";
import { setDefaultResultOrder } from "node:dns";

setDefaultResultOrder("ipv4first");

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

function readVblinkMessage(body: VblinkResponse): string {
  const message = body.message ?? body.msg;
  if (message) return message;
  const data = body.data;
  if (data && typeof data === "object" && "info" in data) {
    const info = (data as { info?: unknown }).info;
    if (typeof info === "string") return info;
    if (info != null) return JSON.stringify(info);
  }
  return "";
}

export async function getVblinkConfig(): Promise<VblinkConfig | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("platform_credentials" as never)
    .select("base_url, agent_id, secret_key")
    .eq("platform", "vblink")
    .maybeSingle();
  if (error || !data) return null;
  const row = data as {
    base_url?: string | null;
    agent_id?: string | null;
    secret_key?: string | null;
  };
  const baseUrl = row.base_url?.trim();
  const appid = row.agent_id?.trim();
  const appsecret = row.secret_key?.trim();
  if (baseUrl && appid && appsecret) return { baseUrl, appid, appsecret };

  const env = globalThis.process?.env ?? {};
  const envBase = (env["VBLINK_API_URL"] ?? env["VBLINK_BASE_URL"])?.trim();
  const envAppid = (env["VBLINK_APP_ID"] ?? env["VBLINK_APPID"])?.trim();
  const envSecret = (env["VBLINK_APP_SECRET"] ?? env["VBLINK_APPSECRET"])?.trim();
  return envBase && envAppid && envSecret
    ? { baseUrl: envBase, appid: envAppid, appsecret: envSecret }
    : null;
}

export function makeVblinkRequestId(prefix: string): string {
  const safePrefix = prefix.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "cosmo";
  const bytes = new Uint32Array(4);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes, (value) => value.toString(36))
    .join("")
    .replace(/[^a-zA-Z0-9]/g, "");
  return `${safePrefix}${Date.now().toString(36)}${random}`.slice(0, 64);
}

function sign(params: Record<string, string>, appsecret: string): string {
  const text = Object.entries(params)
    .filter(([key]) => key !== "sign")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return createHash("md5")
    .update(text + appsecret)
    .digest("hex");
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
    (err as Error & { status?: number; body?: string; sent?: Record<string, string> }).status =
      res.status;
    (err as Error & { status?: number; body?: string; sent?: Record<string, string> }).body = text;
    (err as Error & { status?: number; body?: string; sent?: Record<string, string> }).sent =
      params;
    throw err;
  }

  if (body.code !== 200 && body.code !== 1) {
    const message = readVblinkMessage(body);
    const err = new Error(`Vblink error ${body.code}: ${message}`);
    type VblinkErr = Error & {
      code?: number;
      msg?: string;
      status?: number;
      body?: string;
      sent?: Record<string, string>;
    };
    (err as VblinkErr).code = body.code;
    (err as VblinkErr).msg = message;
    (err as VblinkErr).status = res.status;
    (err as VblinkErr).body = text;
    (err as VblinkErr).sent = params;
    throw err;
  }

  return body;
}
