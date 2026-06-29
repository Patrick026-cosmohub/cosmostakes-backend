import { createFileRoute } from "@tanstack/react-router";
import { getPageAccessToken, parseFacebookUsername } from "@/lib/meta-messenger.server";
import { createHash } from "node:crypto";

const SESSION_COOKIE = "cosmo_admin_session";

function text(body: string, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/plain" } });
}

function readSessionCookie(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function requireStaffSession(request: Request, supabaseAdmin: any) {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) return true;

  const token = readSessionCookie(request);
  if (!token) return false;

  const tokenHash = createHash("sha256").update(token).digest("base64url");
  const { data, error } = await supabaseAdmin
    .from("admin_sessions" as never)
    .select("id")
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  return !error && Boolean(data);
}

async function fetchAttachment(url: string, token: string | null) {
  const headers = token ? { authorization: `Bearer ${token}` } : undefined;
  let response = await fetch(url, { headers });
  if (!response.ok && token) {
    const retry = new URL(url);
    retry.searchParams.set("access_token", token);
    response = await fetch(retry);
  }
  return response;
}

export const Route = createFileRoute("/api/support/attachment/$messageId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        if (!(await requireStaffSession(request, supabaseAdmin))) return text("Unauthorized", 401);

        const { data: message, error } = await supabaseAdmin
          .from("chat_messages" as never)
          .select("id,ticket_id,attachment_url")
          .eq("id", params.messageId)
          .maybeSingle();
        if (error || !(message as any)?.attachment_url) return text("Attachment not found", 404);

        const { data: ticket } = await supabaseAdmin
          .from("support_tickets" as never)
          .select("player_username")
          .eq("id", (message as any).ticket_id)
          .maybeSingle();

        const identity = parseFacebookUsername((ticket as any)?.player_username);
        const token = identity ? await getPageAccessToken(supabaseAdmin, identity.pageId) : null;
        const attachment = await fetchAttachment(String((message as any).attachment_url), token);
        if (!attachment.ok) return text("Attachment unavailable", attachment.status);

        const contentType = attachment.headers.get("content-type") || "application/octet-stream";
        const body = await attachment.arrayBuffer();
        return new Response(body, {
          status: 200,
          headers: {
            "content-type": contentType,
            "cache-control": "private, no-store",
          },
        });
      },
    },
  },
});
