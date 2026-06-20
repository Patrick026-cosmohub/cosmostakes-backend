import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TICKET_STATUSES = ["new", "waiting", "assigned", "in_progress", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

const TabSchema = z.enum(["new", "waiting", "mine", "in_progress", "resolved", "closed", "all"]);

/** List tickets for a given tab, with optional search. */
export const listTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tab: string; search?: string }) => ({
    tab: TabSchema.parse(d.tab),
    search: d.search?.trim() || "",
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("support_tickets")
      .select(
        "id,ticket_number,player_id,player_name,player_phone,player_username,game_provider,issue_type,status,assigned_staff_id,last_message_at,last_message_preview,last_message_sender,unread_count_staff,created_at",
      )
      .order("last_message_at", { ascending: false })
      .limit(200);

    switch (data.tab) {
      case "new":
        q = q.eq("status", "new");
        break;
      case "waiting":
        q = q.eq("status", "waiting");
        break;
      case "mine":
        q = q.eq("assigned_staff_id", userId).in("status", ["assigned", "in_progress", "waiting"]);
        break;
      case "in_progress":
        q = q.eq("status", "in_progress");
        break;
      case "resolved":
        q = q.eq("status", "resolved");
        break;
      case "closed":
        q = q.eq("status", "closed");
        break;
      case "all":
        break;
    }

    if (data.search) {
      const s = data.search.replace(/[%,]/g, " ");
      // numeric search → ticket_number
      const asNum = Number(s);
      if (Number.isFinite(asNum) && /^\d+$/.test(s)) {
        q = q.or(`ticket_number.eq.${asNum},player_name.ilike.%${s}%,player_username.ilike.%${s}%,player_phone.ilike.%${s}%`);
      } else {
        q = q.or(
          `player_name.ilike.%${s}%,player_username.ilike.%${s}%,player_phone.ilike.%${s}%,issue_type.ilike.%${s}%`,
        );
      }
    }

    const { data: tickets, error } = await q;
    if (error) throw new Error(error.message);

    // hydrate assigned staff names
    const ids = Array.from(new Set((tickets ?? []).map((t) => t.assigned_staff_id).filter(Boolean) as string[]));
    let staffMap = new Map<string, string>();
    if (ids.length) {
      const { data: staff } = await supabase
        .from("staff_profiles")
        .select("id,full_name,email")
        .in("id", ids);
      staffMap = new Map((staff ?? []).map((s) => [s.id, s.full_name || s.email || "Staff"]));
    }

    return (tickets ?? []).map((t) => ({
      ...t,
      assigned_staff_name: t.assigned_staff_id ? staffMap.get(t.assigned_staff_id) ?? null : null,
    }));
  });

/** Per-tab unread/open counts for the sidebar tabs. */
export const ticketCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [n, w, mine, ip, rs, cl] = await Promise.all([
      supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "new"),
      supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "waiting"),
      supabase
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .eq("assigned_staff_id", userId)
        .in("status", ["assigned", "in_progress", "waiting"]),
      supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
      supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "resolved"),
      supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "closed"),
    ]);
    return {
      new: n.count ?? 0,
      waiting: w.count ?? 0,
      mine: mine.count ?? 0,
      in_progress: ip.count ?? 0,
      resolved: rs.count ?? 0,
      closed: cl.count ?? 0,
    };
  });

export const getTicket = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: z.string().uuid().parse(d.id) }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: ticket, error } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ticket) throw new Error("Ticket not found");

    let assignedName: string | null = null;
    if (ticket.assigned_staff_id) {
      const { data: s } = await supabase
        .from("staff_profiles")
        .select("full_name,email")
        .eq("id", ticket.assigned_staff_id)
        .maybeSingle();
      assignedName = s?.full_name || s?.email || null;
    }
    return { ...ticket, assigned_staff_name: assignedName };
  });

export const getMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ticketId: string }) => ({ ticketId: z.string().uuid().parse(d.ticketId) }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: messages, error } = await supabase
      .from("chat_messages")
      .select("id,ticket_id,sender_type,sender_id,body,attachment_url,read_by_staff,created_at")
      .eq("ticket_id", data.ticketId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    // mark player messages as read
    await supabase
      .from("chat_messages")
      .update({ read_by_staff: true })
      .eq("ticket_id", data.ticketId)
      .eq("sender_type", "player")
      .eq("read_by_staff", false);
    await supabase
      .from("support_tickets")
      .update({ unread_count_staff: 0 })
      .eq("id", data.ticketId);

    // hydrate staff names
    const staffIds = Array.from(
      new Set((messages ?? []).filter((m) => m.sender_type === "staff" && m.sender_id).map((m) => m.sender_id as string)),
    );
    let staffMap = new Map<string, string>();
    if (staffIds.length) {
      const { data: staff } = await supabase
        .from("staff_profiles")
        .select("id,full_name,email")
        .in("id", staffIds);
      staffMap = new Map((staff ?? []).map((s) => [s.id, s.full_name || s.email || "Staff"]));
    }

    return (messages ?? []).map((m) => ({
      ...m,
      sender_name:
        m.sender_type === "staff" && m.sender_id
          ? staffMap.get(m.sender_id) ?? "Staff"
          : m.sender_type === "bot"
            ? "Bot"
            : m.sender_type === "system"
              ? "System"
              : null,
      is_me: m.sender_type === "staff" && m.sender_id === userId,
    }));
  });

export const sendStaffReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ticketId: string; body: string; attachmentUrl?: string }) => ({
    ticketId: z.string().uuid().parse(d.ticketId),
    body: z.string().trim().min(1).max(4000).parse(d.body),
    attachmentUrl: d.attachmentUrl?.trim() || null,
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: msg, error } = await supabase
      .from("chat_messages")
      .insert({
        ticket_id: data.ticketId,
        sender_type: "staff",
        sender_id: userId,
        body: data.body,
        attachment_url: data.attachmentUrl,
        read_by_staff: true,
      })
      .select("id,created_at")
      .single();
    if (error) throw new Error(error.message);

    // If status was 'new' or 'waiting', promote to in_progress
    await supabase
      .from("support_tickets")
      .update({ status: "in_progress" })
      .eq("id", data.ticketId)
      .in("status", ["new", "waiting", "assigned"]);

    await supabase.from("audit_logs").insert({
      action: "support.reply",
      entity_type: "support_ticket",
      entity_id: data.ticketId,
      staff_id: userId,
      metadata: { message_id: msg.id },
    });
    return msg;
  });

export const assignTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ticketId: string; toStaffId?: string | null }) => ({
    ticketId: z.string().uuid().parse(d.ticketId),
    toStaffId: d.toStaffId === undefined ? undefined : d.toStaffId === null ? null : z.string().uuid().parse(d.toStaffId),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const targetId = data.toStaffId === undefined ? userId : data.toStaffId;

    const { data: prev } = await supabase
      .from("support_tickets")
      .select("assigned_staff_id,status")
      .eq("id", data.ticketId)
      .maybeSingle();

    const nextStatus =
      targetId === null
        ? (prev?.status === "in_progress" ? "waiting" : prev?.status ?? "new")
        : prev?.status === "in_progress"
          ? "in_progress"
          : "assigned";

    const { error } = await supabase
      .from("support_tickets")
      .update({ assigned_staff_id: targetId, status: nextStatus })
      .eq("id", data.ticketId);
    if (error) throw new Error(error.message);

    await supabase.from("staff_assignments").insert({
      ticket_id: data.ticketId,
      from_staff_id: prev?.assigned_staff_id ?? null,
      to_staff_id: targetId,
      action: targetId === null ? "unassigned" : prev?.assigned_staff_id ? "transferred" : "assigned",
      actor_id: userId,
    });
    await supabase.from("audit_logs").insert({
      action: targetId === null ? "support.unassign" : "support.assign",
      entity_type: "support_ticket",
      entity_id: data.ticketId,
      staff_id: userId,
      metadata: { to: targetId },
    });
    return { ok: true };
  });

export const setTicketStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ticketId: string; status: string }) => ({
    ticketId: z.string().uuid().parse(d.ticketId),
    status: z.enum(TICKET_STATUSES).parse(d.status),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("support_tickets")
      .update({ status: data.status })
      .eq("id", data.ticketId);
    if (error) throw new Error(error.message);
    await supabase.from("audit_logs").insert({
      action: "support.status",
      entity_type: "support_ticket",
      entity_id: data.ticketId,
      staff_id: userId,
      metadata: { status: data.status },
    });
    return { ok: true };
  });

export const addNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ticketId: string; body: string }) => ({
    ticketId: z.string().uuid().parse(d.ticketId),
    body: z.string().trim().min(1).max(4000).parse(d.body),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: note, error } = await supabase
      .from("ticket_notes")
      .insert({ ticket_id: data.ticketId, staff_id: userId, body: data.body })
      .select("id,created_at")
      .single();
    if (error) throw new Error(error.message);
    return note;
  });

export const listNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ticketId: string }) => ({ ticketId: z.string().uuid().parse(d.ticketId) }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: notes, error } = await supabase
      .from("ticket_notes")
      .select("id,staff_id,body,created_at")
      .eq("ticket_id", data.ticketId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((notes ?? []).map((n) => n.staff_id)));
    let map = new Map<string, string>();
    if (ids.length) {
      const { data: staff } = await supabase
        .from("staff_profiles")
        .select("id,full_name,email")
        .in("id", ids);
      map = new Map((staff ?? []).map((s) => [s.id, s.full_name || s.email || "Staff"]));
    }
    return (notes ?? []).map((n) => ({ ...n, staff_name: map.get(n.staff_id) ?? "Staff" }));
  });

export const listAssignableStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id,role")
      .in("role", ["support_agent", "admin", "super_admin"]);
    const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
    if (!ids.length) return [];
    const { data: staff } = await supabase
      .from("staff_profiles")
      .select("id,full_name,email,is_active")
      .in("id", ids);
    return (staff ?? [])
      .filter((s) => s.is_active !== false)
      .map((s) => ({ id: s.id, name: s.full_name || s.email || "Staff" }));
  });