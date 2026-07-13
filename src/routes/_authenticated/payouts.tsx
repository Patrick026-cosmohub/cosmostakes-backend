import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type React from "react";
import { useMemo, useState } from "react";
import {
  Bell,
  Check,
  Clock3,
  FileCheck2,
  History,
  Search,
  ShieldCheck,
  WalletCards,
  XCircle,
} from "lucide-react";
import { getMe } from "@/lib/admin.functions";
import {
  createPayoutRequest,
  listPayoutRequests,
  updatePayoutStatus,
} from "@/lib/payment-ops.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtDateTime, fmtRelative, fmtUSD, type Role } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/payouts")({
  component: PayoutsPage,
});

type StatusFilter = "all" | "pending" | "sent" | "failed" | "cancelled";
type PortalView = "dashboard" | "new" | "approval" | "history" | "notifications";
type PaymentMethod = "Cash App" | "PayPal" | "Chime" | "Zelle";

const PAYMENT_METHODS: { value: PaymentMethod; mark: string; className: string }[] = [
  { value: "Cash App", mark: "$", className: "bg-[#00c244]" },
  { value: "PayPal", mark: "P", className: "bg-[#0070ba]" },
  { value: "Chime", mark: "C", className: "bg-[#20bfa3]" },
  { value: "Zelle", mark: "Z", className: "bg-[#6d1ed4]" },
];

type PayoutRow = {
  id: string;
  player_name: string;
  amount: number | string;
  payment_method_name: string | null;
  recipient_details: string;
  note: string | null;
  status: StatusFilter;
  created_by: string | null;
  processed_by: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
};

type FormState = {
  customerName: string;
  brand: string;
  paymentMethod: PaymentMethod;
  recipient: string;
  accountHolder: string;
  requestedAmount: string;
  actualAmount: string;
  referenceNumber: string;
  proofUrl: string;
  note: string;
};

function PayoutsPage() {
  const fetchMe = useServerFn(getMe);
  const fetchPayouts = useServerFn(listPayoutRequests);
  const createPayout = useServerFn(createPayoutRequest);
  const setStatus = useServerFn(updatePayoutStatus);
  const qc = useQueryClient();
  const [view, setView] = useState<PortalView>("dashboard");
  const [status, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [actionNotes, setActionNotes] = useState<Record<string, string>>({});
  const [form, setForm] = useState<FormState>({
    customerName: "",
    brand: "",
    paymentMethod: "Cash App",
    recipient: "",
    accountHolder: "",
    requestedAmount: "",
    actualAmount: "",
    referenceNumber: "",
    proofUrl: "",
    note: "",
  });

  const meQ = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const payoutsQ = useQuery({
    queryKey: ["payout-requests", status],
    queryFn: () => fetchPayouts({ data: { status } }),
  });
  const roles = (meQ.data?.roles ?? []) as Role[];
  const isSuperAdmin = roles.includes("super_admin");
  const rows = ((payoutsQ.data ?? []) as PayoutRow[]).filter((row) =>
    searchRows(row, search),
  );

  const metrics = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        const amount = Number(row.amount ?? 0);
        acc.total += amount;
        if (row.status === "pending") acc.pending += 1;
        if (row.status === "pending" && amount > 200) acc.approval += 1;
        if (row.status === "sent") acc.paid += amount;
        return acc;
      },
      { total: 0, pending: 0, approval: 0, paid: 0 },
    );
  }, [rows]);

  const createMutation = useMutation({
    mutationFn: () => {
      const recipientDetails = [
        `Brand/Page: ${form.brand}`,
        `Recipient: ${form.recipient}`,
        `Account holder: ${form.accountHolder}`,
        form.actualAmount ? `Actual amount paid: ${fmtUSD(form.actualAmount)}` : null,
        form.referenceNumber ? `Reference: ${form.referenceNumber}` : null,
        form.proofUrl ? `Proof screenshot: ${form.proofUrl}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      return createPayout({
        data: {
          player_name: form.customerName,
          amount: Number(form.requestedAmount),
          payment_method_name: form.paymentMethod,
          recipient_details: recipientDetails,
          note: form.note,
        },
      });
    },
    onSuccess: () => {
      toast.success("Payout request created");
      setForm({
        customerName: "",
        brand: "",
        paymentMethod: "Cash App",
        recipient: "",
        accountHolder: "",
        requestedAmount: "",
        actualAmount: "",
        referenceNumber: "",
        proofUrl: "",
        note: "",
      });
      setView("approval");
      qc.invalidateQueries({ queryKey: ["payout-requests"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; status: "sent" | "failed" | "cancelled" }) =>
      setStatus({ data: { ...vars, note: actionNotes[vars.id] ?? "" } }),
    onSuccess: (_data, vars) => {
      toast.success(vars.status === "sent" ? "Payout marked paid" : `Payout marked ${vars.status}`);
      qc.invalidateQueries({ queryKey: ["payout-requests"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const approvalRows = rows.filter((row) => row.status === "pending");
  const historyRows = rows.filter((row) => row.status !== "pending");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 lg:px-6">
          <div className="flex items-center gap-3">
            <img
              src="/cosmo-logo.jpeg"
              alt="Cosmo Stakes"
              className="size-12 rounded-xl border border-warning/30 object-cover shadow-[0_0_28px_-8px_rgba(255,215,109,.8)]"
            />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-warning">
                payout.cosmostakes.net
              </p>
              <h1 className="text-xl font-semibold tracking-tight">Staff Payout Portal</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1.5 text-xs font-semibold text-success">
            <ShieldCheck className="size-4" />
            Protected staff workspace
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-6">
        <aside className="space-y-2">
          {[
            ["dashboard", "Payout Dashboard", WalletCards],
            ["new", "New Payout", FileCheck2],
            ["approval", "Approval Queue", Clock3],
            ["history", "Payout History", History],
            ["notifications", "Notifications", Bell],
          ].map(([key, label, Icon]) => (
            <button
              key={String(key)}
              onClick={() => setView(key as PortalView)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                view === key
                  ? "border-warning/30 bg-warning/10 text-warning"
                  : "border-transparent text-muted-foreground hover:border-border hover:bg-surface",
              )}
            >
              <Icon className="size-4" />
              {String(label)}
            </button>
          ))}
        </aside>

        <main className="min-w-0 space-y-5">
          {view === "dashboard" && (
            <>
              <MetricGrid
                pending={metrics.pending}
                approval={metrics.approval}
                paid={metrics.paid}
                total={metrics.total}
              />
              <PayoutTable
                title="Recent payout activity"
                rows={rows.slice(0, 8)}
                loading={payoutsQ.isLoading}
                isSuperAdmin={isSuperAdmin}
                actionNotes={actionNotes}
                setActionNotes={setActionNotes}
                statusMutation={statusMutation}
              />
            </>
          )}

          {view === "new" && (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <Card className="overflow-hidden border-border/80 bg-card/90">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-warning/15 to-primary/15 px-5 py-4">
                  <div>
                    <h2 className="font-semibold">New payout request</h2>
                    <p className="text-xs text-muted-foreground">
                      Payouts above $200 require Super Admin approval.
                    </p>
                  </div>
                  <Badge className="bg-warning/15 text-warning hover:bg-warning/15">
                    Approval rule active
                  </Badge>
                </div>
                <CardContent className="p-5">
                  <form
                    className="space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      createMutation.mutate();
                    }}
                  >
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Customer name">
                        <Input
                          value={form.customerName}
                          onChange={(e) => setFormValue(setForm, "customerName", e.target.value)}
                          required
                          minLength={2}
                        />
                      </Field>
                      <Field label="Facebook/page or brand">
                        <Input
                          value={form.brand}
                          onChange={(e) => setFormValue(setForm, "brand", e.target.value)}
                          required
                        />
                      </Field>
                      <Field label="Payment method">
                        <select
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={form.paymentMethod}
                          onChange={(e) =>
                            setFormValue(setForm, "paymentMethod", e.target.value as PaymentMethod)
                          }
                        >
                          {PAYMENT_METHODS.map((method) => (
                            <option key={method.value} value={method.value}>
                              {method.value}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <div className="grid grid-cols-2 gap-2 self-end sm:grid-cols-4">
                        {PAYMENT_METHODS.map((method) => (
                          <div
                            key={method.value}
                            className={cn(
                              "flex min-h-10 items-center gap-2 rounded-lg border px-2 text-xs font-semibold",
                              form.paymentMethod === method.value
                                ? "border-warning/40 bg-warning/10 text-foreground"
                                : "border-border bg-background/40 text-muted-foreground",
                            )}
                          >
                            <span
                              className={cn(
                                "grid size-6 shrink-0 place-items-center rounded-md text-[11px] font-black text-white",
                                method.className,
                              )}
                            >
                              {method.mark}
                            </span>
                            <span className="truncate">{method.value}</span>
                          </div>
                        ))}
                      </div>
                      <Field label="Cash tag, email, or phone">
                        <Input
                          value={form.recipient}
                          onChange={(e) => setFormValue(setForm, "recipient", e.target.value)}
                          required
                        />
                      </Field>
                      <Field label="Account-holder name">
                        <Input
                          value={form.accountHolder}
                          onChange={(e) => setFormValue(setForm, "accountHolder", e.target.value)}
                          required
                        />
                      </Field>
                      <Field label="Payout amount">
                        <Input
                          type="number"
                          min="1"
                          step="0.01"
                          value={form.requestedAmount}
                          onChange={(e) =>
                            setFormValue(setForm, "requestedAmount", e.target.value)
                          }
                          required
                        />
                      </Field>
                      <Field label="Actual amount paid">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.actualAmount}
                          onChange={(e) => setFormValue(setForm, "actualAmount", e.target.value)}
                        />
                      </Field>
                      <Field label="Transaction/reference number">
                        <Input
                          value={form.referenceNumber}
                          onChange={(e) =>
                            setFormValue(setForm, "referenceNumber", e.target.value)
                          }
                        />
                      </Field>
                      <Field label="Proof-of-payment screenshot link">
                        <Input
                          value={form.proofUrl}
                          onChange={(e) => setFormValue(setForm, "proofUrl", e.target.value)}
                          placeholder="https://..."
                        />
                      </Field>
                    </div>
                    <Field label="Internal note">
                      <Textarea
                        value={form.note}
                        onChange={(e) => setFormValue(setForm, "note", e.target.value)}
                        placeholder="Private staff note"
                      />
                    </Field>
                    <div className="rounded-xl border border-success/25 bg-success/10 p-3 text-sm">
                      <strong className="text-success">
                        {Number(form.requestedAmount || 0) > 200
                          ? "This request will require Super Admin approval."
                          : "This request may be processed by authorized staff."}
                      </strong>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Staff cannot delete payout records or bypass the $200 approval rule.
                      </p>
                    </div>
                    <Button className="w-full shadow-[var(--shadow-glow)]" disabled={createMutation.isPending}>
                      {createMutation.isPending ? "Creating..." : "Create payout request"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="border-border/80 bg-card/90">
                <CardContent className="space-y-4 p-5">
                  <div className="rounded-2xl border border-white/15 bg-gradient-to-br from-primary/35 via-background to-warning/20 p-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-warning">
                      Ready to save
                    </p>
                    <div className="mt-8 text-4xl font-semibold">
                      {fmtUSD(form.requestedAmount || 0)}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {form.paymentMethod} payout request
                    </p>
                  </div>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>Payout ID is generated automatically.</li>
                    <li>Created and processed staff IDs are logged.</li>
                    <li>Paid, rejected, and failed records remain searchable.</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          )}

          {view === "approval" && (
            <PayoutTable
              title="Approval queue"
              rows={approvalRows}
              loading={payoutsQ.isLoading}
              isSuperAdmin={isSuperAdmin}
              actionNotes={actionNotes}
              setActionNotes={setActionNotes}
              statusMutation={statusMutation}
            />
          )}

          {view === "history" && (
            <Card className="border-border/80 bg-card/90">
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">Payout history</h2>
                    <p className="text-xs text-muted-foreground">
                      Search by customer, staff ID, brand, method, amount, date, and status.
                    </p>
                  </div>
                  <div className="relative w-full sm:w-80">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search payouts"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["all", "pending", "sent", "failed", "cancelled"] as StatusFilter[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs capitalize",
                        status === s
                          ? "border-warning/40 bg-warning/10 text-warning"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {s === "sent" ? "paid" : s === "cancelled" ? "rejected" : s}
                    </button>
                  ))}
                </div>
                <PayoutTable
                  title=""
                  rows={historyRows}
                  loading={payoutsQ.isLoading}
                  isSuperAdmin={isSuperAdmin}
                  actionNotes={actionNotes}
                  setActionNotes={setActionNotes}
                  statusMutation={statusMutation}
                  embedded
                />
              </CardContent>
            </Card>
          )}

          {view === "notifications" && (
            <div className="grid gap-4 md:grid-cols-3">
              <NotificationCard title="Email" detail="New and completed payout alerts for Super Admin." />
              <NotificationCard
                title="Browser"
                detail="Chrome notification permission can be enabled on this staff device."
                action
              />
              <NotificationCard title="In-app" detail="Portal alerts appear in the admin notification center." />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function MetricGrid({
  pending,
  approval,
  paid,
  total,
}: {
  pending: number;
  approval: number;
  paid: number;
  total: number;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Pending" value={String(pending)} sub="Open payout requests" />
      <Metric label="Awaiting Approval" value={String(approval)} sub="Above $200" />
      <Metric label="Paid" value={fmtUSD(paid)} sub="Completed in this view" tone="success" />
      <Metric label="Visible Total" value={fmtUSD(total)} sub="Current filter total" tone="warning" />
    </div>
  );
}

function Metric({
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
    <Card className="border-border/80 bg-card/90">
      <CardContent className="p-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </div>
        <div
          className={cn(
            "mt-1 text-2xl font-semibold tabular-nums",
            tone === "success" && "text-success",
            tone === "warning" && "text-warning",
          )}
        >
          {value}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}

function PayoutTable({
  title,
  rows,
  loading,
  isSuperAdmin,
  actionNotes,
  setActionNotes,
  statusMutation,
  embedded,
}: {
  title: string;
  rows: PayoutRow[];
  loading: boolean;
  isSuperAdmin: boolean;
  actionNotes: Record<string, string>;
  setActionNotes: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  statusMutation: ReturnType<typeof useMutation<any, Error, { id: string; status: "sent" | "failed" | "cancelled" }>>;
  embedded?: boolean;
}) {
  const body = (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Payout ID</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Brand / recipient</TableHead>
            <TableHead>Method</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Note</TableHead>
            <TableHead className="text-right">Date</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                Loading payouts...
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                No payout records found.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => {
              const amount = Number(row.amount ?? 0);
              const needsApproval = row.status === "pending" && amount > 200;
              const canProcess = row.status === "pending" && (!needsApproval || isSuperAdmin);
              return (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{shortId(row.id)}</TableCell>
                  <TableCell className="font-medium">{row.player_name}</TableCell>
                  <TableCell className="max-w-[320px] whitespace-pre-wrap text-xs text-muted-foreground">
                    {row.recipient_details}
                  </TableCell>
                  <TableCell>{row.payment_method_name || "Manual"}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums text-warning">
                    {fmtUSD(row.amount)}
                  </TableCell>
                  <TableCell>
                    <PayoutStatus row={row} />
                  </TableCell>
                  <TableCell className="min-w-[220px]">
                    {row.status === "pending" ? (
                      <Textarea
                        className="min-h-14 text-xs"
                        value={actionNotes[row.id] ?? ""}
                        onChange={(e) =>
                          setActionNotes((current) => ({ ...current, [row.id]: e.target.value }))
                        }
                        placeholder="Optional processing note"
                      />
                    ) : (
                      <div className="whitespace-pre-wrap text-xs text-muted-foreground">
                        {row.note || "-"}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    <div>{fmtRelative(row.created_at)}</div>
                    <div>{fmtDateTime(row.processed_at || row.created_at)}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    {row.status === "pending" ? (
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 border-success/30 text-success hover:bg-success/10"
                          disabled={!canProcess || statusMutation.isPending}
                          title={!canProcess ? "Super Admin approval required" : "Mark paid"}
                          onClick={() => statusMutation.mutate({ id: row.id, status: "sent" })}
                        >
                          <Check className="size-3.5" /> Paid
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={statusMutation.isPending}
                          onClick={() => statusMutation.mutate({ id: row.id, status: "failed" })}
                        >
                          Failed
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 border-destructive/30 text-destructive hover:bg-destructive/10"
                          disabled={statusMutation.isPending}
                          onClick={() => statusMutation.mutate({ id: row.id, status: "cancelled" })}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {row.processed_at ? fmtRelative(row.processed_at) : "-"}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );

  if (embedded) return body;
  return (
    <Card className="border-border/80 bg-card/90">
      <CardContent className="space-y-4 p-5">
        {title && <h2 className="font-semibold">{title}</h2>}
        {body}
      </CardContent>
    </Card>
  );
}

function PayoutStatus({ row }: { row: PayoutRow }) {
  const amount = Number(row.amount ?? 0);
  const label =
    row.status === "sent"
      ? "Paid"
      : row.status === "cancelled"
        ? "Rejected"
        : row.status === "failed"
          ? "Failed"
          : amount > 200
            ? "Awaiting Approval"
            : "Ready to Process";
  const cls =
    row.status === "sent"
      ? "border-success/30 bg-success/10 text-success"
      : row.status === "failed" || row.status === "cancelled"
        ? "border-destructive/30 bg-destructive/10 text-destructive"
        : amount > 200
          ? "border-warning/30 bg-warning/10 text-warning"
          : "border-primary/30 bg-primary/10 text-primary";
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap text-[10px] uppercase tracking-wider", cls)}>
      {label}
    </Badge>
  );
}

function NotificationCard({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: boolean;
}) {
  return (
    <Card className="border-border/80 bg-card/90">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Bell className="size-4 text-warning" />
          <h2 className="font-semibold">{title}</h2>
        </div>
        <p className="text-sm text-muted-foreground">{detail}</p>
        {action && (
          <Button
            variant="outline"
            onClick={() => {
              if (!("Notification" in window)) {
                toast.error("Browser notifications are not supported here");
                return;
              }
              window.Notification.requestPermission().then((permission) => {
                toast.info(`Browser notification permission: ${permission}`);
              });
            }}
          >
            Enable browser notifications
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function setFormValue<K extends keyof FormState>(
  setForm: React.Dispatch<React.SetStateAction<FormState>>,
  key: K,
  value: FormState[K],
) {
  setForm((current) => ({ ...current, [key]: value }));
}

function shortId(id: string) {
  return `PO-${id.slice(0, 8).toUpperCase()}`;
}

function searchRows(row: PayoutRow, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    row.id,
    row.player_name,
    row.amount,
    row.payment_method_name,
    row.recipient_details,
    row.note,
    row.status,
    row.created_by,
    row.processed_by,
    row.created_at,
    row.processed_at,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}
