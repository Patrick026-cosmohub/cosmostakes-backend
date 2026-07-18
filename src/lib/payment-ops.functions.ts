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

const customerTypeSchema = z.enum([
  "website_player",
  "facebook_customer",
  "messenger_customer",
  "external_customer",
]);
const payoutStatusSchema = z.enum([
  "all",
  "pending",
  "awaiting_approval",
  "ready_to_process",
  "paid",
  "rejected",
  "failed",
]);
const paymentMethodSchema = z.enum(["Cash App", "PayPal", "Chime", "Zelle"]);

function assertPermission(ctx: AdminContext, permission: Permission) {
  const roles = (ctx.roles ?? []) as Role[];
  if (!hasPermission(roles, permission)) {
    throw new Error(`Forbidden: ${permission} required`);
  }
}

function isSuperAdmin(ctx: AdminContext) {
  return ((ctx.roles ?? []) as string[]).includes("super_admin");
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
    if (data.status === "failed")
      q = q.in("provider_status", ["failed", "expired", "amount_mismatch"]);
    if (data.provider !== "all") q = q.eq("provider", data.provider);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

async function ownerRecipients(supabase: any) {
  const { data: roles } = await supabase
    .from("user_roles" as never)
    .select("user_id")
    .eq("role", "super_admin");
  const ids = ((roles ?? []) as Array<{ user_id: string }>).map((row) => row.user_id);
  if (!ids.length) return [];
  const { data: staff } = await supabase
    .from("staff_profiles" as never)
    .select("id,email,full_name")
    .in("id", ids)
    .eq("is_active", true);
  return (staff ?? []) as Array<{ id: string; email: string | null; full_name: string | null }>;
}

async function sendOwnerEmail({ to, title, body }: { to: string[]; title: string; body: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const resendFrom = process.env.PAYOUT_FROM_EMAIL || process.env.NOTIFICATION_FROM_EMAIL;
  const smtpFrom = process.env.SMTP_FROM || resendFrom || process.env.SMTP_USER;
  if (to.length === 0) {
    return { status: "not_configured" as const, error: null };
  }

  if (!apiKey || !resendFrom) {
    const smtp = {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true" || process.env.SMTP_PORT === "465",
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: smtpFrom,
    };
    if (!smtp.host || !smtp.user || !smtp.pass || !smtp.from) {
      return { status: "not_configured" as const, error: null };
    }
    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.default.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: {
          user: smtp.user,
          pass: smtp.pass,
        },
      });
      await transporter.sendMail({
        from: smtp.from,
        to,
        subject: title,
        text: body,
      });
      return { status: "sent" as const, error: null };
    } catch (error) {
      return {
        status: "failed" as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resendFrom,
        to,
        subject: title,
        text: body,
      }),
    });
    if (!response.ok) {
      return { status: "failed" as const, error: await response.text() };
    }
    return { status: "sent" as const, error: null };
  } catch (error) {
    return {
      status: "failed" as const,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function notifyOwners(
  supabase: any,
  payload: {
    payoutId: string;
    eventType: "created" | "approval_required" | "approved" | "completed" | "failed" | "rejected";
    title: string;
    body: string;
    amount: number;
  },
) {
  const recipients = await ownerRecipients(supabase);
  const ownerEmail = process.env.PAYOUT_OWNER_EMAIL;
  const emails = [
    ...(ownerEmail ? [ownerEmail] : []),
    ...recipients.map((recipient) => recipient.email).filter(Boolean),
  ] as string[];
  const uniqueEmails = [...new Set(emails)];
  const email = await sendOwnerEmail({
    to: uniqueEmails,
    title: payload.title,
    body: payload.body,
  });

  const notificationRows = (recipients.length ? recipients : [{ id: null }]).map((recipient) => ({
    payout_id: payload.payoutId,
    event_type: payload.eventType,
    title: payload.title,
    body: payload.body,
    amount: payload.amount,
    created_for: recipient.id,
    email_status: email.status,
    email_error: email.error,
  }));
  await supabase.from("payout_notifications" as never).insert(notificationRows as never);
}

const payoutSelect =
  "id,customer_type,customer_name,player_name,brand_page,payment_method_name,recipient_identifier,account_holder_name,recipient_details,amount,amount_requested,actual_amount_paid,reference_number,proof_screenshot_url,staff_note,note,processing_note,status,approval_required,owner_approved_by,owner_approved_at,created_by,processed_by,processed_at,created_at,updated_at,cspay_mch_order_no,cspay_order_id,cspay_pay_way,cspay_provider_status,cspay_error,cspay_sent_at,cspay_checked_at";

export const listPayoutRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        status: payoutStatusSchema.default("all"),
        search: z.string().trim().max(120).optional().default(""),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    assertPermission(context, "payouts.view");
    let q = context.supabase
      .from("payout_requests" as never)
      .select(payoutSelect)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.search) {
      const term = `%${data.search.replace(/[%_]/g, "")}%`;
      q = q.or(
        [
          `customer_name.ilike.${term}`,
          `player_name.ilike.${term}`,
          `brand_page.ilike.${term}`,
          `payment_method_name.ilike.${term}`,
          `recipient_identifier.ilike.${term}`,
          `account_holder_name.ilike.${term}`,
          `reference_number.ilike.${term}`,
          `staff_note.ilike.${term}`,
          `processing_note.ilike.${term}`,
        ].join(","),
      );
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const staffIds = [
      ...new Set(
        (
          (rows ?? []) as Array<{
            created_by?: string;
            processed_by?: string;
            owner_approved_by?: string;
          }>
        )
          .flatMap((row) => [row.created_by, row.processed_by, row.owner_approved_by])
          .filter(Boolean) as string[],
      ),
    ];
    const { data: staff } = staffIds.length
      ? await context.supabase
          .from("staff_profiles" as never)
          .select("id,email,full_name,username")
          .in("id", staffIds)
      : { data: [] };
    const staffById = new Map(
      (
        (staff ?? []) as Array<{
          id: string;
          full_name: string | null;
          email: string | null;
          username: string | null;
        }>
      ).map((person) => [person.id, person]),
    );
    return ((rows ?? []) as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      created_staff: row.created_by ? (staffById.get(String(row.created_by)) ?? null) : null,
      processed_staff: row.processed_by ? (staffById.get(String(row.processed_by)) ?? null) : null,
      approved_staff: row.owner_approved_by
        ? (staffById.get(String(row.owner_approved_by)) ?? null)
        : null,
    }));
  });

export const getPayoutDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertPermission(context, "payouts.view");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [{ data: rows, error }, { data: notifications }] = await Promise.all([
      context.supabase
        .from("payout_requests" as never)
        .select(payoutSelect)
        .order("created_at", { ascending: false })
        .limit(25),
      context.supabase
        .from("payout_notifications" as never)
        .select("id,event_type,title,body,amount,created_at,read_at")
        .order("created_at", { ascending: false })
        .limit(12),
    ]);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Array<{
      status: string;
      amount_requested?: number | string;
      actual_amount_paid?: number | string | null;
      processed_at?: string | null;
      created_at?: string;
    }>;
    const completedToday = list.filter(
      (row) =>
        row.status === "paid" &&
        row.processed_at &&
        new Date(row.processed_at).getTime() >= today.getTime(),
    );
    return {
      metrics: {
        pendingPayouts: list.filter((row) =>
          ["pending", "awaiting_approval", "ready_to_process"].includes(row.status),
        ).length,
        completedToday: completedToday.length,
        awaitingOwnerApproval: list.filter((row) => row.status === "awaiting_approval").length,
        totalPayoutsToday: completedToday.reduce(
          (sum, row) => sum + Number(row.actual_amount_paid ?? row.amount_requested ?? 0),
          0,
        ),
      },
      recent: rows ?? [],
      notifications: notifications ?? [],
    };
  });

export const createPayoutRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        customer_type: customerTypeSchema,
        customer_name: z.string().trim().min(2).max(120),
        brand_page: z.string().trim().min(2).max(160),
        payment_method_name: paymentMethodSchema,
        recipient_identifier: z.string().trim().min(2).max(240),
        account_holder_name: z.string().trim().min(2).max(160),
        amount_requested: z.coerce.number().positive().max(1_000_000),
        staff_note: optionalText(1200),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    assertPermission(context, "payouts.manage");
    const { supabase, userId } = context;
    const approvalRequired = data.amount_requested > 200;
    const status = approvalRequired ? "awaiting_approval" : "ready_to_process";
    const recipientDetails = [
      `Brand/Page: ${data.brand_page}`,
      `Recipient: ${data.recipient_identifier}`,
      `Account holder: ${data.account_holder_name}`,
      `Customer type: ${data.customer_type.replace(/_/g, " ")}`,
    ].join("\n");

    const { data: row, error } = await supabase
      .from("payout_requests" as never)
      .insert({
        customer_type: data.customer_type,
        customer_name: data.customer_name,
        player_name: data.customer_name,
        brand_page: data.brand_page,
        payment_method_name: data.payment_method_name,
        recipient_identifier: data.recipient_identifier,
        account_holder_name: data.account_holder_name,
        recipient_details: recipientDetails,
        amount: data.amount_requested,
        amount_requested: data.amount_requested,
        staff_note: data.staff_note,
        note: data.staff_note,
        status,
        approval_required: approvalRequired,
        created_by: userId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const payoutId = (row as { id: string }).id;

    await supabase.from("audit_logs").insert({
      staff_id: userId,
      action: "payout.create",
      entity_type: "payout_request",
      entity_id: payoutId,
      metadata: {
        amount: data.amount_requested,
        customer_name: data.customer_name,
        brand_page: data.brand_page,
        method: data.payment_method_name,
        approval_required: approvalRequired,
      },
    });

    await notifyOwners(supabase, {
      payoutId,
      eventType: "created",
      title: `New payout request: ${data.customer_name}`,
      body: `${data.customer_name} requested $${data.amount_requested.toFixed(2)} via ${data.payment_method_name} for ${data.brand_page}.`,
      amount: data.amount_requested,
    });
    if (approvalRequired) {
      await notifyOwners(supabase, {
        payoutId,
        eventType: "approval_required",
        title: `Owner approval needed: $${data.amount_requested.toFixed(2)}`,
        body: `${data.customer_name}'s payout is above $200 and requires Super Admin approval before staff can process it.`,
        amount: data.amount_requested,
      });
    }
    return row;
  });

export const approvePayoutRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    assertPermission(context, "payouts.manage");
    if (!isSuperAdmin(context)) throw new Error("Super Admin approval is required");
    const { supabase, userId } = context;
    const { data: payout, error: fetchError } = await supabase
      .from("payout_requests" as never)
      .select("id,status,amount_requested,customer_name")
      .eq("id", data.id)
      .maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (!payout) throw new Error("Payout not found");
    if ((payout as { status: string }).status !== "awaiting_approval") {
      throw new Error("Only payouts awaiting approval can be approved");
    }

    const { error } = await supabase
      .from("payout_requests" as never)
      .update({
        status: "ready_to_process",
        owner_approved_by: userId,
        owner_approved_at: new Date().toISOString(),
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabase.from("audit_logs").insert({
      staff_id: userId,
      action: "payout.approve",
      entity_type: "payout_request",
      entity_id: data.id,
      metadata: { amount: (payout as { amount_requested?: number | string }).amount_requested },
    });
    await notifyOwners(supabase, {
      payoutId: data.id,
      eventType: "approved",
      title: "Payout approved",
      body: `${(payout as { customer_name?: string }).customer_name ?? "Customer"} is approved and ready to process.`,
      amount: Number((payout as { amount_requested?: number | string }).amount_requested ?? 0),
    });
    return { ok: true };
  });

export const processPayoutViaCspay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        actual_amount_paid: z.coerce.number().positive().max(1_000_000).optional().nullable(),
        proof_screenshot_url: optionalText(1000),
        processing_note: optionalText(1200),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    assertPermission(context, "payouts.manage");
    const { supabase, userId } = context;
    const { data: payout, error: fetchError } = await supabase
      .from("payout_requests" as never)
      .select(
        "id,status,amount_requested,customer_name,brand_page,payment_method_name,recipient_identifier,account_holder_name,approval_required,cspay_order_id",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (!payout) throw new Error("Payout not found");

    const row = payout as {
      id: string;
      status: string;
      amount_requested?: number | string;
      customer_name?: string;
      brand_page?: string;
      payment_method_name?: string;
      recipient_identifier?: string;
      account_holder_name?: string;
      approval_required?: boolean;
      cspay_order_id?: string | null;
    };
    if (row.cspay_order_id) throw new Error("This payout has already been sent to CSPay");
    if (!["ready_to_process", "awaiting_approval"].includes(row.status)) {
      throw new Error(`Payout is not ready for CSPay processing: ${row.status}`);
    }
    if (row.status === "awaiting_approval" && !isSuperAdmin(context)) {
      throw new Error("Super Admin approval is required before this payout can be processed");
    }
    if (
      Number(row.amount_requested ?? 0) > 200 &&
      row.status !== "ready_to_process" &&
      !isSuperAdmin(context)
    ) {
      throw new Error("Super Admin approval is required for payouts above $200");
    }

    const amount = Number(data.actual_amount_paid ?? row.amount_requested ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Actual amount paid is required");
    const amountCents = Math.round(amount * 100);
    if (amountCents <= 0) throw new Error("Actual amount paid is required");
    if (!row.recipient_identifier) throw new Error("Recipient information is required");

    const {
      createCspayPayout,
      cspayWebhookBaseUrl,
      normalizeCspayPayoutRecipient,
      resolveCspayPayoutMethod,
    } = await import("@/lib/cspay.server");
    const method = resolveCspayPayoutMethod(row.payment_method_name ?? "");
    if (!method)
      throw new Error(`Unsupported CSPay payout method: ${row.payment_method_name ?? "Unknown"}`);

    const request = (await import("@tanstack/react-start/server")).getRequest();
    const baseUrl = cspayWebhookBaseUrl(request);
    const mchOrderNo = `PO-${row.id.slice(0, 8)}-${Date.now()}`;
    const sentAt = new Date().toISOString();

    try {
      const result = await createCspayPayout({
        userId: row.id,
        amountCents,
        mchOrderNo,
        buyerTag: normalizeCspayPayoutRecipient(row.recipient_identifier, method),
        notifyUrl: `${baseUrl}/api/payouts/cspay/webhook`,
        clientIp: request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1",
        payWay: method.payWay,
        description: `Cosmo Stakes payout for ${row.account_holder_name || row.customer_name || method.label}`,
      });

      const { error } = await supabase
        .from("payout_requests" as never)
        .update({
          status: "pending",
          actual_amount_paid: amount,
          reference_number: result.payOrderId,
          proof_screenshot_url: data.proof_screenshot_url,
          processing_note: data.processing_note,
          note: data.processing_note ?? null,
          processed_by: userId,
          processed_at: sentAt,
          cspay_mch_order_no: result.mchOrderNo,
          cspay_order_id: result.payOrderId,
          cspay_pay_way: method.payWay,
          cspay_provider_status: "submitted",
          cspay_payload: result.raw,
          cspay_error: null,
          cspay_sent_at: sentAt,
          cspay_checked_at: sentAt,
        } as never)
        .eq("id", data.id);
      if (error) throw new Error(error.message);

      await supabase.from("audit_logs").insert({
        staff_id: userId,
        action: "payout.cspay_submitted",
        entity_type: "payout_request",
        entity_id: data.id,
        metadata: {
          amount_requested: row.amount_requested,
          actual_amount_paid: amount,
          customer_name: row.customer_name,
          cspay_mch_order_no: result.mchOrderNo,
          cspay_order_id: result.payOrderId,
          cspay_pay_way: method.payWay,
        },
      });

      await notifyOwners(supabase, {
        payoutId: data.id,
        eventType: "created",
        title: `CSPay payout submitted: ${row.customer_name}`,
        body: `${row.customer_name} was submitted to CSPay for $${amount.toFixed(2)} via ${method.label}. CSPay order: ${result.payOrderId}.`,
        amount,
      });

      return { ok: true, status: "pending", cspayOrderId: result.payOrderId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await supabase
        .from("payout_requests" as never)
        .update({
          status: "failed",
          actual_amount_paid: null,
          reference_number: null,
          proof_screenshot_url: data.proof_screenshot_url,
          processing_note: data.processing_note,
          note: data.processing_note ?? null,
          processed_by: userId,
          processed_at: sentAt,
          cspay_mch_order_no: mchOrderNo,
          cspay_pay_way: method.payWay,
          cspay_provider_status: "submit_failed",
          cspay_error: message,
          cspay_sent_at: sentAt,
          cspay_checked_at: sentAt,
        } as never)
        .eq("id", data.id);
      await notifyOwners(supabase, {
        payoutId: data.id,
        eventType: "failed",
        title: `CSPay payout failed: ${row.customer_name}`,
        body: `${row.customer_name}'s $${amount.toFixed(2)} payout could not be sent through CSPay. ${message}`,
        amount,
      });
      throw new Error(message);
    }
  });

export const updatePayoutStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["failed", "rejected"]),
        actual_amount_paid: z.coerce.number().nonnegative().max(1_000_000).optional().nullable(),
        reference_number: optionalText(240),
        proof_screenshot_url: optionalText(1000),
        processing_note: optionalText(1200),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    assertPermission(context, "payouts.manage");
    const { supabase, userId } = context;
    const { data: payout, error: fetchError } = await supabase
      .from("payout_requests" as never)
      .select(
        "id,status,amount_requested,customer_name,brand_page,payment_method_name,staff_note,approval_required",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (!payout) throw new Error("Payout not found");

    const row = payout as {
      status: string;
      amount_requested?: number | string;
      customer_name?: string;
      brand_page?: string;
      payment_method_name?: string;
      approval_required?: boolean;
    };
    if (!["ready_to_process", "awaiting_approval", "pending"].includes(row.status)) {
      throw new Error(`Payout is already ${row.status}`);
    }
    if (row.status === "awaiting_approval" && !isSuperAdmin(context)) {
      throw new Error("Super Admin approval is required before this payout can be processed");
    }
    const processedAt = new Date().toISOString();
    const { error } = await supabase
      .from("payout_requests" as never)
      .update({
        status: data.status,
        actual_amount_paid: null,
        reference_number: data.reference_number,
        proof_screenshot_url: data.proof_screenshot_url,
        processing_note: data.processing_note,
        note: data.processing_note ?? null,
        processed_by: userId,
        processed_at: processedAt,
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      staff_id: userId,
      action: `payout.${data.status}`,
      entity_type: "payout_request",
      entity_id: data.id,
      metadata: {
        amount_requested: row.amount_requested,
        customer_name: row.customer_name,
      },
    });

    await notifyOwners(supabase, {
      payoutId: data.id,
      eventType: data.status,
      title: `Payout ${data.status}: ${row.customer_name}`,
      body: `${row.customer_name}'s payout for ${row.brand_page ?? "Cosmo Stakes"} was marked ${data.status}.`,
      amount: Number(row.amount_requested ?? 0),
    });

    return { ok: true };
  });

export const listPayoutNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertPermission(context, "payouts.view");
    const { data, error } = await context.supabase
      .from("payout_notifications" as never)
      .select(
        "id,payout_id,event_type,title,body,amount,email_status,email_error,read_at,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
