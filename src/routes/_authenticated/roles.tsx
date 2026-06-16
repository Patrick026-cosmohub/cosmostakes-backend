import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMe, listStaff } from "@/lib/admin.functions";
import { ROLE_LABEL, type Role } from "@/lib/format";
import {
  ROLE_PERMISSIONS,
  ROLE_DESCRIPTION,
  PERMISSION_GROUPS,
} from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Shield, Check, Minus, Crown, UserCog, Wallet, Eye, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/roles")({
  component: RolesPage,
});

const ROLE_ORDER: Role[] = ["super_admin", "admin", "finance_agent", "support_agent"];

const ROLE_ICON: Record<Role, typeof Shield> = {
  super_admin: Crown,
  admin: UserCog,
  finance_agent: Wallet,
  support_agent: Eye,
};

function RolesPage() {
  const fetchMe = useServerFn(getMe);
  const fetchStaff = useServerFn(listStaff);
  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const staff = useQuery({ queryKey: ["staff"], queryFn: () => fetchStaff() });

  const isSuperAdmin = (me.data?.roles ?? []).includes("super_admin");

  if (me.isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!isSuperAdmin) {
    return (
      <div className="p-6">
        <Card className="bg-surface border-border max-w-md">
          <CardHeader><CardTitle className="text-base">Forbidden</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Only super admins can view Roles & Permissions.
          </CardContent>
        </Card>
      </div>
    );
  }

  // Count assigned staff per role
  const counts: Record<Role, number> = {
    super_admin: 0, admin: 0, finance_agent: 0, support_agent: 0,
  };
  for (const s of (staff.data ?? []) as { roles: string[] }[]) {
    for (const r of s.roles) if (r in counts) counts[r as Role]++;
  }

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Shield className="size-5 text-primary" />
            Roles & Permissions
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Role-based access control. Permissions are enforced in the UI and at the database level (RLS).
          </p>
        </div>
        <Link to="/staff">
          <Button variant="outline" size="sm">
            Assign roles in Staff <ArrowRight className="size-3.5" />
          </Button>
        </Link>
      </div>

      {/* Role summary cards */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {ROLE_ORDER.map((r) => {
          const Icon = ROLE_ICON[r];
          return (
            <Card key={r} className="bg-surface border-border">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Icon className="size-4 text-primary" />
                    {ROLE_LABEL[r]}
                  </CardTitle>
                  <Badge variant="secondary" className="text-[10px]">{counts[r]} staff</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <CardDescription className="text-xs leading-relaxed">{ROLE_DESCRIPTION[r]}</CardDescription>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground pt-2">
                  {ROLE_PERMISSIONS[r].length} permissions granted
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Permission matrix */}
      <Card className="bg-surface border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Permission Matrix</CardTitle>
          <CardDescription className="text-xs">
            Each role's access across every section of the admin portal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[280px]">Capability</TableHead>
                {ROLE_ORDER.map((r) => (
                  <TableHead key={r} className="text-center">{ROLE_LABEL[r]}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {PERMISSION_GROUPS.map((group) => (
                <>
                  <TableRow key={group.label} className="bg-surface-hover/40">
                    <TableCell colSpan={1 + ROLE_ORDER.length} className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      {group.label}
                    </TableCell>
                  </TableRow>
                  {group.items.map((perm) => (
                    <TableRow key={perm.key}>
                      <TableCell className="text-sm">{perm.label}</TableCell>
                      {ROLE_ORDER.map((r) => {
                        const allowed = ROLE_PERMISSIONS[r].includes(perm.key);
                        return (
                          <TableCell key={r} className="text-center">
                            {allowed ? (
                              <Check className="size-4 text-success mx-auto" />
                            ) : (
                              <Minus className="size-4 text-muted-foreground/40 mx-auto" />
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </>
              ))}
            </TableBody>
          </Table>
          <p className="text-[11px] text-muted-foreground mt-4">
            To change which staff hold which roles, open <Link to="/staff" className="text-primary hover:underline">Staff</Link>.
            Role definitions are managed in code (<code className="text-[10px] bg-surface-hover px-1 py-0.5 rounded">src/lib/permissions.ts</code>)
            so they stay in sync with database policies.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}