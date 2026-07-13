import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSiteTheme, updateSiteTheme } from "@/lib/portal.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Palette } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cms-theme")({ component: ThemePage });

type Theme = {
  mode: "light" | "dark";
  primary_color: string;
  accent_color: string;
  background_image: string | null;
  banner_image: string | null;
  logo_url: string | null;
  widgets: Record<string, unknown>;
};

function ThemePage() {
  const get = useServerFn(getSiteTheme);
  const upd = useServerFn(updateSiteTheme);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["site-theme"], queryFn: () => get() });
  const [form, setForm] = useState<Theme | null>(null);

  useEffect(() => {
    if (q.data && !form) setForm(q.data as unknown as Theme);
  }, [q.data, form]);

  const save = useMutation({
    mutationFn: () =>
      upd({
        data: {
          mode: form!.mode,
          primary_color: form!.primary_color,
          accent_color: form!.accent_color,
          background_image: form!.background_image,
          banner_image: form!.banner_image,
          logo_url: form!.logo_url,
          widgets: form!.widgets ?? {},
        },
      }),
    onSuccess: () => {
      toast.success("Theme saved");
      qc.invalidateQueries({ queryKey: ["site-theme"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!form) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Palette className="size-5 text-primary" /> Theme & Branding
        </h1>
        <p className="text-xs text-muted-foreground">
          Player dashboard appearance — applies instantly.
        </p>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Mode</Label>
              <Select
                value={form.mode}
                onValueChange={(v) => setForm({ ...form, mode: v as "light" | "dark" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Primary</Label>
              <Input
                type="color"
                value={form.primary_color}
                onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
              />
            </div>
            <div>
              <Label>Accent</Label>
              <Input
                type="color"
                value={form.accent_color}
                onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Logo URL</Label>
            <Input
              value={form.logo_url ?? ""}
              onChange={(e) => setForm({ ...form, logo_url: e.target.value || null })}
              placeholder="https://..."
            />
          </div>
          <div>
            <Label>Banner image URL</Label>
            <Input
              value={form.banner_image ?? ""}
              onChange={(e) => setForm({ ...form, banner_image: e.target.value || null })}
            />
          </div>
          <div>
            <Label>Background image URL</Label>
            <Input
              value={form.background_image ?? ""}
              onChange={(e) => setForm({ ...form, background_image: e.target.value || null })}
            />
          </div>

          <div className="pt-3 border-t border-border">
            <Label className="mb-2 block">Preview</Label>
            <div
              className="h-32 rounded-lg flex items-center justify-center text-white relative overflow-hidden"
              style={{
                background: form.background_image
                  ? `url(${form.background_image}) center/cover`
                  : `linear-gradient(135deg, ${form.primary_color}, ${form.accent_color})`,
              }}
            >
              {form.logo_url && <img src={form.logo_url} alt="" className="h-10 mr-3" />}
              <span className="font-bold text-lg">Cosmo Stakes</span>
            </div>
          </div>

          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            Save theme
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
