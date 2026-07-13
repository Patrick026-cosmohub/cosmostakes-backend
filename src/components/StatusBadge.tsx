import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-warning/10 text-warning ring-warning/20",
    approved: "bg-success/10 text-success ring-success/20",
    rejected: "bg-danger/10 text-danger ring-danger/20",
    failed: "bg-danger/10 text-danger ring-danger/20",
    uncertain: "bg-muted text-muted-foreground ring-border",
    active: "bg-success/10 text-success ring-success/20",
    suspended: "bg-warning/10 text-warning ring-warning/20",
    blocked: "bg-danger/10 text-danger ring-danger/20",
    pending_kyc: "bg-muted text-muted-foreground ring-border",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ring-1",
        styles[status] ?? "bg-muted text-muted-foreground ring-border",
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}
