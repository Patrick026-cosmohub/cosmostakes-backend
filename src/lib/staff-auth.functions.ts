import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";

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
      .select("id,email,username,full_name,is_active,created_at")
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
