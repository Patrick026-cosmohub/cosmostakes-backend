import { createFileRoute, Outlet, redirect, Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getMe } from "@/lib/admin.functions";
import { useServerFn } from "@tanstack/react-start";
import {
  LayoutDashboard,
  Users,
  ArrowDownToLine,
  ArrowUpFromLine,
  Wallet,
  ScrollText,
  Shield,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL, type Role } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

const NAV: { to: string; label: string; icon: typeof LayoutDashboard; roles?: Role[] }[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/players", label: "Players", icon: Users },
  { to: "/deposits", label: "Deposits", icon: ArrowDownToLine },
  { to: "/cashouts", label: "Cashouts", icon: ArrowUpFromLine },
  { to: "/wallet-tools", label: "Wallet Tools", icon: Wallet, roles: ["super_admin", "admin", "finance_agent"] },
  { to: "/audit-log", label: "Audit Log", icon: ScrollText },
  { to: "/staff", label: "Staff", icon: Shield, roles: ["super_admin"] },
  { to: "/settings", label: "Settings", icon: Settings, roles: ["super_admin"] },
];

function AuthedLayout() {
  const router = useRouter();
  const fetchMe = useServerFn(getMe);
  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const [open, setOpen] = useState(false);

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const roles = (me.data?.roles ?? []) as Role[];
  const primaryRole = (roles[0] ?? "support_agent") as Role;

  async function signOut() {
    await supabase.auth.signOut();
    router.invalidate();
  }

  if (me.isLoading) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (me.data && roles.length === 0) {
    return (
      <div className="min-h-screen grid place-items-center px-4 nebula-glow">
        <div className="bg-surface border border-border rounded-xl p-8 max-w-md text-center space-y-4">
          <Shield className="size-8 text-primary mx-auto" />
          <h1 className="font-semibold">No role assigned</h1>
          <p className="text-sm text-muted-foreground">
            Your account exists but a super admin hasn't granted you access yet. Contact your super admin.
          </p>
          <Button variant="outline" onClick={signOut}>Sign out</Button>
        </div>
      </div>
    );
  }

  const visibleNav = NAV.filter((n) => !n.roles || n.roles.some((r) => roles.includes(r)));

  return (
    <div className="min-h-screen flex bg-background nebula-glow">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-40 w-60 bg-sidebar border-r border-sidebar-border flex flex-col shrink-0 transition-transform",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="h-14 px-4 flex items-center gap-2 border-b border-sidebar-border">
          <div className="size-7 bg-primary rounded grid place-items-center text-[10px] font-bold text-primary-foreground shadow-[var(--shadow-glow)]">
            CS
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">Cosmo Stakes</div>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Admin</div>
          </div>
          <button className="ml-auto lg:hidden p-1 text-muted-foreground" onClick={() => setOpen(false)}>
            <X className="size-4" />
          </button>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to || (item.to !== "/dashboard" && pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-muted-foreground hover:bg-surface-hover hover:text-foreground border border-transparent",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="size-8 rounded-full bg-surface border border-border grid place-items-center text-xs font-semibold">
              {(me.data?.profile?.full_name ?? me.data?.profile?.email ?? "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{me.data?.profile?.full_name || me.data?.profile?.email}</div>
              <div className="text-[9px] uppercase tracking-widest text-primary">{ROLE_LABEL[primaryRole]}</div>
            </div>
            <button title="Sign out" onClick={signOut} className="p-1.5 text-muted-foreground hover:text-foreground">
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-black/60 z-30 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border flex items-center px-4 lg:px-6 gap-3 bg-background/80 backdrop-blur sticky top-0 z-20">
          <button className="lg:hidden p-1 text-muted-foreground" onClick={() => setOpen(true)}>
            <Menu className="size-5" />
          </button>
          <div className="text-xs text-muted-foreground">
            <span className="text-foreground font-medium">{me.data?.profile?.full_name || "Staff"}</span>
            <span className="mx-2">·</span>
            <span>cosmostakes.com / Admin</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-success">
            <span className="size-1.5 rounded-full bg-success" />
            Live
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}