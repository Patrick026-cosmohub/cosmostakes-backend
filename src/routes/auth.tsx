import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getStaffSession } from "@/lib/staff-auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

const PAYOUT_HOST = "payout.cosmostakes.net";

function isPayoutHost() {
  return typeof window !== "undefined" && window.location.hostname.toLowerCase() === PAYOUT_HOST;
}

function getPostLoginRoute() {
  return isPayoutHost() ? "/payouts" : "/dashboard";
}

function AuthPage() {
  const navigate = useNavigate();
  const getSession = useServerFn(getStaffSession);
  const [loading, setLoading] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState<{
    factorId: string;
    challengeId: string;
  } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const payoutHost = isPayoutHost();

  async function supabaseSessionReady() {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return !data || data.currentLevel === data.nextLevel;
  }

  useEffect(() => {
    let mounted = true;
    Promise.all([supabase.auth.getSession(), getSession()])
      .then(async ([supabaseSession, staffSession]) => {
        const ready = supabaseSession.data.session ? await supabaseSessionReady() : false;
        if (mounted && (ready || staffSession)) {
          navigate({ to: getPostLoginRoute() });
        }
      })
      .catch(() => {});
    const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session && (await supabaseSessionReady())) navigate({ to: getPostLoginRoute() });
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [getSession, navigate]);

  async function handleStaffSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const login = String(fd.get("username") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    setLoading(true);
    try {
      if (!login.includes("@")) {
        throw new Error("Enter the staff email assigned by Super Admin");
      }
      await signInSupabaseAdmin(login, password);
    } catch (error: any) {
      toast.error(error?.message ?? "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  async function beginSuperAdminMfaIfNeeded() {
    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError) throw aalError;
    if (!aal || aal.currentLevel === aal.nextLevel || aal.nextLevel !== "aal2") return false;

    const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors();
    if (factorError) throw factorError;
    const factor = factors.totp.find((item) => item.status === "verified");
    if (!factor) {
      throw new Error("No verified authenticator is enrolled for this super admin");
    }

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: factor.id,
    });
    if (challengeError) throw challengeError;
    setMfaChallenge({ factorId: factor.id, challengeId: challenge.id });
    setMfaCode("");
    return true;
  }

  async function handleSuperAdminSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    try {
      await signInSupabaseAdmin(
        String(fd.get("email") ?? ""),
        String(fd.get("password") ?? ""),
      );
    } catch (error: any) {
      toast.error(error?.message ?? "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  async function signInSupabaseAdmin(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    if (await beginSuperAdminMfaIfNeeded()) {
      toast.info("Enter your authenticator code");
      return;
    }
    toast.success("Signed in");
    navigate({ to: getPostLoginRoute() });
  }

  async function handleVerifyMfa(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!mfaChallenge) return;
    setLoading(true);
    const { error } = await supabase.auth.mfa.verify({
      factorId: mfaChallenge.factorId,
      challengeId: mfaChallenge.challengeId,
      code: mfaCode,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Signed in");
    navigate({ to: getPostLoginRoute() });
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 nebula-glow">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="size-9 rounded-md bg-primary grid place-items-center text-primary-foreground font-bold shadow-[var(--shadow-glow)]">
            C
          </div>
          <div>
            <h1 className="font-bold tracking-tight">COSMO STAKES</h1>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {payoutHost ? "Payout Portal" : "Admin Console"}
            </p>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-6 shadow-2xl">
          <Tabs defaultValue="staff">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="staff">Staff</TabsTrigger>
              <TabsTrigger value="super-admin">Super admin</TabsTrigger>
            </TabsList>
            <TabsContent value="staff">
              <form onSubmit={handleStaffSignIn} className="space-y-4 pt-4">
                <div className="space-y-1.5">
                    <Label htmlFor="username">Email</Label>
                  <Input
                    id="username"
                    name="username"
                    required
                    autoComplete="email"
                    placeholder="staff@cosmostakes.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="staff-password">Password</Label>
                  <Input
                    id="staff-password"
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full shadow-[var(--shadow-glow)]"
                >
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="super-admin">
              {!mfaChallenge ? (
                <form onSubmit={handleSuperAdminSignIn} className="space-y-4 pt-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" name="email" type="email" required autoComplete="email" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="admin-password">Password</Label>
                    <Input
                      id="admin-password"
                      name="password"
                      type="password"
                      required
                      autoComplete="current-password"
                    />
                  </div>
                  <Button type="submit" disabled={loading} className="w-full">
                    {loading ? "Signing in..." : "Sign in"}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyMfa} className="space-y-4 pt-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="mfa-code">Authenticator code</Label>
                    <Input
                      id="mfa-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={mfaCode}
                      onChange={(event) => setMfaCode(event.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" disabled={loading || mfaCode.length < 6} className="w-full">
                    {loading ? "Verifying..." : "Verify code"}
                  </Button>
                </form>
              )}
            </TabsContent>
          </Tabs>
        </div>
        <p className="text-center text-[11px] text-muted-foreground mt-4">
          Internal use only · {payoutHost ? "payout.cosmostakes.net" : "cosmostakes.com"}
        </p>
      </div>
    </div>
  );
}
