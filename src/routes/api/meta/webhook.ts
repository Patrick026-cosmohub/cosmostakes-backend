import { createFileRoute } from "@tanstack/react-router";
import crypto from "node:crypto";
import {
  fallbackFacebookUserName,
  fetchMetaUserProfile,
  pageNameForId,
} from "@/lib/meta-messenger.server";

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || "";
const APP_SECRET = process.env.META_APP_SECRET?.trim();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function text(body: string, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/plain" } });
}

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function previewFromMessage(message: any) {
  const textBody = safeText(message?.text);
  if (textBody) return textBody;
  const attachmentType = message?.attachments?.[0]?.type;
  if (attachmentType) return `Facebook ${attachmentType} received`;
  return "Facebook message received";
}

function attachmentUrlFromMessage(message: any) {
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  const withUrl = attachments.find(
    (attachment: any) => typeof attachment?.payload?.url === "string",
  );
  return withUrl?.payload?.url ?? null;
}

function externalMessageId(event: any) {
  const mid = safeText(event?.message?.mid);
  return mid || null;
}

function messageEvents(entry: any) {
  return [
    ...(Array.isArray(entry?.messaging) ? entry.messaging : []),
    ...(Array.isArray(entry?.standby) ? entry.standby : []),
  ];
}

async function verifySignature(request: Request, rawBody: string) {
  if (!APP_SECRET) return true;
  const signature = request.headers.get("x-hub-signature-256") || "";
  if (!signature.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", APP_SECRET).update(rawBody).digest("hex");
  const actual = signature.slice("sha256=".length);
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  return (
    expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

async function ensureMetaPage(supabase: any, pageId: string) {
  const now = new Date().toISOString();
  const fallbackName = pageNameForId(pageId);
  const existing = await supabase
    .from("meta_pages" as never)
    .select("page_id,page_name")
    .eq("page_id", pageId)
    .maybeSingle();
  if (existing.error) throw existing.error;

  if (!(existing.data as any)?.page_id) {
    const { error } = await supabase.from("meta_pages" as never).insert({
      page_id: pageId,
      page_name: fallbackName,
      token_status: "unknown",
      token_source: "webhook",
      is_enabled: true,
      updated_at: now,
    } as never);
    if (error) throw error;
    return;
  }

  const currentName = String((existing.data as any)?.page_name || "");
  const shouldRefreshName = !currentName || /^Facebook Page \d+$/i.test(currentName);
  const { error } = await supabase
    .from("meta_pages" as never)
    .update({
      ...(shouldRefreshName ? { page_name: fallbackName } : {}),
      updated_at: now,
    } as never)
    .eq("page_id", pageId);
  if (error) throw error;
}

async function getOrCreateSupportTicket(
  supabase: any,
  pageId: string,
  psid: string,
  body: string,
  senderType: "player" | "staff",
  userName: string,
  pageName: string,
) {
  void body;
  void senderType;
  const playerUsername = `fb:${pageId}:${psid}`;

  const existing = await supabase
    .from("support_tickets" as never)
    .select("id")
    .eq("player_username", playerUsername)
    .in("status", ["new", "waiting", "assigned", "in_progress"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;

  let ticketId = (existing.data as any)?.id as string | undefined;

  if (!ticketId) {
    const created = await supabase
      .from("support_tickets" as never)
      .insert({
        player_id: null,
        player_name: userName,
        player_username: playerUsername,
        game_provider: pageName,
        issue_type: "messenger",
        status: "new",
        unread_count_staff: 0,
      } as never)
      .select("id")
      .single();
    if (created.error) throw created.error;
    ticketId = (created.data as any).id;
  } else {
    await supabase
      .from("support_tickets" as never)
      .update({
        player_name: userName,
        game_provider: pageName,
      } as never)
      .eq("id", ticketId);
  }

  return ticketId;
}

async function matchingRecentStaffMessage(supabase: any, ticketId: string, body: string) {
  const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const existing = await supabase
    .from("chat_messages" as never)
    .select("id")
    .eq("ticket_id", ticketId)
    .eq("sender_type", "staff")
    .eq("body", body)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;
  return ((existing.data as any)?.id as string | undefined) ?? null;
}

async function upsertMetaMessage(pageId: string, event: any) {
  const message = event?.message;
  if (!message) return;

  const isEcho = Boolean(message?.is_echo);
  const psid = String(isEcho ? event?.recipient?.id : event?.sender?.id);
  if (!psid || psid === "undefined") return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const body = previewFromMessage(message);
  const attachmentUrl = attachmentUrlFromMessage(message);
  const direction = isEcho ? "outgoing" : "incoming";
  const senderType = isEcho ? "staff" : "player";
  const externalId = externalMessageId(event);
  const pageName = pageNameForId(pageId);
  const profile =
    senderType === "player" ? await fetchMetaUserProfile(supabaseAdmin, pageId, psid) : null;
  const userName = profile?.name || fallbackFacebookUserName(psid);

  if (externalId) {
    const duplicate = await supabaseAdmin
      .from("meta_messages" as never)
      .select("id")
      .eq("page_id", pageId)
      .eq("external_message_id", externalId)
      .maybeSingle();
    if (duplicate.error) throw duplicate.error;
    if ((duplicate.data as any)?.id) return;
  }

  const ticketId = await getOrCreateSupportTicket(
    supabaseAdmin,
    pageId,
    psid,
    body,
    senderType,
    userName,
    pageName,
  );
  const createdAt = new Date(Number(event?.timestamp) || Date.now()).toISOString();

  let supportChatMessageId: string | null = null;
  if (senderType === "staff") {
    supportChatMessageId = await matchingRecentStaffMessage(supabaseAdmin, ticketId, body);
  } else {
    const recent = await supabaseAdmin
      .from("chat_messages" as never)
      .select("id")
      .eq("ticket_id", ticketId)
      .eq("sender_type", senderType)
      .eq("body", body)
      .gte("created_at", new Date(Date.now() - 2 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent.error) throw recent.error;
    supportChatMessageId = ((recent.data as any)?.id as string | undefined) ?? null;
  }

  if (!supportChatMessageId) {
    const supportMessage = await supabaseAdmin
      .from("chat_messages" as never)
      .insert({
        ticket_id: ticketId,
        sender_type: senderType,
        sender_id: null,
        body,
        attachment_url: attachmentUrl,
        read_by_staff: senderType !== "player",
        created_at: createdAt,
      } as never)
      .select("id")
      .single();
    if (supportMessage.error) throw supportMessage.error;
    supportChatMessageId = (supportMessage.data as any).id;
  }

  try {
    await ensureMetaPage(supabaseAdmin, pageId);

    const conversation = await supabaseAdmin
      .from("meta_conversations" as never)
      .upsert(
        {
          page_id: pageId,
          psid,
          support_ticket_id: ticketId,
          user_name: userName,
          last_message_at: createdAt,
          unread_count_staff: senderType === "player" ? 1 : 0,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "page_id,psid" },
      )
      .select("id")
      .single();
    if (conversation.error) throw conversation.error;

    const metaMessage = await supabaseAdmin.from("meta_messages" as never).insert({
      conversation_id: (conversation.data as any).id,
      page_id: pageId,
      psid,
      external_message_id: externalId,
      direction,
      body,
      attachment_url: attachmentUrl,
      raw_payload: event,
      support_chat_message_id: supportChatMessageId,
      created_at: createdAt,
    } as never);
    if (metaMessage.error) throw metaMessage.error;
  } catch (error) {
    console.warn("[meta/webhook] stored support message without meta tracking tables", error);
  }

  console.log("[meta/webhook] stored message", { ticketId, pageId, psid, direction });
}

export const Route = createFileRoute("/api/meta/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        if (mode === "subscribe" && token && VERIFY_TOKEN && token === VERIFY_TOKEN && challenge) {
          return text(challenge);
        }
        return text("Forbidden", 403);
      },
      POST: async ({ request }) => {
        try {
          const rawBody = await request.text();
          if (!(await verifySignature(request, rawBody))) return text("Invalid signature", 403);

          const payload = JSON.parse(rawBody || "{}");
          const entries = Array.isArray(payload?.entry) ? payload.entry : [];
          for (const entry of entries) {
            const pageId = entry?.id ? String(entry.id) : "unknown";
            for (const event of messageEvents(entry)) await upsertMetaMessage(pageId, event);
          }

          return json({ ok: true });
        } catch (error) {
          console.error("[meta/webhook]", error);
          return json({ ok: false }, 200);
        }
      },
    },
  },
});
