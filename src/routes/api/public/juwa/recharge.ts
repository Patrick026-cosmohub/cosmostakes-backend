import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  checkApiKey,
  getCreds,
  jsonError,
  jsonOk,
  juwaCall,
  randomOrderId,
} from "./-_helpers.server";
import { getVblinkConfig, makeVblinkRequestId, vblinkCall } from "./-_vblink.server";
import { callRefujTransfer } from "@/lib/refuj.server";
import { getRefujIntegration, isRefujPlatform } from "./-_refuj-platforms.server";

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
  amount: z.number().positive(),
  bonusAmount: z.number().min(0).optional().default(0),
});

async function handle(
  request: Request,
  type: "recharge" | "withdraw",
  path: string,
  prefix: string,
) {
  const authFail = checkApiKey(request);
  if (authFail) return authFail;

  let parsed;
  try {
    parsed = schema.parse(await request.json());
  } catch (e) {
    return jsonError(400, "Invalid body", { detail: (e as Error).message });
  }
  const { platform, playerSiteUserId, amount, bonusAmount } = parsed;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: player } = await supabaseAdmin
    .from("platform_players" as never)
    .select("juwa_user_id, juwa_username, juwa_password")
    .eq("site_user_id", playerSiteUserId)
    .eq("platform", platform)
    .maybeSingle();
  if (!player) return jsonError(404, "player not found");

  const juwaUserId = (player as { juwa_user_id: string }).juwa_user_id;
  const orderId = randomOrderId(prefix);

  if (isRefujPlatform(platform)) {
    if (type !== "recharge") {
      return jsonError(400, "REFUJ redeems are handled manually by admin approval.");
    }

    const row = player as { juwa_username?: string | null; juwa_password?: string | null };
    const customerUsername = row.juwa_username?.trim();
    if (!customerUsername || !row.juwa_password?.trim()) {
      return jsonError(
        400,
        "REFUJ player registration is still pending. Create username again before depositing.",
      );
    }

    let result;
    try {
      const refuj = await getRefujIntegration(platform);
      result = await callRefujTransfer({
        kind: "deposit",
        requestId: orderId,
        gameName: refuj.gameName,
        gameCode: refuj.gameCode,
        gameUser: refuj.gameUser,
        gamePass: refuj.gamePass,
        customerUsername,
        amount,
        bonusAmount,
        apiBase: refuj.apiBase,
      });

      await supabaseAdmin.from("platform_transactions" as never).insert({
        site_user_id: playerSiteUserId,
        platform,
        type,
        amount,
        order_id: result.transferId,
        juwa_transaction_id: result.transferId,
        status: "success",
        error: JSON.stringify(result.raw),
      } as never);

      return jsonOk({
        order_id: result.transferId,
        transaction_id: result.transferId,
        provider: "refuj",
        game_code: result.gameCode,
        bonus_amount: bonusAmount,
      });
    } catch (e) {
      const err = e as Error;
      await supabaseAdmin.from("platform_transactions" as never).insert({
        site_user_id: playerSiteUserId,
        platform,
        type,
        amount,
        order_id: result?.transferId ?? orderId,
        status: "failed",
        error: err.message,
      } as never);
      return jsonError(502, err.message);
    }
  }

  if (platform === "vblink") {
    const config = await getVblinkConfig();
    if (!config) return jsonError(400, "Vblink is not configured");
    const requestid = makeVblinkRequestId(prefix);
    try {
      const data = await vblinkCall<{
        balance?: number | string;
        order_num?: string | number;
        requestid?: string;
      }>(config, type === "recharge" ? "/fast/user/deposit" : "/fast/user/withdrawal", {
        requestid,
        account: juwaUserId,
        amount: amount.toFixed(2),
      });

      await supabaseAdmin.from("platform_transactions" as never).insert({
        site_user_id: playerSiteUserId,
        platform,
        type,
        amount,
        order_id: data.data?.requestid ?? requestid,
        juwa_transaction_id: data.data?.order_num ? String(data.data.order_num) : null,
        user_balance: data.data?.balance != null ? Number(data.data.balance) : null,
        status: "success",
      } as never);

      return jsonOk({
        user_balance: data.data?.balance,
        transaction_id: data.data?.order_num,
        order_id: data.data?.requestid ?? requestid,
      });
    } catch (e) {
      const err = e as Error;
      await supabaseAdmin.from("platform_transactions" as never).insert({
        site_user_id: playerSiteUserId,
        platform,
        type,
        amount,
        order_id: requestid,
        status: "failed",
        error: err.message,
      } as never);
      return jsonError(502, err.message);
    }
  }

  const creds = await getCreds(platform);
  if (!creds) return jsonError(400, "platform not configured");

  try {
    let finalOrderId = orderId;
    let data: {
      user_balance?: number | string;
      agent_balance?: number | string;
      transaction_id?: string | number;
    };

    try {
      data = await juwaCall(creds, path, { user_id: juwaUserId, amount, order_id: finalOrderId });
    } catch (e) {
      const err = e as Error & { code?: number };
      if (type !== "recharge" || (err.code !== 10 && err.code !== 21)) {
        throw e;
      }

      await juwaCall(creds, "/api/external/playerOffline", { user_id: juwaUserId });
      finalOrderId = randomOrderId(prefix);
      data = await juwaCall(creds, path, { user_id: juwaUserId, amount, order_id: finalOrderId });
    }

    await supabaseAdmin.from("platform_transactions" as never).insert({
      site_user_id: playerSiteUserId,
      platform,
      type,
      amount,
      order_id: finalOrderId,
      juwa_transaction_id: data.transaction_id ? String(data.transaction_id) : null,
      user_balance: data.user_balance != null ? Number(data.user_balance) : null,
      status: "success",
    } as never);

    return jsonOk({
      user_balance: data.user_balance,
      transaction_id: data.transaction_id,
      order_id: finalOrderId,
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
