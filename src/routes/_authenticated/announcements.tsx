import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listAnnouncements,
  upsertAnnouncement,
  deleteAnnouncement,
  listGamesAdmin,
} from "@/lib/portal.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Megaphone, Plus, Pin, Trash2, Pencil } from "lucide-react";
import { fmtRelative } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/announcements")({
  component: AnnouncementsPage,
});

type Ann = {
  id: string;
  title: string;
  body: string;
  starts_at: string;
  ends_at: string | null;
  pinned: boolean;
  push_enabled: boolean;
  game_id: string | null;
  is_active: boolean;
  game: { name: string } | null;
};

function AnnouncementsPage() {
  const list = useServerFn(listAnnouncements);
  const games = useServerFn(listGamesAdmin);
  const upsert = useServerFn(upsertAnnouncement);
  const del = useServerFn(deleteAnnouncement);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["announcements"], queryFn: () => list() });
  const gq = useQuery({ queryKey: ["games-admin"], queryFn: () => games() });
  const [editing, setEditing] = useState<Partial<Ann> | null>(null);

  const save = useMutation({
    mutationFn: (a: Partial<Ann>) =>
      upsert({
        data: {
          id: a.id,
          title: a.title!,
          body: a.body!,
          starts_at: a.starts_at || undefined,
          ends_at: a.ends_at || undefined,
          pinned: a.pinned ?? false,
          push_enabled: a.push_enabled ?? false,
          game_id: a.game_id || undefined,
          is_active: a.is_active ?? true,
        },
      }),
    onSuccess: () => {
      toast.success("Saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["announcements"] });
    },
  });
  const allGames = (gq.data ?? []) as { id: string; name: string }[];
  const rows = (q.data ?? []) as Ann[];

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Megaphone className="size-5 text-primary" /> Announcements
          </h1>
          <p className="text-xs text-muted-foreground">
            Schedule, pin and broadcast platform-wide messages.
          </p>
        </div>
        <Button onClick={() => setEditing({ is_active: true })}>
          <Plus className="size-4 mr-1" /> New
        </Button>
      </div>

      <div className="space-y-3">
        {rows.map((a) => (
          <Card key={a.id}>
            <CardContent className="p-4 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {a.pinned && <Pin className="size-3 text-warning" />}
                  <h3 className="font-semibold text-sm">{a.title}</h3>
                  {a.push_enabled && <Badge variant="outline">Push</Badge>}
                  {!a.is_active && <Badge variant="secondary">Inactive</Badge>}
                  {a.game?.name && <Badge>{a.game.name}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{a.body}</p>
                <div className="text-[10px] text-muted-foreground mt-2 font-mono">
                  {fmtRelative(a.starts_at)} {a.ends_at && `· ends ${fmtRelative(a.ends_at)}`}
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" onClick={() => setEditing(a)}>
                  <Pencil className="size-3" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(a.id)}>
                  <Trash2 className="size-3 text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {rows.length === 0 && !q.isLoading && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No announcements yet.
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit" : "New"} announcement</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Title</Label>
                <Input
                  value={editing.title ?? ""}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                />
              </div>
              <div>
                <Label>Body</Label>
                <Textarea
                  rows={5}
                  value={editing.body ?? ""}
                  onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Starts at</Label>
                  <Input
                    type="datetime-local"
                    value={editing.starts_at?.slice(0, 16) ?? ""}
                    onChange={(e) => setEditing({ ...editing, starts_at: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Ends at</Label>
                  <Input
                    type="datetime-local"
                    value={editing.ends_at?.slice(0, 16) ?? ""}
                    onChange={(e) => setEditing({ ...editing, ends_at: e.target.value || null })}
                  />
                </div>
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
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editing.pinned ?? false}
                    onCheckedChange={(v) => setEditing({ ...editing, pinned: v })}
                  />
                  <Label>Pinned</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editing.push_enabled ?? false}
                    onCheckedChange={(v) => setEditing({ ...editing, push_enabled: v })}
                  />
                  <Label>Push</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editing.is_active ?? true}
                    onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                  />
                  <Label>Active</Label>
                </div>
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
