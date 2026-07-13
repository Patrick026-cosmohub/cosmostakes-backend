import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listBonuses, upsertBonus, deleteBonus } from "@/lib/portal.functions";
import { listGamesAdmin } from "@/lib/portal.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Gift, Plus, Trash2, Pencil } from "lucide-react";
import { fmtUSD } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/promotions")({ component: PromotionsPage });

type Bonus = {
  id: string;
  name: string;
  type: "welcome" | "referral" | "reload" | "cashback" | "seasonal";
  description: string | null;
  percentage: number;
  min_deposit: number;
  max_bonus: number;
  game_id: string | null;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  game: { name: string } | null;
};

function PromotionsPage() {
  const list = useServerFn(listBonuses);
  const games = useServerFn(listGamesAdmin);
  const upsert = useServerFn(upsertBonus);
  const del = useServerFn(deleteBonus);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["bonuses"], queryFn: () => list() });
  const gq = useQuery({ queryKey: ["games-admin"], queryFn: () => games() });
  const [editing, setEditing] = useState<Partial<Bonus> | null>(null);

  const save = useMutation({
    mutationFn: (b: Partial<Bonus>) =>
      upsert({
        data: {
          id: b.id,
          name: b.name!,
          type: b.type ?? "welcome",
          description: b.description ?? null,
          percentage: Number(b.percentage ?? 0),
          min_deposit: Number(b.min_deposit ?? 0),
          max_bonus: Number(b.max_bonus ?? 0),
          game_id: b.game_id || null,
          starts_at: b.starts_at || null,
          expires_at: b.expires_at || null,
          is_active: b.is_active ?? true,
        },
      }),
    onSuccess: () => {
      toast.success("Saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["bonuses"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["bonuses"] });
    },
  });

  const rows = (q.data ?? []) as Bonus[];
  const allGames = (gq.data ?? []) as { id: string; name: string }[];

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Gift className="size-5 text-primary" /> Promotions & Bonuses
          </h1>
          <p className="text-xs text-muted-foreground">
            Welcome, referral, reload, cashback and seasonal bonuses.
          </p>
        </div>
        <Button onClick={() => setEditing({ type: "welcome", is_active: true })}>
          <Plus className="size-4 mr-1" /> New bonus
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((b) => (
          <Card key={b.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm">
                <span>{b.name}</span>
                <Badge variant={b.is_active ? "default" : "secondary"}>{b.type}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bonus %</span>
                <span className="font-mono">{b.percentage}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Min deposit</span>
                <span className="font-mono">{fmtUSD(b.min_deposit)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Max bonus</span>
                <span className="font-mono">{fmtUSD(b.max_bonus)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Platform</span>
                <span>{b.game?.name ?? "All"}</span>
              </div>
              {b.expires_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expires</span>
                  <span>{new Date(b.expires_at).toLocaleDateString()}</span>
                </div>
              )}
              <div className="flex gap-1.5 pt-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(b)}>
                  <Pencil className="size-3" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(b.id)}>
                  <Trash2 className="size-3 text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {rows.length === 0 && !q.isLoading && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No bonuses yet.
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit bonus" : "New bonus"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input
                  value={editing.name ?? ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Type</Label>
                  <Select
                    value={editing.type}
                    onValueChange={(v) => setEditing({ ...editing, type: v as Bonus["type"] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["welcome", "referral", "reload", "cashback", "seasonal"].map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Platform</Label>
                  <Select
                    value={editing.game_id ?? "__all__"}
                    onValueChange={(v) =>
                      setEditing({ ...editing, game_id: v === "__all__" ? null : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All platforms</SelectItem>
                      {allGames.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Percentage</Label>
                  <Input
                    type="number"
                    value={editing.percentage ?? 0}
                    onChange={(e) => setEditing({ ...editing, percentage: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Min deposit</Label>
                  <Input
                    type="number"
                    value={editing.min_deposit ?? 0}
                    onChange={(e) =>
                      setEditing({ ...editing, min_deposit: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Max bonus</Label>
                  <Input
                    type="number"
                    value={editing.max_bonus ?? 0}
                    onChange={(e) => setEditing({ ...editing, max_bonus: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Starts at</Label>
                  <Input
                    type="datetime-local"
                    value={editing.starts_at?.slice(0, 16) ?? ""}
                    onChange={(e) => setEditing({ ...editing, starts_at: e.target.value || null })}
                  />
                </div>
                <div>
                  <Label>Expires at</Label>
                  <Input
                    type="datetime-local"
                    value={editing.expires_at?.slice(0, 16) ?? ""}
                    onChange={(e) => setEditing({ ...editing, expires_at: e.target.value || null })}
                  />
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={editing.description ?? ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editing.is_active ?? true}
                  onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                />
                <Label>Active</Label>
              </div>
              <Button
                className="w-full"
                disabled={save.isPending}
                onClick={() => save.mutate(editing)}
              >
                Save
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
