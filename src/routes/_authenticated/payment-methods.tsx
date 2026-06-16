import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPaymentMethodStats } from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { fmtUSD } from "@/lib/format";
import { ArrowDownToLine, ArrowUpFromLine, CreditCard, Banknote, Bitcoin, Smartphone } from "lucide-react";
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

function iconFor(kind: string) {
  if (kind === "crypto") return Bitcoin;
  if (kind === "bank") return Banknote;
  if (kind === "card") return CreditCard;
  if (kind === "p2p") return Smartphone;
  return CreditCard;
}

function PaymentMethodsPage() {
  const fetchStats = useServerFn(listPaymentMethodStats);
  const q = useQuery({ queryKey: ["payment-method-stats"], queryFn: () => fetchStats() });
  const rows = (q.data ?? []) as MethodRow[];

  const totals = rows.reduce(
    (acc, r) => {
      acc.depCount += r.deposits.count;
      acc.depTotal += r.deposits.total;
      acc.outCount += r.cashouts.count;
      acc.outTotal += r.cashouts.total;
      return acc;
    },
    { depCount: 0, depTotal: 0, outCount: 0, outTotal: 0 },
  );

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Payment Methods</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Each payment method tracked separately, with deposit and cashout volume.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Total deposits" sub={`${totals.depCount} requests`} value={fmtUSD(totals.depTotal)} tone="success" />
        <SummaryCard label="Total cashouts" sub={`${totals.outCount} requests`} value={fmtUSD(totals.outTotal)} tone="warning" />
        <SummaryCard label="Active methods" sub="enabled" value={`${rows.filter((r) => r.is_active && r.id !== "__unassigned__").length}`} />
        <SummaryCard label="Net flow" sub="deposits − cashouts" value={fmtUSD(totals.depTotal - totals.outTotal)} />
      </div>

      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No payment methods yet.</CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((m) => {
            const Icon = iconFor(m.kind);
            return (
              <Card key={m.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="size-9 rounded-md bg-primary/10 border border-primary/20 grid place-items-center text-primary">
                      <Icon className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base flex items-center gap-2">
                        {m.name}
                        {!m.is_active && (
                          <span className="text-[9px] uppercase tracking-widest text-muted-foreground border border-border px-1 rounded">
                            off
                          </span>
                        )}
                      </CardTitle>
                      <CardDescription className="text-[10px] uppercase tracking-widest">
                        {m.kind}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <Section
                    icon={<ArrowDownToLine className="size-3.5 text-success" />}
                    label="Deposits in"
                    bucket={m.deposits}
                    tone="success"
                  />
                  <Section
                    icon={<ArrowUpFromLine className="size-3.5 text-warning" />}
                    label="Cashouts out"
                    bucket={m.cashouts}
                    tone="warning"
                  />
                </CardContent>
              </Card>
            );
          })}
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