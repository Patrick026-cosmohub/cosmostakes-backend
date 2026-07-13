import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTransactions } from "@/lib/portal.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { fmtUSD, fmtDateTime } from "@/lib/format";
import { Receipt, Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/transactions")({
  component: TransactionsPage,
});

type Row = {
  id: string;
  kind: "deposit" | "cashout";
  amount: number;
  status: string;
  requested_at: string;
  processed_at: string | null;
  reference: string | null;
  player: { id: string; username: string; full_name: string | null; game_id: string | null } | null;
  method: { name: string; kind: string } | null;
};

function TransactionsPage() {
  const fn = useServerFn(listTransactions);
  const [kind, setKind] = useState<"all" | "deposit" | "cashout">("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [days, setDays] = useState(30);

  const query = useQuery({
    queryKey: ["transactions", kind, status, q, days],
    queryFn: () => fn({ data: { kind, status, q, days } }),
  });
  const rows = (query.data ?? []) as Row[];

  const exportCsv = () => {
    const headers = [
      "kind",
      "amount",
      "status",
      "requested_at",
      "processed_at",
      "player",
      "game_id",
      "method",
      "reference",
    ];
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        [
          r.kind,
          r.amount,
          r.status,
          r.requested_at,
          r.processed_at ?? "",
          r.player?.username ?? "",
          r.player?.game_id ?? "",
          r.method?.name ?? "",
          r.reference ?? "",
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `transactions-${Date.now()}.csv`;
    a.click();
  };

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Receipt className="size-5 text-primary" /> Transactions
          </h1>
          <p className="text-xs text-muted-foreground">
            Unified deposits + cashouts with advanced filters and export.
          </p>
        </div>
        <Button onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="size-4 mr-1" /> CSV
        </Button>
      </div>

      <Card>
        <CardContent className="p-3 grid grid-cols-2 md:grid-cols-4 gap-2">
          <Input
            placeholder="Search player, ref…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kinds</SelectItem>
              <SelectItem value="deposit">Deposits</SelectItem>
              <SelectItem value="cashout">Cashouts</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["all", "pending", "approved", "rejected", "failed", "uncertain"].map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[7, 30, 90, 180, 365].map((d) => (
                <SelectItem key={d} value={String(d)}>
                  Last {d} days
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Player</TableHead>
                <TableHead>Game ID</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.kind}-${r.id}`}>
                  <TableCell className="text-xs">{fmtDateTime(r.requested_at)}</TableCell>
                  <TableCell>
                    <Badge variant={r.kind === "deposit" ? "default" : "secondary"}>{r.kind}</Badge>
                  </TableCell>
                  <TableCell>{r.player?.username ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.player?.game_id ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.method?.name ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{fmtUSD(r.amount)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && !query.isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                    No transactions match.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
