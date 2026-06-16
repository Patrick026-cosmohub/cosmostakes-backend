import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listStaff, createStaff, setStaffRoles, setStaffActive } from "@/lib/admin.functions";
import { ROLE_LABEL, type Role, fmtRelative } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Shield, UserCheck, UserX } from "lucide-react";

export const Route = createFileRoute("/_authenticated/staff")({
  component: StaffPage,
});

const ALL_ROLES: Role[] = ["super_admin", "admin", "finance_agent", "support_agent"];

type StaffRow = {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
  roles: string[];
};

function StaffPage() {
  const fetchStaff = useServerFn(listStaff);
  const createFn = useServerFn(createStaff);
  const updateRoles = useServerFn(setStaffRoles);
  const toggleActive = useServerFn(setStaffActive);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["staff"], queryFn: () => fetchStaff() });
  const [addOpen, setAddOpen] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["staff"] });

  const createMut = useMutation({
    mutationFn: (vars: { email: string; password: string; full_name: string; roles: Role[] }) =>
      createFn({ data: vars }),
    onSuccess: () => {
      toast.success("Staff account created");
      setAddOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rolesMut = useMutation({
    mutationFn: (vars: { user_id: string; roles: Role[] }) => updateRoles({ data: vars }),
    onSuccess: () => {
      toast.success("Roles updated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeMut = useMutation({
    mutationFn: (vars: { user_id: string; is_active: boolean }) => toggleActive({ data: vars }),
    onSuccess: (_d, v) => {
      toast.success(v.is_active ? "Account activated" : "Account deactivated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Staff & Roles</h1>
          <p className="text-xs text-muted-foreground">Super admin only · create staff accounts and assign roles</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="shadow-[var(--shadow-glow)]">
              <Plus className="size-4 mr-1" /> Add staff
            </Button>
          </DialogTrigger>
          <AddStaffDialog
            pending={createMut.isPending}
            onSubmit={(v) => createMut.mutate(v)}
          />
        </Dialog>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1.5fr_2fr_1fr_auto] gap-3 px-4 py-2.5 border-b border-border text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          <div>Name</div>
          <div>Roles</div>
          <div>Created</div>
          <div className="text-right">Actions</div>
        </div>
        {isLoading && <div className="p-6 text-xs text-muted-foreground">Loading staff…</div>}
        {!isLoading && (data?.length ?? 0) === 0 && (
          <div className="p-6 text-xs text-muted-foreground text-center">No staff yet.</div>
        )}
        <ul className="divide-y divide-border/50">
          {(data ?? []).map((s: StaffRow) => (
            <StaffRowItem
              key={s.id}
              row={s}
              busy={rolesMut.isPending || activeMut.isPending}
              onSaveRoles={(roles) => rolesMut.mutate({ user_id: s.id, roles })}
              onToggleActive={() => activeMut.mutate({ user_id: s.id, is_active: !s.is_active })}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

function StaffRowItem({
  row,
  busy,
  onSaveRoles,
  onToggleActive,
}: {
  row: StaffRow;
  busy: boolean;
  onSaveRoles: (roles: Role[]) => void;
  onToggleActive: () => void;
}) {
  const [selected, setSelected] = useState<Role[]>(row.roles as Role[]);
  const dirty = selected.slice().sort().join(",") !== row.roles.slice().sort().join(",");

  function toggle(r: Role) {
    setSelected((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  return (
    <li className="grid grid-cols-[1.5fr_2fr_1fr_auto] gap-3 px-4 py-3 items-center hover:bg-surface-hover/40">
      <div className="min-w-0">
        <div className="text-sm font-medium truncate flex items-center gap-2">
          {row.full_name || row.email}
          {!row.is_active && (
            <span className="text-[9px] uppercase tracking-widest text-warning border border-warning/30 px-1.5 py-0.5 rounded">
              Inactive
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground truncate font-mono">{row.email}</div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ALL_ROLES.map((r) => {
          const on = selected.includes(r);
          return (
            <button
              key={r}
              type="button"
              disabled={busy}
              onClick={() => toggle(r)}
              className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded border transition-colors ${
                on
                  ? "bg-primary/15 text-primary border-primary/30"
                  : "bg-transparent text-muted-foreground border-border hover:border-primary/30"
              }`}
            >
              {ROLE_LABEL[r]}
            </button>
          );
        })}
      </div>
      <div className="text-[11px] text-muted-foreground">{fmtRelative(row.created_at)}</div>
      <div className="flex gap-1.5 justify-end">
        {dirty && (
          <Button size="sm" disabled={busy} onClick={() => onSaveRoles(selected)}>
            <Shield className="size-3.5 mr-1" />
            Save
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={busy} onClick={onToggleActive}>
          {row.is_active ? <UserX className="size-3.5" /> : <UserCheck className="size-3.5" />}
        </Button>
      </div>
    </li>
  );
}

function AddStaffDialog({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (v: { email: string; password: string; full_name: string; roles: Role[] }) => void;
}) {
  const [roles, setRoles] = useState<Role[]>(["admin"]);

  function toggle(r: Role) {
    setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  function handle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (roles.length === 0) {
      toast.error("Select at least one role");
      return;
    }
    onSubmit({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
      full_name: String(fd.get("full_name")),
      roles,
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add staff account</DialogTitle>
      </DialogHeader>
      <form onSubmit={handle} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="full_name">Full name</Label>
          <Input id="full_name" name="full_name" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Temporary password</Label>
          <Input id="password" name="password" type="text" minLength={8} required defaultValue={genPassword()} />
          <p className="text-[10px] text-muted-foreground">Share with the new staff member securely. They can change it after sign-in.</p>
        </div>
        <div className="space-y-2">
          <Label>Roles</Label>
          <div className="grid grid-cols-2 gap-2">
            {ALL_ROLES.map((r) => (
              <label
                key={r}
                className="flex items-center gap-2 border border-border rounded-md px-3 py-2 cursor-pointer hover:border-primary/30"
              >
                <Checkbox checked={roles.includes(r)} onCheckedChange={() => toggle(r)} />
                <span className="text-xs">{ROLE_LABEL[r]}</span>
              </label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={pending} className="shadow-[var(--shadow-glow)]">
            {pending ? "Creating…" : "Create account"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 14; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out + "!";
}