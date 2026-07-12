import crypto from "node:crypto";

type RefujKind = "deposit" | "cashout";

export type RefujTransferInput = {
  kind: RefujKind;
  requestId: string;
  gameName: string;
  gameCode?: string | null;
  gameUser?: string | null;
  gamePass?: string | null;
  apiUsername?: string | null;
  apiPassword?: string | null;
  customerUsername: string;
  amount: number;
  bonusAmount?: number;
  apiBase?: string | null;
};

type RefujTransferResult = {
  transferId: string;
  gameCode: string;
  status: number;
  raw: unknown;
};

export type RefujRegisterInput = {
  registrationId: string;
  gameName: string;
  gameCode?: string | null;
  gameUser?: string | null;
  gamePass?: string | null;
  apiUsername?: string | null;
  apiPassword?: string | null;
  desiredUsername: string;
  nickname: string;
  email: string;
  apiBase?: string | null;
};

type RefujRegisterResult = {
  registrationId: string;
  gameCode: string;
  status: number;
  raw: unknown;
};

export type RefujRegistrationReadResult = {
  status: number;
  raw: unknown;
};

const DEFAULT_REFUJ_API_BASE = "https://www.refuj.io/api";

const GAME_CODE_MAP: Record<string, string> = {
  "fire kirin": "FK",
  firekirin: "FK",
  "vegas sweeps": "VS",
  lasvegassweeps: "VS",
  vegassweeps: "VS",
  "cash ignite": "CI",
  cashignite: "CI",
  egame: "EG",
  "panda master": "PM",
  pandamaster: "PM",
  "blue dragon": "BD",
  bluedragon: "BD",
  "orion stars": "OS",
  orionstars: "OS",
  "ultra panda": "UP",
  ultrapanda: "UP",
  "golden treasure": "GT",
  goldentreasure: "GT",
  "milky way": "MW",
  milkyway: "MW",
  "high stakes": "HS",
  highstakes: "HS",
  "double up": "DU",
  doubleup: "DU",
  "gameroom online": "GO",
  gameroomonline: "GO",
  "cash machine": "CM",
  cashmachine: "CM",
  "mr.allinone": "MR",
  "mr allinone": "MR",
  mrallinone: "MR",
  mafia: "MF",
  riveslot: "RS",
  "mega spin": "MS",
  megaspin: "MS",
  "casino royale": "CR",
  casinoroyale: "CR",
  "cash frenzy": "CF",
  cashfrenzy: "CF",
  acebook: "AB",
  "ace book": "AB",
  acebook777: "AB",
  "vegas roll": "VR",
  vegasroll: "VR",
  joker: "JK",
  joker777: "JK",
  "lucky star": "LS",
  luckystar: "LS",
  moola: "ML",
};

function env(name: string, fallbackName?: string) {
  const value =
    process.env[name]?.trim() || (fallbackName ? process.env[fallbackName]?.trim() : "");
  return value || "";
}

function requireEnv(name: string, fallbackName?: string) {
  const value = env(name, fallbackName);
  if (!value)
    throw new Error(`${name}${fallbackName ? ` or ${fallbackName}` : ""} is required for REFUJ.`);
  return value;
}

function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ");
}

function compact(value: string) {
  return normalize(value).replace(/\s+/g, "");
}

export function isSpecialGameProvider(gameName?: string | null, provider?: string | null) {
  const haystack = `${normalize(gameName ?? "")} ${normalize(provider ?? "")}`;
  return /juwa|juwa\s*2|game\s*vault|gamevault|vblink|v\s*blink/.test(haystack);
}

function resolveGameCode(gameName: string, configured?: string | null) {
  const candidates = [configured, gameName].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const direct = GAME_CODE_MAP[normalize(candidate)] ?? GAME_CODE_MAP[compact(candidate)];
    if (direct) return direct;
  }

  const explicit = configured?.trim();
  if (explicit && /^[A-Za-z0-9_.-]{1,8}$/.test(explicit)) return explicit.toUpperCase();

  throw new Error(
    `No REFUJ game acronym is configured for ${gameName}. Set the game provider to the REFUJ code.`,
  );
}

function refujApiCredentialFields(
  gameCode: string,
  gameUser: string,
  gamePass: string,
  passphrase: string,
  apiUsername?: string | null,
  apiPassword?: string | null,
) {
  const explicitApiUsername = apiUsername?.trim();
  const explicitApiPassword = apiPassword?.trim();
  const usesSeparateGameApi = gameCode === "VS";
  const derivedApiUsername =
    usesSeparateGameApi && gameUser.toLowerCase().startsWith("account-")
      ? gameUser.slice("account-".length)
      : gameUser;
  const resolvedApiUsername = explicitApiUsername || (usesSeparateGameApi ? derivedApiUsername : "");
  const resolvedApiPassword = explicitApiPassword || (usesSeparateGameApi ? gamePass : "");

  if (!resolvedApiUsername || !resolvedApiPassword) return {};
  return {
    api_username: encryptForRefuj(resolvedApiUsername, passphrase),
    api_password: encryptForRefuj(resolvedApiPassword, passphrase),
  };
}

function apiBase(configured?: string | null) {
  const raw = configured?.trim() || env("REFUJ_API_BASE_URL") || DEFAULT_REFUJ_API_BASE;
  const clean = raw.replace(/\/+$/, "");
  return clean.endsWith("/api") ? clean : `${clean}/api`;
}

function masterConfig() {
  const secretKey = requireEnv("REFUJ_SECRET_KEY", "REFUJ_API_KEY");
  const passphrase = requireEnv("REFUJ_ENCRYPTION_PASSPHRASE");
  const gatewayKey = env("REFUJ_GATEWAY_KEY");
  if (!/^[a-f0-9]{64}$/i.test(passphrase)) {
    throw new Error("REFUJ_ENCRYPTION_PASSPHRASE must be a 64-character hex string.");
  }
  return { secretKey, passphrase, gatewayKey };
}

export function encryptForRefuj(
  value: string,
  passphrase = requireEnv("REFUJ_ENCRYPTION_PASSPHRASE"),
) {
  if (!/^[a-f0-9]{64}$/i.test(passphrase)) {
    throw new Error("REFUJ_ENCRYPTION_PASSPHRASE must be a 64-character hex string.");
  }

  const key = Buffer.from(passphrase, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(value)).toString("base64");
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.from(
    JSON.stringify({
      iv: iv.toString("base64"),
      data: encrypted.toString("base64"),
      tag: tag.toString("base64"),
    }),
  ).toString("base64");
}

export function decryptFromRefuj(
  value: string,
  passphrase = requireEnv("REFUJ_ENCRYPTION_PASSPHRASE"),
) {
  try {
    if (!/^[a-f0-9]{64}$/i.test(passphrase)) return "";
    const key = Buffer.from(passphrase, "hex");
    const outer = JSON.parse(Buffer.from(value, "base64").toString("utf8"));
    const iv = Buffer.from(outer.iv, "base64");
    const tag = Buffer.from(outer.tag, "base64");
    const encrypted = Buffer.from(outer.data, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const base64Plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
      "utf8",
    );
    const jsonText = Buffer.from(base64Plaintext, "base64").toString("utf8");
    const parsed = JSON.parse(jsonText);
    return typeof parsed === "string" ? parsed : String(parsed ?? "");
  } catch {
    return "";
  }
}

function headers(gatewayKey: string) {
  const h: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
  };
  if (gatewayKey) h["X-Refuj-Gateway-Key"] = gatewayKey;
  return h;
}

async function readResponse(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

function accepted(responseStatus: number, body: any) {
  const code = Number(body?.code ?? body?.Code ?? body?.status_code ?? body?.Status_code);
  const status = String(body?.status ?? body?.Status ?? "").toLowerCase();
  const message = String(body?.message ?? body?.Message ?? body?.msg ?? "").toLowerCase();
  const failed =
    code >= 400 ||
    status === "failed" ||
    status === "fail" ||
    status === "error" ||
    status === "false" ||
    body?.success === false ||
    /\b(fail|failed|invalid|incorrect|denied|unauthorized|forbidden|wrong)\b/.test(message);
  if (failed) return false;
  return (
    code === 200 ||
    code === 201 ||
    status === "success" ||
    status === "true" ||
    status === "200" ||
    status === "201" ||
    body?.success === true ||
    message.includes("success") ||
    message.includes("submitted") ||
    message.includes("sent") ||
    (responseStatus >= 200 && responseStatus < 300 && !message.includes("error"))
  );
}

function errorMessage(responseStatus: number, body: any) {
  if (body && typeof body === "object") {
    return String(
      body.message ??
        body.Message ??
        body.error ??
        body.Error ??
        `REFUJ request failed with HTTP ${responseStatus}`,
    );
  }
  return `REFUJ request failed with HTTP ${responseStatus}: ${String(body).slice(0, 180)}`;
}

async function postRefuj(
  path: string,
  payload: Record<string, unknown>,
  configuredBase?: string | null,
) {
  const { gatewayKey } = masterConfig();
  const response = await fetch(`${apiBase(configuredBase)}${path}`, {
    method: "POST",
    headers: headers(gatewayKey),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await readResponse(response);
  if (!accepted(response.status, body)) throw new Error(errorMessage(response.status, body));
  return { status: response.status, body };
}

export async function readRefujGameList(configuredBase?: string | null) {
  const { secretKey, gatewayKey } = masterConfig();
  const url = new URL(`${apiBase(configuredBase)}/credits/read_game_list`);
  url.searchParams.set("secret_key", secretKey);
  const response = await fetch(url, {
    method: "GET",
    headers: headers(gatewayKey),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await readResponse(response);
  if (!accepted(response.status, body)) throw new Error(errorMessage(response.status, body));
  return body;
}

export async function callRefujTransfer(input: RefujTransferInput): Promise<RefujTransferResult> {
  if (input.kind !== "deposit") {
    throw new Error(
      "REFUJ is only used for game loads. Redeems are handled manually and credited on admin approval.",
    );
  }

  const { secretKey, passphrase } = masterConfig();
  const gameUser = input.gameUser?.trim() || env("REFUJ_DEFAULT_GAME_USER");
  const gamePass = input.gamePass?.trim() || env("REFUJ_DEFAULT_GAME_PASS");
  if (!gameUser || !gamePass) {
    throw new Error(`REFUJ game username/password is missing for ${input.gameName}.`);
  }

  const gameCode = resolveGameCode(input.gameName, input.gameCode);
  const amount = Math.round(Number(input.amount));
  const bonus = Math.max(0, Math.round(Number(input.bonusAmount ?? 0)));
  const transferId = `COSMO-LOAD-${input.requestId}`;
  const common = {
    secret_key: secretKey,
    gaming_site: gameCode,
    amount,
    game_user: encryptForRefuj(gameUser, passphrase),
    game_pass: encryptForRefuj(gamePass, passphrase),
    ...refujApiCredentialFields(
      gameCode,
      gameUser,
      gamePass,
      passphrase,
      input.apiUsername,
      input.apiPassword,
    ),
    customer_username: input.customerUsername,
  };

  const payload = { ...common, deposit_id: transferId, bonus };
  const { status, body } = await postRefuj("/credits/add_credit", payload, input.apiBase);
  return { transferId, gameCode, status, raw: body };
}

export async function callRefujRegister(input: RefujRegisterInput): Promise<RefujRegisterResult> {
  const { secretKey, passphrase } = masterConfig();
  const gameUser = input.gameUser?.trim() || env("REFUJ_DEFAULT_GAME_USER");
  const gamePass = input.gamePass?.trim() || env("REFUJ_DEFAULT_GAME_PASS");
  if (!gameUser || !gamePass) {
    throw new Error(`REFUJ agent ID/password is missing for ${input.gameName}.`);
  }

  const gameCode = resolveGameCode(input.gameName, input.gameCode);
  const encryptRegistrationFields = gameCode === "VS";
  const registrationValue = (value: string) =>
    encryptRegistrationFields ? encryptForRefuj(value, passphrase) : value;
  const payload = {
    secret_key: secretKey,
    registration_id: input.registrationId,
    gaming_site: gameCode,
    email: registrationValue(input.email),
    nickname: registrationValue(input.nickname),
    desire_username: registrationValue(input.desiredUsername),
    game_user: registrationValue(gameUser),
    game_pass: registrationValue(gamePass),
    ...refujApiCredentialFields(
      gameCode,
      gameUser,
      gamePass,
      passphrase,
      input.apiUsername,
      input.apiPassword,
    ),
  };

  const { status, body } = await postRefuj("/credits/add_game_user", payload, input.apiBase);
  return { registrationId: input.registrationId, gameCode, status, raw: body };
}

export async function readRefujRegistrationRequests(
  opts: { registrationId?: string; gameCode?: string; apiBase?: string | null } = {},
): Promise<RefujRegistrationReadResult> {
  const { secretKey, gatewayKey } = masterConfig();
  const url = new URL(`${apiBase(opts.apiBase)}/credits/read_game_user_requests`);
  url.searchParams.set("secret_key", secretKey);
  if (opts.registrationId) url.searchParams.set("registration_id", opts.registrationId);
  if (opts.gameCode) url.searchParams.set("gaming_site", opts.gameCode);
  const response = await fetch(url, {
    method: "GET",
    headers: headers(gatewayKey),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await readResponse(response);
  if (!accepted(response.status, body)) throw new Error(errorMessage(response.status, body));
  return { status: response.status, raw: body };
}
