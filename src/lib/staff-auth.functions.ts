import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";

const SESSION_COOKIE = "cosmo_admin_session";

function cookieOptions(maxAgeSeconds: number) {
  return [
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    maxAgeSeconds > 0 ? `Max-Age=${maxAgeSeconds}` : "Max-Age=0",
    "Secure",
  ];
}

function setSessionCookie(token: string, expiresAt: Date) {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  setResponseHeader(
    "Set-Cookie",
    [`${SESSION_COOKIE}=${encodeURIComponent(token)}`, ...cookieOptions(maxAge)].join("; "),
  );
}

function clearSessionCookie() {
  setResponseHeader("Set-Cookie", [`${SESSION_COOKIE}=`, ...cookieOptions(0)].join("; "));
}

function readSessionCookie() {
  const cookie = getRequest()?.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function loadStaffSession(token: string | null) {
  if (!token) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { hashSessionToken } = await import("./staff-auth.server");
  const { isPasswordExpired, loadSecurityPolicy } = await import("./security-policy.server");
  const policy = await loadSecurityPolicy(supabaseAdmin);
  const tokenHash = await hashSessionToken(token);
  const { data: session, error: sessionError } = await supabaseAdmin
    .from("admin_sessions" as never)
    .select("id,staff_id,expires_at")
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (sessionError || !session) return null;

  const row = session as { id: string; staff_id: string; expires_at: string };
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabaseAdmin
      .from("staff_profiles" as never)
      .select("id,email,username,full_name,is_active,created_at,password_updated_at,locked_until")
      .eq("id", row.staff_id)
      .maybeSingle(),
    supabaseAdmin
      .from("user_roles" as never)
      .select("role")
      .eq("user_id", row.staff_id),
  ]);
  const roleNames = ((roles ?? []) as Array<{ role: string }>).map((r) => r.role);
  if (
    !profile ||
    (profile as { is_active?: boolean }).is_active === false ||
    roleNames.length === 0
  ) {
    return null;
  }
  const profileRow = profile as {
    password_updated_at?: string | null;
    locked_until?: string | null;
  };
  if (profileRow.locked_until && new Date(profileRow.locked_until).getTime() > Date.now()) {
    return null;
  }
  if (isPasswordExpired(profileRow.password_updated_at, policy)) return null;

  return {
    userId: row.staff_id,
    profile,
    roles: roleNames,
    expiresAt: row.expires_at,
  };
}

export const getStaffSession = createServerFn({ method: "GET" }).handler(async () => {
  return loadStaffSession(readSessionCookie());
});

export const signInStaff = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        username: z.string().trim().min(2).max(120),
        password: z.string().min(1).max(128),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createSessionToken, hashSessionToken, sessionExpiresAt, verifyStaffPassword } =
      await import("./staff-auth.server");
    const { assertRequestIpAllowed, getRequestIp, isPasswordExpired, loadSecurityPolicy } =
      await import("./security-policy.server");
    const request = getRequest();
    const policy = await loadSecurityPolicy(supabaseAdmin);
    assertRequestIpAllowed(request, policy);

    const login = data.username.trim();
    let profile: unknown = null;
    const byUsername = await supabaseAdmin
      .from("staff_profiles" as never)
      .select(
        "id,email,username,full_name,is_active,password_hash,password_updated_at,failed_login_attempts,locked_until",
      )
      .ilike("username", login)
      .maybeSingle();
    profile = byUsername.data;

    if (!profile && login.includes("@")) {
      const byEmail = await supabaseAdmin
        .from("staff_profiles" as never)
        .select(
          "id,email,username,full_name,is_active,password_hash,password_updated_at,failed_login_attempts,locked_until",
        )
        .ilike("email", login)
        .maybeSingle();
      profile = byEmail.data;
    }

    const staff = profile as {
      id: string;
      email: string;
      username: string | null;
      full_name: string | null;
      is_active: boolean;
      password_hash: string | null;
      password_updated_at: string | null;
      failed_login_attempts: number | null;
      locked_until: string | null;
    } | null;

    if (!staff || staff.is_active === false) throw new Error("Invalid username or password");
    if (staff.locked_until && new Date(staff.locked_until).getTime() > Date.now()) {
      throw new Error("Staff account is temporarily locked. Try again later.");
    }

    const ok = await verifyStaffPassword(data.password, staff.password_hash);
    if (!ok) {
      const attempts = (staff.failed_login_attempts ?? 0) + 1;
      const lockedUntil =
        attempts >= policy.max_login_attempts
          ? new Date(Date.now() + policy.lockout_minutes * 60 * 1000).toISOString()
          : null;
      await supabaseAdmin
        .from("staff_profiles" as never)
        .update({
          failed_login_attempts: attempts,
          locked_until: lockedUntil,
        } as never)
        .eq("id", staff.id);
      throw new Error("Invalid username or password");
    }

    if (isPasswordExpired(staff.password_updated_at, policy)) {
      throw new Error("Staff password has expired. Ask a super admin to reset it.");
    }

    const { data: roles } = await supabaseAdmin
      .from("user_roles" as never)
      .select("role")
      .eq("user_id", staff.id);
    const roleNames = ((roles ?? []) as Array<{ role: string }>).map((r) => r.role);
    if (roleNames.length === 0) throw new Error("Invalid username or password");

    const token = await createSessionToken();
    const tokenHash = await hashSessionToken(token);
    const expiresAt = sessionExpiresAt(policy.session_timeout_minutes);
    const { error: insertError } = await supabaseAdmin.from("admin_sessions" as never).insert({
      staff_id: staff.id,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
      user_agent: request?.headers.get("user-agent") ?? null,
      ip_address: getRequestIp(request),
    } as never);
    if (insertError) throw new Error(insertError.message);

    await supabaseAdmin
      .from("staff_profiles" as never)
      .update({
        failed_login_attempts: 0,
        locked_until: null,
        last_login_at: new Date().toISOString(),
      } as never)
      .eq("id", staff.id);

    setSessionCookie(token, expiresAt);

    return {
      userId: staff.id,
      profile: {
        id: staff.id,
        email: staff.email,
        username: staff.username,
        full_name: staff.full_name,
        is_active: staff.is_active,
      },
      roles: roleNames,
    };
  });

export const signOutStaff = createServerFn({ method: "POST" }).handler(async () => {
  const token = readSessionCookie();
  if (token) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hashSessionToken } = await import("./staff-auth.server");
    await supabaseAdmin
      .from("admin_sessions" as never)
      .delete()
      .eq("token_hash", await hashSessionToken(token));
  }
  clearSessionCookie();
  return { ok: true };
});
