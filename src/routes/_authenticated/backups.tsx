import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { exportTableCsv } from "@/lib/portal.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Database, Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/backups")({ component: BackupsPage });

const TABLES = [
  "players", "deposit_requests", "cashout_requests", "wallet_ledger",
  "audit_logs", "bonuses", "vip_tiers", "announcements",
] as const;

function BackupsPage() {
  const fn = useServerFn(exportTableCsv);
  const m = useMutation({
    mutationFn: (table: (typeof TABLES)[number]) => fn({ data: { table } }),
    onSuccess: (res, table) => {
      if (!res.csv) return toast.info(`${table} is empty`);
      const blob = new Blob([res.csv], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${table}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      toast.success(`${table}: ${res.rows} rows exported`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2"><Database className="size-5 text-primary" /> Backups & Export</h1>
        <p className="text-xs text-muted-foreground">Manual CSV exports. Lovable Cloud handles point-in-time backups automatically.</p>
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {TABLES.map((t) => (
              <Button
                key={t}
                variant="outline"
                disabled={m.isPending}
                onClick={() => m.mutate(t)}
                className="justify-start"
              >
                <Download className="size-3 mr-2" /> {t}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 text-xs space-y-2 text-muted-foreground">
          <h3 className="font-semibold text-foreground text-sm">Restore & PITR</h3>
          <p>Lovable Cloud maintains automatic point-in-time recovery for the database. Restoring is an infrastructure operation — contact Lovable support with the target timestamp.</p>
          <p>For ad-hoc imports, drop a CSV into a migration via the staff team.</p>
        </CardContent>
      </Card>
    </div>
  );
}