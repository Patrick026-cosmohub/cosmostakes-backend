import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listRequests, decideRequest } from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtUSD, fmtRelative } from "@/lib/format";
import {
  ArrowDownToLine,
  Bitcoin,
  Banknote,
  CreditCard,
  Smartphone,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/deposits")({
  component: DepositsPage,
});

type DepositRow = {
  id: string;
  amount: number | string;
  status: string;
  reference: string | null;
  notes: string | null;
  requested_at: string;
  processed_at: string | null;
  player: { id: string; username: string; full_name: string | null; game_id: string | null } | null;
  method: { name: string; kind: string } | null;
};

const STATUSES = ["all", "pending", "approved", "rejected"] as const;
type StatusFilter = (typeof STATUSES)[number];

function iconFor(kind: string | undefined) {
  if (kind === "crypto") return Bitcoin;
  if (kind === "bank") return Banknote;
  if (kind === "card") return CreditCard;
  if (kind === "p2p") return Smartphone;
  return CreditCard;
}

function DepositsPage() {
  const fetchRequests = useServerFn(listRequests);
  const decide = useServerFn(decideRequest);
  const qc = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>("pending");

  const q = useQuery({
    queryKey: ["deposits", status],
    queryFn: () => fetchRequests({ data: { kind: "deposit", status } }),
  });
  const rows = (q.data ?? []) as DepositRow[];

  const decideMutation = useMutation({
    mutationFn: (vars: { id: string; decision: "approved" | "rejected" }) =>
      decide({ data: { kind: "deposit", id: vars.id, decision: vars.decision } }),
    onSuccess: (_, vars) => {
      toast.success(`Deposit ${vars.decision}`);
      qc.invalidateQueries({ queryKey: ["deposits"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Group by payment method name
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { name: string; kind: string; rows: DepositRow[]; total: number; pendingTotal: number; approvedTotal: number }
    >();
    rows.forEach((r) => {
      const key = r.method?.name ?? "Unassigned";
      const kind = r.method?.kind ?? "other";
      if (!map.has(key)) {
        map.set(key, { name: key, kind, rows: [], total: 0, pendingTotal: 0, approvedTotal: 0 });
      }
      const g = map.get(key)!;
      const amt = Number(r.amount);
      g.rows.push(r);
      g.total += amt;
      if (r.status === "pending") g.pendingTotal += amt;
      if (r.status === "approved") g.approvedTotal += amt;
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [rows]);

  const totals = useMemo(() => {
    const t = { count: rows.length, total: 0, pending: 0, approved: 0 };
    rows.forEach((r) => {
      const amt = Number(r.amount);
      t.total += amt;
      if (r.status === "pending") t.pending += amt;
      if (r.status === "approved") t.approved += amt;
    });
    return t;
  }, [rows]);

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <ArrowDownToLine className="size-5 text-success" /> Deposits
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Grouped by payment method. Each section shows how much has been deposited via that channel.
          </p>
        </div>
        <div className="flex gap-1 bg-surface border border-border rounded-md p-0.5">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                "px-2.5 py-1 text-xs rounded capitalize",
                status === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Summary label="Requests" value={String(totals.count)} sub={`${status} filter`} />
        <Summary label="Total volume" value={fmtUSD(totals.total)} sub="all selected" tone="success" />
        <Summary label="Pending" value={fmtUSD(totals.pending)} sub="awaiting review" tone="warning" />
        <Summary label="Approved" value={fmtUSD(totals.approved)} sub="settled into wallets" tone="success" />
      </div>

      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No deposits in this filter.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map((g) => {
            const Icon = iconFor(g.kind);
            return (
              <Card key={g.name}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="size-9 rounded-md bg-primary/10 border border-primary/20 grid place-items-center text-primary">
                      <Icon className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base">{g.name}</CardTitle>
                      <CardDescription className="text-[10px] uppercase tracking-widest">
                        {g.kind} · {g.rows.length} request{g.rows.length === 1 ? "" : "s"}
                      </CardDescription>
                    </div>
                    <div className="flex gap-4 text-right">
                      <Mini label="Total" value={fmtUSD(g.total)} />
                      <Mini label="Pending" value={fmtUSD(g.pendingTotal)} tone="warning" />
                      <Mini label="Approved" value={fmtUSD(g.approvedTotal)} tone="success" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Player</TableHead>
                        <TableHead>Game ID</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Requested</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {g.rows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>
                            <div className="font-medium text-sm">{r.player?.username ?? "—"}</div>
                            <div className="text-[11px] text-muted-foreground">{r.player?.full_name ?? ""}</div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.player?.game_id ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.reference ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums font-semibold text-success">
                            {fmtUSD(r.amount as number)}
                          </TableCell>
                          <TableCell>
                            <StatusPill status={r.status} />
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {fmtRelative(r.requested_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.status === "pending" ? (
                              <div className="flex gap-1 justify-end">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-success border-success/30 hover:bg-success/10"
                                  disabled={decideMutation.isPending}
                                  onClick={() => decideMutation.mutate({ id: r.id, decision: "approved" })}
                                >
                                  <Check className="size-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                                  disabled={decideMutation.isPending}
                                  onClick={() => decideMutation.mutate({ id: r.id, decision: "rejected" })}
                                >
                                  <X className="size-3" />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">
                                {r.processed_at ? fmtRelative(r.processed_at) : "—"}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
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

function Mini({ label, value, tone }: { label: string; value: string; tone?: "success" | "warning" }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div
        className={cn(
          "text-sm font-semibold tabular-nums",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "approved"
      ? "border-success/30 text-success bg-success/10"
      : status === "rejected" || status === "failed"
        ? "border-destructive/30 text-destructive bg-destructive/10"
        : status === "pending"
          ? "border-warning/30 text-warning bg-warning/10"
          : "border-border text-muted-foreground bg-surface";
  return (
    <span className={cn("text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border", cls)}>
      {status}
    </span>
  );
}