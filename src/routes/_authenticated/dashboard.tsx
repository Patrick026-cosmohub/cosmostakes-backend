import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboard, decideRequest } from "@/lib/admin.functions";
import { fmtUSD, fmtRelative } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { ArrowDownToLine, ArrowUpFromLine, Users, TrendingUp } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const fetchDash = useServerFn(getDashboard);
  const decide = useServerFn(decideRequest);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDash() });

  const mut = useMutation({
    mutationFn: (vars: {
      kind: "deposit" | "cashout";
      id: string;
      decision: "approved" | "rejected";
    }) => decide({ data: vars }),
    onSuccess: (_d, v) => {
      toast.success(`${v.kind === "deposit" ? "Deposit" : "Cashout"} ${v.decision}`);
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) {
    return <div className="p-8 text-sm text-muted-foreground">Loading dashboard…</div>;
  }

  const kpis = [
    {
      label: "Pending Loads",
      value: data.kpis.pendingDepositCount,
      sub: fmtUSD(data.kpis.pendingDepositTotal),
      icon: ArrowDownToLine,
      tone: "text-warning",
    },
    {
      label: "Pending Cashouts",
      value: data.kpis.pendingCashoutCount,
      sub: fmtUSD(data.kpis.pendingCashoutTotal),
      icon: ArrowUpFromLine,
      tone: "text-primary",
    },
    {
      label: "Today's Volume",
      value: fmtUSD(data.kpis.todayVolume),
      sub: "Wallet movement",
      icon: TrendingUp,
      tone: "text-success",
    },
    {
      label: "Active Players",
      value: data.kpis.activePlayers.toLocaleString(),
      sub: "Status: active",
      icon: Users,
      tone: "text-foreground",
    },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
        <p className="text-xs text-muted-foreground">Operational overview · live data</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="bg-surface border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {k.label}
                </span>
                <Icon className={`size-4 ${k.tone}`} />
              </div>
              <div className="text-2xl font-mono font-semibold">{k.value}</div>
              <div className="text-[10px] text-muted-foreground mt-1">{k.sub}</div>
            </div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <QueueCard
            title="Pending Deposits"
            kind="deposit"
            rows={data.pendingDeposits}
          />
          <QueueCard
            title="Pending Cashouts"
            kind="cashout"
            rows={data.pendingCashouts}
            onDecide={(id, decision) => mut.mutate({ kind: "cashout", id, decision })}
            pending={mut.isPending}
          />
        </div>
        <div className="bg-surface border border-border rounded-xl">
          <div className="p-4 border-b border-border">
            <h2 className="text-xs font-bold uppercase tracking-widest">Recent Staff Activity</h2>
          </div>
          <ul className="divide-y divide-border/50">
            {data.activity.length === 0 && (
              <li className="p-4 text-xs text-muted-foreground">No activity yet.</li>
            )}
            {data.activity.map((a) => (
              <li key={a.id} className="p-3 text-xs flex gap-3">
                <span className="size-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div>
                    <span className="font-medium">
                      {a.staff?.full_name || a.staff?.email || "System"}
                    </span>{" "}
                    <span className="text-muted-foreground">·</span>{" "}
                    <span className="font-mono text-[11px]">{a.action}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {fmtRelative(a.created_at)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

type Row = {
  id: string;
  amount: number | string;
  status: string;
  requested_at: string;
  player: { username: string; full_name: string | null } | null;
};

function QueueCard({
  title,
  kind,
  rows,
  onDecide,
  pending,
}: {
  title: string;
  kind: "deposit" | "cashout";
  rows: Row[];
  onDecide?: (id: string, decision: "approved" | "rejected") => void;
  pending?: boolean;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-widest">{title}</h2>
        <span className="text-[10px] text-muted-foreground">{rows.length} waiting</span>
      </div>
      {rows.length === 0 ? (
        <div className="p-6 text-xs text-muted-foreground text-center">Queue is clear.</div>
      ) : (
        <ul className="divide-y divide-border/50">
          {rows.map((r) => (
            <li key={r.id} className="p-3 flex items-center gap-3 hover:bg-surface-hover/40">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">
                  {r.player?.username ?? "—"}
                  {r.player?.full_name && (
                    <span className="text-muted-foreground font-normal text-xs ml-1.5">
                      ({r.player.full_name})
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                  {fmtRelative(r.requested_at)} · {kind.toUpperCase()}
                </div>
              </div>
              <div className="font-mono text-sm tabular-nums">{fmtUSD(r.amount as number)}</div>
              <StatusBadge status={r.status} />
              {onDecide && (
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => onDecide(r.id, "rejected")}
                  >
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => onDecide(r.id, "approved")}
                    className="shadow-[var(--shadow-glow)]"
                  >
                    Approve
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
