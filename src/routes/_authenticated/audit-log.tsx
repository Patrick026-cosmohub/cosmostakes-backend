import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { getFinancialReports, listAuditLogs } from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
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
  ArrowUpFromLine,
  Wallet,
  TrendingUp,
  Trophy,
  ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/audit-log")({
  component: AuditLogPage,
});

function AuditLogPage() {
  const fetchReports = useServerFn(getFinancialReports);
  const fetchLogs = useServerFn(listAuditLogs);
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [search, setSearch] = useState("");

  const r = useQuery({ queryKey: ["audit-financials"], queryFn: () => fetchReports() });
  const l = useQuery({ queryKey: ["audit-logs"], queryFn: () => fetchLogs({ data: {} }) });

  const filteredLogs = useMemo(() => {
    const rows = l.data ?? [];
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r: any) =>
        r.action?.toLowerCase().includes(s) ||
        r.entity_type?.toLowerCase().includes(s) ||
        r.staff?.full_name?.toLowerCase().includes(s) ||
        r.staff?.email?.toLowerCase().includes(s),
    );
  }, [l.data, search]);

  if (r.isLoading || l.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading audit…</div>;
  }
  if (r.error)
    return <div className="p-6 text-sm text-destructive">Failed: {(r.error as Error).message}</div>;

  const data = r.data!;
  const series = data[period] as {
    key: string;
    label: string;
    in: number;
    out: number;
    profit: number;
    holding: number;
  }[];
  const topGames = data.perGame as {
    id: string;
    name: string;
    provider: string | null;
    in: number;
    out: number;
    profit: number;
    depositCount: number;
    cashoutCount: number;
  }[];

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Audit</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Daily, weekly, and monthly audit — money in, out, holding, profit. Most cashed-out games
          ranked on top, followed by raw staff activity.
        </p>
      </div>

      {/* Today's audit */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI
          icon={ArrowDownToLine}
          tone="success"
          label="Today IN"
          value={fmtUSD(data.today.in)}
          sub={`All-time ${fmtUSD(data.totals.in)}`}
        />
        <KPI
          icon={ArrowUpFromLine}
          tone="warning"
          label="Today OUT"
          value={fmtUSD(data.today.out)}
          sub={`All-time ${fmtUSD(data.totals.out)}`}
        />
        <KPI
          icon={Wallet}
          label="Holding"
          value={fmtUSD(data.totals.holding)}
          sub="Net player liability"
        />
        <KPI
          icon={TrendingUp}
          tone={data.today.profit >= 0 ? "success" : "destructive"}
          label="Today Profit"
          value={fmtUSD(data.today.profit)}
          sub={`All-time ${fmtUSD(data.totals.profit)}`}
        />
      </div>

      {/* Top games by cashout */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="size-4 text-warning" /> Most cashed-out games
          </CardTitle>
          <CardDescription>
            Top payout game first. Used to spot heavy outflow concentration.
          </CardDescription>
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
                <TableHead className="text-right">Cashouts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topGames.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">
                    No activity yet.
                  </TableCell>
                </TableRow>
              ) : (
                topGames.map((g, i) => (
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
                      <div className="font-medium text-sm">{g.name}</div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        {g.provider ?? "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-success">
                      {fmtUSD(g.in)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-warning">
                      {fmtUSD(g.out)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums font-semibold",
                        g.profit >= 0 ? "text-success" : "text-destructive",
                      )}
                    >
                      {fmtUSD(g.profit)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {g.cashoutCount}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Daily/Weekly/Monthly audit */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base">Cashflow audit</CardTitle>
              <CardDescription>
                Per-period in / out / profit / holding. Most recent at bottom.
              </CardDescription>
            </div>
            <Tabs value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
              <TabsList>
                <TabsTrigger value="daily">Daily</TabsTrigger>
                <TabsTrigger value="weekly">Weekly</TabsTrigger>
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {period === "daily" ? "Day" : period === "weekly" ? "Week" : "Month"}
                </TableHead>
                <TableHead className="text-right">In</TableHead>
                <TableHead className="text-right">Out</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead className="text-right">Holding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {series.map((b) => (
                <TableRow key={b.key}>
                  <TableCell className="text-xs font-medium">{b.label}</TableCell>
                  <TableCell className="text-right tabular-nums text-success">
                    {fmtUSD(b.in)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-warning">
                    {fmtUSD(b.out)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums font-semibold",
                      b.profit >= 0 ? "text-success" : "text-destructive",
                    )}
                  >
                    {fmtUSD(b.profit)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {fmtUSD(b.holding)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Staff activity */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ScrollText className="size-4 text-primary" /> Staff activity
              </CardTitle>
              <CardDescription>
                Every approval, rejection, role change, and wallet adjustment. Newest first.
              </CardDescription>
            </div>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search action / staff…"
              className="w-56"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">
                    No audit entries.
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {fmtRelative(a.created_at)}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium">
                        {a.staff?.full_name ?? a.staff?.email ?? "System"}
                      </div>
                      {a.staff?.email && (
                        <div className="text-[10px] text-muted-foreground">{a.staff.email}</div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-[11px]">{a.action}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {a.entity_type ?? "—"}
                      {a.entity_id && (
                        <div className="font-mono text-[10px] truncate max-w-[160px]">
                          {a.entity_id}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground font-mono max-w-md truncate">
                      {a.metadata ? JSON.stringify(a.metadata) : ""}
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
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {label}
          </span>
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
