import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSecuritySettings, updateSecuritySettings } from "@/lib/portal.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Lock, KeyRound, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/security")({ component: SecurityPage });

type Sec = {
  min_password_length: number;
  require_uppercase: boolean;
  require_number: boolean;
  require_symbol: boolean;
  session_timeout_minutes: number;
  enforce_2fa_super_admin: boolean;
  ip_whitelist: string[];
};

function SecurityPage() {
  const get = useServerFn(getSecuritySettings);
  const upd = useServerFn(updateSecuritySettings);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["security"], queryFn: () => get() });
  const [form, setForm] = useState<Sec | null>(null);
  const [newPwd, setNewPwd] = useState("");
  const [enrollData, setEnrollData] = useState<{ qr: string; secret: string; factorId: string } | null>(null);
  const [otp, setOtp] = useState("");

  useEffect(() => {
    if (q.data && !form) setForm(q.data as unknown as Sec);
  }, [q.data, form]);

  const save = useMutation({
    mutationFn: () => upd({ data: form! }),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["security"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const changePwd = async () => {
    if (newPwd.length < (form?.min_password_length ?? 12)) return toast.error(`Min ${form?.min_password_length} chars`);
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    if (error) return toast.error(error.message);
    toast.success("Password updated");
    setNewPwd("");
  };

  const enroll2fa = async () => {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Cosmo Stakes Admin" });
    if (error) return toast.error(error.message);
    setEnrollData({ qr: data.totp.qr_code, secret: data.totp.secret, factorId: data.id });
  };
  const verify2fa = async () => {
    if (!enrollData) return;
    const { data: ch, error: e1 } = await supabase.auth.mfa.challenge({ factorId: enrollData.factorId });
    if (e1) return toast.error(e1.message);
    const { error: e2 } = await supabase.auth.mfa.verify({ factorId: enrollData.factorId, challengeId: ch.id, code: otp });
    if (e2) return toast.error(e2.message);
    toast.success("2FA enabled");
    setEnrollData(null);
    setOtp("");
  };

  if (!form) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2"><Lock className="size-5 text-primary" /> Security</h1>
        <p className="text-xs text-muted-foreground">2FA, password rules, sessions, IP whitelist.</p>
      </div>

      <Card>
        <CardContent className="p-5 space-y-3">
          <h2 className="font-semibold flex items-center gap-2"><ShieldCheck className="size-4" /> Password & session policy</h2>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Min password length</Label><Input type="number" value={form.min_password_length} onChange={(e) => setForm({ ...form, min_password_length: Number(e.target.value) })} /></div>
            <div><Label>Session timeout (min)</Label><Input type="number" value={form.session_timeout_minutes} onChange={(e) => setForm({ ...form, session_timeout_minutes: Number(e.target.value) })} /></div>
          </div>
          <div className="flex gap-4 flex-wrap">
            <label className="flex items-center gap-2"><Switch checked={form.require_uppercase} onCheckedChange={(v) => setForm({ ...form, require_uppercase: v })} />Uppercase</label>
            <label className="flex items-center gap-2"><Switch checked={form.require_number} onCheckedChange={(v) => setForm({ ...form, require_number: v })} />Number</label>
            <label className="flex items-center gap-2"><Switch checked={form.require_symbol} onCheckedChange={(v) => setForm({ ...form, require_symbol: v })} />Symbol</label>
            <label className="flex items-center gap-2"><Switch checked={form.enforce_2fa_super_admin} onCheckedChange={(v) => setForm({ ...form, enforce_2fa_super_admin: v })} />Enforce 2FA for super admins</label>
          </div>
          <div>
            <Label>IP whitelist (one per line, empty = allow all)</Label>
            <Textarea
              rows={4}
              value={form.ip_whitelist.join("\n")}
              onChange={(e) => setForm({ ...form, ip_whitelist: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
              placeholder="203.0.113.10&#10;198.51.100.0/24"
            />
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Save policy</Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-3">
          <h2 className="font-semibold flex items-center gap-2"><KeyRound className="size-4" /> Change my password</h2>
          <div className="flex gap-2 max-w-md">
            <Input type="password" placeholder="New password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
            <Button onClick={changePwd}>Update</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-3">
          <h2 className="font-semibold">Two-factor authentication (TOTP)</h2>
          {!enrollData ? (
            <Button onClick={enroll2fa}>Enroll new authenticator</Button>
          ) : (
            <div className="space-y-3">
              <img src={enrollData.qr} alt="QR" className="size-40 bg-white p-2 rounded" />
              <div className="text-xs font-mono break-all">Secret: {enrollData.secret}</div>
              <div className="flex gap-2 max-w-xs">
                <Input placeholder="6-digit code" value={otp} onChange={(e) => setOtp(e.target.value)} />
                <Button onClick={verify2fa}>Verify</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}