import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SESSION_COOKIE = "cosmo_admin_session";

function readSessionCookie() {
  const cookie = getRequest()?.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertRequestIpAllowed, loadSecurityPolicy } =
      await import("@/lib/security-policy.server");
    const policy = await loadSecurityPolicy(supabaseAdmin);
    assertRequestIpAllowed(request, policy);

    const authHeader = request?.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const bearerToken = authHeader.replace("Bearer ", "");
      const SUPABASE_URL = process.env.SUPABASE_URL;
      const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
      if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
        throw new Error("Missing Supabase environment variables");
      }

      const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        global: { headers: { Authorization: `Bearer ${bearerToken}` } },
        auth: {
          storage: undefined,
          persistSession: false,
          autoRefreshToken: false,
        },
      });

      const { data, error } = await supabase.auth.getClaims(bearerToken);
      if (error || !data?.claims?.sub) throw new Error("Unauthorized: Invalid token");

      const userId = data.claims.sub;
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase
          .from("staff_profiles")
          .select("id,email,username,full_name,is_active")
          .eq("id", userId)
          .maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);

      const roleNames = (roles ?? []).map((r) => r.role as string);
      if (!profile || profile.is_active === false || roleNames.length === 0) {
        throw new Error("Unauthorized: Staff access required");
      }
      const aal = (data.claims as { aal?: string }).aal;
      if (policy.enforce_2fa_super_admin && roleNames.includes("super_admin") && aal !== "aal2") {
        throw new Error("Unauthorized: 2FA required for super admin");
      }

      return next({
        context: {
          supabase,
          userId,
          staffProfile: profile,
          roles: roleNames,
          claims: data.claims,
          authMode: "supabase",
        },
      });
    }

    const token = readSessionCookie();
    if (!token) throw new Error("Unauthorized: No staff session");

    const { hashSessionToken } = await import("@/lib/staff-auth.server");
    const tokenHash = await hashSessionToken(token);

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("admin_sessions" as never)
      .select("id,staff_id,expires_at")
      .eq("token_hash", tokenHash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (sessionError || !session) throw new Error("Unauthorized: Invalid staff session");

    const staffId = (session as { staff_id: string }).staff_id;
    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabaseAdmin
        .from("staff_profiles" as never)
        .select("id,email,username,full_name,is_active")
        .eq("id", staffId)
        .maybeSingle(),
      supabaseAdmin
        .from("user_roles" as never)
        .select("role")
        .eq("user_id", staffId),
    ]);

    const roleNames = ((roles ?? []) as Array<{ role: string }>).map((r) => r.role);
    if (
      !profile ||
      (profile as { is_active?: boolean }).is_active === false ||
      roleNames.length === 0
    ) {
      throw new Error("Unauthorized: Staff access required");
    }
    if (policy.enforce_2fa_super_admin && roleNames.includes("super_admin")) {
      throw new Error("Unauthorized: Super admin requires Supabase 2FA session");
    }

    return next({
      context: {
        supabase: supabaseAdmin,
        userId: staffId,
        staffProfile: profile,
        roles: roleNames,
        claims: { sub: staffId },
        authMode: "manual_staff",
      },
    });
  },
);
