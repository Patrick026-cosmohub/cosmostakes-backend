import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type React from "react";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Check,
  ChevronRight,
  Clock3,
  FileCheck2,
  History,
  Mail,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  WalletCards,
  XCircle,
} from "lucide-react";
import { getMe } from "@/lib/admin.functions";
import {
  approvePayoutRequest,
  createPayoutRequest,
  getPayoutDashboard,
  listPayoutNotifications,
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

type PortalView = "dashboard" | "new" | "approval" | "history" | "notifications";
type CustomerType =
  | "website_player"
  | "facebook_customer"
  | "messenger_customer"
  | "external_customer";
type PaymentMethod = "Cash App" | "PayPal" | "Chime" | "Zelle";
type PayoutStatus =
  | "pending"
  | "awaiting_approval"
  | "ready_to_process"
  | "paid"
  | "rejected"
  | "failed";

type StaffMini = {
  id: string;
  email: string | null;
  full_name: string | null;
  username: string | null;
};

type PayoutRow = {
  id: string;
  customer_type: CustomerType | null;
  customer_name: string | null;
  player_name: string;
  brand_page: string | null;
  payment_method_name: PaymentMethod | string | null;
  recipient_identifier: string | null;
  account_holder_name: string | null;
  recipient_details: string | null;
  amount: number | string;
  amount_requested: number | string | null;
  actual_amount_paid: number | string | null;
  reference_number: string | null;
  proof_screenshot_url: string | null;
  staff_note: string | null;
  note: string | null;
  processing_note: string | null;
  status: PayoutStatus;
  approval_required: boolean | null;
  owner_approved_by: string | null;
  owner_approved_at: string | null;
  created_by: string | null;
  processed_by: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
  created_staff?: StaffMini | null;
  processed_staff?: StaffMini | null;
  approved_staff?: StaffMini | null;
};

type PayoutNotification = {
  id: string;
  event_type: string;
  title: string;
  body: string;
  amount: number | string | null;
  email_status: string;
  email_error: string | null;
  read_at: string | null;
  created_at: string;
};

type FormState = {
  customerType: CustomerType;
  customerName: string;
  brandPage: string;
  paymentMethod: PaymentMethod;
  recipient: string;
  accountHolder: string;
  amount: string;
  note: string;
};

type ProcessState = {
  actualAmount: string;
  referenceNumber: string;
  proofUrl: string;
  note: string;
};

type HistoryFilters = {
  customer: string;
  brand: string;
  staff: string;
  method: "all" | PaymentMethod;
  status: "all" | PayoutStatus;
  date: string;
};

const PAYMENT_METHODS: { value: PaymentMethod; mark: string; className: string }[] = [
  { value: "Cash App", mark: "$", className: "bg-[#00c244]" },
  { value: "PayPal", mark: "P", className: "bg-[#0070ba]" },
  { value: "Chime", mark: "C", className: "bg-[#20bfa3]" },
  { value: "Zelle", mark: "Z", className: "bg-[#6d1ed4]" },
];

const CUSTOMER_TYPES: { value: CustomerType; label: string; detail: string }[] = [
  { value: "website_player", label: "Website player", detail: "Known site account" },
  { value: "facebook_customer", label: "Facebook customer", detail: "Page conversation" },
  { value: "messenger_customer", label: "Messenger customer", detail: "Messenger thread" },
  { value: "external_customer", label: "External customer", detail: "No site account" },
];

const EMPTY_FORM: FormState = {
  customerType: "external_customer",
  customerName: "",
  brandPage: "",
  paymentMethod: "Cash App",
  recipient: "",
  accountHolder: "",
  amount: "",
  note: "",
};

const EMPTY_PROCESS: ProcessState = {
  actualAmount: "",
  referenceNumber: "",
  proofUrl: "",
  note: "",
};

function PayoutsPage() {
  const fetchMe = useServerFn(getMe);
  const fetchDashboard = useServerFn(getPayoutDashboard);
  const fetchPayouts = useServerFn(listPayoutRequests);
  const fetchNotifications = useServerFn(listPayoutNotifications);
  const createPayout = useServerFn(createPayoutRequest);
  const approvePayout = useServerFn(approvePayoutRequest);
  const setPayoutStatus = useServerFn(updatePayoutStatus);
  const qc = useQueryClient();

  const [view, setView] = useState<PortalView>("dashboard");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [selectedRow, setSelectedRow] = useState<PayoutRow | null>(null);
  const [processForm, setProcessForm] = useState<ProcessState>(EMPTY_PROCESS);
  const [historyFilters, setHistoryFilters] = useState<HistoryFilters>({
    customer: "",
    brand: "",
    staff: "",
    method: "all",
    status: "all",
    date: "",
  });

  const meQ = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const dashboardQ = useQuery({
    queryKey: ["payout-dashboard"],
    queryFn: () => fetchDashboard(),
  });
  const payoutsQ = useQuery({
    queryKey: ["payout-requests"],
    queryFn: () => fetchPayouts({ data: { status: "all", search: "" } }),
  });
  const notificationsQ = useQuery({
    queryKey: ["payout-notifications"],
    queryFn: () => fetchNotifications(),
  });

  const roles = (meQ.data?.roles ?? []) as Role[];
  const canManage = roles.includes("super_admin") || roles.includes("admin") || roles.includes("finance_agent");
  const isSuperAdmin = roles.includes("super_admin");
  const rows = ((payoutsQ.data ?? []) as PayoutRow[]).map(normalizePayoutRow);
  const pendingRows = rows.filter((row) =>
    ["pending", "awaiting_approval", "ready_to_process"].includes(row.status),
  );
  const approvalRows = rows.filter((row) => row.status === "awaiting_approval");
  const historyRows = useMemo(() => filterHistory(rows, historyFilters), [rows, historyFilters]);
  const recentRows = (dashboardQ.data?.recent as PayoutRow[] | undefined)?.map(normalizePayoutRow) ?? rows.slice(0, 8);
  const notifications =
    ((notificationsQ.data ?? dashboardQ.data?.notifications ?? []) as PayoutNotification[]) ?? [];
  const metrics = dashboardQ.data?.metrics ?? buildMetrics(rows);

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["payout-dashboard"] });
    qc.invalidateQueries({ queryKey: ["payout-requests"] });
    qc.invalidateQueries({ queryKey: ["payout-notifications"] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createPayout({
        data: {
          customer_type: form.customerType,
          customer_name: form.customerName,
          brand_page: form.brandPage,
          payment_method_name: form.paymentMethod,
          recipient_identifier: form.recipient,
          account_holder_name: form.accountHolder,
          amount_requested: Number(form.amount),
          staff_note: form.note,
        },
      }),
    onSuccess: () => {
      toast.success("Payout request saved");
      if (Number(form.amount) > 200) {
        notifyBrowser("Owner approval needed", `${form.customerName} requires approval for ${fmtUSD(form.amount)}.`);
      }
      setForm(EMPTY_FORM);
      setView(Number(form.amount) > 200 ? "approval" : "dashboard");
      refreshAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => approvePayout({ data: { id } }),
    onSuccess: () => {
      toast.success("Payout approved");
      refreshAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const statusMutation = useMutation({
    mutationFn: (vars: { row: PayoutRow; status: "paid" | "failed" | "rejected" }) =>
      setPayoutStatus({
        data: {
          id: vars.row.id,
          status: vars.status,
          actual_amount_paid: vars.status === "paid" ? Number(processForm.actualAmount) : null,
          reference_number: vars.status === "paid" ? processForm.referenceNumber : null,
          proof_screenshot_url: processForm.proofUrl,
          processing_note: processForm.note,
        },
      }),
    onSuccess: (_data, vars) => {
      const message =
        vars.status === "paid"
          ? `${displayCustomer(vars.row)} paid ${fmtUSD(processForm.actualAmount)}`
          : `${displayCustomer(vars.row)} marked ${vars.status}`;
      toast.success(message);
      notifyBrowser("Payout updated", message);
      setSelectedRow(null);
      setProcessForm(EMPTY_PROCESS);
      refreshAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalHeader me={meQ.data as any} />
      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[230px_minmax(0,1fr)] lg:px-6">
        <aside className="space-y-2">
          <NavButton active={view === "dashboard"} onClick={() => setView("dashboard")} icon={WalletCards}>
            Payout Dashboard
          </NavButton>
          <NavButton active={view === "new"} onClick={() => setView("new")} icon={FileCheck2}>
            New Payout
          </NavButton>
          <NavButton active={view === "approval"} onClick={() => setView("approval")} icon={Clock3}>
            Approval Queue
          </NavButton>
          <NavButton active={view === "history"} onClick={() => setView("history")} icon={History}>
            Payout History
          </NavButton>
          <NavButton active={view === "notifications"} onClick={() => setView("notifications")} icon={Bell}>
            Notifications
          </NavButton>

          <div className="rounded-xl border border-warning/20 bg-warning/10 p-3 text-xs text-muted-foreground">
            <div className="mb-1 flex items-center gap-2 font-semibold text-warning">
              <ShieldCheck className="size-4" />
              Rule locked
            </div>
            Staff can process up to $200. Anything higher must be approved by Super Admin first.
          </div>
        </aside>

        <main className="min-w-0 space-y-5">
          {view === "dashboard" && (
            <>
              <MetricGrid metrics={metrics} />
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
                <PayoutTable
                  title="Recent activity"
                  rows={recentRows}
                  loading={dashboardQ.isLoading || payoutsQ.isLoading}
                  canManage={canManage}
                  isSuperAdmin={isSuperAdmin}
                  onSelectProcess={(row) => openProcess(row, setSelectedRow, setProcessForm)}
                  onApprove={(row) => approveMutation.mutate(row.id)}
                  approving={approveMutation.isPending}
                />
                <ActivityPanel rows={pendingRows} notifications={notifications.slice(0, 5)} />
              </div>
              <ProcessPanel
                row={selectedRow}
                form={processForm}
                setForm={setProcessForm}
                loading={statusMutation.isPending}
                onClose={() => setSelectedRow(null)}
                onSubmit={(status) => selectedRow && statusMutation.mutate({ row: selectedRow, status })}
              />
            </>
          )}

          {view === "new" && (
            <NewPayoutForm
              form={form}
              setForm={setForm}
              canManage={canManage}
              loading={createMutation.isPending}
              onSubmit={() => createMutation.mutate()}
            />
          )}

          {view === "approval" && (
            <>
              <PayoutTable
                title="Awaiting owner approval"
                rows={approvalRows}
                loading={payoutsQ.isLoading}
                canManage={canManage}
                isSuperAdmin={isSuperAdmin}
                onSelectProcess={(row) => openProcess(row, setSelectedRow, setProcessForm)}
                onApprove={(row) => approveMutation.mutate(row.id)}
                approving={approveMutation.isPending}
              />
              <ProcessPanel
                row={selectedRow}
                form={processForm}
                setForm={setProcessForm}
                loading={statusMutation.isPending}
                onClose={() => setSelectedRow(null)}
                onSubmit={(status) => selectedRow && statusMutation.mutate({ row: selectedRow, status })}
              />
            </>
          )}

          {view === "history" && (
            <HistoryView
              rows={historyRows}
              loading={payoutsQ.isLoading}
              filters={historyFilters}
              setFilters={setHistoryFilters}
              canManage={canManage}
              isSuperAdmin={isSuperAdmin}
              onSelectProcess={(row) => openProcess(row, setSelectedRow, setProcessForm)}
              onApprove={(row) => approveMutation.mutate(row.id)}
              approving={approveMutation.isPending}
            />
          )}

          {view === "notifications" && (
            <NotificationsView notifications={notifications} loading={notificationsQ.isLoading} />
          )}
        </main>
      </div>
    </div>
  );
}

function PortalHeader({ me }: { me: { profile?: { full_name?: string | null; email?: string | null }; roles?: string[] } | null }) {
  return (
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
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-full border border-success/30 bg-success/10 px-3 py-1.5 text-xs font-semibold text-success">
            Protected workspace
          </div>
          <div className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
            {me?.profile?.full_name || me?.profile?.email || "Staff"}
          </div>
        </div>
      </div>
    </div>
  );
}

function NavButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof WalletCards;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
        active
          ? "border-warning/30 bg-warning/10 text-warning"
          : "border-transparent text-muted-foreground hover:border-border hover:bg-surface",
      )}
    >
      <Icon className="size-4" />
      <span className="min-w-0 flex-1">{children}</span>
      {active && <ChevronRight className="size-4" />}
    </button>
  );
}

function MetricGrid({ metrics }: { metrics: Record<string, number> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Pending payouts" value={String(metrics.pendingPayouts ?? 0)} sub="Open requests" />
      <Metric label="Completed today" value={String(metrics.completedToday ?? 0)} sub="Paid since midnight" tone="success" />
      <Metric label="Awaiting approval" value={String(metrics.awaitingOwnerApproval ?? 0)} sub="Owner action needed" tone="warning" />
      <Metric label="Total payouts today" value={fmtUSD(metrics.totalPayoutsToday ?? 0)} sub="Actual paid amount" tone="success" />
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

function NewPayoutForm({
  form,
  setForm,
  canManage,
  loading,
  onSubmit,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  canManage: boolean;
  loading: boolean;
  onSubmit: () => void;
}) {
  const amount = Number(form.amount || 0);
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="overflow-hidden border-border/80 bg-card/90">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-warning/15 via-primary/15 to-transparent px-5 py-4">
          <div>
            <h2 className="font-semibold">New payout</h2>
            <p className="text-xs text-muted-foreground">
              Create payouts for website, Facebook, Messenger, or external customers.
            </p>
          </div>
          <Badge className="bg-warning/15 text-warning hover:bg-warning/15">
            $200 approval rule
          </Badge>
        </div>
        <CardContent className="p-5">
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canManage) {
                toast.error("Your staff role cannot create payouts");
                return;
              }
              onSubmit();
            }}
          >
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {CUSTOMER_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setFormValue(setForm, "customerType", type.value)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    form.customerType === type.value
                      ? "border-warning/40 bg-warning/10"
                      : "border-border bg-background/40 hover:bg-surface",
                  )}
                >
                  <div className="text-sm font-semibold">{type.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{type.detail}</div>
                </button>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Customer name">
                <Input
                  value={form.customerName}
                  onChange={(event) => setFormValue(setForm, "customerName", event.target.value)}
                  required
                  minLength={2}
                  placeholder="Customer full name"
                />
              </Field>
              <Field label="Brand/Page">
                <Input
                  value={form.brandPage}
                  onChange={(event) => setFormValue(setForm, "brandPage", event.target.value)}
                  required
                  placeholder="Cosmo Stakes / Page name"
                />
              </Field>
            </div>

            <div>
              <Label>Payment method</Label>
              <div className="mt-2 grid gap-2 sm:grid-cols-4">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method.value}
                    type="button"
                    onClick={() => setFormValue(setForm, "paymentMethod", method.value)}
                    className={cn(
                      "flex min-h-14 items-center gap-2 rounded-lg border px-3 text-left transition-colors",
                      form.paymentMethod === method.value
                        ? "border-warning/50 bg-warning/10 shadow-[0_0_24px_-14px_rgba(255,215,109,.9)]"
                        : "border-border bg-background/40 hover:bg-surface",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-md text-sm font-black text-white",
                        method.className,
                      )}
                    >
                      {method.mark}
                    </span>
                    <span className="min-w-0 truncate text-sm font-semibold">{method.value}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Cash tag, email, or phone">
                <Input
                  value={form.recipient}
                  onChange={(event) => setFormValue(setForm, "recipient", event.target.value)}
                  required
                  placeholder="$cashtag / email / phone"
                />
              </Field>
              <Field label="Account-holder name">
                <Input
                  value={form.accountHolder}
                  onChange={(event) => setFormValue(setForm, "accountHolder", event.target.value)}
                  required
                  placeholder="Name on receiving account"
                />
              </Field>
              <Field label="Amount">
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  value={form.amount}
                  onChange={(event) => setFormValue(setForm, "amount", event.target.value)}
                  required
                  placeholder="0.00"
                />
              </Field>
              <Field label="Staff note">
                <Textarea
                  value={form.note}
                  onChange={(event) => setFormValue(setForm, "note", event.target.value)}
                  placeholder="Internal note"
                  className="min-h-10"
                />
              </Field>
            </div>

            <div
              className={cn(
                "rounded-xl border p-3 text-sm",
                amount > 200
                  ? "border-warning/30 bg-warning/10 text-warning"
                  : "border-success/25 bg-success/10 text-success",
              )}
            >
              {amount > 200
                ? "This payout will be locked until Super Admin approval."
                : "This payout can be processed by authorized staff."}
            </div>

            <Button className="w-full shadow-[var(--shadow-glow)]" disabled={loading || !canManage}>
              {loading ? "Saving..." : "Create payout request"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/90">
        <CardContent className="space-y-4 p-5">
          <div className="rounded-2xl border border-white/15 bg-gradient-to-br from-primary/35 via-background to-warning/20 p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-warning">
              Payout preview
            </p>
            <div className="mt-8 text-4xl font-semibold">{fmtUSD(form.amount || 0)}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {form.paymentMethod} to {form.customerName || "customer"}
            </p>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <PreviewLine label="Source" value={typeLabel(form.customerType)} />
            <PreviewLine label="Brand" value={form.brandPage || "-"} />
            <PreviewLine label="Recipient" value={form.recipient || "-"} />
            <PreviewLine label="Holder" value={form.accountHolder || "-"} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PayoutTable({
  title,
  rows,
  loading,
  canManage,
  isSuperAdmin,
  onSelectProcess,
  onApprove,
  approving,
  compact,
}: {
  title: string;
  rows: PayoutRow[];
  loading: boolean;
  canManage: boolean;
  isSuperAdmin: boolean;
  onSelectProcess: (row: PayoutRow) => void;
  onApprove: (row: PayoutRow) => void;
  approving: boolean;
  compact?: boolean;
}) {
  return (
    <Card className="border-border/80 bg-card/90">
      <CardContent className="space-y-4 p-5">
        {title && <h2 className="font-semibold">{title}</h2>}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payout ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Requested</TableHead>
                <TableHead>Status</TableHead>
                {!compact && <TableHead>Staff</TableHead>}
                <TableHead className="text-right">Date</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={compact ? 8 : 9} className="py-10 text-center text-sm text-muted-foreground">
                    Loading payouts...
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={compact ? 8 : 9} className="py-10 text-center text-sm text-muted-foreground">
                    No payout records found.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{shortId(row.id)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{displayCustomer(row)}</div>
                      <div className="text-[11px] text-muted-foreground">{typeLabel(row.customer_type)}</div>
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate">{row.brand_page || "-"}</TableCell>
                    <TableCell>
                      <MethodBadge value={String(row.payment_method_name || "Manual")} />
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-warning">
                      {fmtUSD(row.amount_requested ?? row.amount)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    {!compact && (
                      <TableCell className="text-xs text-muted-foreground">
                        <div>Created: {staffName(row.created_staff, row.created_by)}</div>
                        <div>Processed: {staffName(row.processed_staff, row.processed_by)}</div>
                      </TableCell>
                    )}
                    <TableCell className="text-right text-xs text-muted-foreground">
                      <div>{fmtRelative(row.created_at)}</div>
                      <div>{fmtDateTime(row.processed_at || row.created_at)}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        {row.status === "awaiting_approval" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 border-warning/30 text-warning hover:bg-warning/10"
                            disabled={!isSuperAdmin || approving}
                            onClick={() => onApprove(row)}
                            title={!isSuperAdmin ? "Super Admin only" : "Approve payout"}
                          >
                            <ShieldCheck className="size-3.5" /> Approve
                          </Button>
                        )}
                        {["pending", "ready_to_process", "awaiting_approval"].includes(row.status) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            disabled={!canManage || (row.status === "awaiting_approval" && !isSuperAdmin)}
                            onClick={() => onSelectProcess(row)}
                          >
                            Process
                          </Button>
                        )}
                        {row.status === "paid" && (
                          <span className="text-xs text-success">{fmtUSD(row.actual_amount_paid)}</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ProcessPanel({
  row,
  form,
  setForm,
  loading,
  onClose,
  onSubmit,
}: {
  row: PayoutRow | null;
  form: ProcessState;
  setForm: React.Dispatch<React.SetStateAction<ProcessState>>;
  loading: boolean;
  onClose: () => void;
  onSubmit: (status: "paid" | "failed" | "rejected") => void;
}) {
  if (!row) return null;
  return (
    <Card className="border-warning/30 bg-card/95 shadow-[0_0_36px_-28px_rgba(255,215,109,.9)]">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-warning">
              Processing payout
            </p>
            <h2 className="font-semibold">
              {displayCustomer(row)} / {fmtUSD(row.amount_requested ?? row.amount)}
            </h2>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Actual amount paid">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.actualAmount}
              onChange={(event) => setProcessValue(setForm, "actualAmount", event.target.value)}
              placeholder="Required for Paid"
            />
          </Field>
          <Field label="Transaction/reference number">
            <Input
              value={form.referenceNumber}
              onChange={(event) => setProcessValue(setForm, "referenceNumber", event.target.value)}
              placeholder="Required for Paid"
            />
          </Field>
          <Field label="Payment screenshot link">
            <div className="relative">
              <Upload className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={form.proofUrl}
                onChange={(event) => setProcessValue(setForm, "proofUrl", event.target.value)}
                placeholder="Optional URL"
              />
            </div>
          </Field>
        </div>
        <Field label="Processing note">
          <Textarea
            value={form.note}
            onChange={(event) => setProcessValue(setForm, "note", event.target.value)}
            placeholder="Internal processing note"
          />
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            className="border-destructive/30 text-destructive hover:bg-destructive/10"
            disabled={loading}
            onClick={() => onSubmit("rejected")}
          >
            <XCircle className="size-4" /> Reject
          </Button>
          <Button variant="outline" disabled={loading} onClick={() => onSubmit("failed")}>
            <AlertTriangle className="size-4" /> Failed
          </Button>
          <Button disabled={loading} onClick={() => onSubmit("paid")}>
            <Check className="size-4" /> Mark Paid
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function HistoryView({
  rows,
  loading,
  filters,
  setFilters,
  canManage,
  isSuperAdmin,
  onSelectProcess,
  onApprove,
  approving,
}: {
  rows: PayoutRow[];
  loading: boolean;
  filters: HistoryFilters;
  setFilters: React.Dispatch<React.SetStateAction<HistoryFilters>>;
  canManage: boolean;
  isSuperAdmin: boolean;
  onSelectProcess: (row: PayoutRow) => void;
  onApprove: (row: PayoutRow) => void;
  approving: boolean;
}) {
  return (
    <div className="space-y-5">
      <Card className="border-border/80 bg-card/90">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <Search className="size-4 text-warning" />
            <h2 className="font-semibold">Search payout history</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Input
              value={filters.customer}
              onChange={(event) => setFilterValue(setFilters, "customer", event.target.value)}
              placeholder="Customer"
            />
            <Input
              value={filters.brand}
              onChange={(event) => setFilterValue(setFilters, "brand", event.target.value)}
              placeholder="Brand/Page"
            />
            <Input
              value={filters.staff}
              onChange={(event) => setFilterValue(setFilters, "staff", event.target.value)}
              placeholder="Staff"
            />
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={filters.method}
              onChange={(event) =>
                setFilterValue(setFilters, "method", event.target.value as HistoryFilters["method"])
              }
            >
              <option value="all">All methods</option>
              {PAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.value}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={filters.status}
              onChange={(event) =>
                setFilterValue(setFilters, "status", event.target.value as HistoryFilters["status"])
              }
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="awaiting_approval">Awaiting approval</option>
              <option value="ready_to_process">Ready</option>
              <option value="paid">Paid</option>
              <option value="rejected">Rejected</option>
              <option value="failed">Failed</option>
            </select>
            <Input
              type="date"
              value={filters.date}
              onChange={(event) => setFilterValue(setFilters, "date", event.target.value)}
            />
          </div>
        </CardContent>
      </Card>
      <PayoutTable
        title="Permanent payout records"
        rows={rows}
        loading={loading}
        canManage={canManage}
        isSuperAdmin={isSuperAdmin}
        onSelectProcess={onSelectProcess}
        onApprove={onApprove}
        approving={approving}
      />
    </div>
  );
}

function ActivityPanel({
  rows,
  notifications,
}: {
  rows: PayoutRow[];
  notifications: PayoutNotification[];
}) {
  return (
    <div className="space-y-5">
      <Card className="border-border/80 bg-card/90">
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-warning" />
            <h2 className="font-semibold">Quick queue</h2>
          </div>
          {rows.slice(0, 5).map((row) => (
            <div key={row.id} className="rounded-lg border border-border bg-background/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{displayCustomer(row)}</div>
                  <div className="text-xs text-muted-foreground">{row.brand_page || "Cosmo Stakes"}</div>
                </div>
                <StatusBadge status={row.status} />
              </div>
              <div className="mt-2 text-sm font-semibold text-warning">
                {fmtUSD(row.amount_requested ?? row.amount)}
              </div>
            </div>
          ))}
          {rows.length === 0 && <p className="text-sm text-muted-foreground">No open payouts right now.</p>}
        </CardContent>
      </Card>
      <Card className="border-border/80 bg-card/90">
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Bell className="size-4 text-warning" />
            <h2 className="font-semibold">Owner alerts</h2>
          </div>
          {notifications.map((item) => (
            <div key={item.id} className="rounded-lg border border-border bg-background/40 p-3">
              <div className="text-sm font-medium">{item.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">{fmtRelative(item.created_at)}</div>
            </div>
          ))}
          {notifications.length === 0 && <p className="text-sm text-muted-foreground">No payout alerts yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationsView({
  notifications,
  loading,
}: {
  notifications: PayoutNotification[];
  loading: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <NotificationCard
          title="Email"
          detail="Owner emails are sent when RESEND_API_KEY and PAYOUT_FROM_EMAIL are configured."
          icon={Mail}
        />
        <NotificationCard
          title="Browser"
          detail="Enable Chrome notifications on this device for immediate local alerts."
          icon={Bell}
          action
        />
        <NotificationCard
          title="In-app"
          detail="Payout alerts are stored permanently for Super Admin review."
          icon={ShieldCheck}
        />
      </div>
      <Card className="border-border/80 bg-card/90">
        <CardContent className="space-y-4 p-5">
          <h2 className="font-semibold">Notification log</h2>
          <div className="space-y-2">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading notifications...</p>
            ) : notifications.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payout notifications yet.</p>
            ) : (
              notifications.map((item) => (
                <div key={item.id} className="rounded-lg border border-border bg-background/40 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{item.title}</div>
                      <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {item.email_status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">{fmtDateTime(item.created_at)}</div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationCard({
  title,
  detail,
  icon: Icon,
  action,
}: {
  title: string;
  detail: string;
  icon: typeof Bell;
  action?: boolean;
}) {
  return (
    <Card className="border-border/80 bg-card/90">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-warning" />
          <h2 className="font-semibold">{title}</h2>
        </div>
        <p className="text-sm text-muted-foreground">{detail}</p>
        {action && (
          <Button variant="outline" onClick={requestBrowserNotifications}>
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

function PreviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="max-w-[180px] truncate text-foreground">{value}</span>
    </div>
  );
}

function MethodBadge({ value }: { value: string }) {
  const method = PAYMENT_METHODS.find((item) => item.value === value);
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-md text-xs font-black text-white",
          method?.className ?? "bg-muted",
        )}
      >
        {method?.mark ?? value.slice(0, 1)}
      </span>
      <span className="whitespace-nowrap">{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: PayoutStatus }) {
  const config = {
    pending: ["Pending", "border-muted bg-muted/10 text-muted-foreground"],
    awaiting_approval: ["Awaiting Approval", "border-warning/30 bg-warning/10 text-warning"],
    ready_to_process: ["Ready to Process", "border-primary/30 bg-primary/10 text-primary"],
    paid: ["Paid", "border-success/30 bg-success/10 text-success"],
    rejected: ["Rejected", "border-destructive/30 bg-destructive/10 text-destructive"],
    failed: ["Failed", "border-destructive/30 bg-destructive/10 text-destructive"],
  } satisfies Record<PayoutStatus, [string, string]>;
  const [label, className] = config[status] ?? config.pending;
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap text-[10px] uppercase tracking-wider", className)}>
      {label}
    </Badge>
  );
}

function setFormValue<K extends keyof FormState>(
  setForm: React.Dispatch<React.SetStateAction<FormState>>,
  key: K,
  value: FormState[K],
) {
  setForm((current) => ({ ...current, [key]: value }));
}

function setProcessValue<K extends keyof ProcessState>(
  setForm: React.Dispatch<React.SetStateAction<ProcessState>>,
  key: K,
  value: ProcessState[K],
) {
  setForm((current) => ({ ...current, [key]: value }));
}

function setFilterValue<K extends keyof HistoryFilters>(
  setFilters: React.Dispatch<React.SetStateAction<HistoryFilters>>,
  key: K,
  value: HistoryFilters[K],
) {
  setFilters((current) => ({ ...current, [key]: value }));
}

function normalizePayoutRow(row: PayoutRow): PayoutRow {
  const amount = Number(row.amount_requested ?? row.amount ?? 0);
  return {
    ...row,
    customer_name: row.customer_name || row.player_name,
    amount_requested: row.amount_requested ?? row.amount,
    status:
      row.status === ("sent" as PayoutStatus)
        ? "paid"
        : row.status === ("cancelled" as PayoutStatus)
          ? "rejected"
          : row.status === "pending" && amount > 200
            ? "awaiting_approval"
            : row.status === "pending"
              ? "ready_to_process"
              : row.status,
  };
}

function buildMetrics(rows: PayoutRow[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const completedToday = rows.filter(
    (row) =>
      row.status === "paid" &&
      row.processed_at &&
      new Date(row.processed_at).getTime() >= today.getTime(),
  );
  return {
    pendingPayouts: rows.filter((row) =>
      ["pending", "awaiting_approval", "ready_to_process"].includes(row.status),
    ).length,
    completedToday: completedToday.length,
    awaitingOwnerApproval: rows.filter((row) => row.status === "awaiting_approval").length,
    totalPayoutsToday: completedToday.reduce(
      (sum, row) => sum + Number(row.actual_amount_paid ?? row.amount_requested ?? 0),
      0,
    ),
  };
}

function filterHistory(rows: PayoutRow[], filters: HistoryFilters) {
  return rows.filter((row) => {
    const customer = displayCustomer(row).toLowerCase();
    const brand = String(row.brand_page ?? "").toLowerCase();
    const staff = [staffName(row.created_staff, row.created_by), staffName(row.processed_staff, row.processed_by)]
      .join(" ")
      .toLowerCase();
    const date = row.created_at?.slice(0, 10);
    return (
      (!filters.customer || customer.includes(filters.customer.toLowerCase())) &&
      (!filters.brand || brand.includes(filters.brand.toLowerCase())) &&
      (!filters.staff || staff.includes(filters.staff.toLowerCase())) &&
      (filters.method === "all" || row.payment_method_name === filters.method) &&
      (filters.status === "all" || row.status === filters.status) &&
      (!filters.date || date === filters.date)
    );
  });
}

function openProcess(
  row: PayoutRow,
  setSelectedRow: React.Dispatch<React.SetStateAction<PayoutRow | null>>,
  setProcessForm: React.Dispatch<React.SetStateAction<ProcessState>>,
) {
  setSelectedRow(row);
  setProcessForm({
    actualAmount: String(row.actual_amount_paid ?? row.amount_requested ?? row.amount ?? ""),
    referenceNumber: row.reference_number ?? "",
    proofUrl: row.proof_screenshot_url ?? "",
    note: row.processing_note ?? "",
  });
}

function typeLabel(type: CustomerType | string | null | undefined) {
  return CUSTOMER_TYPES.find((item) => item.value === type)?.label ?? "External customer";
}

function displayCustomer(row: PayoutRow) {
  return row.customer_name || row.player_name || "Customer";
}

function shortId(id: string) {
  return `PO-${id.slice(0, 8).toUpperCase()}`;
}

function staffName(staff: StaffMini | null | undefined, fallback?: string | null) {
  if (!staff) return fallback ? fallback.slice(0, 8) : "-";
  return staff.full_name || staff.username || staff.email || staff.id.slice(0, 8);
}

function requestBrowserNotifications() {
  if (!("Notification" in window)) {
    toast.error("Browser notifications are not supported here");
    return;
  }
  window.Notification.requestPermission().then((permission) => {
    toast.info(`Browser notification permission: ${permission}`);
  });
}

function notifyBrowser(title: string, body: string) {
  if (!("Notification" in window) || window.Notification.permission !== "granted") return;
  new window.Notification(title, {
    body,
    icon: "/cosmo-logo.jpeg",
  });
}
