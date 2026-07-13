import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Role } from "@/lib/format";
import { hasPermission, type Permission } from "@/lib/permissions";

type AdminContext = { roles?: string[]; supabase: any; userId: string };

const PROVIDER_METHODS = [
  { id: "cash_app", name: "Cash App", display_name: "Cash App", is_active: true },
  { id: "paypal", name: "PayPal", display_name: "PayPal", is_active: true },
  { id: "chime", name: "Chime", display_name: "Chime", is_active: true },
  { id: "zelle", name: "Zelle", display_name: "Zelle", is_active: true },
];

function assertPermission(ctx: AdminContext, permission: Permission) {
  const roles = (ctx.roles ?? []) as Role[];
  if (!hasPermission(roles, permission)) {
    throw new Error(`Forbidden: ${permission} required`);
  }
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => value || null);

export const listPaymentMethodSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertPermission(context, "payment_methods.view");
    return PROVIDER_METHODS;
  });

export const listPaymentRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        status: z.enum(["all", "pending", "succeeded", "failed"]).default("pending"),
        provider: z.enum(["all", "cspay", "zappay"]).default("all"),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    assertPermission(context, "payments.view");
    let q = context.supabase
      .from("public_payment_requests" as never)
      .select(
        "id,provider,provider_order_id,provider_payment_id,player_name,game_username,amount_usd,amount_cents,pay_way,pay_url,provider_status,wallet_credited,created_at,updated_at,completed_at",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (data.status === "pending") q = q.in("provider_status", ["creating", "pending"]);
    if (data.status === "succeeded") q = q.in("provider_status", ["paid", "completed"]);
    if (data.status === "failed") q = q.in("provider_status", ["failed", "expired", "amount_mismatch"]);
    if (data.provider !== "all") q = q.eq("provider", data.provider);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listPayoutRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        status: z.enum(["all", "pending", "sent", "failed", "cancelled"]).default("pending"),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    assertPermission(context, "payouts.view");
    let q = context.supabase
      .from("payout_requests" as never)
      .select(
        "id,player_name,amount,payment_method_name,recipient_details,note,status,created_by,processed_by,processed_at,created_at,updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createPayoutRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        player_name: z.string().trim().min(2).max(120),
        amount: z.coerce.number().positive().max(1_000_000),
        payment_method_id: z.string().optional().nullable(),
        payment_method_name: optionalText(120),
        recipient_details: z.string().trim().min(2).max(1000),
        note: optionalText(1000),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    assertPermission(context, "payouts.manage");
    const { supabase, userId } = context;
    const method =
      PROVIDER_METHODS.find((item) => item.id === data.payment_method_id)?.display_name ||
      data.payment_method_name ||
      "Manual / Other";

    const { data: row, error } = await supabase
      .from("payout_requests" as never)
      .insert({
        player_name: data.player_name,
        amount: data.amount,
        payment_method_name: method,
        recipient_details: data.recipient_details,
        note: data.note,
        status: "pending",
        created_by: userId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await supabase.from("audit_logs").insert({
      staff_id: userId,
      action: "payout.create",
      entity_type: "payout_request",
      entity_id: (row as { id: string }).id,
      metadata: { amount: data.amount, player_name: data.player_name, method },
    });
    return row;
  });

export const updatePayoutStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["sent", "failed", "cancelled"]),
        note: optionalText(1000),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    assertPermission(context, "payouts.manage");
    const { supabase, userId } = context;
    const { data: payout, error: fetchError } = await supabase
      .from("payout_requests" as never)
      .select("id,status,amount,player_name,note")
      .eq("id", data.id)
      .maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (!payout) throw new Error("Payout not found");
    if ((payout as { status: string }).status !== "pending") {
      throw new Error(`Payout is already ${(payout as { status: string }).status}`);
    }
    if (
      data.status === "sent" &&
      Number((payout as { amount?: number | string }).amount ?? 0) > 200 &&
      !((context.roles ?? []) as string[]).includes("super_admin")
    ) {
      throw new Error("Super Admin approval is required for payouts above $200");
    }

    const { error } = await supabase
      .from("payout_requests" as never)
      .update({
        status: data.status,
        note: data.note ?? (payout as { note?: string | null }).note ?? null,
        processed_by: userId,
        processed_at: new Date().toISOString(),
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      staff_id: userId,
      action: `payout.${data.status}`,
      entity_type: "payout_request",
      entity_id: data.id,
      metadata: {
        amount: (payout as { amount?: number | string }).amount,
        player_name: (payout as { player_name?: string }).player_name,
        note: data.note,
      },
    });
    return { ok: true };
  });
