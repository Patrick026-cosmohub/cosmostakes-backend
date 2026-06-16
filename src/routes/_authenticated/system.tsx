import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSystemStatus } from "@/lib/portal.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckCircle2, XCircle } from "lucide-react";
import { fmtRelative } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/system")({ component: SystemPage });

function SystemPage() {
  const fn = useServerFn(getSystemStatus);
  const q = useQuery({ queryKey: ["sys-status"], queryFn: () => fn(), refetchInterval: 15000 });
  const d = q.data;

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2"><Activity className="size-5 text-primary" /> System Status</h1>
        <p className="text-xs text-muted-foreground">Live infrastructure & integration health (auto-refresh 15s).</p>
      </div>

      {d && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <HealthCard name="Database" ok={d.db.ok} latency={d.db.latencyMs} note={d.db.error} />
            <HealthCard name="Auth" ok={d.auth.ok} note={d.auth.note} />
            <HealthCard name="Storage" ok={d.storage.ok} latency={d.storage.latencyMs} note={d.storage.error} />
          </div>

          <Card>
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold mb-3">Platform API integrations</h2>
              <ul className="divide-y divide-border/50">
                {(d.integrations as unknown as Array<{ id: string; connection_status: string | null; last_test_at: string | null; game: { name: string } | null }>).map((i) => (
                  <li key={i.id} className="py-2 flex items-center gap-3 text-sm">
                    <Badge variant={i.connection_status === "connected" ? "default" : i.connection_status === "error" ? "destructive" : "secondary"}>{i.connection_status ?? "—"}</Badge>
                    <span className="font-medium">{i.game?.name ?? "Unknown"}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{i.last_test_at ? fmtRelative(i.last_test_at) : "never tested"}</span>
                  </li>
                ))}
                {(d.integrations as unknown[]).length === 0 && <li className="py-4 text-xs text-muted-foreground text-center">No integrations configured.</li>}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function HealthCard({ name, ok, latency, note }: { name: string; ok: boolean; latency?: number; note?: string | null }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        {ok ? <CheckCircle2 className="size-6 text-success" /> : <XCircle className="size-6 text-destructive" />}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">{name}</div>
          <div className="text-[10px] text-muted-foreground font-mono">
            {latency !== undefined ? `${latency}ms · ` : ""}{note ?? (ok ? "Healthy" : "Down")}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}