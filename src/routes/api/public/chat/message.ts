import { createFileRoute } from "@tanstack/react-router";
import { checkApiKey, cors204, jsonError, jsonOk } from "./-_helpers.server";

export const Route = createFileRoute("/api/public/chat/message")({
  server: {
    handlers: {
      OPTIONS: () => cors204(),
      POST: async ({ request }) => {
        const auth = checkApiKey(request);
        if (auth) return auth;
        let body: Record<string, unknown>;
        try {
          body = await request.json();
        } catch {
          return jsonError(400, "Invalid JSON");
        }
        const ticket_id = body.ticket_id as string | undefined;
        const text = body.body as string | undefined;
        const attachment_url = (body.attachment_url as string | undefined) ?? null;
        const player_id = (body.player_id as string | undefined) ?? null;
        if (!ticket_id) return jsonError(400, "Missing ticket_id");
        if (!text && !attachment_url) return jsonError(400, "Empty message");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: msg, error } = await supabaseAdmin
          .from("chat_messages")
          .insert({
            ticket_id,
            sender_type: "player",
            sender_id: player_id,
            body: text ? text.slice(0, 4000) : null,
            attachment_url,
            read_by_staff: false,
          })
          .select("id,created_at")
          .single();
        if (error || !msg) return jsonError(500, error?.message ?? "Failed to send message");
        return jsonOk({ message: msg });
      },
    },
  },
});
