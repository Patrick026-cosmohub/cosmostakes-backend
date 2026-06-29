import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Role } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import {
  fallbackFacebookUserName,
  isLikelyImageUrl,
  pageNameForId,
  parseFacebookUsername,
} from "@/lib/meta-messenger.server";

type SupportContext = { roles?: string[] };

function assertSupportAccess(ctx: SupportContext) {
  if (!hasPermission((ctx.roles ?? []) as Role[], "support.access")) {
    throw new Error("Forbidden: support.access required");
  }
}

const TICKET_STATUSES = [
  "new",
  "waiting",
  "assigned",
  "in_progress",
  "resolved",
  "closed",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

const TabSchema = z.enum(["new", "waiting", "mine", "in_progress", "resolved", "closed", "all"]);

function envTokenNameForPage(pageId: string) {
  return `META_PAGE_ACCESS_TOKEN_${pageId.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}`;
}

type TicketLike = {
  id: string;
  player_name?: string | null;
  player_username?: string | null;
  game_provider?: string | null;
};

type MessengerDetails = {
  pageId: string;
  psid: string;
  pageName: string;
  userName: string;
};

async function loadMessengerDetails(supabase: any, tickets: TicketLike[]) {
  const byTicket = new Map<string, MessengerDetails>();
  const messengerTickets = tickets
    .map((ticket) => ({ ticket, identity: parseFacebookUsername(ticket.player_username) }))
    .filter((item): item is { ticket: TicketLike; identity: { pageId: string; psid: string } } =>
      Boolean(item.identity),
    );

  if (!messengerTickets.length) return byTicket;

  const ticketIds = messengerTickets.map((item) => item.ticket.id);
  const pageIds = Array.from(new Set(messengerTickets.map((item) => item.identity.pageId)));
  const pageNames = new Map(pageIds.map((pageId) => [pageId, pageNameForId(pageId)]));

  const { data: pages } = await supabase
    .from("meta_pages" as never)
    .select("page_id,page_name")
    .in("page_id", pageIds);
  for (const page of ((pages ?? []) as any[])) {
    if (page.page_id && page.page_name) pageNames.set(String(page.page_id), String(page.page_name));
  }

  const { data: conversations } = await supabase
    .from("meta_conversations" as never)
    .select("support_ticket_id,page_id,psid,user_name")
    .in("support_ticket_id", ticketIds);
  const conversationsByTicket = new Map(
    ((conversations ?? []) as any[]).map((row) => [String(row.support_ticket_id), row]),
  );

  for (const item of messengerTickets) {
    const conversation = conversationsByTicket.get(item.ticket.id);
    const pageId = String(conversation?.page_id || item.identity.pageId);
    const psid = String(conversation?.psid || item.identity.psid);
    const pageName = pageNames.get(pageId) ?? pageNameForId(pageId);
    const ticketName = item.ticket.player_name?.startsWith("Facebook User")
      ? ""
      : item.ticket.player_name || "";
    const userName =
      (typeof conversation?.user_name === "string" && conversation.user_name.trim()) ||
      ticketName ||
      fallbackFacebookUserName(psid);

    byTicket.set(item.ticket.id, { pageId, psid, pageName, userName });
  }

  return byTicket;
}

async function sendMetaPageReplyIfNeeded(supabase: any, ticketId: string, body: string) {
  const { data: ticket, error } = await supabase
    .from("support_tickets")
    .select("player_username")
    .eq("id", ticketId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const username = ticket?.player_username as string | undefined;
  if (!username?.startsWith("fb:")) return;

  const fallbackPageId = process.env.META_PAGE_ID?.trim() || "";
  const parts = username.split(":");
  const pageId = parts.length >= 3 ? parts[1] : fallbackPageId;
  const recipientId = parts.length >= 3 ? parts.slice(2).join(":") : username.slice(3);
  if (!pageId || !recipientId) return;

  let token =
    process.env[envTokenNameForPage(pageId)]?.trim() ||
    process.env.META_PAGE_ACCESS_TOKEN?.trim() ||
    "";

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: pageRow, error: pageError } = await supabaseAdmin
    .from("meta_pages" as never)
    .select("page_access_token")
    .eq("page_id", pageId)
    .eq("is_enabled", true)
    .maybeSingle();
  if (!pageError && (pageRow as any)?.page_access_token) {
    token = String((pageRow as any).page_access_token).trim();
  }
  if (!token) return;

  const graphVersion = process.env.META_GRAPH_API_VERSION?.trim() || "v24.0";
  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/me/messages?access_token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        messaging_type: "RESPONSE",
        message: { text: body },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Meta reply failed (${response.status}): ${errorText.slice(0, 500)}`);
  }
}

/** List tickets for a given tab, with optional search. */
export const listTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tab: string; search?: string }) => ({
    tab: TabSchema.parse(d.tab),
    search: d.search?.trim() || "",
  }))
  .handler(async ({ data, context }) => {
    assertSupportAccess(context);
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
        q = q.or(
          `ticket_number.eq.${asNum},player_name.ilike.%${s}%,player_username.ilike.%${s}%,player_phone.ilike.%${s}%`,
        );
      } else {
        q = q.or(
          `player_name.ilike.%${s}%,player_username.ilike.%${s}%,player_phone.ilike.%${s}%,issue_type.ilike.%${s}%`,
        );
      }
    }

    const { data: tickets, error } = await q;
    if (error) throw new Error(error.message);

    // hydrate assigned staff names
    const ids = Array.from(
      new Set((tickets ?? []).map((t) => t.assigned_staff_id).filter(Boolean) as string[]),
    );
    let staffMap = new Map<string, string>();
    if (ids.length) {
      const { data: staff } = await supabase
        .from("staff_profiles")
        .select("id,full_name,email")
        .in("id", ids);
      staffMap = new Map((staff ?? []).map((s) => [s.id, s.full_name || s.email || "Staff"]));
    }

    const messengerMap = await loadMessengerDetails(supabase, tickets ?? []);

    return (tickets ?? []).map((t) => {
      const messenger = messengerMap.get(t.id);
      return {
        ...t,
        player_name: messenger?.userName ?? t.player_name,
        game_provider: messenger?.pageName ?? t.game_provider,
        messenger_page_id: messenger?.pageId ?? null,
        messenger_page_name: messenger?.pageName ?? null,
        messenger_user_name: messenger?.userName ?? null,
        assigned_staff_name: t.assigned_staff_id ? (staffMap.get(t.assigned_staff_id) ?? null) : null,
      };
    });
  });

/** Per-tab unread/open counts for the sidebar tabs. */
export const ticketCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertSupportAccess(context);
    const { supabase, userId } = context;
    const [n, w, mine, ip, rs, cl] = await Promise.all([
      supabase
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .eq("status", "new"),
      supabase
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .eq("status", "waiting"),
      supabase
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .eq("assigned_staff_id", userId)
        .in("status", ["assigned", "in_progress", "waiting"]),
      supabase
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .eq("status", "in_progress"),
      supabase
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .eq("status", "resolved"),
      supabase
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .eq("status", "closed"),
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
    assertSupportAccess(context);
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
    const messenger = (await loadMessengerDetails(supabase, [ticket])).get(ticket.id);

    return {
      ...ticket,
      player_name: messenger?.userName ?? ticket.player_name,
      game_provider: messenger?.pageName ?? ticket.game_provider,
      messenger_page_id: messenger?.pageId ?? null,
      messenger_page_name: messenger?.pageName ?? null,
      messenger_user_name: messenger?.userName ?? null,
      assigned_staff_name: assignedName,
    };
  });

export const getMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ticketId: string }) => ({ ticketId: z.string().uuid().parse(d.ticketId) }))
  .handler(async ({ data, context }) => {
    assertSupportAccess(context);
    const { supabase, userId } = context;
    const { data: messages, error } = await supabase
      .from("chat_messages")
      .select("id,ticket_id,sender_type,sender_id,body,attachment_url,read_by_staff,created_at")
      .eq("ticket_id", data.ticketId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const { data: ticket } = await supabase
      .from("support_tickets")
      .select("id,player_name,player_username,game_provider")
      .eq("id", data.ticketId)
      .maybeSingle();
    const messenger = ticket ? (await loadMessengerDetails(supabase, [ticket])).get(ticket.id) : null;
    const playerSenderName = messenger?.userName ?? ticket?.player_name ?? "Player";

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
      new Set(
        (messages ?? [])
          .filter((m) => m.sender_type === "staff" && m.sender_id)
          .map((m) => m.sender_id as string),
      ),
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
          ? (staffMap.get(m.sender_id) ?? "Staff")
          : m.sender_type === "bot"
            ? "Bot"
            : m.sender_type === "system"
              ? "System"
              : playerSenderName,
      attachment_proxy_url: m.attachment_url ? `/api/support/attachment/${m.id}` : null,
      attachment_is_image: isLikelyImageUrl(m.attachment_url) || Boolean(m.attachment_url),
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
    assertSupportAccess(context);
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

    await sendMetaPageReplyIfNeeded(supabase, data.ticketId, data.body);

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
    toStaffId:
      d.toStaffId === undefined
        ? undefined
        : d.toStaffId === null
          ? null
          : z.string().uuid().parse(d.toStaffId),
  }))
  .handler(async ({ data, context }) => {
    assertSupportAccess(context);
    const { supabase, userId } = context;
    const targetId = data.toStaffId === undefined ? userId : data.toStaffId;

    const { data: prev } = await supabase
      .from("support_tickets")
      .select("assigned_staff_id,status")
      .eq("id", data.ticketId)
      .maybeSingle();

    const nextStatus =
      targetId === null
        ? prev?.status === "in_progress"
          ? "waiting"
          : (prev?.status ?? "new")
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
      action:
        targetId === null ? "unassigned" : prev?.assigned_staff_id ? "transferred" : "assigned",
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
    assertSupportAccess(context);
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
    assertSupportAccess(context);
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
    assertSupportAccess(context);
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
    assertSupportAccess(context);
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
