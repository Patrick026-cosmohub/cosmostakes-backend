import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getFinancialReports } from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtUSD } from "@/lib/format";
import { ArrowDownToLine, ArrowUpFromLine, Wallet, TrendingUp, Trophy, Gamepad2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

type Bucket = { key: string; label: string; in: number; out: number; profit: number; holding: number };
type GameRow = {
  id: string;
  name: string;
  provider: string | null;
  in: number;
  out: number;
  profit: number;
  holding: number;
  depositCount: number;
  cashoutCount: number;
};

function ReportsPage() {
  const fetchReports = useServerFn(getFinancialReports);
  const q = useQuery({ queryKey: ["financial-reports"], queryFn: () => fetchReports() });
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");

  if (q.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading reports…</div>;
  }
  if (q.error) {
    return <div className="p-6 text-sm text-destructive">Failed: {(q.error as Error).message}</div>;
  }

  const data = q.data!;
  const series: Bucket[] = data[period];
  const perGame: GameRow[] = data.perGame;

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Financial Reports</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Daily, weekly, and monthly cashflow — money in, money out, holding, and profit. Per-game ranking sorted by cashout volume.
        </p>
      </div>

      {/* All-time + today */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI icon={ArrowDownToLine} tone="success" label="All-time IN" value={fmtUSD(data.totals.in)} sub={`Today ${fmtUSD(data.today.in)}`} />
        <KPI icon={ArrowUpFromLine} tone="warning" label="All-time OUT" value={fmtUSD(data.totals.out)} sub={`Today ${fmtUSD(data.today.out)}`} />
        <KPI icon={Wallet} label="Holding" value={fmtUSD(data.totals.holding)} sub="Net player liability" />
        <KPI
          icon={TrendingUp}
          tone={data.totals.profit >= 0 ? "success" : "destructive"}
          label="Profit"
          value={fmtUSD(data.totals.profit)}
          sub={`Today ${fmtUSD(data.today.profit)}`}
        />
      </div>

      {/* Top games */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="size-4 text-warning" /> Top games by cashout volume
          </CardTitle>
          <CardDescription>Most-paid-out game on top. Profit = deposits in − cashouts out for that game.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Game</TableHead>
                <TableHead className="text-right">In</TableHead>
                <TableHead className="text-right">Out</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead className="text-right">Deposits</TableHead>
                <TableHead className="text-right">Cashouts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perGame.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                    No settled activity yet.
                  </TableCell>
                </TableRow>
              ) : (
                perGame.map((g, i) => (
                  <TableRow key={g.id}>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-grid place-items-center size-6 rounded text-[11px] font-semibold",
                          i === 0
                            ? "bg-warning/15 text-warning border border-warning/30"
                            : i === 1
                              ? "bg-primary/10 text-primary border border-primary/20"
                              : "bg-surface border border-border text-muted-foreground",
                        )}
                      >
                        {i + 1}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Gamepad2 className="size-3.5 text-muted-foreground" />
                        <div>
                          <div className="font-medium text-sm">{g.name}</div>
                          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                            {g.provider ?? "—"}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-success">{fmtUSD(g.in)}</TableCell>
                    <TableCell className="text-right tabular-nums text-warning">{fmtUSD(g.out)}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums font-semibold",
                        g.profit >= 0 ? "text-success" : "text-destructive",
                      )}
                    >
                      {fmtUSD(g.profit)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{g.depositCount}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{g.cashoutCount}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Time-series report */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base">Cashflow report</CardTitle>
              <CardDescription>In, out, profit, and holding by period. Most recent at the bottom.</CardDescription>
            </div>
            <Tabs value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
              <TabsList>
                <TabsTrigger value="daily">Daily</TabsTrigger>
                <TabsTrigger value="weekly">Weekly</TabsTrigger>
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
              </TabsList>
              <TabsContent value="daily" />
              <TabsContent value="weekly" />
              <TabsContent value="monthly" />
            </Tabs>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{period === "daily" ? "Day" : period === "weekly" ? "Week" : "Month"}</TableHead>
                <TableHead className="text-right">In</TableHead>
                <TableHead className="text-right">Out</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead className="text-right">Holding</TableHead>
                <TableHead className="w-40">Mix</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {series.map((b) => {
                const max = Math.max(b.in, b.out, 1);
                return (
                  <TableRow key={b.key}>
                    <TableCell className="text-xs font-medium">{b.label}</TableCell>
                    <TableCell className="text-right tabular-nums text-success">{fmtUSD(b.in)}</TableCell>
                    <TableCell className="text-right tabular-nums text-warning">{fmtUSD(b.out)}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums font-semibold",
                        b.profit >= 0 ? "text-success" : "text-destructive",
                      )}
                    >
                      {fmtUSD(b.profit)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{fmtUSD(b.holding)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 items-end h-6">
                        <div
                          className="bg-success/60 rounded-sm w-3"
                          style={{ height: `${(b.in / max) * 100}%` }}
                          title={`In ${fmtUSD(b.in)}`}
                        />
                        <div
                          className="bg-warning/60 rounded-sm w-3"
                          style={{ height: `${(b.out / max) * 100}%` }}
                          title={`Out ${fmtUSD(b.out)}`}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function KPI({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  sub: string;
  tone?: "success" | "warning" | "destructive";
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center gap-2">
          <Icon
            className={cn(
              "size-3.5",
              tone === "success" && "text-success",
              tone === "warning" && "text-warning",
              tone === "destructive" && "text-destructive",
              !tone && "text-muted-foreground",
            )}
          />
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
        </div>
        <div
          className={cn(
            "text-xl font-semibold tabular-nums",
            tone === "success" && "text-success",
            tone === "warning" && "text-warning",
            tone === "destructive" && "text-destructive",
          )}
        >
          {value}
        </div>
        <div className="text-[10px] text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}