import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getNotificationSettings, updateNotificationSettings } from "@/lib/portal.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Bell } from "lucide-react";

export const Route = createFileRoute("/_authenticated/notifications")({ component: NotifPage });

type N = {
  email_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
  from_email: string | null;
  from_name: string | null;
};

function NotifPage() {
  const get = useServerFn(getNotificationSettings);
  const upd = useServerFn(updateNotificationSettings);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notif"], queryFn: () => get() });
  const [f, setF] = useState<N | null>(null);

  useEffect(() => {
    if (q.data && !f) setF(q.data as unknown as N);
  }, [q.data, f]);

  const save = useMutation({
    mutationFn: () => upd({ data: { ...f!, from_email: f!.from_email || "" } }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["notif"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!f) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Bell className="size-5 text-primary" /> Notifications
        </h1>
        <p className="text-xs text-muted-foreground">
          Toggle channels and sender identity. Delivery is wired when sender credentials are
          configured.
        </p>
      </div>
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2">
              <Switch
                checked={f.email_enabled}
                onCheckedChange={(v) => setF({ ...f, email_enabled: v })}
              />{" "}
              Email notifications
            </label>
            <label className="flex items-center gap-2">
              <Switch
                checked={f.sms_enabled}
                onCheckedChange={(v) => setF({ ...f, sms_enabled: v })}
              />{" "}
              SMS notifications
            </label>
            <label className="flex items-center gap-2">
              <Switch
                checked={f.push_enabled}
                onCheckedChange={(v) => setF({ ...f, push_enabled: v })}
              />{" "}
              Push notifications
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>From email</Label>
              <Input
                value={f.from_email ?? ""}
                onChange={(e) => setF({ ...f, from_email: e.target.value })}
                placeholder="support@cosmostakes.com"
              />
            </div>
            <div>
              <Label>From name</Label>
              <Input
                value={f.from_name ?? ""}
                onChange={(e) => setF({ ...f, from_name: e.target.value })}
                placeholder="Cosmo Stakes"
              />
            </div>
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Save
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
