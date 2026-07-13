import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getSecuritySettings,
  revokeManualStaffSessions,
  updateSecuritySettings,
} from "@/lib/portal.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { KeyRound, Lock, RotateCcw, ShieldCheck, Smartphone, TimerReset } from "lucide-react";

export const Route = createFileRoute("/_authenticated/security")({ component: SecurityPage });

type Sec = {
  min_password_length: number;
  require_uppercase: boolean;
  require_number: boolean;
  require_symbol: boolean;
  session_timeout_minutes: number;
  enforce_2fa_super_admin: boolean;
  ip_whitelist: string[];
  max_login_attempts: number;
  lockout_minutes: number;
  password_rotation_days: number;
};

function passwordPolicyError(password: string, policy: Sec) {
  const missing: string[] = [];
  if (password.length < policy.min_password_length) {
    missing.push(`at least ${policy.min_password_length} characters`);
  }
  if (policy.require_uppercase && !/[A-Z]/.test(password)) missing.push("an uppercase letter");
  if (policy.require_number && !/[0-9]/.test(password)) missing.push("a number");
  if (policy.require_symbol && !/[^A-Za-z0-9]/.test(password)) missing.push("a symbol");
  return missing.length ? `Password must include ${missing.join(", ")}` : null;
}

function SecurityPage() {
  const get = useServerFn(getSecuritySettings);
  const update = useServerFn(updateSecuritySettings);
  const revokeSessions = useServerFn(revokeManualStaffSessions);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["security"], queryFn: () => get() });
  const [form, setForm] = useState<Sec | null>(null);
  const [newPwd, setNewPwd] = useState("");
  const [enrollData, setEnrollData] = useState<{
    qr: string;
    secret: string;
    factorId: string;
  } | null>(null);
  const [otp, setOtp] = useState("");

  useEffect(() => {
    if (q.data && !form) setForm(q.data as unknown as Sec);
  }, [q.data, form]);

  const save = useMutation({
    mutationFn: () => update({ data: form! }),
    onSuccess: () => {
      toast.success("Security policy saved");
      qc.invalidateQueries({ queryKey: ["security"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const revoke = useMutation({
    mutationFn: () => revokeSessions({ data: {} }),
    onSuccess: (result) => {
      toast.success(`Revoked ${result.revoked} manual staff session(s)`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const changePwd = async () => {
    if (!form) return;
    const message = passwordPolicyError(newPwd, form);
    if (message) {
      toast.error(message);
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated");
    setNewPwd("");
  };

  const enroll2fa = async () => {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Cosmo Stakes Admin",
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setEnrollData({ qr: data.totp.qr_code, secret: data.totp.secret, factorId: data.id });
  };

  const verify2fa = async () => {
    if (!enrollData) return;
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: enrollData.factorId,
    });
    if (challengeError) {
      toast.error(challengeError.message);
      return;
    }
    const { error } = await supabase.auth.mfa.verify({
      factorId: enrollData.factorId,
      challengeId: challenge.id,
      code: otp,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("2FA enabled");
    setEnrollData(null);
    setOtp("");
  };

  if (q.isError) {
    return <div className="p-8 text-sm text-destructive">{(q.error as Error).message}</div>;
  }
  if (!form) return <div className="p-8 text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-5xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Lock className="size-5 text-primary" /> Security
          </h1>
          <p className="text-xs text-muted-foreground">
            Global controls for admin passwords, sessions, 2FA, and trusted access.
          </p>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          <ShieldCheck className="size-4" />
          {save.isPending ? "Saving..." : "Save policy"}
        </Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.8fr)]">
        <div className="space-y-5">
          <Card>
            <CardContent className="p-5 space-y-4">
              <h2 className="font-semibold flex items-center gap-2">
                <ShieldCheck className="size-4" /> Password Policy
              </h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Minimum length</Label>
                  <Input
                    type="number"
                    min={6}
                    max={128}
                    value={form.min_password_length}
                    onChange={(event) =>
                      setForm({ ...form, min_password_length: Number(event.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Password rotation days</Label>
                  <Input
                    type="number"
                    min={0}
                    max={365}
                    value={form.password_rotation_days}
                    onChange={(event) =>
                      setForm({ ...form, password_rotation_days: Number(event.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Session timeout minutes</Label>
                  <Input
                    type="number"
                    min={5}
                    max={1440}
                    value={form.session_timeout_minutes}
                    onChange={(event) =>
                      setForm({ ...form, session_timeout_minutes: Number(event.target.value) })
                    }
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Uppercase letter", "require_uppercase"],
                  ["Number", "require_number"],
                  ["Symbol", "require_symbol"],
                ].map(([label, key]) => (
                  <label
                    key={key}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <span className="text-sm">{label}</span>
                    <Switch
                      checked={Boolean(form[key as keyof Sec])}
                      onCheckedChange={(value) => setForm({ ...form, [key]: value })}
                    />
                  </label>
                ))}
                <label className="flex items-center justify-between rounded-md border p-3">
                  <span className="text-sm">Enforce 2FA for super admin</span>
                  <Switch
                    checked={form.enforce_2fa_super_admin}
                    onCheckedChange={(value) =>
                      setForm({ ...form, enforce_2fa_super_admin: value })
                    }
                  />
                </label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-4">
              <h2 className="font-semibold flex items-center gap-2">
                <TimerReset className="size-4" /> Login Protection
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Failed attempts before lockout</Label>
                  <Input
                    type="number"
                    min={3}
                    max={20}
                    value={form.max_login_attempts}
                    onChange={(event) =>
                      setForm({ ...form, max_login_attempts: Number(event.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Lockout duration minutes</Label>
                  <Input
                    type="number"
                    min={1}
                    max={1440}
                    value={form.lockout_minutes}
                    onChange={(event) =>
                      setForm({ ...form, lockout_minutes: Number(event.target.value) })
                    }
                  />
                </div>
              </div>
              <div>
                <Label>IP whitelist</Label>
                <Textarea
                  rows={5}
                  value={form.ip_whitelist.join("\n")}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      ip_whitelist: event.target.value
                        .split("\n")
                        .map((item) => item.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder={"203.0.113.10\n198.51.100.0/24"}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Leave empty to allow all IPs. IPv4 CIDR ranges are supported.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardContent className="p-5 space-y-3">
              <h2 className="font-semibold flex items-center gap-2">
                <KeyRound className="size-4" /> Change My Password
              </h2>
              <Input
                type="password"
                placeholder="New password"
                value={newPwd}
                onChange={(event) => setNewPwd(event.target.value)}
              />
              <Button onClick={changePwd} className="w-full">
                Update password
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-3">
              <h2 className="font-semibold flex items-center gap-2">
                <Smartphone className="size-4" /> Two-Factor Authentication
              </h2>
              {!enrollData ? (
                <Button onClick={enroll2fa} variant="outline" className="w-full">
                  Enroll authenticator
                </Button>
              ) : (
                <div className="space-y-3">
                  <img
                    src={enrollData.qr}
                    alt="Authenticator QR"
                    className="size-40 rounded bg-white p-2"
                  />
                  <div className="break-all rounded-md bg-muted p-2 font-mono text-[11px]">
                    {enrollData.secret}
                  </div>
                  <Input
                    placeholder="6-digit code"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(event) => setOtp(event.target.value)}
                  />
                  <Button onClick={verify2fa} disabled={otp.length < 6} className="w-full">
                    Verify authenticator
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-3">
              <h2 className="font-semibold flex items-center gap-2">
                <RotateCcw className="size-4" /> Manual Staff Sessions
              </h2>
              <p className="text-xs text-muted-foreground">
                Revokes all current manually-created staff sessions. Super admin Supabase sessions
                are not removed here.
              </p>
              <Button
                onClick={() => revoke.mutate()}
                disabled={revoke.isPending}
                variant="outline"
                className="w-full"
              >
                {revoke.isPending ? "Revoking..." : "Revoke staff sessions"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
