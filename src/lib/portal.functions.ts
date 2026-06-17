import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AppRole = "super_admin" | "admin" | "finance_agent" | "support_agent";

async function requireRoles(
  ctx: { supabase: any; userId: string },
  roles: AppRole[],
) {
  for (const role of roles) {
    const { data, error } = await ctx.supabase.rpc("has_role", {
      _user_id: ctx.userId,
      _role: role,
    });
    if (error) throw new Error(error.message);
    if (data) return;
  }
  throw new Error(`Forbidden: requires one of ${roles.join(", ")}`);
}

/* ============ BONUSES / PROMOTIONS ============ */

export const listBonuses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("bonuses")
      .select("*, game:games(id,name,provider)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const bonusInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  type: z.enum(["welcome", "referral", "reload", "cashback", "seasonal"]),
  description: z.string().max(1000).optional().nullable(),
  percentage: z.number().min(0).max(1000),
  min_deposit: z.number().min(0),
  max_bonus: z.number().min(0),
  game_id: z.string().uuid().nullable().optional(),
  starts_at: z.string().nullable().optional(),
  expires_at: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
});

export const upsertBonus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => bonusInput.parse(d))
  .handler(async ({ context, data }) => {
    await requireRoles(context, ["super_admin", "admin"]);
    const { supabase, userId } = context;
    const row = data.id
      ? await supabase.from("bonuses").update({ ...data, id: undefined }).eq("id", data.id).select().single()
      : await supabase.from("bonuses").insert({ ...data, id: undefined }).select().single();
    if (row.error) throw new Error(row.error.message);
    await supabase.from("audit_logs").insert({
      staff_id: userId,
      action: data.id ? "bonus.update" : "bonus.create",
      entity_type: "bonus",
      entity_id: row.data.id,
      new_value: row.data,
    });
    return row.data;
  });

export const deleteBonus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireRoles(context, ["super_admin", "admin"]);
    const { error } = await context.supabase.from("bonuses").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await context.supabase.from("audit_logs").insert({
      staff_id: context.userId,
      action: "bonus.delete",
      entity_type: "bonus",
      entity_id: data.id,
    });
    return { ok: true };
  });

/* ============ VIP TIERS ============ */

export const listVipTiers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("vip_tiers")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const vipInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(60),
  icon: z.string().max(20).optional().nullable(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  deposit_required: z.number().min(0),
  monthly_activity_required: z.number().min(0),
  cashback_pct: z.number().min(0).max(100),
  perks: z.array(z.string()).default([]),
  priority_support: z.boolean().default(false),
  sort_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
});

export const upsertVipTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => vipInput.parse(d))
  .handler(async ({ context, data }) => {
    await requireRoles(context, ["super_admin", "admin"]);
    const { supabase, userId } = context;
    const row = data.id
      ? await supabase.from("vip_tiers").update({ ...data, id: undefined }).eq("id", data.id).select().single()
      : await supabase.from("vip_tiers").insert({ ...data, id: undefined }).select().single();
    if (row.error) throw new Error(row.error.message);
    await supabase.from("audit_logs").insert({
      staff_id: userId,
      action: data.id ? "vip.update" : "vip.create",
      entity_type: "vip_tier",
      entity_id: row.data.id,
      new_value: row.data,
    });
    return row.data;
  });

export const deleteVipTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireRoles(context, ["super_admin", "admin"]);
    const { error } = await context.supabase.from("vip_tiers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await context.supabase.from("audit_logs").insert({
      staff_id: context.userId,
      action: "vip.delete",
      entity_type: "vip_tier",
      entity_id: data.id,
    });
    return { ok: true };
  });

/* ============ ANNOUNCEMENTS ============ */

export const listAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("announcements")
      .select("*, game:games(id,name)")
      .order("pinned", { ascending: false })
      .order("starts_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const annInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
  pinned: z.boolean().default(false),
  push_enabled: z.boolean().default(false),
  game_id: z.string().uuid().optional(),
  is_active: z.boolean().default(true),
});

export const upsertAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => annInput.parse(d))
  .handler(async ({ context, data }) => {
    await requireRoles(context, ["super_admin", "admin"]);
    const { supabase, userId } = context;
    const payload = { ...data, id: undefined, created_by: userId };
    const row = data.id
      ? await supabase.from("announcements").update({ ...data, id: undefined }).eq("id", data.id).select().single()
      : await supabase.from("announcements").insert(payload).select().single();
    if (row.error) throw new Error(row.error.message);
    await supabase.from("audit_logs").insert({
      staff_id: userId,
      action: data.id ? "announcement.update" : "announcement.create",
      entity_type: "announcement",
      entity_id: row.data.id,
      new_value: row.data,
    });
    return row.data;
  });

export const deleteAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireRoles(context, ["super_admin", "admin"]);
    const { error } = await context.supabase.from("announcements").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============ SITE THEME ============ */

export const getSiteTheme = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("site_theme").select("*").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const updateSiteTheme = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        mode: z.enum(["light", "dark"]),
        primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
        accent_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
        background_image: z.string().nullable().optional(),
        banner_image: z.string().nullable().optional(),
        logo_url: z.string().nullable().optional(),
        widgets: z.record(z.string(), z.any()).default({}),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireRoles(context, ["super_admin", "admin"]);
    const { error } = await context.supabase
      .from("site_theme")
      .update({ ...data, updated_by: context.userId, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    await context.supabase.from("audit_logs").insert({
      staff_id: context.userId,
      action: "theme.update",
      entity_type: "site_theme",
      entity_id: "1",
      new_value: data,
    });
    return { ok: true };
  });

/* ============ MUSIC ============ */

export const getMusic = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: settings }, { data: tracks }] = await Promise.all([
      context.supabase.from("music_settings").select("*").eq("id", 1).maybeSingle(),
      context.supabase.from("music_tracks").select("*").order("sort_order"),
    ]);
    return { settings, tracks: tracks ?? [] };
  });

export const updateMusicSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        enabled: z.boolean(),
        autoplay: z.boolean(),
        default_volume: z.number().min(0).max(1),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireRoles(context, ["super_admin", "admin"]);
    const { error } = await context.supabase
      .from("music_settings")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addMusicTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ title: z.string().min(1).max(200), url: z.string().url() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireRoles(context, ["super_admin", "admin"]);
    const { error } = await context.supabase.from("music_tracks").insert(data);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMusicTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireRoles(context, ["super_admin", "admin"]);
    const { error } = await context.supabase.from("music_tracks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============ NOTIFICATIONS SETTINGS ============ */

export const getNotificationSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("notification_settings").select("*").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const updateNotificationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        email_enabled: z.boolean(),
        sms_enabled: z.boolean(),
        push_enabled: z.boolean(),
        from_email: z.string().email().nullable().optional().or(z.literal("")),
        from_name: z.string().max(120).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireRoles(context, ["super_admin", "admin"]);
    const { error } = await context.supabase
      .from("notification_settings")
      .update({ ...data, from_email: data.from_email || null, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============ SECURITY SETTINGS ============ */

export const getSecuritySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("security_settings").select("*").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const updateSecuritySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        min_password_length: z.number().int().min(6).max(128),
        require_uppercase: z.boolean(),
        require_number: z.boolean(),
        require_symbol: z.boolean(),
        session_timeout_minutes: z.number().int().min(5).max(1440),
        enforce_2fa_super_admin: z.boolean(),
        ip_whitelist: z.array(z.string()).default([]),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireRoles(context, ["super_admin"]);
    const { error } = await context.supabase
      .from("security_settings")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    await context.supabase.from("audit_logs").insert({
      staff_id: context.userId,
      action: "security.update",
      entity_type: "security_settings",
      entity_id: "1",
      new_value: data,
    });
    return { ok: true };
  });

/* ============ TRANSACTIONS (unified) ============ */

export const listTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        kind: z.enum(["all", "deposit", "cashout"]).default("all"),
        status: z.string().default("all"),
        q: z.string().max(120).default(""),
        days: z.number().int().min(1).max(365).default(30),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const since = new Date(Date.now() - data.days * 86400000).toISOString();
    const select =
      "id,amount,status,requested_at,processed_at,reference,player:players(id,username,full_name,game_id),method:payment_methods(name,kind)";

    const deposits =
      data.kind === "cashout"
        ? { data: [] as any[] }
        : await supabase.from("deposit_requests").select(select).gte("requested_at", since).order("requested_at", { ascending: false }).limit(500);
    const cashouts =
      data.kind === "deposit"
        ? { data: [] as any[] }
        : await supabase
            .from("cashout_requests")
            .select("id,amount,status,requested_at,processed_at,destination,player:players(id,username,full_name,game_id),method:payment_methods(name,kind)")
            .gte("requested_at", since)
            .order("requested_at", { ascending: false })
            .limit(500);

    type Row = {
      id: string;
      kind: "deposit" | "cashout";
      amount: number;
      status: string;
      requested_at: string;
      processed_at: string | null;
      reference: string | null;
      player: { id: string; username: string; full_name: string | null; game_id: string | null } | null;
      method: { name: string; kind: string } | null;
    };
    let rows: Row[] = [
      ...((deposits.data ?? []) as any[]).map((r) => ({ ...r, kind: "deposit" as const })),
      ...((cashouts.data ?? []) as any[]).map((r) => ({ ...r, kind: "cashout" as const, reference: r.destination })),
    ];
    if (data.status !== "all") rows = rows.filter((r) => r.status === data.status);
    const q = data.q.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.player?.username?.toLowerCase().includes(q) ||
          r.player?.full_name?.toLowerCase().includes(q) ||
          r.player?.game_id?.toLowerCase().includes(q) ||
          (r.reference ?? "").toLowerCase().includes(q),
      );
    }
    rows.sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime());
    return rows.slice(0, 1000);
  });

/* ============ SYSTEM STATUS ============ */

export const getSystemStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const t0 = Date.now();
    const { error: dbErr } = await context.supabase.from("games").select("id", { head: true, count: "exact" }).limit(1);
    const dbLatency = Date.now() - t0;

    const t1 = Date.now();
    const { error: storageErr } = await context.supabase.storage.listBuckets();
    const storageLatency = Date.now() - t1;

    const { data: integrations } = await context.supabase
      .from("platform_integrations")
      .select("id,connection_status,last_test_at,game:games(name)");

    return {
      db: { ok: !dbErr, latencyMs: dbLatency, error: dbErr?.message ?? null },
      auth: { ok: true, note: "Managed by Lovable Cloud" },
      storage: { ok: !storageErr, latencyMs: storageLatency, error: storageErr?.message ?? null },
      integrations: integrations ?? [],
      serverTime: new Date().toISOString(),
    };
  });

/* ============ BACKUPS — manual CSV export of any table ============ */

const exportable = ["players", "deposit_requests", "cashout_requests", "wallet_ledger", "audit_logs", "bonuses", "vip_tiers", "announcements"] as const;

export const exportTableCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ table: z.enum(exportable) }).parse(d))
  .handler(async ({ context, data }) => {
    await requireRoles(context, ["super_admin"]);
    const { data: rows, error } = await context.supabase.from(data.table).select("*").limit(50000);
    if (error) throw new Error(error.message);
    const records = (rows ?? []) as Record<string, unknown>[];
    if (records.length === 0) return { csv: "", rows: 0 };
    const headers = Object.keys(records[0]);
    const esc = (v: unknown) => {
      if (v === null || v === undefined) return "";
      const s = typeof v === "object" ? JSON.stringify(v) : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const csv = [headers.join(","), ...records.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
    await context.supabase.from("audit_logs").insert({
      staff_id: context.userId,
      action: "backup.export",
      entity_type: "table",
      entity_id: data.table,
      metadata: { row_count: records.length },
    });
    return { csv, rows: records.length };
  });

/* ============ PLAYER ACTIONS — suspend, reactivate, KYC, reset password ============ */

export const updatePlayerStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["active", "suspended", "blocked", "pending_kyc"]),
        kyc_status: z.enum(["unverified", "pending", "verified", "rejected"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireRoles(context, ["super_admin", "admin", "support_agent"]);
    const { supabase, userId } = context;
    const patch: {
      status: "active" | "suspended" | "blocked" | "pending_kyc";
      suspended_at?: string | null;
      kyc_status?: string;
    } = { status: data.status };
    if (data.status === "suspended") patch.suspended_at = new Date().toISOString();
    if (data.status === "active") patch.suspended_at = null;
    if (data.kyc_status) patch.kyc_status = data.kyc_status;
    const { error } = await supabase.from("players").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabase.from("audit_logs").insert({
      staff_id: userId,
      action: "player.status_change",
      entity_type: "player",
      entity_id: data.id,
      new_value: patch as unknown as Record<string, string | null>,
    });
    return { ok: true };
  });

/* ============ PLATFORM (game) updates ============ */

export const updateGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        is_active: z.boolean().optional(),
        maintenance_mode: z.boolean().optional(),
        logo_url: z.string().nullable().optional(),
        sort_order: z.number().int().optional(),
        display_title: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        thumbnail_url: z.string().nullable().optional(),
        featured: z.boolean().optional(),
        sync_frequency_seconds: z.number().int().min(30).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireRoles(context, ["super_admin", "admin"]);
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("games").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    await context.supabase.from("audit_logs").insert({
      staff_id: context.userId,
      action: "game.update",
      entity_type: "game",
      entity_id: id,
      new_value: patch,
    });
    return { ok: true };
  });

export const listGamesAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("games").select("*").order("sort_order").order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });