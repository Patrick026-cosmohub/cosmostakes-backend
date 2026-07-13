import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listGamesAdmin, updateGame } from "@/lib/portal.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Gamepad2, Pencil, Star } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cms-games")({ component: CmsGamesPage });

type Game = {
  id: string;
  name: string;
  provider: string;
  is_active: boolean;
  maintenance_mode: boolean;
  display_title: string | null;
  description: string | null;
  thumbnail_url: string | null;
  logo_url: string | null;
  featured: boolean;
  sort_order: number;
};

function CmsGamesPage() {
  const list = useServerFn(listGamesAdmin);
  const upd = useServerFn(updateGame);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["games-admin"], queryFn: () => list() });
  const [editing, setEditing] = useState<Game | null>(null);

  const save = useMutation({
    mutationFn: (g: Game) =>
      upd({
        data: {
          id: g.id,
          is_active: g.is_active,
          maintenance_mode: g.maintenance_mode,
          display_title: g.display_title,
          description: g.description,
          thumbnail_url: g.thumbnail_url,
          logo_url: g.logo_url,
          featured: g.featured,
          sort_order: g.sort_order,
        },
      }),
    onSuccess: () => {
      toast.success("Saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["games-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (vars: { id: string; patch: Partial<Game> }) =>
      upd({ data: { id: vars.id, ...vars.patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["games-admin"] }),
  });

  const rows = (q.data ?? []) as Game[];

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Gamepad2 className="size-5 text-primary" /> Game Display
        </h1>
        <p className="text-xs text-muted-foreground">
          Edit titles, descriptions, thumbnails, featured flags — applies on player dashboard.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((g) => (
          <Card key={g.id}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  {g.logo_url ? (
                    <img src={g.logo_url} alt="" className="size-8 rounded" />
                  ) : (
                    <div className="size-8 rounded bg-muted" />
                  )}
                  <div>
                    <div className="font-semibold text-sm">{g.display_title || g.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      #{g.sort_order} · {g.provider}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  {g.featured && (
                    <Badge>
                      <Star className="size-3 mr-0.5" />
                      Featured
                    </Badge>
                  )}
                  {g.maintenance_mode && <Badge variant="destructive">Maintenance</Badge>}
                  {!g.is_active && <Badge variant="secondary">Off</Badge>}
                </div>
              </div>
              {g.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{g.description}</p>
              )}
              <div className="flex gap-3 pt-2 text-xs">
                <label className="flex items-center gap-1">
                  <Switch
                    checked={g.is_active}
                    onCheckedChange={(v) => toggle.mutate({ id: g.id, patch: { is_active: v } })}
                  />{" "}
                  Active
                </label>
                <label className="flex items-center gap-1">
                  <Switch
                    checked={g.featured}
                    onCheckedChange={(v) => toggle.mutate({ id: g.id, patch: { featured: v } })}
                  />{" "}
                  Featured
                </label>
                <label className="flex items-center gap-1">
                  <Switch
                    checked={g.maintenance_mode}
                    onCheckedChange={(v) =>
                      toggle.mutate({ id: g.id, patch: { maintenance_mode: v } })
                    }
                  />{" "}
                  Maint.
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto"
                  onClick={() => setEditing(g)}
                >
                  <Pencil className="size-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit {editing?.name}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Display title</Label>
                <Input
                  value={editing.display_title ?? ""}
                  onChange={(e) => setEditing({ ...editing, display_title: e.target.value })}
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={editing.description ?? ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Logo URL</Label>
                  <Input
                    value={editing.logo_url ?? ""}
                    onChange={(e) => setEditing({ ...editing, logo_url: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Thumbnail URL</Label>
                  <Input
                    value={editing.thumbnail_url ?? ""}
                    onChange={(e) => setEditing({ ...editing, thumbnail_url: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Sort order</Label>
                <Input
                  type="number"
                  value={editing.sort_order}
                  onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
                />
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
