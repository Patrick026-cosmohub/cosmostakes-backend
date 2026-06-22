import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getGeneralSettings,
  updateGeneralSettings,
  listPlatformIntegrations,
  upsertPlatformIntegration,
  testPlatformIntegration,
} from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings as SettingsIcon, Gamepad2, Loader2, Plug, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "UTC",
  "Europe/London",
  "Asia/Kathmandu",
];
const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "INR", "NPR"];
const DATE_FORMATS = ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"];

function SettingsPage() {
  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <SettingsIcon className="size-5 text-primary" />
          Settings
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manage platform-wide configuration and per-game API integrations.
        </p>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="api">API Configuration</TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="mt-4">
          <GeneralSettings />
        </TabsContent>
        <TabsContent value="api" className="mt-4">
          <ApiConfiguration />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GeneralSettings() {
  const fetchSettings = useServerFn(getGeneralSettings);
  const saveSettings = useServerFn(updateGeneralSettings);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["general-settings"], queryFn: () => fetchSettings() });
  const [form, setForm] = useState<any>(null);

  useEffect(() => {
    if (q.data && !form) setForm(q.data);
  }, [q.data, form]);

  const m = useMutation({
    mutationFn: (input: any) => saveSettings({ data: input }),
    onSuccess: () => {
      toast.success("General settings saved");
      qc.invalidateQueries({ queryKey: ["general-settings"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save"),
  });

  if (q.isLoading || !form) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  const setField = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  return (
    <Card className="bg-surface border-border">
      <CardHeader>
        <CardTitle className="text-base">General</CardTitle>
        <CardDescription className="text-xs">
          Platform identity, support contacts, and localization defaults.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Platform name">
            <Input value={form.platform_name ?? ""} onChange={(e) => setField("platform_name", e.target.value)} />
          </Field>
          <Field label="Company logo URL">
            <Input
              placeholder="https://…/logo.png"
              value={form.company_logo_url ?? ""}
              onChange={(e) => setField("company_logo_url", e.target.value)}
            />
          </Field>
          <Field label="Support email">
            <Input
              type="email"
              placeholder="support@example.com"
              value={form.support_email ?? ""}
              onChange={(e) => setField("support_email", e.target.value)}
            />
          </Field>
          <Field label="Support phone">
            <Input
              placeholder="+1 555 555 5555"
              value={form.support_phone ?? ""}
              onChange={(e) => setField("support_phone", e.target.value)}
            />
          </Field>
          <Field label="Time zone">
            <Select value={form.timezone} onValueChange={(v) => setField("timezone", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Currency">
            <Select value={form.currency} onValueChange={(v) => setField("currency", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Date format">
            <Select value={form.date_format} onValueChange={(v) => setField("date_format", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DATE_FORMATS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Time format">
            <Select value={form.time_format} onValueChange={(v) => setField("time_format", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="12h">12-hour (1:30 PM)</SelectItem>
                <SelectItem value="24h">24-hour (13:30)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="mt-5 flex justify-end">
          <Button
            disabled={m.isPending}
            onClick={() =>
              m.mutate({
                platform_name: form.platform_name,
                company_logo_url: form.company_logo_url,
                support_email: form.support_email,
                support_phone: form.support_phone,
                timezone: form.timezone,
                currency: form.currency,
                date_format: form.date_format,
                time_format: form.time_format,
              })
            }
          >
            {m.isPending && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ApiConfiguration() {
  const fetchList = useServerFn(listPlatformIntegrations);
  const q = useQuery({ queryKey: ["platform-integrations"], queryFn: () => fetchList() });

  if (q.isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (q.error) return <div className="text-sm text-destructive">Failed: {(q.error as Error).message}</div>;

  return (
    <div className="grid md:grid-cols-2 gap-3">
      {(q.data ?? []).map((row: any) => (
        <IntegrationCard key={row.game.id} row={row} />
      ))}
    </div>
  );
}

function IntegrationCard({ row }: { row: any }) {
  const save = useServerFn(upsertPlatformIntegration);
  const test = useServerFn(testPlatformIntegration);
  const qc = useQueryClient();
  const integ = row.integration ?? {};
  const [form, setForm] = useState({
    api_endpoint: integ.api_endpoint ?? "",
    api_key: integ.api_key ?? "",
    secret_key: integ.secret_key ?? "",
    webhook_url: integ.webhook_url ?? "",
  });

  const saveM = useMutation({
    mutationFn: () => save({ data: { game_id: row.game.id, ...form } }),
    onSuccess: () => {
      toast.success(`${row.game.name} credentials saved`);
      qc.invalidateQueries({ queryKey: ["platform-integrations"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });
  const testM = useMutation({
    mutationFn: () => test({ data: { game_id: row.game.id } }),
    onSuccess: (r: any) => {
      if (r.connection_status === "connected") toast.success(`${row.game.name}: ${r.last_test_message}`);
      else toast.error(`${row.game.name}: ${r.last_test_message}`);
      qc.invalidateQueries({ queryKey: ["platform-integrations"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Test failed"),
  });

  const status = integ.connection_status ?? "not_configured";

  return (
    <Card className="bg-surface border-border">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Gamepad2 className="size-4 text-primary" />
              {row.game.name}
            </CardTitle>
            <CardDescription className="text-[11px]">{row.game.provider}</CardDescription>
          </div>
          <StatusBadge status={status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Field label="REFUJ API base URL">
          <Input
            placeholder="https://www.refuj.io/api"
            value={form.api_endpoint}
            onChange={(e) => setForm((f) => ({ ...f, api_endpoint: e.target.value }))}
          />
        </Field>
        <Field label="REFUJ agent ID">
          <Input
            type="password"
            placeholder="Agent ID for this game"
            value={form.api_key}
            onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
          />
        </Field>
        <Field label="REFUJ agent password">
          <Input
            type="password"
            placeholder="Agent password for this game"
            value={form.secret_key}
            onChange={(e) => setForm((f) => ({ ...f, secret_key: e.target.value }))}
          />
        </Field>
        <Field label="Webhook URL">
          <Input
            placeholder="https://yourapp.com/api/public/webhooks/…"
            value={form.webhook_url}
            onChange={(e) => setForm((f) => ({ ...f, webhook_url: e.target.value }))}
          />
        </Field>

        <div className="flex justify-between text-[11px] text-muted-foreground border-t border-border pt-2">
          <span>Last sync: {integ.last_synced_at ? new Date(integ.last_synced_at).toLocaleString() : "—"}</span>
          <span>Last test: {integ.last_test_at ? new Date(integ.last_test_at).toLocaleString() : "—"}</span>
        </div>
        {integ.last_test_message && (
          <div className="text-[11px] text-muted-foreground italic">"{integ.last_test_message}"</div>
        )}

        <div className="flex gap-2 pt-1">
          <Button size="sm" className="flex-1" disabled={saveM.isPending} onClick={() => saveM.mutate()}>
            {saveM.isPending && <Loader2 className="size-3.5 animate-spin" />}
            Save
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={testM.isPending}
            onClick={() => testM.mutate()}
          >
            {testM.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Plug className="size-3.5" />}
            Test connection
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "connected")
    return (
      <Badge className="bg-success/15 text-success border-success/20 text-[10px]">
        <CheckCircle2 className="size-3 mr-1" /> Connected
      </Badge>
    );
  if (status === "error")
    return (
      <Badge className="bg-destructive/15 text-destructive border-destructive/20 text-[10px]">
        <XCircle className="size-3 mr-1" /> Error
      </Badge>
    );
  if (status === "configured")
    return (
      <Badge className="bg-primary/15 text-primary border-primary/20 text-[10px]">
        <AlertCircle className="size-3 mr-1" /> Configured
      </Badge>
    );
  return <Badge variant="secondary" className="text-[10px]">Not configured</Badge>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
