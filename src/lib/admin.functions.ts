import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callRefujTransfer, isSpecialGameProvider, readRefujGameList } from "./refuj.server";

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

/**
 * Daily / weekly / monthly financial report.
 * - in: approved deposit volume
 * - out: approved cashout volume (absolute)
 * - holding: cumulative in − out as of period end (snapshot)
 * - profit: in − out for the period
 * Also returns per-game ranking sorted by cashout volume desc.
 */
export const getFinancialReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    // Pull all settled ledger rows (deposits/cashouts only) joined with player's game.
    const { data: ledger, error } = await supabase
      .from("wallet_ledger")
      .select("amount,type,created_at,player:players(id,game_ref_id,game:games(id,name,provider))")
      .in("type", ["deposit", "cashout"])
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    type Row = {
      amount: number;
      type: "deposit" | "cashout";
      created_at: string;
      player: { game: { id: string; name: string; provider: string } | null } | null;
    };
    const rows = (ledger ?? []) as unknown as Row[];

    const startOfDay = (d: Date) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return x;
    };
    const startOfWeek = (d: Date) => {
      const x = startOfDay(d);
      const day = x.getDay(); // Sun=0
      x.setDate(x.getDate() - day);
      return x;
    };
    const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    type Bucket = { key: string; label: string; in: number; out: number };
    const empty = (key: string, label: string): Bucket => ({ key, label, in: 0, out: 0 });

    // Build empty buckets for last N periods so the chart/table is dense.
    const now = new Date();
    const days: Bucket[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const s = startOfDay(d);
      days.push(empty(iso(s), s.toLocaleDateString("en-US", { month: "short", day: "numeric" })));
    }
    const weeks: Bucket[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i * 7);
      const s = startOfWeek(d);
      weeks.push(empty(iso(s), `Wk of ${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`));
    }
    const months: Bucket[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(empty(iso(d), d.toLocaleDateString("en-US", { month: "short", year: "2-digit" })));
    }

    const dayMap = new Map(days.map((b) => [b.key, b]));
    const weekMap = new Map(weeks.map((b) => [b.key, b]));
    const monthMap = new Map(months.map((b) => [b.key, b]));

    // Per-game aggregation across all-time.
    type GameRow = {
      id: string;
      name: string;
      provider: string | null;
      in: number;
      out: number;
      depositCount: number;
      cashoutCount: number;
    };
    const games = new Map<string, GameRow>();
    const UNGAMED = "__no_game__";
    games.set(UNGAMED, {
      id: UNGAMED,
      name: "Unassigned (no game)",
      provider: null,
      in: 0,
      out: 0,
      depositCount: 0,
      cashoutCount: 0,
    });

    let totalIn = 0;
    let totalOut = 0;

    rows.forEach((r) => {
      const amt = Math.abs(Number(r.amount));
      const at = new Date(r.created_at);
      const dKey = iso(startOfDay(at));
      const wKey = iso(startOfWeek(at));
      const mKey = iso(startOfMonth(at));

      const isDeposit = r.type === "deposit";
      if (isDeposit) totalIn += amt;
      else totalOut += amt;

      const bumpBucket = (b: Bucket | undefined) => {
        if (!b) return;
        if (isDeposit) b.in += amt;
        else b.out += amt;
      };
      bumpBucket(dayMap.get(dKey));
      bumpBucket(weekMap.get(wKey));
      bumpBucket(monthMap.get(mKey));

      const game = r.player?.game;
      const gKey = game?.id ?? UNGAMED;
      if (!games.has(gKey)) {
        games.set(gKey, {
          id: gKey,
          name: game?.name ?? "Unassigned (no game)",
          provider: game?.provider ?? null,
          in: 0,
          out: 0,
          depositCount: 0,
          cashoutCount: 0,
        });
      }
      const g = games.get(gKey)!;
      if (isDeposit) {
        g.in += amt;
        g.depositCount += 1;
      } else {
        g.out += amt;
        g.cashoutCount += 1;
      }
    });

    // Add running holding to each bucket series.
    const withHolding = (buckets: Bucket[]) => {
      let running = 0;
      return buckets.map((b) => {
        running += b.in - b.out;
        return { ...b, profit: b.in - b.out, holding: running };
      });
    };

    const perGame = Array.from(games.values())
      .filter((g) => g.in > 0 || g.out > 0)
      .map((g) => ({ ...g, profit: g.in - g.out, holding: g.in - g.out }))
      .sort((a, b) => b.out - a.out);

    const today = startOfDay(now);
    const todayKey = iso(today);
    const todayBucket = dayMap.get(todayKey) ?? empty(todayKey, "Today");

    return {
      totals: {
        in: totalIn,
        out: totalOut,
        profit: totalIn - totalOut,
        holding: totalIn - totalOut,
      },
      today: { in: todayBucket.in, out: todayBucket.out, profit: todayBucket.in - todayBucket.out },
      daily: withHolding(days),
      weekly: withHolding(weeks),
      monthly: withHolding(months),
      perGame,
    };
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
        : "id,amount,status,destination,notes,requested_at,processed_at,processed_by,player:players(id,username,full_name,game_id,game:games(id,name,provider)),method:payment_methods(name,kind)";
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

async function maybeRunRefujForDeposit(supabase: any, req: any) {
  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("id,username,full_name,email,game_id,game:games(id,name,provider)")
    .eq("id", req.player_id)
    .maybeSingle();
  if (playerError) throw new Error(playerError.message);

  const game = Array.isArray(player?.game) ? player.game[0] : player?.game;
  if (!player?.game_id || !game?.name) return null;
  if (isSpecialGameProvider(game.name, game.provider)) return null;

  const { data: integration, error: integrationError } = await supabase
    .from("platform_integrations")
    .select("api_endpoint,api_key,secret_key")
    .eq("game_id", player.game_id)
    .maybeSingle();
  if (integrationError) throw new Error(integrationError.message);

  const result = await callRefujTransfer({
    kind: "deposit",
    requestId: req.id,
    gameName: game.name,
    gameCode: game.provider,
    gameUser: integration?.api_key,
    gamePass: integration?.secret_key,
    customerUsername: player.username || player.full_name || player.email || req.player_id,
    amount: Number(req.amount),
    apiBase: integration?.api_endpoint,
  });

  return `REFUJ deposit ${result.transferId} accepted (${result.gameCode}).`;
}

function requestedProfileCurrency(req: any): "gold" | "sweeps" {
  const notes = String(req?.notes ?? "");
  const match = notes.match(/^currency=(gold|sweeps)$/im);
  return match?.[1] === "gold" ? "gold" : "sweeps";
}

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

    let refujNote: string | null = null;
    if (data.decision === "approved" && data.kind === "deposit") {
      try {
        refujNote = await maybeRunRefujForDeposit(supabase, req);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await supabase
          .from(table)
          .update({
            status: "failed",
            processed_at: new Date().toISOString(),
            processed_by: userId,
            notes: [data.note ?? req.notes, `REFUJ failed: ${message}`].filter(Boolean).join("\n"),
          })
          .eq("id", data.id);
        await supabase.from("audit_logs").insert({
          staff_id: userId,
          action: `${data.kind}.refuj_failed`,
          entity_type: data.kind,
          entity_id: data.id,
          metadata: { amount: req.amount, player_id: req.player_id, error: message },
        });
        throw new Error(`REFUJ failed: ${message}`);
      }
    }

    if (
      data.decision === "approved" &&
      data.kind === "cashout" &&
      String(req.notes ?? "").includes("platform_redeem_request")
    ) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: profile } = await supabaseAdmin
        .from("profiles" as never)
        .select("id")
        .eq("id", req.player_id)
        .maybeSingle();
      if (profile) {
        const delta = Number(req.amount);
        const currency = requestedProfileCurrency(req);
        const creditReason = `manual redeem approval: ${req.destination ?? "game redeem"}`;
        const { data: existingCredit, error: existingCreditError } = await supabaseAdmin
          .from("wallet_transactions" as never)
          .select("id")
          .eq("user_id", req.player_id)
          .eq("currency", currency)
          .eq("amount", delta)
          .filter("metadata->>reason", "eq", creditReason)
          .maybeSingle();
        if (existingCreditError) throw new Error(existingCreditError.message);
        if (!existingCredit) {
          const { error: profileCreditError } = await supabaseAdmin.rpc("admin_adjust_profile_wallet" as never, {
            p_user_id: req.player_id,
            p_currency: currency,
            p_delta: delta,
            p_reason: creditReason,
            p_staff_id: userId,
          } as never);
          if (profileCreditError) throw new Error(profileCreditError.message);
        }
      }
    }

    const { error: updErr } = await supabase
      .from(table)
      .update({
        status: data.decision,
        processed_at: new Date().toISOString(),
        processed_by: userId,
        notes: [data.note ?? req.notes, refujNote].filter(Boolean).join("\n") || null,
      })
      .eq("id", data.id);
    if (updErr) throw new Error(updErr.message);

    // On approval, credit the wallet and write a ledger row. Cashouts here are
    // manual game redeems: admin redeems in the game, then approval credits wallet.
    if (data.decision === "approved") {
      const { data: player } = await supabase.from("players").select("balance").eq("id", req.player_id).single();
      const current = Number(player?.balance ?? 0);
      const delta = Number(req.amount);
      const next = current + delta;
      await supabase.from("players").update({ balance: next }).eq("id", req.player_id);

      await supabase.from("wallet_ledger").insert({
        player_id: req.player_id,
        type: "deposit",
        amount: delta,
        balance_after: next,
        staff_id: userId,
        related_deposit: data.kind === "deposit" ? req.id : null,
        related_cashout: data.kind === "cashout" ? req.id : null,
        reason: data.note ?? (data.kind === "cashout" ? "manual redeem approval" : "deposit approval"),
      });
    }

    await supabase.from("audit_logs").insert({
      staff_id: userId,
      action: `${data.kind}.${data.decision}`,
      entity_type: data.kind,
      entity_id: data.id,
      metadata: { amount: req.amount, player_id: req.player_id, note: data.note ?? null, refuj: refujNote },
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

/** Player-dashboard wallet search for manual test credits/debits. */
export const searchPlayerWallets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().max(120).default("") }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: canFinance } = await supabase.rpc("can_handle_finance", { _user_id: userId });
    if (!canFinance) throw new Error("Forbidden: finance role required");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("profiles" as never)
      .select("id,first_name,last_name,email,phone,gold_coins,sweeps_coins,onboarded_at")
      .order("onboarded_at", { ascending: false })
      .limit(50);
    const q = data.q.trim();
    if (q) {
      const like = `%${q}%`;
      query = query.or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`);
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Manual adjustment for the player dashboard Cosmo wallet. Finance-only. */
export const adjustPlayerDashboardWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        user_id: z.string().uuid(),
        currency: z.enum(["sweeps", "gold"]),
        kind: z.enum(["credit", "debit"]),
        amount: z.number().positive().max(1_000_000),
        reason: z.string().min(3).max(500),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: canFinance } = await supabase.rpc("can_handle_finance", { _user_id: userId });
    if (!canFinance) throw new Error("Forbidden: finance role required");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles" as never)
      .select("id,email,first_name,last_name,gold_coins,sweeps_coins")
      .eq("id", data.user_id)
      .maybeSingle();
    if (profileError || !profile) throw new Error("Player profile not found");

    const row = profile as {
      id: string;
      email: string | null;
      first_name: string | null;
      last_name: string | null;
      gold_coins: number | string | null;
      sweeps_coins: number | string | null;
    };
    const column = data.currency === "gold" ? "gold_coins" : "sweeps_coins";
    const current = Number(row[column] ?? 0);
    const delta = data.kind === "credit" ? data.amount : -data.amount;
    const next = +(current + delta).toFixed(2);
    if (next < 0) throw new Error("Adjustment would result in negative balance");

    const { data: adjustedRows, error: adjustError } = await supabaseAdmin.rpc(
      "admin_adjust_profile_wallet" as never,
      {
        p_user_id: data.user_id,
        p_currency: data.currency,
        p_delta: delta,
        p_reason: data.reason,
        p_staff_id: userId,
      } as never,
    );
    if (adjustError) throw new Error(adjustError.message);
    const adjusted = Array.isArray(adjustedRows) ? adjustedRows[0] : adjustedRows;
    const finalBalance = Number((adjusted as { balance?: number | string } | null)?.balance ?? next);

    await supabase.from("audit_logs").insert({
      staff_id: userId,
      action: `player_wallet.${data.kind}`,
      entity_type: "profile",
      entity_id: data.user_id,
      metadata: {
        currency: data.currency,
        amount: data.amount,
        balance_after: finalBalance,
        reason: data.reason,
        email: row.email,
      },
    });

    return { ok: true, balance: finalBalance, currency: data.currency };
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

const PLAYER_DASHBOARD_PLATFORMS = [
  { name: "Juwa", provider: "juwa" },
  { name: "Juwa 2", provider: "juwa2" },
  { name: "Game Vault", provider: "gamevault" },
  { name: "Orion Stars", provider: "orionstars" },
  { name: "Fire Kirin", provider: "firekirin" },
  { name: "Milky Way", provider: "milkyway" },
  { name: "Panda Master", provider: "pandamaster" },
  { name: "High Stakes", provider: "highstakes" },
  { name: "Las Vegas Sweeps", provider: "lasvegassweeps" },
  { name: "Vblink", provider: "vblink" },
] as const;

function platformKey(value?: string | null) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

async function listDashboardGameRows(supabase: any) {
  const { data, error } = await supabase
    .from("games")
    .select("id,name,provider,is_active,display_title,sort_order")
    .order("sort_order")
    .order("name");
  if (error) throw new Error(error.message);

  let games = (data ?? []) as Array<{
    id: string;
    name: string;
    provider: string | null;
    is_active: boolean;
    display_title?: string | null;
    sort_order?: number | null;
  }>;

  const missing = PLAYER_DASHBOARD_PLATFORMS.filter((platform) => {
    const keys = new Set([platformKey(platform.name), platformKey(platform.provider)]);
    return !games.some((g) => keys.has(platformKey(g.name)) || keys.has(platformKey(g.provider)));
  });

  if (missing.length > 0) {
    const { error: insertError } = await supabase.from("games").insert(
      missing.map((platform) => ({
        name: platform.name,
        provider: platform.provider,
        display_title: platform.name,
        sort_order: PLAYER_DASHBOARD_PLATFORMS.findIndex((p) => p.provider === platform.provider),
        is_active: true,
        maintenance_mode: false,
        featured: false,
        sync_frequency_seconds: 300,
      })),
    );
    if (insertError) throw new Error(insertError.message);

    const refreshed = await supabase
      .from("games")
      .select("id,name,provider,is_active,display_title,sort_order")
      .order("sort_order")
      .order("name");
    if (refreshed.error) throw new Error(refreshed.error.message);
    games = refreshed.data ?? [];
  }

  return PLAYER_DASHBOARD_PLATFORMS.map((platform) => {
    const keys = new Set([platformKey(platform.name), platformKey(platform.provider)]);
    return games.find((g) => keys.has(platformKey(g.name)) || keys.has(platformKey(g.provider)));
  }).filter(Boolean);
}

/** Per-platform overview: every active game plus aggregate player + financial stats. */
export const getPlatformsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [{ data: games }, { data: players }, { data: ledger }, { data: pendingDeps }, { data: pendingCash }] =
      await Promise.all([
        supabase.from("games").select("id,name,provider,is_active,display_title,sort_order").order("sort_order").order("name"),
        supabase.from("players").select("id,game_id,status,balance"),
        supabase.from("wallet_ledger").select("amount,type,player:players(game_id)"),
        supabase
          .from("deposit_requests")
          .select("amount,player:players(game_id)")
          .eq("status", "pending"),
        supabase
          .from("cashout_requests")
          .select("amount,player:players(game_id)")
          .eq("status", "pending"),
      ]);

    type Stat = {
      id: string;
      name: string;
      provider: string | null;
      is_active: boolean;
      players: number;
      activePlayers: number;
      balance: number;
      in: number;
      out: number;
      profit: number;
      pendingDeposits: number;
      pendingCashouts: number;
    };
    const map = new Map<string, Stat>();

    const gameToPlatformId = new Map<string, string>();
    const dbGames = (games ?? []) as Array<{
      id: string;
      name: string;
      provider: string | null;
      is_active: boolean;
      display_title?: string | null;
    }>;

    PLAYER_DASHBOARD_PLATFORMS.forEach((platform) => {
      const keys = new Set([platformKey(platform.name), platformKey(platform.provider)]);
      const game = dbGames.find((g) => keys.has(platformKey(g.name)) || keys.has(platformKey(g.provider)));
      const id = game?.id ?? `dashboard-${platform.provider}`;
      if (game?.id) gameToPlatformId.set(game.id, id);

      map.set(id, {
        id,
        name: platform.name,
        provider: game?.provider ?? platform.provider,
        is_active: game?.is_active ?? true,
        players: 0,
        activePlayers: 0,
        balance: 0,
        in: 0,
        out: 0,
        profit: 0,
        pendingDeposits: 0,
        pendingCashouts: 0,
      });
    });

    (players ?? []).forEach((p) => {
      if (!p.game_id) return;
      const platformId = gameToPlatformId.get(p.game_id);
      if (!platformId) return;
      const s = map.get(platformId);
      if (!s) return;
      s.players += 1;
      if (p.status === "active") s.activePlayers += 1;
      s.balance += Number(p.balance ?? 0);
    });

    (ledger ?? []).forEach((r: any) => {
      const gid = r.player?.game_id;
      if (!gid) return;
      const platformId = gameToPlatformId.get(gid);
      if (!platformId) return;
      const s = map.get(platformId);
      if (!s) return;
      const amt = Math.abs(Number(r.amount));
      if (r.type === "deposit") s.in += amt;
      else s.out += amt;
    });

    (pendingDeps ?? []).forEach((r: any) => {
      const gid = r.player?.game_id;
      if (!gid) return;
      const platformId = gameToPlatformId.get(gid);
      const s = platformId ? map.get(platformId) : null;
      if (s) s.pendingDeposits += Number(r.amount);
    });
    (pendingCash ?? []).forEach((r: any) => {
      const gid = r.player?.game_id;
      if (!gid) return;
      const platformId = gameToPlatformId.get(gid);
      const s = platformId ? map.get(platformId) : null;
      if (s) s.pendingCashouts += Number(r.amount);
    });

    const platforms = Array.from(map.values()).map((s) => ({ ...s, profit: s.in - s.out }));
    const totals = platforms.reduce(
      (a, p) => ({
        platforms: a.platforms + 1,
        players: a.players + p.players,
        in: a.in + p.in,
        out: a.out + p.out,
        profit: a.profit + p.profit,
        balance: a.balance + p.balance,
      }),
      { platforms: 0, players: 0, in: 0, out: 0, profit: 0, balance: 0 },
    );
    return { platforms, totals };
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

// ====================== Settings ======================

async function assertSuperAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "super_admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: super admin only");
}

export const getGeneralSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("general_settings")
      .select("*")
      .eq("id", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const updateGeneralSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        platform_name: z.string().trim().min(1).max(120),
        company_logo_url: z.string().trim().max(500).optional().nullable(),
        support_email: z.string().trim().email().max(255).optional().nullable().or(z.literal("")),
        support_phone: z.string().trim().max(40).optional().nullable(),
        timezone: z.string().trim().min(1).max(64),
        currency: z.string().trim().min(1).max(8),
        date_format: z.string().trim().min(1).max(32),
        time_format: z.enum(["12h", "24h"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const payload = {
      ...data,
      support_email: data.support_email || null,
      company_logo_url: data.company_logo_url || null,
      support_phone: data.support_phone || null,
    };
    const { data: row, error } = await context.supabase
      .from("general_settings")
      .upsert({ id: true, ...payload })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await context.supabase.from("audit_logs").insert({
      staff_id: context.userId,
      action: "settings.general.update",
      entity_type: "general_settings",
      entity_id: null,
      metadata: { fields: Object.keys(payload) },
    });
    return row;
  });

export const listPlatformIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context);
    const games = await listDashboardGameRows(context.supabase);
    const { data: integrations, error: iErr } = await context.supabase
      .from("platform_integrations")
      .select("*");
    if (iErr) throw new Error(iErr.message);
    const byGame = new Map((integrations ?? []).map((r: any) => [r.game_id, r]));
    return (games ?? []).map((g: any) => ({
      game: g,
      integration: byGame.get(g.id) ?? null,
    }));
  });

export const upsertPlatformIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        game_id: z.string().uuid(),
        api_endpoint: z.string().trim().max(500).optional().nullable(),
        api_key: z.string().trim().max(500).optional().nullable(),
        secret_key: z.string().trim().max(500).optional().nullable(),
        webhook_url: z.string().trim().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const payload = {
      game_id: data.game_id,
      api_endpoint: data.api_endpoint || null,
      api_key: data.api_key || null,
      secret_key: data.secret_key || null,
      webhook_url: data.webhook_url || null,
      connection_status:
        data.api_key && data.secret_key ? "configured" : "not_configured",
    };
    const { data: row, error } = await context.supabase
      .from("platform_integrations")
      .upsert(payload, { onConflict: "game_id" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await context.supabase.from("audit_logs").insert({
      staff_id: context.userId,
      action: "settings.integration.update",
      entity_type: "platform_integration",
      entity_id: row.id,
      metadata: { game_id: data.game_id },
    });
    return row;
  });

export const testPlatformIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ game_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { data: integ } = await context.supabase
      .from("platform_integrations")
      .select("*")
      .eq("game_id", data.game_id)
      .maybeSingle();

    let status = "failed";
    let message = "Missing REFUJ agent ID or agent password.";
    if (integ?.api_key && integ?.secret_key) {
      try {
        await readRefujGameList(integ.api_endpoint);
        status = "connected";
        message = "REFUJ master key works and agent credentials are present.";
      } catch (e: any) {
        status = "error";
        message = e?.message ?? "REFUJ connection failed";
      }
    }

    const now = new Date().toISOString();
    const { data: row, error } = await context.supabase
      .from("platform_integrations")
      .update({
        connection_status: status,
        last_test_at: now,
        last_test_message: message,
        last_synced_at: status === "connected" ? now : integ?.last_synced_at ?? null,
      })
      .eq("game_id", data.game_id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
