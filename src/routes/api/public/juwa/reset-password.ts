import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  checkApiKey,
  getCreds,
  jsonError,
  jsonOk,
  juwaCall,
  randomString,
} from "./_helpers.server";
} from "./-_helpers.server";

const schema = z.object({
  platform: z.enum(["juwa", "juwa2", "gamevault"]),
  playerSiteUserId: z.string().uuid(),
});

export const Route = createFileRoute("/api/public/juwa/reset-password")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFail = checkApiKey(request);
        if (authFail) return authFail;

        let parsed;
        try {
          parsed = schema.parse(await request.json());
        } catch (e) {
          return jsonError(400, "Invalid body", { detail: (e as Error).message });
        }
        const { platform, playerSiteUserId } = parsed;

        const creds = await getCreds(platform);
        if (!creds) return jsonError(400, "platform not configured");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: player } = await supabaseAdmin
          .from("platform_players" as never)
          .select("id, juwa_user_id")
          .eq("site_user_id", playerSiteUserId)
          .eq("platform", platform)
          .maybeSingle();
        if (!player) return jsonError(404, "player not found");

        const row = player as { id: string; juwa_user_id: string };
        const newPassword = randomString(10);

        try {
          await juwaCall(creds, "/api/external/resetPassword", {
            user_id: row.juwa_user_id,
            login_pwd: newPassword,
          });
        } catch (e) {
          return jsonError(502, (e as Error).message);
        }

        const { error: updErr } = await supabaseAdmin
          .from("platform_players" as never)
          .update({ juwa_password: newPassword } as never)
          .eq("id", row.id);
        if (updErr) return jsonError(500, updErr.message);

        return jsonOk({ password: newPassword });
      },
    },
  },
});