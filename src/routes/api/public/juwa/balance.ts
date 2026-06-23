import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { checkApiKey, getCreds, jsonError, jsonOk, juwaCall } from "./-_helpers.server";
import { getVblinkConfig, vblinkCall } from "./-_vblink.server";
import { isRefujPlatform } from "./-_refuj-platforms.server";

const schema = z.object({
  platform: z.enum([
    "juwa",
    "juwa2",
    "gamevault",
    "vblink",
    "firekirin",
    "milkyway",
    "orionstars",
    "pandamaster",
    "lasvegassweeps",
    "highstakes",
  ]),
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

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: player } = await supabaseAdmin
          .from("platform_players" as never)
          .select("juwa_user_id")
          .eq("site_user_id", playerSiteUserId)
          .eq("platform", platform)
          .maybeSingle();
        if (!player) return jsonError(404, "player not found");

        if (isRefujPlatform(platform)) {
          return jsonOk({
            user_balance: null,
            provider: "refuj",
            message: "REFUJ balance is not shown live here.",
          });
        }

        if (platform === "vblink") {
          const config = await getVblinkConfig();
          if (!config) return jsonError(400, "Vblink is not configured");
          try {
            const data = await vblinkCall<{ balance?: number | string }>(
              config,
              "/fast/user/balance",
              { account: (player as { juwa_user_id: string }).juwa_user_id },
            );
            return jsonOk({ user_balance: data.data?.balance });
          } catch (e) {
            return jsonError(502, (e as Error).message);
          }
        }

        const creds = await getCreds(platform);
        if (!creds) return jsonError(400, "platform not configured");

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
