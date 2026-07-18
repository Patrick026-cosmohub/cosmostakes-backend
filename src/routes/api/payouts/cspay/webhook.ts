import { createFileRoute } from "@tanstack/react-router";

function text(body: string, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/plain" } });
}

function stringifyMap(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, String(val)]));
}

async function parsePayload(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return stringifyMap((await request.json()) as Record<string, unknown>);
  }
  const form = await request.formData();
  return Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value)]));
}

function payoutState(raw: Record<string, string>) {
  const state = raw.state || raw.tradeState || raw.trade_state || raw.status || "";
  const normalized = String(state).trim().toLowerCase();
  if (["2", "success", "paid", "completed"].includes(normalized)) return "paid";
  if (["3", "failed", "closed", "cancelled", "canceled"].includes(normalized)) return "failed";
  return "pending";
}

function providerOrderId(raw: Record<string, string>) {
  return raw.payOrderId || raw.orderId || raw.order_id || raw.paymentOrderId || null;
}

function merchantOrderNo(raw: Record<string, string>) {
  return raw.mchOrderNo || raw.mch_order_no || raw.outTradeNo || raw.out_trade_no || "";
}

export const Route = createFileRoute("/api/payouts/cspay/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const [{ supabaseAdmin }, { verifyCspayWebhook }] = await Promise.all([
          import("@/integrations/supabase/client.server"),
          import("@/lib/cspay.server"),
        ]);
        let raw: Record<string, string>;
        try {
          raw = await parsePayload(request);
        } catch (error) {
          console.error("[payouts/cspay/webhook] parse failed", error);
          return text("fail", 400);
        }

        if (!verifyCspayWebhook(raw)) {
          console.warn("[payouts/cspay/webhook] invalid signature");
          return text("fail", 400);
        }

        const mchOrderNo = merchantOrderNo(raw);
        if (!mchOrderNo) return text("fail", 400);

        const status = payoutState(raw);
        if (status === "pending") return text("success");

        const payOrderId = providerOrderId(raw);
        const amountCents = Number(raw.amount || raw.totalAmount || raw.payAmount || 0);
        const actualAmount =
          Number.isFinite(amountCents) && amountCents > 0
            ? Number((amountCents / 100).toFixed(2))
            : undefined;
        const now = new Date().toISOString();

        const { data: payout, error: fetchError } = await supabaseAdmin
          .from("payout_requests" as never)
          .select("id,customer_name,amount_requested")
          .eq("cspay_mch_order_no", mchOrderNo)
          .maybeSingle();
        if (fetchError) {
          console.error("[payouts/cspay/webhook] lookup failed", fetchError.message);
          return text("fail", 500);
        }
        if (!payout) {
          console.warn("[payouts/cspay/webhook] unknown order", mchOrderNo);
          return text("success");
        }

        const payoutId = (payout as { id: string }).id;
        const update =
          status === "paid"
            ? {
                status: "paid",
                actual_amount_paid:
                  actualAmount ?? (payout as { amount_requested?: number }).amount_requested,
                reference_number: payOrderId,
                cspay_order_id: payOrderId,
                cspay_provider_status: String(raw.state || raw.status || "paid"),
                cspay_payload: raw,
                cspay_error: null,
                cspay_checked_at: now,
                processed_at: now,
              }
            : {
                status: "failed",
                cspay_order_id: payOrderId,
                cspay_provider_status: String(raw.state || raw.status || "failed"),
                cspay_payload: raw,
                cspay_error: raw.msg || raw.message || "CSPay marked payout failed",
                cspay_checked_at: now,
                processed_at: now,
              };

        const { error: updateError } = await supabaseAdmin
          .from("payout_requests" as never)
          .update(update as never)
          .eq("id", payoutId);
        if (updateError) {
          console.error("[payouts/cspay/webhook] update failed", updateError.message);
          return text("fail", 500);
        }

        await supabaseAdmin.from("payout_notifications" as never).insert({
          payout_id: payoutId,
          event_type: status === "paid" ? "completed" : "failed",
          title: status === "paid" ? "CSPay payout completed" : "CSPay payout failed",
          body:
            status === "paid"
              ? `${(payout as { customer_name?: string }).customer_name ?? "Customer"} payout was confirmed by CSPay.`
              : `${(payout as { customer_name?: string }).customer_name ?? "Customer"} payout failed at CSPay.`,
          amount: actualAmount ?? (payout as { amount_requested?: number }).amount_requested,
          email_status: "not_configured",
        } as never);

        return text("success");
      },
    },
  },
});
