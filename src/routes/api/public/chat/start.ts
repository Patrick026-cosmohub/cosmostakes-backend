import { createFileRoute } from "@tanstack/react-router";
import { checkApiKey, cors204, jsonError, CORS_HEADERS } from "./-_helpers.server";

const BOT_GREETING = "Hi 👋 Welcome to Cosmo Stakes Support. How can we help you today?";

export const Route = createFileRoute("/api/public/chat/start")({
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
        const {
          player_id,
          player_name,
          player_phone,
          player_username,
          game_provider,
          issue_type,
          initial_message,
        } = body as Record<string, string | undefined>;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: ticket, error } = await supabaseAdmin
          .from("support_tickets")
          .insert({
            player_id: player_id ?? null,
            player_name: player_name ?? null,
            player_phone: player_phone ?? null,
            player_username: player_username ?? null,
            game_provider: game_provider ?? null,
            issue_type: issue_type ?? null,
            status: "new",
          })
          .select("id,ticket_number,status,created_at")
          .single();
        if (error || !ticket) return jsonError(500, error?.message ?? "Failed to create ticket");

        // Insert bot greeting + optional player initial message
        const messages: Array<{ ticket_id: string; sender_type: "bot" | "player"; body: string }> = [
          { ticket_id: ticket.id, sender_type: "bot", body: BOT_GREETING },
        ];
        if (initial_message && initial_message.trim()) {
          messages.push({ ticket_id: ticket.id, sender_type: "player", body: initial_message.trim().slice(0, 4000) });
        }
        await supabaseAdmin.from("chat_messages").insert(messages);

        return new Response(JSON.stringify({ ticket }), {
          status: 200,
          headers: { "content-type": "application/json", ...CORS_HEADERS },
        });
      },
    },
  },
});