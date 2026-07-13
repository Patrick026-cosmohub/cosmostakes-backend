import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { CreditCard, ExternalLink } from "lucide-react";
import { listPaymentRequests } from "@/lib/payment-ops.functions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtRelative, fmtUSD } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/payments")({
  component: PaymentsPage,
});

type StatusFilter = "all" | "pending" | "succeeded" | "failed";
type ProviderFilter = "all" | "cspay" | "zappay";
const STATUSES: StatusFilter[] = ["pending", "succeeded", "failed", "all"];

type PaymentRow = {
  id: string;
  provider: "cspay" | "zappay";
  provider_order_id: string;
  provider_payment_id: string | null;
  player_name: string;
  game_username: string;
  amount_usd: number | string;
  amount_cents: number;
  pay_way: string | null;
  pay_url: string | null;
  provider_status: string;
  wallet_credited: boolean;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

function PaymentsPage() {
  const fetchPayments = useServerFn(listPaymentRequests);
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [provider, setProvider] = useState<ProviderFilter>("all");

  const paymentsQ = useQuery({
    queryKey: ["public-provider-payment-requests", status, provider],
    queryFn: () => fetchPayments({ data: { status, provider } }),
  });
  const rows = (paymentsQ.data ?? []) as PaymentRow[];

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => {
          const amount = Number(row.amount_usd ?? 0);
          acc.count += 1;
          acc.total += amount;
          if (isPendingStatus(row.provider_status)) acc.pending += amount;
          if (isSucceededStatus(row.provider_status)) acc.succeeded += amount;
          if (isFailedStatus(row.provider_status)) acc.failed += amount;
          return acc;
        },
        { count: 0, total: 0, pending: 0, succeeded: 0, failed: 0 },
      ),
    [rows],
  );

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <CreditCard className="size-5 text-primary" /> Payments
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Public /pay CSPay and ZapPay orders, tracked from provider callbacks.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <select
            className="h-8 rounded-md border border-border bg-surface px-2 text-xs capitalize"
            value={provider}
            onChange={(event) => setProvider(event.target.value as ProviderFilter)}
          >
            <option value="all">All providers</option>
            <option value="cspay">CSPay</option>
            <option value="zappay">ZapPay</option>
          </select>
          <div className="flex gap-1 bg-surface border border-border rounded-md p-0.5">
            {STATUSES.map((item) => (
              <button
                key={item}
                onClick={() => setStatus(item)}
                className={cn(
                  "px-2.5 py-1 text-xs rounded capitalize",
                  status === item
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Summary label="Orders" value={String(totals.count)} sub={`${status} filter`} />
        <Summary label="Visible total" value={fmtUSD(totals.total)} sub="current filter" />
        <Summary label="Pending" value={fmtUSD(totals.pending)} sub="awaiting callback" tone="warning" />
        <Summary label="Succeeded" value={fmtUSD(totals.succeeded)} sub="provider confirmed" tone="success" />
        <Summary label="Failed" value={fmtUSD(totals.failed)} sub="failed or expired" tone="danger" />
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Order</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Created</TableHead>
                <TableHead className="text-right">Completed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paymentsQ.isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    Loading payments...
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    No payment requests in this filter.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="text-sm font-medium">{row.player_name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {row.game_username}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-semibold uppercase">{row.provider}</div>
                      <div className="text-[10px] text-muted-foreground">{row.pay_way || "checkout"}</div>
                    </TableCell>
                    <TableCell className="max-w-[260px]">
                      <div className="font-mono text-[11px] break-all">{row.provider_order_id}</div>
                      {row.provider_payment_id && (
                        <div className="mt-1 text-[10px] text-muted-foreground break-all">
                          Provider: {row.provider_payment_id}
                        </div>
                      )}
                      {row.pay_url && (
                        <a
                          href={row.pay_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          Checkout <ExternalLink className="size-3" />
                        </a>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {fmtUSD(row.amount_usd as number)}
                    </TableCell>
                    <TableCell>
                      <ProviderBadge status={row.provider_status} />
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {fmtRelative(row.created_at)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {row.completed_at ? fmtRelative(row.completed_at) : "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Summary({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "success" | "warning" | "danger";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <div
          className={cn(
            "text-lg font-semibold tabular-nums mt-1",
            tone === "success" && "text-success",
            tone === "warning" && "text-warning",
            tone === "danger" && "text-destructive",
          )}
        >
          {value}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
      </CardContent>
    </Card>
  );
}

function ProviderBadge({ status }: { status: string }) {
  const cls =
    isSucceededStatus(status)
      ? "border-success/30 text-success bg-success/10"
      : isFailedStatus(status)
        ? "border-destructive/30 text-destructive bg-destructive/10"
        : "border-warning/30 text-warning bg-warning/10";
  return (
    <Badge variant="outline" className={cn("uppercase tracking-wider text-[10px]", cls)}>
      {statusLabel(status)}
    </Badge>
  );
}

function isPendingStatus(status: string) {
  return status === "creating" || status === "pending";
}

function isSucceededStatus(status: string) {
  return status === "paid" || status === "completed";
}

function isFailedStatus(status: string) {
  return status === "failed" || status === "expired" || status === "amount_mismatch";
}

function statusLabel(status: string) {
  if (isSucceededStatus(status)) return "succeeded";
  if (isFailedStatus(status)) return status === "amount_mismatch" ? "amount mismatch" : status;
  return "pending";
}
