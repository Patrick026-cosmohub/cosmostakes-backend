import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  checkApiKey,
  getCreds,
  jsonError,
  jsonOk,
  juwaCall,
  randomAlnum,
} from "./_helpers.server";

const schema = z.object({
  platform: z.enum(["juwa", "juwa2", "gamevault"]),
  playerSiteUserId: z.string().uuid(),
});

export const Route = createFileRoute("/api/public/juwa/create-player")({
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

        const { data: existing } = await supabaseAdmin
          .from("platform_players" as never)
          .select("juwa_user_id, juwa_username, juwa_password")
          .eq("site_user_id", playerSiteUserId)
          .eq("platform", platform)
          .maybeSingle();

        if (existing) {
          const row = existing as { juwa_user_id: string; juwa_username: string; juwa_password: string };
          return jsonOk({
            username: row.juwa_username,
            password: row.juwa_password,
            juwa_user_id: row.juwa_user_id,
          });
        }

        // Juwa account rules: letters/numbers/underscore, 4–20 chars.
        const username = "cs_" + randomAlnum(8);
        // Juwa password rules: 6–32 chars. Use 10 alphanumeric.
        const password = randomAlnum(10);

        let data: { account_name?: string; user_id?: string | number };
        try {
          data = await juwaCall(creds, "/api/external/addUser", {
            account: username,
            login_pwd: password,
          });
        } catch (e) {
          return jsonError(502, (e as Error).message);
        }

        const juwaUserId = String(data.user_id ?? "");
        if (!juwaUserId) return jsonError(502, "Juwa addUser missing user_id");

        const { error: insertErr } = await supabaseAdmin
          .from("platform_players" as never)
          .insert({
            site_user_id: playerSiteUserId,
            platform,
            juwa_user_id: juwaUserId,
            juwa_username: data.account_name ?? username,
            juwa_password: password,
          } as never);
        if (insertErr) return jsonError(500, insertErr.message);

        return jsonOk({
          username: data.account_name ?? username,
          password,
          juwa_user_id: juwaUserId,
        });
      },
    },
  },
});