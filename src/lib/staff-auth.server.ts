const PASSWORD_SCHEME = "scrypt-sha256";

export function sessionExpiresAt(minutes = 12 * 60) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

export async function hashStaffPassword(password: string) {
  const { randomBytes, scryptSync } = await import("node:crypto");
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 64).toString("base64url");
  return `${PASSWORD_SCHEME}:${salt}:${hash}`;
}

export async function verifyStaffPassword(password: string, stored: string | null | undefined) {
  if (!stored) return false;
  const { scryptSync, timingSafeEqual } = await import("node:crypto");
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== PASSWORD_SCHEME || !salt || !hash) return false;

  const expected = Buffer.from(hash, "base64url");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function createSessionToken() {
  const { randomBytes } = await import("node:crypto");
  return randomBytes(32).toString("base64url");
}

export async function hashSessionToken(token: string) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(token).digest("base64url");
}
