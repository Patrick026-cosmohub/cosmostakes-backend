import { createFileRoute } from "@tanstack/react-router";
import { checkApiKey, cors204, jsonError, jsonOk } from "./-_helpers.server";

export const Route = createFileRoute("/api/public/chat/ticket/$id/messages")({
  server: {
    handlers: {
      OPTIONS: () => cors204(),
      GET: async ({ request, params }) => {
        const auth = checkApiKey(request);
        if (auth) return auth;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("chat_messages")
          .select("id,ticket_id,sender_type,sender_id,body,attachment_url,created_at")
          .eq("ticket_id", params.id)
          .order("created_at", { ascending: true });
        if (error) return jsonError(500, error.message);

        const { data: ticket } = await supabaseAdmin
          .from("support_tickets")
          .select("id,ticket_number,status,assigned_staff_id")
          .eq("id", params.id)
          .maybeSingle();
        return jsonOk({ ticket, messages: data ?? [] });
      },
    },
  },
});
