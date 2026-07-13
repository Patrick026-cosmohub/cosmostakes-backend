type SecurityPolicy = {
  min_password_length: number;
  require_uppercase: boolean;
  require_number: boolean;
  require_symbol: boolean;
  session_timeout_minutes: number;
  enforce_2fa_super_admin: boolean;
  ip_whitelist: string[];
  max_login_attempts: number;
  lockout_minutes: number;
  password_rotation_days: number;
};

export const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  min_password_length: 12,
  require_uppercase: true,
  require_number: true,
  require_symbol: true,
  session_timeout_minutes: 60,
  enforce_2fa_super_admin: false,
  ip_whitelist: [],
  max_login_attempts: 5,
  lockout_minutes: 15,
  password_rotation_days: 0,
};

function normalizeWhitelist(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

export async function loadSecurityPolicy(supabase: any): Promise<SecurityPolicy> {
  const { data, error } = await supabase
    .from("security_settings" as never)
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return {
    ...DEFAULT_SECURITY_POLICY,
    ...(data ?? {}),
    ip_whitelist: normalizeWhitelist((data as { ip_whitelist?: unknown } | null)?.ip_whitelist),
  };
}

export function validatePasswordAgainstPolicy(password: string, policy: SecurityPolicy) {
  const missing: string[] = [];
  if (password.length < policy.min_password_length) {
    missing.push(`at least ${policy.min_password_length} characters`);
  }
  if (policy.require_uppercase && !/[A-Z]/.test(password)) missing.push("an uppercase letter");
  if (policy.require_number && !/[0-9]/.test(password)) missing.push("a number");
  if (policy.require_symbol && !/[^A-Za-z0-9]/.test(password)) missing.push("a symbol");

  if (missing.length > 0) {
    throw new Error(`Password must include ${missing.join(", ")}`);
  }
}

function stripPort(ip: string) {
  const value = ip.trim();
  if (value.startsWith("[") && value.includes("]")) return value.slice(1, value.indexOf("]"));
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(value)) return value.slice(0, value.lastIndexOf(":"));
  return value;
}

export function getRequestIp(request: Request | undefined) {
  const headers = request?.headers;
  if (!headers) return null;

  const forwarded = headers.get("x-forwarded-for")?.split(",")[0];
  const candidate =
    headers.get("cf-connecting-ip") ??
    headers.get("x-real-ip") ??
    forwarded ??
    headers.get("x-client-ip");

  return candidate ? stripPort(candidate) : null;
}

function ipv4ToNumber(ip: string) {
  const parts = ip.split(".").map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return null;
  }
  return parts.reduce((acc, part) => (acc << 8) + part, 0) >>> 0;
}

function matchesCidr(ip: string, cidr: string) {
  const [base, bitsText] = cidr.split("/");
  const bits = Number(bitsText);
  const ipNumber = ipv4ToNumber(ip);
  const baseNumber = ipv4ToNumber(base);
  if (
    ipNumber === null ||
    baseNumber === null ||
    !Number.isInteger(bits) ||
    bits < 0 ||
    bits > 32
  ) {
    return false;
  }
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipNumber & mask) === (baseNumber & mask);
}

export function isIpAllowed(ip: string | null, whitelist: string[]) {
  if (whitelist.length === 0) return true;
  if (!ip) return false;
  const normalizedIp = ip.toLowerCase();
  return whitelist.some((entry) => {
    const normalizedEntry = entry.toLowerCase();
    if (normalizedEntry === normalizedIp) return true;
    if (normalizedEntry.includes("/")) return matchesCidr(normalizedIp, normalizedEntry);
    return false;
  });
}

export function assertRequestIpAllowed(request: Request | undefined, policy: SecurityPolicy) {
  const ip = getRequestIp(request);
  if (!isIpAllowed(ip, policy.ip_whitelist)) {
    throw new Error("Unauthorized: IP address is not allowed for admin access");
  }
}

export function isPasswordExpired(updatedAt: string | null | undefined, policy: SecurityPolicy) {
  if (!policy.password_rotation_days) return false;
  if (!updatedAt) return true;
  const maxAgeMs = policy.password_rotation_days * 24 * 60 * 60 * 1000;
  return Date.now() - new Date(updatedAt).getTime() > maxAgeMs;
}
