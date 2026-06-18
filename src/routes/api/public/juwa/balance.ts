import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { checkApiKey, getCreds, jsonError, jsonOk, juwaCall } from "./-_helpers.server";

const schema = z.object({
  platform: z.enum(["juwa", "juwa2", "gamevault"]),
  playerSiteUserId: z.string().uuid(),
});

export const Route = createFileRoute("/api/public/juwa/balance")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authFail = checkApiKey(request);
        if (authFail) return authFail;

        const url = new URL(request.url);
        let parsed;
        try {
          parsed = schema.parse({
            platform: url.searchParams.get("platform"),
            playerSiteUserId: url.searchParams.get("playerSiteUserId"),
          });
        } catch (e) {
          return jsonError(400, "Invalid query", { detail: (e as Error).message });
        }
        const { platform, playerSiteUserId } = parsed;

        const creds = await getCreds(platform);
        if (!creds) return jsonError(400, "platform not configured");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: player } = await supabaseAdmin
          .from("platform_players" as never)
          .select("juwa_user_id")
          .eq("site_user_id", playerSiteUserId)
          .eq("platform", platform)
          .maybeSingle();
        if (!player) return jsonError(404, "player not found");

        try {
          const data = await juwaCall<{ user_balance?: number | string }>(
            creds,
            "/api/external/userBalance",
            { user_id: (player as { juwa_user_id: string }).juwa_user_id },
          );
          return jsonOk({ user_balance: data.user_balance });
        } catch (e) {
          return jsonError(502, (e as Error).message);
        }
      },
    },
  },
});