import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  checkApiKey,
  getCreds,
  jsonError,
  jsonOk,
  juwaCall,
  redactJuwaFields,
} from "./-_helpers.server";
import { getVblinkConfig, vblinkCall } from "./-_vblink.server";
import {
  callRefujRegister,
  decryptFromRefuj,
  readRefujRegistrationRequests,
} from "@/lib/refuj.server";
import {
  REFUJ_PLATFORM_GAMES,
  getRefujIntegration,
  isRefujPlatform,
} from "./-_refuj-platforms.server";

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

const PLATFORM_USERNAME_MAX_LENGTH = 12;
const PLATFORM_USERNAME_RANDOM_LENGTH = 3;
const PLATFORM_USERNAME_SUFFIX = {
  juwa: "ju",
  juwa2: "j2",
  gamevault: "gv",
  vblink: "vb",
  firekirin: "fk",
  milkyway: "mw",
  orionstars: "os",
  pandamaster: "pm",
  lasvegassweeps: "vs",
  highstakes: "hs",
} as const;
const PLATFORM_USERNAME_ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789";

type ManagedPlatform = keyof typeof PLATFORM_USERNAME_SUFFIX;
type PlayerProfileName = {
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

function randomFrom(alphabet: string) {
  const rand = new Uint32Array(1);
  crypto.getRandomValues(rand);
  return alphabet[rand[0] % alphabet.length] ?? alphabet[0];
}

function usernamePart(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.toLowerCase().replace(/[^a-z0-9]/g, "")
    : "";
}

function createPlatformUsername(input: {
  userId: string;
  platform: ManagedPlatform;
  profile?: PlayerProfileName | null;
}) {
  const firstName = usernamePart(input.profile?.first_name);
  const lastName = usernamePart(input.profile?.last_name);
  const email = usernamePart(input.profile?.email?.split("@")[0]);
  const userIdFallback = usernamePart(input.userId).slice(0, 8);
  const suffix = PLATFORM_USERNAME_SUFFIX[input.platform];
  const randomPart = Array.from({ length: PLATFORM_USERNAME_RANDOM_LENGTH }, () =>
    randomFrom(PLATFORM_USERNAME_ALPHABET),
  ).join("");
  const nameStem =
    firstName && lastName
      ? `${firstName.slice(0, 1)}${lastName}`
      : firstName || lastName || email || `cs${userIdFallback || "player"}`;
  const stemMaxLength = Math.max(
    1,
    PLATFORM_USERNAME_MAX_LENGTH - randomPart.length - suffix.length,
  );
  const alphaStem = /^[a-z]/.test(nameStem) ? nameStem : `p${nameStem}`;
  const stem = alphaStem.slice(0, stemMaxLength) || "cs";
  return `${stem}${randomPart}${suffix}`.slice(0, PLATFORM_USERNAME_MAX_LENGTH);
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
const VBLINK_ACCOUNT_RE = /^[a-zA-Z0-9]{3,16}$/;
const VBLINK_PASSWORD_RE = /^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z0-9!@#$()%^/.,]{6,16}$/;

function readRefujText(value: unknown) {
  if (!value || typeof value !== "string") return "";
  return decryptFromRefuj(value) || value;
}

function generateVblinkUsername(userId: string): string {
  const cleanId =
    userId
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 8)
      .toLowerCase() || "player";
  return `cs${cleanId}${Math.floor(1000 + Math.random() * 9000)}`.slice(0, 16);
}

function readVblinkFullAccount(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const row = data as Record<string, unknown>;
  const candidates = [
    row["Full account"],
    row.full_account,
    row.fullAccount,
    row.account,
    row.account_name,
    row.username,
  ];
  return (
    candidates
      .find((value): value is string => typeof value === "string" && value.trim().length > 0)
      ?.trim() ?? fallback
  );
}

const GENERIC_REFUJ_STATUS_RE =
  /^(added successfully|created successfully|account created|success|completed|pending|request submitted|done|failed)$/i;
const REFUJ_STALE_PENDING_MS = 3 * 60 * 1000;
const VEGAS_SWEEPS_STALE_PENDING_MS = 10 * 60 * 1000;

function extractRefujPassword(record: any) {
  const candidates = [record?.password, record?.Password, record?.notes, record?.Notes];
  for (const raw of candidates) {
    const value = readRefujText(raw)
      .replace(/^Password:\s*/i, "")
      .trim();
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

function findRefujRegistrationRecord(records: any[], input: { registrationId: string; gameCode: string; desiredUsername: string }) {
  return records.find((record: any) => {
    const regId =
      record.registration_id ??
      record.registrationId ??
      record.Registration_ID ??
      record.request_id;
    if (regId && regId === input.registrationId) return true;
    const recordGameCode = String(
      record.gaming_site ?? record.game_code ?? record.Game_Code ?? record.Gaming_Site ?? "",
    ).toUpperCase();
    if (recordGameCode && recordGameCode !== input.gameCode.toUpperCase()) return false;
    const username = readRefujText(
      record.desire_username ?? record.desired_username ?? record.Desire_Username,
    );
    return username === input.desiredUsername;
  });
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
    const filteredRecords = refujRecords(result.raw);
    let match = findRefujRegistrationRecord(filteredRecords, input);
    if (!match && input.registrationId && filteredRecords.length === 1) {
      match = filteredRecords[0];
    }
    if (!match) {
      try {
        const fallbackResult = await readRefujRegistrationRequests({ apiBase: input.apiBase });
        match = findRefujRegistrationRecord(refujRecords(fallbackResult.raw), input);
      } catch {
        // Keep the original filtered response behavior if REFUJ's full list is unavailable.
      }
    }
    if (!match) continue;

    const status = String(match.status ?? match.Status ?? "").toLowerCase();
    const notes = readRefujText(match.notes ?? match.Notes).toLowerCase();
    if (
      status.includes("completed") ||
      status.includes("success") ||
      status.includes("done") ||
      /added successfully|created successfully|success/i.test(notes)
    ) {
      return { status: "completed" as const, password: extractRefujPassword(match), raw: match };
    }
    if (status.includes("failed") || status.includes("error") || status.includes("reject")) {
      return {
        status: "failed" as const,
        reason: readRefujText(match.notes ?? match.Notes) || "REFUJ registration failed",
        raw: match,
      };
    }
  }
  return { status: "pending" as const };
}

async function savePlatformAccount(input: {
  supabaseAdmin: any;
  userId: string;
  platform: string;
  username: string;
  password: string;
}) {
  if (!input.username || !input.password) return;
  const payload = {
    user_id: input.userId,
    platform: input.platform,
    platform_username: input.username,
    platform_password: input.password,
  };
  const { data: existing, error: existingError } = await input.supabaseAdmin
    .from("platform_accounts" as never)
    .select("id")
    .eq("user_id", input.userId)
    .eq("platform", input.platform)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  const query = existing?.id
    ? input.supabaseAdmin
        .from("platform_accounts" as never)
        .update(payload as never)
        .eq("id", existing.id)
    : input.supabaseAdmin.from("platform_accounts" as never).insert(payload as never);
  const { error } = await query;
  if (
    error?.code === "23514" ||
    String(error?.message ?? "").includes("platform_accounts_platform_check")
  )
    return;
  if (error) throw new Error(error.message);
}

const schema = z.object({
  platform: z.enum([
    "juwa",
    "juwa2",
    "gamevault",
    "vblink",
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
        const { data: profile, error: profileError } = await supabaseAdmin
          .from("profiles")
          .select("email,first_name,last_name")
          .eq("id", playerSiteUserId)
          .maybeSingle();
        if (profileError) return jsonError(500, profileError.message);
        const patternedUsername = () =>
          createPlatformUsername({
            userId: playerSiteUserId,
            platform,
            profile: profile as PlayerProfileName | null,
          });

        if (platform === "vblink") {
          const { data: existing } = await supabaseAdmin
            .from("platform_players" as never)
            .select("juwa_user_id, juwa_username, juwa_password")
            .eq("site_user_id", playerSiteUserId)
            .eq("platform", platform)
            .maybeSingle();

          if (existing) {
            const row = existing as {
              juwa_user_id: string;
              juwa_username: string;
              juwa_password: string;
            };
            return jsonOk({
              username: row.juwa_username,
              password: row.juwa_password,
              juwa_user_id: row.juwa_user_id,
            });
          }

          const config = await getVblinkConfig();
          if (!config) return jsonError(400, "Vblink is not configured");

          const callerAccount = parsed.account ?? parsed.username;
          const callerPwd = parsed.login_pwd ?? parsed.password;
          let username =
            callerAccount && VBLINK_ACCOUNT_RE.test(callerAccount)
              ? callerAccount
              : patternedUsername();
          const password =
            callerPwd && VBLINK_PASSWORD_RE.test(callerPwd) ? callerPwd : generateJuwaPassword();

          let fullAccount = username;
          let lastError: Error | null = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const result = await vblinkCall(config, "/fast/user/create", {
                account: username,
                passwd: password,
              });
              fullAccount = readVblinkFullAccount(result.data, username);
              lastError = null;
              break;
            } catch (e) {
              const err = e as Error & { code?: number };
              lastError = err;
              if (err.code !== 12 || callerAccount) break;
              username = patternedUsername();
            }
          }
          if (lastError) return jsonError(502, lastError.message);

          const { error: insertErr } = await supabaseAdmin
            .from("platform_players" as never)
            .insert({
              site_user_id: playerSiteUserId,
              platform,
              juwa_user_id: username,
              juwa_username: fullAccount,
              juwa_password: password,
            } as never);
          if (insertErr) return jsonError(500, insertErr.message);

          return jsonOk({
            username: fullAccount,
            password,
            juwa_user_id: username,
          });
        }

        if (isRefujPlatform(platform)) {
          const { data: existing } = await supabaseAdmin
            .from("platform_players" as never)
            .select("juwa_user_id, juwa_username, juwa_password, created_at")
            .eq("site_user_id", playerSiteUserId)
            .eq("platform", platform)
            .maybeSingle();

          const refuj = await getRefujIntegration(platform);
          const callerPwd = parsed.login_pwd ?? parsed.password;
          const requestedPassword =
            callerPwd && callerPwd.length >= 6 && callerPwd.length <= 20
              ? callerPwd
              : generateJuwaPassword();
          const completeRefujAccount = async (input: {
            username: string;
            registrationId: string;
            password?: string;
          }) => {
            const password = input.password || requestedPassword;
            await supabaseAdmin
              .from("platform_players" as never)
              .update({ juwa_password: password } as never)
              .eq("site_user_id", playerSiteUserId)
              .eq("platform", platform)
              .eq("juwa_user_id", input.registrationId);
            await savePlatformAccount({
              supabaseAdmin,
              userId: playerSiteUserId,
              platform,
              username: input.username,
              password,
            });
            return jsonOk({
              username: input.username,
              password,
              juwa_user_id: input.registrationId,
            });
          };
          const existingRow = existing as {
            juwa_user_id: string;
            juwa_username: string;
            juwa_password: string;
            created_at?: string;
          } | null;
          if (existingRow?.juwa_username && existingRow?.juwa_password) {
            await savePlatformAccount({
              supabaseAdmin,
              userId: playerSiteUserId,
              platform,
              username: existingRow.juwa_username,
              password: existingRow.juwa_password,
            });
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
            if (polled.status === "completed") {
              return completeRefujAccount({
                username: existingRow.juwa_username,
                registrationId: existingRow.juwa_user_id,
                password: polled.password,
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

            const createdAtMs = existingRow.created_at
              ? new Date(existingRow.created_at).getTime()
              : 0;
            const stalePendingMs =
              platform === "lasvegassweeps" ? VEGAS_SWEEPS_STALE_PENDING_MS : REFUJ_STALE_PENDING_MS;
            const stalePending =
              !createdAtMs || Date.now() - createdAtMs > stalePendingMs;
            if (stalePending) {
              const registrationId = generateRefujRegistrationId(playerSiteUserId);
              const username = existingRow.juwa_username;
              const email = `${username}${Date.now().toString(36)}@player.cosmostakes.net`;
              const nickname = username.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20) || "Player";

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
                return jsonError(502, (e as Error).message);
              }

              const { error: retryUpdateError } = await supabaseAdmin
                .from("platform_players" as never)
                .update({
                  juwa_user_id: registrationId,
                  juwa_password: "",
                  created_at: new Date().toISOString(),
                } as never)
                .eq("site_user_id", playerSiteUserId)
                .eq("platform", platform);
              if (retryUpdateError) return jsonError(500, retryUpdateError.message);

              const retryPolled = await waitForRefujRegistration({
                registrationId,
                gameCode: refuj.gameCode,
                desiredUsername: username,
                apiBase: refuj.apiBase,
              });
              if (retryPolled.status === "completed") {
                return completeRefujAccount({
                  username,
                  registrationId,
                  password: retryPolled.password,
                });
              }
              if (retryPolled.status === "failed") {
                await supabaseAdmin
                  .from("platform_players" as never)
                  .delete()
                  .eq("site_user_id", playerSiteUserId)
                  .eq("platform", platform);
                return jsonError(502, retryPolled.reason ?? "REFUJ registration failed");
              }

              return jsonOk({
                pending: true,
                username,
                message: "Registration resubmitted. Try again shortly.",
              });
            }

            return jsonOk({
              pending: true,
              username: existingRow.juwa_username,
              message: "Registration is still pending. Try again shortly.",
            });
          }

          const callerAccount = parsed.account ?? parsed.username;
          const username =
            callerAccount && REFUJ_ACCOUNT_RE.test(callerAccount)
              ? callerAccount
              : patternedUsername();
          const registrationId = generateRefujRegistrationId(playerSiteUserId);
          const email = `${username}${Date.now().toString(36)}@player.cosmostakes.net`;
          const nickname = username.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20) || "Player";

          const { error: pendingInsertError } = await supabaseAdmin
            .from("platform_players" as never)
            .insert({
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

          if (polled.status === "completed") {
            return completeRefujAccount({
              username,
              registrationId,
              password: polled.password,
            });
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
          const row = existing as {
            juwa_user_id: string;
            juwa_username: string;
            juwa_password: string;
          };
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
        const username =
          callerAccount && JUWA_ACCOUNT_RE.test(callerAccount)
            ? callerAccount
            : patternedUsername();
        const password =
          callerPwd && callerPwd.length >= 6 && callerPwd.length <= 20
            ? callerPwd
            : generateJuwaPassword();
        console.log("[juwa create-player] using", {
          username,
          passwordLen: password.length,
          callerProvidedAccount: !!callerAccount,
          callerProvidedPwd: !!callerPwd,
        });

        let data: { account_name?: string; user_id?: string | number };
        try {
          data = await juwaCall(creds, "/api/external/addUser", {
            account: username,
            login_pwd: password,
          });
        } catch (e) {
          const err = e as Error & {
            code?: number;
            msg?: string;
            status?: number;
            body?: string;
            sent?: Record<string, string>;
          };
          try {
            await supabaseAdmin.from("juwa_debug_log" as never).insert({
              platform,
              endpoint: "/api/external/addUser",
              sent_fields: err.sent ?? redactJuwaFields({ account: username, login_pwd: password }),
              response_status: err.status ?? null,
              response_body: err.body ?? null,
              juwa_code: err.code ?? null,
              juwa_msg: err.msg ?? null,
              error_message: err.message,
            } as never);
          } catch {
            // Best-effort debug logging should not mask the provider failure response.
          }
          return jsonError(502, err.message, {
            juwa_code: err.code,
            juwa_msg: err.msg,
            response_body: err.body,
          });
        }

        const juwaUserId = String(data.user_id ?? "");
        if (!juwaUserId) return jsonError(502, "Juwa addUser missing user_id");

        const { error: insertErr } = await supabaseAdmin.from("platform_players" as never).insert({
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
