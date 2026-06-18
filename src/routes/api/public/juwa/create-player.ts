import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  checkApiKey,
  getCreds,
  jsonError,
  jsonOk,
  juwaCall,
} from "./_helpers.server";

function generateJuwaUsername(): string {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const rand = new Uint32Array(10);
  crypto.getRandomValues(rand);
  let username = "";
  for (let i = 0; i < 8; i++) username += letters[rand[i] % letters.length];
  for (let i = 8; i < 10; i++) username += digits[rand[i] % digits.length];
  return username;
}

function generateJuwaPassword(): string {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";
  const all = letters + upper + digits;
  const rand = new Uint32Array(10);
  crypto.getRandomValues(rand);
  let pwd = upper[rand[0] % upper.length] + letters[rand[1] % letters.length];
  for (let i = 2; i < 8; i++) pwd += all[rand[i] % all.length];
  pwd += digits[rand[8] % digits.length] + digits[rand[9] % digits.length];
  return pwd;
}

// Juwa account rule: starts with letter, 6-12 alphanumeric chars.
const JUWA_ACCOUNT_RE = /^[a-zA-Z][a-zA-Z0-9]{5,11}$/;

const schema = z.object({
  platform: z.enum(["juwa", "juwa2", "gamevault"]),
  playerSiteUserId: z.string().uuid(),
  username: z.string().optional(),
  password: z.string().optional(),
  account: z.string().optional(),
  login_pwd: z.string().optional(),
});

export const Route = createFileRoute("/api/public/juwa/create-player")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFail = checkApiKey(request);
        if (authFail) return authFail;

        let parsed;
        try {
          parsed = schema.parse(await request.json());
        } catch (e) {
          return jsonError(400, "Invalid body", { detail: (e as Error).message });
        }
        const { platform, playerSiteUserId } = parsed;

        const creds = await getCreds(platform);
        if (!creds) return jsonError(400, "platform not configured");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: existing } = await supabaseAdmin
          .from("platform_players" as never)
          .select("juwa_user_id, juwa_username, juwa_password")
          .eq("site_user_id", playerSiteUserId)
          .eq("platform", platform)
          .maybeSingle();

        if (existing) {
          const row = existing as { juwa_user_id: string; juwa_username: string; juwa_password: string };
          return jsonOk({
            username: row.juwa_username,
            password: row.juwa_password,
            juwa_user_id: row.juwa_user_id,
          });
        }

        // Juwa rule: must start with English letter, alphanumeric.
        // Only honor caller-provided values when they pass the format check;
        // otherwise generate server-side so the Juwa call never fails on bad input.
        const callerAccount = parsed.account ?? parsed.username;
        const callerPwd = parsed.login_pwd ?? parsed.password;
        const username = callerAccount && JUWA_ACCOUNT_RE.test(callerAccount)
          ? callerAccount
          : generateJuwaUsername();
        const password = callerPwd && callerPwd.length >= 6 && callerPwd.length <= 20
          ? callerPwd
          : generateJuwaPassword();
        console.log("[juwa create-player] using", { username, passwordLen: password.length, callerProvidedAccount: !!callerAccount, callerProvidedPwd: !!callerPwd });

        let data: { account_name?: string; user_id?: string | number };
        try {
          data = await juwaCall(creds, "/api/external/addUser", {
            account: username,
            login_pwd: password,
          });
        } catch (e) {
          return jsonError(502, (e as Error).message);
        }

        const juwaUserId = String(data.user_id ?? "");
        if (!juwaUserId) return jsonError(502, "Juwa addUser missing user_id");

        const { error: insertErr } = await supabaseAdmin
          .from("platform_players" as never)
          .insert({
            site_user_id: playerSiteUserId,
            platform,
            juwa_user_id: juwaUserId,
            juwa_username: data.account_name ?? username,
            juwa_password: password,
          } as never);
        if (insertErr) return jsonError(500, insertErr.message);

        return jsonOk({
          username: data.account_name ?? username,
          password,
          juwa_user_id: juwaUserId,
        });
      },
    },
  },
});