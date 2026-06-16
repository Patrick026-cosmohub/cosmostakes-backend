import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listVipTiers, upsertVipTier, deleteVipTier } from "@/lib/portal.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Crown, Plus, Trash2, Pencil } from "lucide-react";
import { fmtUSD } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/vip")({ component: VipPage });

type Tier = {
  id: string;
  name: string;
  icon: string | null;
  color: string;
  deposit_required: number;
  monthly_activity_required: number;
  cashback_pct: number;
  perks: string[];
  priority_support: boolean;
  sort_order: number;
  is_active: boolean;
};

function VipPage() {
  const list = useServerFn(listVipTiers);
  const upsert = useServerFn(upsertVipTier);
  const del = useServerFn(deleteVipTier);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["vip"], queryFn: () => list() });
  const [editing, setEditing] = useState<Partial<Tier> | null>(null);

  const save = useMutation({
    mutationFn: (t: Partial<Tier>) =>
      upsert({
        data: {
          id: t.id,
          name: t.name!,
          icon: t.icon ?? null,
          color: t.color || "#888888",
          deposit_required: Number(t.deposit_required ?? 0),
          monthly_activity_required: Number(t.monthly_activity_required ?? 0),
          cashback_pct: Number(t.cashback_pct ?? 0),
          perks: t.perks ?? [],
          priority_support: t.priority_support ?? false,
          sort_order: t.sort_order ?? 0,
          is_active: t.is_active ?? true,
        },
      }),
    onSuccess: () => {
      toast.success("Saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["vip"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["vip"] }); },
  });

  const rows = (q.data ?? []) as Tier[];

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><Crown className="size-5 text-primary" /> VIP Tiers</h1>
          <p className="text-xs text-muted-foreground">Customize VIP levels — players see updates instantly.</p>
        </div>
        <Button onClick={() => setEditing({ color: "#FFD700", sort_order: rows.length + 1, is_active: true, perks: [] })}>
          <Plus className="size-4 mr-1" /> New tier
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((t) => (
          <Card key={t.id} style={{ borderTop: `3px solid ${t.color}` }}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">{t.icon && <span>{t.icon}</span>}{t.name}</span>
                <span className="text-[10px] font-mono">#{t.sort_order}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-1.5">
              <div className="flex justify-between"><span className="text-muted-foreground">Deposit req.</span><span className="font-mono">{fmtUSD(t.deposit_required)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Monthly req.</span><span className="font-mono">{fmtUSD(t.monthly_activity_required)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Cashback</span><span className="font-mono">{t.cashback_pct}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Priority support</span><span>{t.priority_support ? "Yes" : "No"}</span></div>
              {t.perks.length > 0 && <div className="text-muted-foreground text-[10px]">Perks: {t.perks.join(", ")}</div>}
              <div className="flex gap-1.5 pt-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(t)}><Pencil className="size-3" /></Button>
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(t.id)}><Trash2 className="size-3 text-destructive" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {rows.length === 0 && !q.isLoading && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No VIP tiers yet.</CardContent></Card>}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit tier" : "New VIP tier"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Name</Label><Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
                <div><Label>Icon (emoji)</Label><Input value={editing.icon ?? ""} onChange={(e) => setEditing({ ...editing, icon: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Color</Label><Input type="color" value={editing.color ?? "#888888"} onChange={(e) => setEditing({ ...editing, color: e.target.value })} /></div>
                <div><Label>Sort order</Label><Input type="number" value={editing.sort_order ?? 0} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Deposit req.</Label><Input type="number" value={editing.deposit_required ?? 0} onChange={(e) => setEditing({ ...editing, deposit_required: Number(e.target.value) })} /></div>
                <div><Label>Monthly req.</Label><Input type="number" value={editing.monthly_activity_required ?? 0} onChange={(e) => setEditing({ ...editing, monthly_activity_required: Number(e.target.value) })} /></div>
                <div><Label>Cashback %</Label><Input type="number" value={editing.cashback_pct ?? 0} onChange={(e) => setEditing({ ...editing, cashback_pct: Number(e.target.value) })} /></div>
              </div>
              <div><Label>Perks (comma-separated)</Label><Textarea value={(editing.perks ?? []).join(", ")} onChange={(e) => setEditing({ ...editing, perks: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></div>
              <div className="flex gap-4">
                <div className="flex items-center gap-2"><Switch checked={editing.priority_support ?? false} onCheckedChange={(v) => setEditing({ ...editing, priority_support: v })} /><Label>Priority support</Label></div>
                <div className="flex items-center gap-2"><Switch checked={editing.is_active ?? true} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} /><Label>Active</Label></div>
              </div>
              <Button className="w-full" disabled={save.isPending} onClick={() => save.mutate(editing)}>Save</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}