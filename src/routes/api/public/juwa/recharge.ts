import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  checkApiKey,
  getCreds,
  jsonError,
  jsonOk,
  juwaCall,
  randomOrderId,
} from "./_helpers.server";

const schema = z.object({
  platform: z.enum(["juwa", "juwa2", "gamevault"]),
  playerSiteUserId: z.string().uuid(),
  amount: z.number().positive(),
});

async function handle(request: Request, type: "recharge" | "withdraw", path: string, prefix: string) {
  const authFail = checkApiKey(request);
  if (authFail) return authFail;

  let parsed;
  try {
    parsed = schema.parse(await request.json());
  } catch (e) {
    return jsonError(400, "Invalid body", { detail: (e as Error).message });
  }
  const { platform, playerSiteUserId, amount } = parsed;

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

  const juwaUserId = (player as { juwa_user_id: string }).juwa_user_id;
  const orderId = randomOrderId(prefix);

  try {
    const data = await juwaCall<{
      user_balance?: number | string;
      agent_balance?: number | string;
      transaction_id?: string | number;
    }>(creds, path, { user_id: juwaUserId, amount, order_id: orderId });

    await supabaseAdmin.from("platform_transactions" as never).insert({
      site_user_id: playerSiteUserId,
      platform,
      type,
      amount,
      order_id: orderId,
      juwa_transaction_id: data.transaction_id ? String(data.transaction_id) : null,
      user_balance: data.user_balance != null ? Number(data.user_balance) : null,
      status: "success",
    } as never);

    return jsonOk({
      user_balance: data.user_balance,
      transaction_id: data.transaction_id,
      order_id: orderId,
    });
  } catch (e) {
    const err = e as Error;
    await supabaseAdmin.from("platform_transactions" as never).insert({
      site_user_id: playerSiteUserId,
      platform,
      type,
      amount,
      order_id: orderId,
      status: "failed",
      error: err.message,
    } as never);
    return jsonError(502, err.message);
  }
}

export const handleTxn = handle;

export const Route = createFileRoute("/api/public/juwa/recharge")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request, "recharge", "/api/external/recharge", "rc"),
    },
  },
});