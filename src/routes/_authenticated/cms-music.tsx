import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getMusic,
  updateMusicSettings,
  addMusicTrack,
  deleteMusicTrack,
} from "@/lib/portal.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Music, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cms-music")({ component: MusicPage });

type Settings = { enabled: boolean; autoplay: boolean; default_volume: number };
type Track = { id: string; title: string; url: string };

function isYouTubeUrl(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "youtu.be" || host.includes("youtube.com");
  } catch {
    return false;
  }
}

function MusicPage() {
  const get = useServerFn(getMusic);
  const upd = useServerFn(updateMusicSettings);
  const add = useServerFn(addMusicTrack);
  const del = useServerFn(deleteMusicTrack);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["music"], queryFn: () => get() });
  const [s, setS] = useState<Settings | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (q.data?.settings && !s) {
      const ss = q.data.settings as unknown as Settings;
      setS({
        enabled: ss.enabled,
        autoplay: ss.autoplay,
        default_volume: Number(ss.default_volume),
      });
    }
  }, [q.data, s]);

  const saveS = useMutation({
    mutationFn: () => upd({ data: s! }),
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["music"] });
    },
  });
  const addT = useMutation({
    mutationFn: () => add({ data: { title, url } }),
    onSuccess: () => {
      toast.success("Added");
      setTitle("");
      setUrl("");
      qc.invalidateQueries({ queryKey: ["music"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delT = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["music"] }),
  });

  const tracks = (q.data?.tracks ?? []) as Track[];

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Music className="size-5 text-primary" /> Background Music
        </h1>
        <p className="text-xs text-muted-foreground">Player dashboard music settings & playlist.</p>
      </div>

      {s && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Switch checked={s.enabled} onCheckedChange={(v) => setS({ ...s, enabled: v })} />
              <Label>Enable music</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={s.autoplay} onCheckedChange={(v) => setS({ ...s, autoplay: v })} />
              <Label>Autoplay</Label>
            </div>
            <div>
              <Label>Default volume ({Math.round(s.default_volume * 100)}%)</Label>
              <Input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={s.default_volume}
                onChange={(e) => setS({ ...s, default_volume: Number(e.target.value) })}
              />
            </div>
            <Button onClick={() => saveS.mutate()} disabled={saveS.isPending}>
              Save settings
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-5 space-y-3">
          <h2 className="text-sm font-semibold">Playlist</h2>
          <div className="flex gap-2">
            <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input
              placeholder="https://youtu.be/... or https://...mp3"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Button onClick={() => addT.mutate()} disabled={!title || !url || addT.isPending}>
              <Plus className="size-4" />
            </Button>
          </div>
          <ul className="divide-y divide-border/50">
            {tracks.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{t.title}</div>
                  <div className="text-[10px] text-muted-foreground truncate font-mono">
                    {t.url}
                  </div>
                </div>
                {isYouTubeUrl(t.url) ? (
                  <a
                    href={t.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    YouTube
                  </a>
                ) : (
                  <audio src={t.url} controls className="h-7" />
                )}
                <Button size="sm" variant="ghost" onClick={() => delT.mutate(t.id)}>
                  <Trash2 className="size-3 text-destructive" />
                </Button>
              </li>
            ))}
            {tracks.length === 0 && (
              <li className="py-6 text-center text-xs text-muted-foreground">No tracks yet.</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
