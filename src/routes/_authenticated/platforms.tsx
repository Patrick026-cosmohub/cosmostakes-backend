import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPlatformsOverview } from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtUSD } from "@/lib/format";
import {
  Gamepad2,
  Users,
  ArrowDownToLine,
  ArrowUpFromLine,
  Wallet,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/platforms")({
  component: PlatformsPage,
});

function PlatformsPage() {
  const fetchOverview = useServerFn(getPlatformsOverview);
  const q = useQuery({ queryKey: ["platforms-overview"], queryFn: () => fetchOverview() });

  if (q.isLoading)
    return <div className="p-6 text-sm text-muted-foreground">Loading platforms…</div>;
  if (q.error)
    return <div className="p-6 text-sm text-destructive">Failed: {(q.error as Error).message}</div>;

  const { platforms, totals } = q.data!;

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Gaming Platforms</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Unified overview of all {totals.platforms} hosted game platforms — players, deposits,
          cashouts, and profit per platform.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi icon={Gamepad2} label="Platforms" value={String(totals.platforms)} />
        <Kpi icon={Users} label="Total Players" value={String(totals.players)} />
        <Kpi icon={ArrowDownToLine} label="Total IN" value={fmtUSD(totals.in)} tone="success" />
        <Kpi
          icon={ArrowUpFromLine}
          label="Total OUT"
          value={fmtUSD(totals.out)}
          tone="destructive"
        />
        <Kpi
          icon={totals.profit >= 0 ? TrendingUp : TrendingDown}
          label="Net Profit"
          value={fmtUSD(totals.profit)}
          tone={totals.profit >= 0 ? "success" : "destructive"}
        />
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {platforms.map((p) => {
          const share = totals.out > 0 ? (p.out / totals.out) * 100 : 0;
          return (
            <Card key={p.id} className="bg-surface border-border">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Gamepad2 className="size-4 text-primary" />
                      {p.name}
                    </CardTitle>
                    <CardDescription className="text-[11px]">{p.provider ?? "—"}</CardDescription>
                  </div>
                  <Badge variant={p.is_active ? "default" : "secondary"} className="text-[10px]">
                    {p.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <Row label="Players" value={`${p.players} (${p.activePlayers} active)`} />
                <Row label="Player balances" value={fmtUSD(p.balance)} />
                <Row label="Money IN" value={fmtUSD(p.in)} tone="success" />
                <Row label="Money OUT" value={fmtUSD(p.out)} tone="destructive" />
                <Row
                  label="Profit"
                  value={fmtUSD(p.profit)}
                  tone={p.profit >= 0 ? "success" : "destructive"}
                  bold
                />
                <Row label="Pending deposit" value={fmtUSD(p.pendingDeposits)} />
                <Row label="Pending cashout" value={fmtUSD(p.pendingCashouts)} />
                <div className="pt-2 border-t border-border">
                  <div className="flex justify-between text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                    <span>Share of cashouts</span>
                    <span>{share.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 bg-surface-hover rounded">
                    <div
                      className="h-1.5 bg-primary rounded"
                      style={{ width: `${Math.min(100, share)}%` }}
                    />
                  </div>
                </div>
                <div className="pt-2 flex gap-2">
                  <Link to="/players" className="text-[11px] text-primary hover:underline">
                    View players →
                  </Link>
                  <Link to="/reports" className="text-[11px] text-primary hover:underline">
                    Reports →
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="bg-surface border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">All Platforms — Comparison</CardTitle>
          <CardDescription className="text-xs">
            Sorted by money out (highest payout first).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Platform</TableHead>
                <TableHead className="text-right">Players</TableHead>
                <TableHead className="text-right">Balances</TableHead>
                <TableHead className="text-right">IN</TableHead>
                <TableHead className="text-right">OUT</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...platforms]
                .sort((a, b) => b.out - a.out)
                .map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-right">{p.players}</TableCell>
                    <TableCell className="text-right">{fmtUSD(p.balance)}</TableCell>
                    <TableCell className="text-right text-success">{fmtUSD(p.in)}</TableCell>
                    <TableCell className="text-right text-destructive">{fmtUSD(p.out)}</TableCell>
                    <TableCell
                      className={`text-right font-medium ${p.profit >= 0 ? "text-success" : "text-destructive"}`}
                    >
                      {fmtUSD(p.profit)}
                    </TableCell>
                    <TableCell className="text-right text-warning">
                      {fmtUSD(p.pendingDeposits + p.pendingCashouts)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={p.is_active ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {p.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any;
  label: string;
  value: string;
  tone?: "success" | "destructive";
}) {
  return (
    <Card className="bg-surface border-border">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
          <Icon className="size-3.5" />
          {label}
        </div>
        <div
          className={`mt-1.5 text-lg font-semibold ${tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : ""}`}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  tone,
  bold,
}: {
  label: string;
  value: string;
  tone?: "success" | "destructive";
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`${bold ? "font-semibold" : ""} ${tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
