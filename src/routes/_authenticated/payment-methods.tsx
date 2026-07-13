import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type React from "react";
import { ArrowDownToLine, ArrowUpFromLine, CreditCard, Smartphone, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listPaymentMethodStats } from "@/lib/admin.functions";
import { fmtUSD } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/payment-methods")({
  component: PaymentMethodsPage,
});

type Bucket = {
  count: number;
  total: number;
  pending: number;
  pendingTotal: number;
  approved: number;
  approvedTotal: number;
  rejected: number;
};
type MethodRow = {
  id: string;
  name: string;
  kind: string;
  is_active: boolean;
  deposits: Bucket;
  cashouts: Bucket;
};

const PUBLIC_PROVIDERS = [
  { name: "CSPay", detail: "Cash App, Apple Pay, Google Pay, and card checkout", icon: Smartphone },
  { name: "ZapPay", detail: "Hosted card checkout", icon: Zap },
];

function PaymentMethodsPage() {
  const fetchStats = useServerFn(listPaymentMethodStats);
  const q = useQuery({ queryKey: ["payment-method-stats"], queryFn: () => fetchStats() });
  const rows = (q.data ?? []) as MethodRow[];

  const totals = rows.reduce(
    (acc, row) => {
      acc.depCount += row.deposits.count;
      acc.depTotal += row.deposits.total;
      acc.outCount += row.cashouts.count;
      acc.outTotal += row.cashouts.total;
      return acc;
    },
    { depCount: 0, depTotal: 0, outCount: 0, outTotal: 0 },
  );

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Payment Methods</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Public /pay uses the same provider checkout methods as the player wallet.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {PUBLIC_PROVIDERS.map((provider) => {
          const Icon = provider.icon;
          return (
            <Card key={provider.name}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="size-9 rounded-md bg-primary/10 border border-primary/20 grid place-items-center text-primary">
                    <Icon className="size-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{provider.name}</CardTitle>
                    <CardDescription>{provider.detail}</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Total deposits" sub={`${totals.depCount} requests`} value={fmtUSD(totals.depTotal)} tone="success" />
        <SummaryCard label="Total cashouts" sub={`${totals.outCount} requests`} value={fmtUSD(totals.outTotal)} tone="warning" />
        <SummaryCard label="Active methods" sub="existing ledger" value={`${rows.filter((r) => r.is_active && r.id !== "__unassigned__").length}`} />
        <SummaryCard label="Net flow" sub="deposits minus cashouts" value={fmtUSD(totals.depTotal - totals.outTotal)} />
      </div>

      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No payment method ledger rows yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((method) => (
            <Card key={method.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="size-9 rounded-md bg-primary/10 border border-primary/20 grid place-items-center text-primary">
                    <CreditCard className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base flex items-center gap-2">
                      {method.name}
                      {!method.is_active && (
                        <span className="text-[9px] uppercase tracking-widest text-muted-foreground border border-border px-1 rounded">
                          off
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription className="text-[10px] uppercase tracking-widest">
                      {method.kind}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <Section
                  icon={<ArrowDownToLine className="size-3.5 text-success" />}
                  label="Deposits in"
                  bucket={method.deposits}
                  tone="success"
                />
                <Section
                  icon={<ArrowUpFromLine className="size-3.5 text-warning" />}
                  label="Cashouts out"
                  bucket={method.cashouts}
                  tone="warning"
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  sub,
  value,
  tone,
}: {
  label: string;
  sub: string;
  value: string;
  tone?: "success" | "warning";
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
          )}
        >
          {value}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
      </CardContent>
    </Card>
  );
}

function Section({
  icon,
  label,
  bucket,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  bucket: Bucket;
  tone: "success" | "warning";
}) {
  return (
    <div className="rounded-md border border-border bg-surface/50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className={cn("text-sm font-semibold tabular-nums", tone === "success" ? "text-success" : "text-warning")}>
          {fmtUSD(bucket.total)}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <Stat label="Pending" value={bucket.pending} sub={fmtUSD(bucket.pendingTotal)} />
        <Stat label="Approved" value={bucket.approved} sub={fmtUSD(bucket.approvedTotal)} />
        <Stat label="Rejected" value={bucket.rejected} sub={`${bucket.count} total`} />
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="rounded border border-border/60 bg-background/60 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      <div className="text-[9px] text-muted-foreground truncate">{sub}</div>
    </div>
  );
}
