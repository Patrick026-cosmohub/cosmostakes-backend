import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Returns roles + profile for the current signed-in staff member. */
export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("staff_profiles").select("id,email,full_name,is_active").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    return {
      userId,
      profile: profile ?? null,
      roles: (roles ?? []).map((r) => r.role as string),
    };
  });

/** Dashboard KPIs + recent activity. */
export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const sinceToday = new Date();
    sinceToday.setHours(0, 0, 0, 0);

    const [pendingDeposits, pendingCashouts, players, todayLedger, recentActivity, recentDeposits, recentCashouts] =
      await Promise.all([
        supabase.from("deposit_requests").select("id,amount", { count: "exact" }).eq("status", "pending"),
        supabase.from("cashout_requests").select("id,amount", { count: "exact" }).eq("status", "pending"),
        supabase.from("players").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("wallet_ledger").select("amount,type").gte("created_at", sinceToday.toISOString()),
        supabase
          .from("audit_logs")
          .select("id,action,entity_type,entity_id,created_at,staff_id,metadata")
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("deposit_requests")
          .select("id,amount,status,requested_at,player:players(username,full_name)")
          .eq("status", "pending")
          .order("requested_at", { ascending: false })
          .limit(5),
        supabase
          .from("cashout_requests")
          .select("id,amount,status,requested_at,player:players(username,full_name)")
          .eq("status", "pending")
          .order("requested_at", { ascending: false })
          .limit(5),
      ]);

    const pendingDepositTotal = (pendingDeposits.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
    const pendingCashoutTotal = (pendingCashouts.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
    const todayVolume = (todayLedger.data ?? []).reduce((s, r) => s + Math.abs(Number(r.amount)), 0);

    // hydrate staff names for activity
    const staffIds = Array.from(new Set((recentActivity.data ?? []).map((a) => a.staff_id).filter(Boolean) as string[]));
    const { data: staff } = staffIds.length
      ? await supabase.from("staff_profiles").select("id,full_name,email").in("id", staffIds)
      : { data: [] as { id: string; full_name: string | null; email: string }[] };
    const staffById = new Map((staff ?? []).map((s) => [s.id, s]));

    return {
      kpis: {
        pendingDepositCount: pendingDeposits.count ?? 0,
        pendingDepositTotal,
        pendingCashoutCount: pendingCashouts.count ?? 0,
        pendingCashoutTotal,
        activePlayers: players.count ?? 0,
        todayVolume,
      },
      pendingDeposits: recentDeposits.data ?? [],
      pendingCashouts: recentCashouts.data ?? [],
      activity: (recentActivity.data ?? []).map((a) => ({
        ...a,
        staff: a.staff_id ? staffById.get(a.staff_id) ?? null : null,
      })),
    };
  });

/** Search players by username, name, phone, email, or game_id. */
export const searchPlayers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().max(120).default("") }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    let query = supabase
      .from("players")
      .select("id,username,full_name,email,phone,game_id,status,balance,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    const q = data.q.trim();
    if (q) {
      const like = `%${q}%`;
      query = query.or(
        `username.ilike.${like},full_name.ilike.${like},email.ilike.${like},phone.ilike.${like},game_id.ilike.${like}`,
      );
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getPlayer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const [{ data: player }, { data: ledger }] = await Promise.all([
      supabase.from("players").select("*").eq("id", data.id).maybeSingle(),
      supabase
        .from("wallet_ledger")
        .select("id,type,amount,balance_after,reason,created_at,staff_id")
        .eq("player_id", data.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    return { player, ledger: ledger ?? [] };
  });

/**
 * Players segmented into "new_signup" (no approved deposit yet) and
 * "returning" (≥1 deposit ledger row). Shared search by username, name,
 * phone, email, or game_id.
 */
export const listPlayersSegmented = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().max(120).default("") }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    let query = supabase
      .from("players")
      .select("id,username,full_name,email,phone,game_id,status,balance,created_at,game:games(id,name,provider)")
      .order("created_at", { ascending: false })
      .limit(500);
    const q = data.q.trim();
    if (q) {
      const like = `%${q}%`;
      query = query.or(
        `username.ilike.${like},full_name.ilike.${like},email.ilike.${like},phone.ilike.${like},game_id.ilike.${like}`,
      );
    }
    const { data: players, error } = await query;
    if (error) throw new Error(error.message);
    const ids = (players ?? []).map((p) => p.id);
    const depositorIds = new Set<string>();
    if (ids.length) {
      const { data: depositRows } = await supabase
        .from("wallet_ledger")
        .select("player_id")
        .eq("type", "deposit")
        .in("player_id", ids);
      (depositRows ?? []).forEach((r) => depositorIds.add(r.player_id));
    }
    const newSignups: typeof players = [];
    const returning: typeof players = [];
    (players ?? []).forEach((p) => {
      (depositorIds.has(p.id) ? returning : newSignups).push(p);
    });
    return { newSignups, returning };
  });

/**
 * Per-payment-method stats: deposit & cashout counts/totals, split by status.
 * One row per active payment method, plus an "Unassigned" bucket for requests
 * without a method.
 */
export const listPaymentMethodStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [{ data: methods }, { data: deposits }, { data: cashouts }] = await Promise.all([
      supabase.from("payment_methods").select("id,name,kind,is_active").order("name"),
      supabase.from("deposit_requests").select("amount,status,payment_method_id"),
      supabase.from("cashout_requests").select("amount,status,payment_method_id"),
    ]);

    type Bucket = {
      count: number;
      total: number;
      pending: number;
      pendingTotal: number;
      approved: number;
      approvedTotal: number;
      rejected: number;
    };
    const empty = (): Bucket => ({
      count: 0,
      total: 0,
      pending: 0,
      pendingTotal: 0,
      approved: 0,
      approvedTotal: 0,
      rejected: 0,
    });
    const bump = (b: Bucket, amount: number, status: string) => {
      b.count += 1;
      b.total += amount;
      if (status === "pending") {
        b.pending += 1;
        b.pendingTotal += amount;
      } else if (status === "approved") {
        b.approved += 1;
        b.approvedTotal += amount;
      } else if (status === "rejected" || status === "failed") {
        b.rejected += 1;
      }
    };

    const depMap = new Map<string, Bucket>();
    const outMap = new Map<string, Bucket>();
    const key = (id: string | null) => id ?? "__unassigned__";

    (deposits ?? []).forEach((r) => {
      const k = key(r.payment_method_id);
      if (!depMap.has(k)) depMap.set(k, empty());
      bump(depMap.get(k)!, Number(r.amount), r.status as string);
    });
    (cashouts ?? []).forEach((r) => {
      const k = key(r.payment_method_id);
      if (!outMap.has(k)) outMap.set(k, empty());
      bump(outMap.get(k)!, Number(r.amount), r.status as string);
    });

    const rows = (methods ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      kind: m.kind,
      is_active: m.is_active,
      deposits: depMap.get(m.id) ?? empty(),
      cashouts: outMap.get(m.id) ?? empty(),
    }));

    const unassignedDep = depMap.get("__unassigned__");
    const unassignedOut = outMap.get("__unassigned__");
    if (unassignedDep || unassignedOut) {
      rows.push({
        id: "__unassigned__",
        name: "Unassigned",
        kind: "other",
        is_active: true,
        deposits: unassignedDep ?? empty(),
        cashouts: unassignedOut ?? empty(),
      });
    }
    return rows;
  });

export const createPlayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        username: z.string().min(2).max(64).regex(/^[a-zA-Z0-9_.-]+$/),
        full_name: z.string().max(120).optional().nullable(),
        email: z.string().email().optional().nullable().or(z.literal("")),
        phone: z.string().max(40).optional().nullable(),
        game_id: z.string().max(64).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("players")
      .insert({
        username: data.username,
        full_name: data.full_name || null,
        email: data.email || null,
        phone: data.phone || null,
        game_id: data.game_id || null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await supabase.from("audit_logs").insert({
      staff_id: userId,
      action: "player.create",
      entity_type: "player",
      entity_id: row.id,
      metadata: { username: row.username },
    });
    return row;
  });

/** List deposit or cashout requests with optional status filter. */
export const listRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        kind: z.enum(["deposit", "cashout"]),
        status: z.enum(["all", "pending", "approved", "rejected", "failed", "uncertain"]).default("pending"),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const table = data.kind === "deposit" ? "deposit_requests" : "cashout_requests";
    const selectCols =
      data.kind === "deposit"
        ? "id,amount,status,reference,notes,requested_at,processed_at,processed_by,player:players(id,username,full_name,game_id),method:payment_methods(name,kind)"
        : "id,amount,status,destination,notes,requested_at,processed_at,processed_by,player:players(id,username,full_name,game_id),method:payment_methods(name,kind)";
    let q = supabase
      .from(table)
      .select(selectCols)
      .order("requested_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Approve / reject a deposit or cashout. Writes audit log + ledger. */
export const decideRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        kind: z.enum(["deposit", "cashout"]),
        id: z.string().uuid(),
        decision: z.enum(["approved", "rejected", "failed", "uncertain"]),
        note: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const table = data.kind === "deposit" ? "deposit_requests" : "cashout_requests";

    const { data: req, error: fetchErr } = await supabase.from(table).select("*").eq("id", data.id).maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!req) throw new Error("Request not found");
    if (req.status !== "pending") throw new Error(`Request is already ${req.status}`);

    const { error: updErr } = await supabase
      .from(table)
      .update({
        status: data.decision,
        processed_at: new Date().toISOString(),
        processed_by: userId,
        notes: data.note ?? req.notes,
      })
      .eq("id", data.id);
    if (updErr) throw new Error(updErr.message);

    // On approval, mutate player balance + write ledger
    if (data.decision === "approved") {
      const { data: player } = await supabase.from("players").select("balance").eq("id", req.player_id).single();
      const current = Number(player?.balance ?? 0);
      const delta = data.kind === "deposit" ? Number(req.amount) : -Number(req.amount);
      const next = current + delta;
      if (data.kind === "cashout" && next < 0) {
        // rollback status
        await supabase.from(table).update({ status: "pending", processed_at: null, processed_by: null }).eq("id", data.id);
        throw new Error("Insufficient player balance for cashout.");
      }
      await supabase.from("players").update({ balance: next }).eq("id", req.player_id);
      await supabase.from("wallet_ledger").insert({
        player_id: req.player_id,
        type: data.kind === "deposit" ? "deposit" : "cashout",
        amount: delta,
        balance_after: next,
        staff_id: userId,
        related_deposit: data.kind === "deposit" ? req.id : null,
        related_cashout: data.kind === "cashout" ? req.id : null,
        reason: data.note ?? `${data.kind} approval`,
      });
    }

    await supabase.from("audit_logs").insert({
      staff_id: userId,
      action: `${data.kind}.${data.decision}`,
      entity_type: data.kind,
      entity_id: data.id,
      metadata: { amount: req.amount, player_id: req.player_id, note: data.note ?? null },
    });
    return { ok: true };
  });

/** Manual wallet credit/debit. Finance-only. */
export const adjustWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        player_id: z.string().uuid(),
        kind: z.enum(["credit", "debit"]),
        amount: z.number().positive().max(1_000_000),
        reason: z.string().min(3).max(500),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    // Finance check
    const { data: canFinance } = await supabase.rpc("can_handle_finance", { _user_id: userId });
    if (!canFinance) throw new Error("Forbidden: finance role required");

    const { data: player, error: pErr } = await supabase.from("players").select("balance,username").eq("id", data.player_id).maybeSingle();
    if (pErr || !player) throw new Error("Player not found");
    const delta = data.kind === "credit" ? data.amount : -data.amount;
    const next = Number(player.balance) + delta;
    if (next < 0) throw new Error("Adjustment would result in negative balance");

    await supabase.from("players").update({ balance: next }).eq("id", data.player_id);
    await supabase.from("wallet_ledger").insert({
      player_id: data.player_id,
      type: data.kind === "credit" ? "manual_credit" : "manual_debit",
      amount: delta,
      balance_after: next,
      staff_id: userId,
      reason: data.reason,
    });
    await supabase.from("audit_logs").insert({
      staff_id: userId,
      action: `wallet.${data.kind}`,
      entity_type: "player",
      entity_id: data.player_id,
      metadata: { amount: data.amount, reason: data.reason, username: player.username },
    });
    return { ok: true, balance: next };
  });

/** Audit log feed with filters. */
export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        action: z.string().max(80).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    let q = supabase
      .from("audit_logs")
      .select("id,action,entity_type,entity_id,metadata,created_at,staff_id")
      .order("created_at", { ascending: false })
      .limit(300);
    if (data.action) q = q.ilike("action", `%${data.action}%`);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const staffIds = Array.from(new Set((rows ?? []).map((r) => r.staff_id).filter(Boolean) as string[]));
    const { data: staff } = staffIds.length
      ? await supabase.from("staff_profiles").select("id,full_name,email").in("id", staffIds)
      : { data: [] as { id: string; full_name: string | null; email: string }[] };
    const map = new Map((staff ?? []).map((s) => [s.id, s]));
    return (rows ?? []).map((r) => ({ ...r, staff: r.staff_id ? map.get(r.staff_id) ?? null : null }));
  });

/** Staff list — super admin only mutates. */
export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase
        .from("staff_profiles")
        .select("id,email,username,full_name,is_active,created_at")
        .order("created_at"),
      supabase.from("user_roles").select("user_id,role"),
    ]);
    const byUser = new Map<string, string[]>();
    (roles ?? []).forEach((r) => {
      const list = byUser.get(r.user_id) ?? [];
      list.push(r.role as string);
      byUser.set(r.user_id, list);
    });
    return (profiles ?? []).map((p) => ({ ...p, roles: byUser.get(p.id) ?? [] }));
  });

export const setStaffRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        user_id: z.string().uuid(),
        roles: z.array(z.enum(["super_admin", "admin", "finance_agent", "support_agent"])).max(4),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: isSuper } = await supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" });
    if (!isSuper) throw new Error("Forbidden: super admin only");
    if (data.user_id === userId && !data.roles.includes("super_admin")) {
      throw new Error("Cannot remove your own super_admin role");
    }
    // Replace role set
    await supabase.from("user_roles").delete().eq("user_id", data.user_id);
    if (data.roles.length) {
      await supabase.from("user_roles").insert(data.roles.map((role) => ({ user_id: data.user_id, role })));
    }
    await supabase.from("audit_logs").insert({
      staff_id: userId,
      action: "staff.roles_updated",
      entity_type: "staff",
      entity_id: data.user_id,
      metadata: { roles: data.roles },
    });
    return { ok: true };
  });

/** Super-admin: create a new staff account with chosen roles. */
export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        username: z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9_.-]+$/, "Username may use letters, numbers, _ . -"),
        email: z.string().email(),
        password: z.string().min(8).max(128),
        full_name: z.string().min(1).max(120),
        roles: z
          .array(z.enum(["super_admin", "admin", "finance_agent", "support_agent"]))
          .min(1)
          .max(4),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: isSuper } = await supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" });
    if (!isSuper) throw new Error("Forbidden: super admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: clash } = await supabaseAdmin
      .from("staff_profiles")
      .select("id")
      .ilike("username", data.username)
      .maybeSingle();
    if (clash) throw new Error("Username already taken");

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (createErr || !created.user) throw new Error(createErr?.message ?? "Failed to create user");
    const newId = created.user.id;

    // Ensure profile exists (trigger should handle it, but upsert to be safe).
    await supabaseAdmin
      .from("staff_profiles")
      .upsert({ id: newId, email: data.email, username: data.username, full_name: data.full_name, is_active: true });

    // Replace any auto-assigned roles with the chosen set.
    await supabaseAdmin.from("user_roles").delete().eq("user_id", newId);
    await supabaseAdmin
      .from("user_roles")
      .insert(data.roles.map((role) => ({ user_id: newId, role })));

    await supabase.from("audit_logs").insert({
      staff_id: userId,
      action: "staff.create",
      entity_type: "staff",
      entity_id: newId,
      metadata: { email: data.email, username: data.username, roles: data.roles },
    });
    return { ok: true, id: newId };
  });

/** Super-admin: toggle active flag on a staff account. */
export const setStaffActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ user_id: z.string().uuid(), is_active: z.boolean() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: isSuper } = await supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" });
    if (!isSuper) throw new Error("Forbidden: super admin only");
    if (data.user_id === userId) throw new Error("Cannot deactivate your own account");
    await supabase.from("staff_profiles").update({ is_active: data.is_active }).eq("id", data.user_id);
    await supabase.from("audit_logs").insert({
      staff_id: userId,
      action: data.is_active ? "staff.activate" : "staff.deactivate",
      entity_type: "staff",
      entity_id: data.user_id,
    });
    return { ok: true };
  });

/** Super-admin: edit a staff member's identity / password. */
export const updateStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        user_id: z.string().uuid(),
        username: z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9_.-]+$/).optional(),
        full_name: z.string().min(1).max(120).optional(),
        email: z.string().email().optional(),
        password: z.string().min(8).max(128).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: isSuper } = await supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" });
    if (!isSuper) throw new Error("Forbidden: super admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const profilePatch: { username?: string; full_name?: string; email?: string } = {};
    if (data.username !== undefined) {
      const { data: clash } = await supabaseAdmin
        .from("staff_profiles")
        .select("id")
        .ilike("username", data.username)
        .neq("id", data.user_id)
        .maybeSingle();
      if (clash) throw new Error("Username already taken");
      profilePatch.username = data.username;
    }
    if (data.full_name !== undefined) profilePatch.full_name = data.full_name;
    if (data.email !== undefined) profilePatch.email = data.email;

    if (Object.keys(profilePatch).length) {
      const { error } = await supabaseAdmin.from("staff_profiles").update(profilePatch).eq("id", data.user_id);
      if (error) throw new Error(error.message);
    }

    const authPatch: { email?: string; password?: string } = {};
    if (data.email) authPatch.email = data.email;
    if (data.password) authPatch.password = data.password;
    if (Object.keys(authPatch).length) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, authPatch);
      if (error) throw new Error(error.message);
    }

    await supabase.from("audit_logs").insert({
      staff_id: userId,
      action: "staff.update",
      entity_type: "staff",
      entity_id: data.user_id,
      metadata: {
        changed: [
          ...Object.keys(profilePatch),
          ...(data.password ? ["password"] : []),
        ],
      },
    });
    return { ok: true };
  });

/** Detail view for a single staff member: profile + roles + recent audit log. */
export const getStaffDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: isSuper } = await supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" });
    if (!isSuper) throw new Error("Forbidden: super admin only");

    const [{ data: profile }, { data: roles }, { data: activity }, { count: actionCount }] = await Promise.all([
      supabase
        .from("staff_profiles")
        .select("id,email,username,full_name,is_active,created_at")
        .eq("id", data.user_id)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", data.user_id),
      supabase
        .from("audit_logs")
        .select("id,action,entity_type,entity_id,metadata,created_at")
        .eq("staff_id", data.user_id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("audit_logs").select("id", { count: "exact", head: true }).eq("staff_id", data.user_id),
    ]);
    return {
      profile,
      roles: (roles ?? []).map((r) => r.role as string),
      activity: activity ?? [],
      totalActions: actionCount ?? 0,
    };
  });

export const listPaymentMethods = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("payment_methods").select("*").order("name");
    return data ?? [];
  });

export const listGames = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("games").select("*").order("name");
    return data ?? [];
  });

/** Create a deposit/cashout request manually from the admin (testing or phone intake). */
export const createRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        kind: z.enum(["deposit", "cashout"]),
        player_id: z.string().uuid(),
        amount: z.number().positive().max(1_000_000),
        payment_method_id: z.string().uuid().optional().nullable(),
        reference: z.string().max(200).optional().nullable(),
        destination: z.string().max(200).optional().nullable(),
        notes: z.string().max(500).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const table = data.kind === "deposit" ? "deposit_requests" : "cashout_requests";
    const base = {
      player_id: data.player_id,
      amount: data.amount,
      payment_method_id: data.payment_method_id || null,
      notes: data.notes || null,
    };
    const { data: row, error } =
      data.kind === "deposit"
        ? await supabase.from("deposit_requests").insert({ ...base, reference: data.reference || null }).select().single()
        : await supabase.from("cashout_requests").insert({ ...base, destination: data.destination || null }).select().single();
    if (error) throw new Error(error.message);
    await supabase.from("audit_logs").insert({
      staff_id: userId,
      action: `${data.kind}.create`,
      entity_type: data.kind,
      entity_id: row.id,
      metadata: { amount: data.amount, player_id: data.player_id },
    });
    return row;
  });