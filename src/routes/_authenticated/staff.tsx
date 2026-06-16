import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import {
  listStaff,
  createStaff,
  setStaffRoles,
  setStaffActive,
  updateStaff,
  getStaffDetail,
} from "@/lib/admin.functions";
import { ROLE_LABEL, type Role, fmtRelative, fmtDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Shield, UserCheck, UserX, Eye, Activity } from "lucide-react";

export const Route = createFileRoute("/_authenticated/staff")({
  component: StaffPage,
});

const ALL_ROLES: Role[] = ["super_admin", "admin", "finance_agent", "support_agent"];

type StaffRow = {
  id: string;
  email: string;
  username: string | null;
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
  const [detailId, setDetailId] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["staff"] });

  const createMut = useMutation({
    mutationFn: (vars: { username: string; email: string; password: string; full_name: string; roles: Role[] }) =>
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
          <p className="text-xs text-muted-foreground">
            Super admin only · create staff accounts, assign roles, monitor activity
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="shadow-[var(--shadow-glow)]">
              <Plus className="size-4 mr-1" /> Add staff
            </Button>
          </DialogTrigger>
          <AddStaffDialog pending={createMut.isPending} onSubmit={(v) => createMut.mutate(v)} />
        </Dialog>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1.5fr_1fr_2fr_1fr_auto] gap-3 px-4 py-2.5 border-b border-border text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          <div>Name</div>
          <div>Username</div>
          <div>Roles</div>
          <div>Created</div>
          <div className="text-right">Actions</div>
        </div>
        {isLoading && <div className="p-6 text-xs text-muted-foreground">Loading staff…</div>}
        {!isLoading && (data?.length ?? 0) === 0 && (
          <div className="p-6 text-xs text-muted-foreground text-center">No staff yet.</div>
        )}
        <ul className="divide-y divide-border/50">
          {(data ?? []).map((s) => (
            <StaffRowItem
              key={s.id}
              row={s as StaffRow}
              busy={rolesMut.isPending || activeMut.isPending}
              onSaveRoles={(roles) => rolesMut.mutate({ user_id: s.id, roles })}
              onToggleActive={() => activeMut.mutate({ user_id: s.id, is_active: !s.is_active })}
              onView={() => setDetailId(s.id)}
            />
          ))}
        </ul>
      </div>

      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        {detailId && <StaffDetailDialog userId={detailId} />}
      </Dialog>
    </div>
  );
}

function StaffRowItem({
  row,
  busy,
  onSaveRoles,
  onToggleActive,
  onView,
}: {
  row: StaffRow;
  busy: boolean;
  onSaveRoles: (roles: Role[]) => void;
  onToggleActive: () => void;
  onView: () => void;
}) {
  const [selected, setSelected] = useState<Role[]>(row.roles as Role[]);
  const dirty = selected.slice().sort().join(",") !== row.roles.slice().sort().join(",");

  function toggle(r: Role) {
    setSelected((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  return (
    <li className="grid grid-cols-[1.5fr_1fr_2fr_1fr_auto] gap-3 px-4 py-3 items-center hover:bg-surface-hover/40">
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
      <div className="text-xs font-mono text-foreground/80 truncate">{row.username ?? "—"}</div>
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
        <Button size="sm" variant="ghost" onClick={onView} title="View / edit">
          <Eye className="size-3.5" />
        </Button>
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
  onSubmit: (v: { username: string; email: string; password: string; full_name: string; roles: Role[] }) => void;
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
      username: String(fd.get("username")).trim(),
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
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="full_name">Full name</Label>
            <Input id="full_name" name="full_name" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <Input id="username" name="username" required pattern="[A-Za-z0-9_.\-]{2,40}" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email (used to sign in)</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Temporary password</Label>
          <Input id="password" name="password" type="text" minLength={8} required defaultValue={genPassword()} />
          <p className="text-[10px] text-muted-foreground">
            Share with the new staff member securely. They sign in at /auth with email + password.
          </p>
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

function StaffDetailDialog({ userId }: { userId: string }) {
  const fetchDetail = useServerFn(getStaffDetail);
  const updateFn = useServerFn(updateStaff);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["staff-detail", userId],
    queryFn: () => fetchDetail({ data: { user_id: userId } }),
  });

  const [form, setForm] = useState({ username: "", full_name: "", email: "", password: "" });

  useEffect(() => {
    if (data?.profile) {
      setForm({
        username: data.profile.username ?? "",
        full_name: data.profile.full_name ?? "",
        email: data.profile.email ?? "",
        password: "",
      });
    }
  }, [data?.profile]);

  const mut = useMutation({
    mutationFn: (vars: { username?: string; full_name?: string; email?: string; password?: string }) =>
      updateFn({ data: { user_id: userId, ...vars } }),
    onSuccess: () => {
      toast.success("Staff updated");
      qc.invalidateQueries({ queryKey: ["staff"] });
      qc.invalidateQueries({ queryKey: ["staff-detail", userId] });
      setForm((f) => ({ ...f, password: "" }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const payload: { username?: string; full_name?: string; email?: string; password?: string } = {};
    const orig = data?.profile;
    if (orig) {
      if (form.username !== (orig.username ?? "")) payload.username = form.username;
      if (form.full_name !== (orig.full_name ?? "")) payload.full_name = form.full_name;
      if (form.email !== orig.email) payload.email = form.email;
    }
    if (form.password) payload.password = form.password;
    if (Object.keys(payload).length === 0) {
      toast.message("Nothing to update");
      return;
    }
    mut.mutate(payload);
  }

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Activity className="size-4 text-primary" />
          {data?.profile?.full_name || data?.profile?.email || "Staff"}
        </DialogTitle>
      </DialogHeader>
      {isLoading || !data ? (
        <div className="p-6 text-xs text-muted-foreground">Loading…</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-5">
          <form onSubmit={handle} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="d-fullname">Full name</Label>
              <Input
                id="d-fullname"
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-username">Username</Label>
              <Input
                id="d-username"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-email">Email</Label>
              <Input
                id="d-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-pass">New password</Label>
              <Input
                id="d-pass"
                type="text"
                placeholder="Leave blank to keep current"
                minLength={8}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={mut.isPending} className="shadow-[var(--shadow-glow)]">
                {mut.isPending ? "Saving…" : "Save changes"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setForm((f) => ({ ...f, password: genPassword() }))}
              >
                Generate password
              </Button>
            </div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground pt-2">
              Roles: {data.roles.map((r) => ROLE_LABEL[r as Role] ?? r).join(", ") || "—"}
            </div>
          </form>

          <div className="border border-border rounded-lg bg-background/40 flex flex-col min-h-0">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest">Activity</span>
              <span className="text-[10px] text-muted-foreground font-mono">{data.totalActions} total</span>
            </div>
            <ul className="divide-y divide-border/50 max-h-[360px] overflow-y-auto">
              {data.activity.length === 0 && (
                <li className="p-4 text-xs text-muted-foreground text-center">No actions yet.</li>
              )}
              {data.activity.map((a) => (
                <li key={a.id} className="px-3 py-2 text-xs">
                  <div className="font-mono text-[11px]">{a.action}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {fmtDateTime(a.created_at)} · {a.entity_type}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </DialogContent>
  );
}

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 14; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out + "!";
}