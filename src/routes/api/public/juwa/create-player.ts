import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  checkApiKey,
  getCreds,
  jsonError,
  jsonOk,
  juwaCall,
} from "./-_helpers.server";
import { callRefujRegister, decryptFromRefuj, readRefujRegistrationRequests } from "@/lib/refuj.server";

function generateJuwaUsername(): string {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const tail = letters + digits + "_";
  const rand = new Uint32Array(10);
  crypto.getRandomValues(rand);
  let username = letters[rand[0] % letters.length];
  for (let i = 1; i < 8; i++) username += tail[rand[i] % tail.length];
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

function generateRefujRegistrationId(userId: string) {
  const userPart = userId.replace(/[^a-fA-F0-9]/g, "").slice(0, 10) || "player";
  const random = new Uint8Array(4);
  crypto.getRandomValues(random);
  const randomPart = Array.from(random, (byte) => byte.toString(36).padStart(2, "0")).join("");
  return `COSMO-${userPart}-${Date.now().toString(36)}-${randomPart}`.slice(0, 48);
}

// Juwa account rule from their docs: letters, numbers, and underscores.
const JUWA_ACCOUNT_RE = /^[a-zA-Z][a-zA-Z0-9_]{5,31}$/;
const REFUJ_ACCOUNT_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;

const REFUJ_PLATFORM_GAMES: Record<string, { name: string; provider: string }> = {
  firekirin: { name: "Fire Kirin", provider: "firekirin" },
  milkyway: { name: "Milky Way", provider: "milkyway" },
  orionstars: { name: "Orion Stars", provider: "orionstars" },
  pandamaster: { name: "Panda Master", provider: "pandamaster" },
  lasvegassweeps: { name: "Las Vegas Sweeps", provider: "lasvegassweeps" },
  highstakes: { name: "High Stakes", provider: "highstakes" },
};

function compact(value?: string | null) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function readRefujText(value: unknown) {
  if (!value || typeof value !== "string") return "";
  return decryptFromRefuj(value) || value;
}

const GENERIC_REFUJ_STATUS_RE = /^(added successfully|created successfully|account created|success|completed|pending|request submitted|done|failed)$/i;

function extractRefujPassword(record: any) {
  const candidates = [record?.password, record?.Password, record?.notes, record?.Notes];
  for (const raw of candidates) {
    const value = readRefujText(raw).replace(/^Password:\s*/i, "").trim();
    if (!value || value.length > 60 || GENERIC_REFUJ_STATUS_RE.test(value)) continue;
    return value;
  }
  return "";
}

function refujRecords(raw: any) {
  return Array.isArray(raw?.data)
    ? raw.data
    : Array.isArray(raw?.data?.data)
      ? raw.data.data
      : Array.isArray(raw?.results)
        ? raw.results
        : Array.isArray(raw?.requests)
          ? raw.requests
          : Array.isArray(raw)
            ? raw
            : raw?.data && typeof raw.data === "object"
              ? [raw.data]
              : raw && typeof raw === "object"
                ? [raw]
                : [];
}

async function waitForRefujRegistration(input: {
  registrationId: string;
  gameCode: string;
  desiredUsername: string;
  apiBase?: string | null;
}) {
  for (let i = 0; i < 6; i++) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 2_000));
    let result;
    try {
      result = await readRefujRegistrationRequests({
        registrationId: input.registrationId,
        gameCode: input.gameCode,
        apiBase: input.apiBase,
      });
    } catch {
      continue;
    }
    const match = refujRecords(result.raw).find((record: any) => {
      const regId = record.registration_id ?? record.registrationId ?? record.Registration_ID ?? record.request_id;
      if (regId && regId === input.registrationId) return true;
      const username = readRefujText(record.desire_username ?? record.desired_username ?? record.Desire_Username);
      return username === input.desiredUsername;
    });
    if (!match) continue;

    const status = String(match.status ?? match.Status ?? "").toLowerCase();
    const notes = readRefujText(match.notes ?? match.Notes).toLowerCase();
    if (status.includes("completed") || status.includes("success") || /added successfully|created successfully|success/i.test(notes)) {
      return { status: "completed" as const, password: extractRefujPassword(match), raw: match };
    }
    if (status.includes("failed") || status.includes("error")) {
      return { status: "failed" as const, reason: readRefujText(match.notes ?? match.Notes) || "REFUJ registration failed", raw: match };
    }
  }
  return { status: "pending" as const };
}

async function getRefujIntegration(platform: keyof typeof REFUJ_PLATFORM_GAMES) {
  const spec = REFUJ_PLATFORM_GAMES[platform];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: games, error: gameError } = await supabaseAdmin
    .from("games")
    .select("id,name,provider")
    .or(`provider.eq.${spec.provider},name.eq.${spec.name}`);
  if (gameError) throw new Error(gameError.message);

  const game =
    (games ?? []).find((g: any) => compact(g.provider) === compact(spec.provider) || compact(g.name) === compact(spec.name)) ??
    null;
  if (!game) throw new Error(`${spec.name} is not configured in games.`);

  const { data: integration, error: integrationError } = await supabaseAdmin
    .from("platform_integrations")
    .select("api_endpoint,api_key,secret_key")
    .eq("game_id", (game as any).id)
    .maybeSingle();
  if (integrationError) throw new Error(integrationError.message);
  if (!integration?.api_key || !integration?.secret_key) {
    throw new Error(`${spec.name} REFUJ agent credentials are not configured.`);
  }

  return {
    gameName: spec.name,
    gameCode: (game as any).provider,
    apiBase: integration.api_endpoint,
    gameUser: integration.api_key,
    gamePass: integration.secret_key,
  };
}

const schema = z.object({
  platform: z.enum([
    "juwa",
    "juwa2",
    "gamevault",
    "firekirin",
    "milkyway",
    "orionstars",
    "pandamaster",
    "lasvegassweeps",
    "highstakes",
  ]),
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

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (platform in REFUJ_PLATFORM_GAMES) {
          const { data: existing } = await supabaseAdmin
            .from("platform_players" as never)
            .select("juwa_user_id, juwa_username, juwa_password")
            .eq("site_user_id", playerSiteUserId)
            .eq("platform", platform)
            .maybeSingle();

          const refuj = await getRefujIntegration(platform as keyof typeof REFUJ_PLATFORM_GAMES);
          const existingRow = existing as { juwa_user_id: string; juwa_username: string; juwa_password: string } | null;
          if (existingRow?.juwa_username && existingRow?.juwa_password) {
            return jsonOk({
              username: existingRow.juwa_username,
              password: existingRow.juwa_password,
              juwa_user_id: existingRow.juwa_user_id,
            });
          }

          if (existingRow?.juwa_user_id && existingRow?.juwa_username) {
            const polled = await waitForRefujRegistration({
              registrationId: existingRow.juwa_user_id,
              gameCode: refuj.gameCode,
              desiredUsername: existingRow.juwa_username,
              apiBase: refuj.apiBase,
            });
            if (polled.status === "completed" && polled.password) {
              await supabaseAdmin
                .from("platform_players" as never)
                .update({ juwa_password: polled.password } as never)
                .eq("site_user_id", playerSiteUserId)
                .eq("platform", platform);
              return jsonOk({
                username: existingRow.juwa_username,
                password: polled.password,
                juwa_user_id: existingRow.juwa_user_id,
              });
            }
            if (polled.status === "failed") {
              await supabaseAdmin
                .from("platform_players" as never)
                .delete()
                .eq("site_user_id", playerSiteUserId)
                .eq("platform", platform);
              return jsonError(502, polled.reason ?? "REFUJ registration failed");
            }
            return jsonOk({
              pending: true,
              username: existingRow.juwa_username,
              message: "Registration is still pending. Try again shortly.",
            });
          }

          const callerAccount = parsed.account ?? parsed.username;
          const username = callerAccount && REFUJ_ACCOUNT_RE.test(callerAccount)
            ? callerAccount
            : generateJuwaUsername().replace(/_/g, "").slice(0, 12);
          const registrationId = generateRefujRegistrationId(playerSiteUserId);
          const email = `${username}${Date.now().toString(36)}@player.cosmostakes.net`;
          const nickname = username.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20) || "Player";

          const { error: pendingInsertError } = await supabaseAdmin.from("platform_players" as never).insert({
            site_user_id: playerSiteUserId,
            platform,
            juwa_user_id: registrationId,
            juwa_username: username,
            juwa_password: "",
          } as never);
          if (pendingInsertError) return jsonError(500, pendingInsertError.message);

          try {
            await callRefujRegister({
              registrationId,
              gameName: refuj.gameName,
              gameCode: refuj.gameCode,
              gameUser: refuj.gameUser,
              gamePass: refuj.gamePass,
              desiredUsername: username,
              nickname,
              email,
              apiBase: refuj.apiBase,
            });
          } catch (e) {
            await supabaseAdmin
              .from("platform_players" as never)
              .delete()
              .eq("site_user_id", playerSiteUserId)
              .eq("platform", platform)
              .eq("juwa_user_id", registrationId);
            return jsonError(502, (e as Error).message);
          }

          const polled = await waitForRefujRegistration({
            registrationId,
            gameCode: refuj.gameCode,
            desiredUsername: username,
            apiBase: refuj.apiBase,
          });

          if (polled.status === "completed" && polled.password) {
            await supabaseAdmin
              .from("platform_players" as never)
              .update({ juwa_password: polled.password } as never)
              .eq("site_user_id", playerSiteUserId)
              .eq("platform", platform)
              .eq("juwa_user_id", registrationId);
          }

          if (polled.status === "completed" && polled.password) {
            return jsonOk({ username, password: polled.password, juwa_user_id: registrationId });
          }
          if (polled.status === "failed") {
            await supabaseAdmin
              .from("platform_players" as never)
              .delete()
              .eq("site_user_id", playerSiteUserId)
              .eq("platform", platform)
              .eq("juwa_user_id", registrationId);
            return jsonError(502, polled.reason ?? "REFUJ registration failed");
          }
          return jsonOk({
            pending: true,
            username,
            message: "Registration submitted. Try again shortly to fetch the password.",
          });
        }

        const creds = await getCreds(platform as "juwa" | "juwa2" | "gamevault");
        if (!creds) return jsonError(400, "platform not configured");

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
          const err = e as Error & { code?: number; msg?: string; status?: number; body?: string; sent?: Record<string, string> };
          try {
            await supabaseAdmin.from("juwa_debug_log" as never).insert({
              platform,
              endpoint: "/api/external/addUser",
              sent_fields: err.sent ?? { account: username, login_pwd: password },
              response_status: err.status ?? null,
              response_body: err.body ?? null,
              juwa_code: err.code ?? null,
              juwa_msg: err.msg ?? null,
              error_message: err.message,
            } as never);
          } catch {}
          return jsonError(502, err.message, { juwa_code: err.code, juwa_msg: err.msg, response_body: err.body });
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
