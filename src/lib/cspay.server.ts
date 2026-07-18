import crypto from "node:crypto";

type CspayPayWay = "STRIPE_PC" | "PP_PC" | "CHIME" | "ZELLE";

export type CspayPayoutMethod = {
  payWay: CspayPayWay;
  label: "Cash App" | "PayPal" | "Chime" | "Zelle";
  tagLike: boolean;
};

export type CspayPayoutResult = {
  mchOrderNo: string;
  payOrderId: string;
  amount: number;
  raw: unknown;
};

export type CspayPayoutStatusResult = {
  payOrderId: string;
  mchOrderNo: string;
  amount: number;
  state: string;
  notifyState: string;
  feeAmount: number | null;
  raw: unknown;
};

const PAYOUT_METHODS: Record<string, CspayPayoutMethod> = {
  cashapp: { payWay: "STRIPE_PC", label: "Cash App", tagLike: true },
  "cash app": { payWay: "STRIPE_PC", label: "Cash App", tagLike: true },
  paypal: { payWay: "PP_PC", label: "PayPal", tagLike: false },
  chime: { payWay: "CHIME", label: "Chime", tagLike: true },
  zelle: { payWay: "ZELLE", label: "Zelle", tagLike: false },
};

function getConfig() {
  const mchNo = process.env.CSPAY_MCH_NO?.trim();
  const signKey = process.env.CSPAY_SIGN_KEY?.trim();
  const rawBase = process.env.CSPAY_API_BASE_URL?.trim();
  if (!mchNo) throw new Error("CSPAY_MCH_NO is not configured");
  if (!signKey) throw new Error("CSPAY_SIGN_KEY is not configured");
  if (!rawBase) throw new Error("CSPAY_API_BASE_URL is not configured");

  let apiBase: string;
  try {
    const parsed = new URL(rawBase);
    apiBase = `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    apiBase = rawBase.split("?")[0].replace(/\/$/, "");
  }
  return { mchNo, signKey, apiBase };
}

function parseResponseData(data: any): any {
  if (typeof data?.data === "string") {
    try {
      return JSON.parse(data.data);
    } catch {
      throw new Error("CSPay returned invalid response data");
    }
  }
  return data?.data ?? {};
}

async function postCspaySigned(path: string, body: Record<string, string | number>) {
  const { mchNo, signKey, apiBase } = getConfig();
  const signedBody: Record<string, string | number> = {
    mchNo,
    signType: "MD5",
    timestamp: Date.now(),
    ...body,
  };
  signedBody.sign = cspaySign(signedBody, signKey);

  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(signedBody),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`CSPay ${path} HTTP ${response.status}: ${await response.text()}`);
  }

  const payload = (await response.json()) as any;
  if (payload.code !== 0) {
    throw new Error(`CSPay ${path} failed: ${payload.msg || JSON.stringify(payload)}`);
  }

  return { payload, data: parseResponseData(payload) };
}

export function cspaySign(
  params: Record<string, string | number | undefined | null>,
  signKey: string,
) {
  const entries = Object.entries(params)
    .filter(([key, value]) => key !== "sign" && value != null && String(value) !== "")
    .map(([key, value]) => `${key}=${value}&`);
  entries.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  return crypto
    .createHash("md5")
    .update(entries.join("") + `key=${signKey}`, "utf8")
    .digest("hex")
    .toUpperCase();
}

export function verifyCspayWebhook(params: Record<string, string>) {
  const signKey = process.env.CSPAY_SIGN_KEY?.trim();
  const incoming = params.sign?.toUpperCase();
  if (!signKey || !incoming) return false;
  return cspaySign(params, signKey) === incoming;
}

export function resolveCspayPayoutMethod(method: string): CspayPayoutMethod | null {
  const normalized = method.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  return PAYOUT_METHODS[normalized] ?? null;
}

export function normalizeCspayPayoutRecipient(recipient: string, method: CspayPayoutMethod) {
  const trimmed = recipient.trim();
  if (!method.tagLike || trimmed.startsWith("$")) return trimmed;
  return `$${trimmed}`;
}

export function cspayWebhookBaseUrl(request?: Request) {
  if (process.env.CSPAY_WEBHOOK_BASE_URL?.trim()) {
    return process.env.CSPAY_WEBHOOK_BASE_URL.trim().replace(/\/$/, "");
  }
  if (!request) return "https://payout.cosmostakes.net";
  const proto =
    request.headers.get("x-forwarded-proto") || new URL(request.url).protocol.replace(":", "");
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "payout.cosmostakes.net";
  return `${proto}://${host}`.replace(/\/$/, "");
}

export async function createCspayPayout(params: {
  userId: string;
  amountCents: number;
  mchOrderNo: string;
  buyerTag: string;
  notifyUrl: string;
  description: string;
  payWay: CspayPayWay;
  clientIp?: string;
}): Promise<CspayPayoutResult> {
  const { mchNo, signKey, apiBase } = getConfig();
  const body: Record<string, string | number> = {
    mchNo,
    mchOrderNo: params.mchOrderNo,
    amount: params.amountCents,
    payWay: params.payWay,
    mchUserId: params.userId,
    buyerTag: params.buyerTag,
    clientIp: params.clientIp || "127.0.0.1",
    notifyUrl: params.notifyUrl,
    description: params.description,
    signType: "MD5",
    timestamp: Date.now(),
  };
  body.sign = cspaySign(body, signKey);

  const response = await fetch(`${apiBase}/api/pay/paymentOrder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`CSPay payout HTTP ${response.status}: ${await response.text()}`);
  }

  const payload = (await response.json()) as any;
  if (payload.code !== 0) {
    throw new Error(`CSPay payout failed: ${payload.msg || JSON.stringify(payload)}`);
  }

  const data = parseResponseData(payload);
  return {
    mchOrderNo: params.mchOrderNo,
    payOrderId: String(data.payOrderId || data.orderId || ""),
    amount: Number(data.amount || params.amountCents),
    raw: payload,
  };
}

export async function queryCspayPayout(payOrderId: string): Promise<CspayPayoutStatusResult> {
  const { payload, data } = await postCspaySigned("/api/pay/queryPaymentOrder", { payOrderId });
  return {
    payOrderId: String(data.payOrderId || payOrderId),
    mchOrderNo: String(data.mchOrderNo || ""),
    amount: Number(data.amount || 0),
    state: String(data.state ?? ""),
    notifyState: String(data.notifyState ?? ""),
    feeAmount:
      data.feeAmount === null || data.feeAmount === undefined ? null : Number(data.feeAmount),
    raw: payload,
  };
}
