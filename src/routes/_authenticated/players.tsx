import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listPlayersSegmented } from "@/lib/admin.functions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtUSD, fmtRelative } from "@/lib/format";
import { Search, UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/players")({
  component: PlayersPage,
});

type PlayerRow = {
  id: string;
  username: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  game_id: string | null;
  status: string;
  balance: number | string;
  created_at: string;
  game: { id: string; name: string; provider: string } | null;
};

function PlayersPage() {
  const fetchSegments = useServerFn(listPlayersSegmented);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"new" | "returning">("new");

  const query = useQuery({
    queryKey: ["players-segmented", q],
    queryFn: () => fetchSegments({ data: { q } }),
    placeholderData: (prev) => prev,
  });

  const newSignups = (query.data?.newSignups ?? []) as PlayerRow[];
  const returning = (query.data?.returning ?? []) as PlayerRow[];

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Players</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            New signups have no approved deposits yet. Returning clients have at least one.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search username, name, email, phone, game id"
            className="pl-8 h-9 text-sm"
          />
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "new" | "returning")}>
        <TabsList>
          <TabsTrigger value="new" className="gap-1.5">
            <UserPlus className="size-3.5" />
            New Signups
            <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary">
              {newSignups.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="returning" className="gap-1.5">
            <Users className="size-3.5" />
            Returning Clients
            <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-surface text-muted-foreground border border-border">
              {returning.length}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new">
          <PlayerListCard
            title="New Signups"
            description="Players who haven't completed a deposit yet."
            rows={newSignups}
            loading={query.isLoading}
            emptyLabel="No new signups."
          />
        </TabsContent>
        <TabsContent value="returning">
          <PlayerListCard
            title="Returning Clients"
            description="Players with at least one approved deposit."
            rows={returning}
            loading={query.isLoading}
            emptyLabel="No returning clients yet."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PlayerListCard({
  title,
  description,
  rows,
  loading,
  emptyLabel,
}: {
  title: string;
  description: string;
  rows: PlayerRow[];
  loading: boolean;
  emptyLabel: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Full name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Game ID</TableHead>
              <TableHead>Game</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                  Loading…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                  {emptyLabel}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.username}</TableCell>
                  <TableCell className="text-muted-foreground">{p.full_name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {p.email || p.phone || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{p.game_id ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {p.game ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-primary/20 bg-primary/10 text-primary">
                        {p.game.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtUSD(p.balance as number)}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border",
                        p.status === "active"
                          ? "border-success/30 text-success bg-success/10"
                          : p.status === "suspended"
                            ? "border-warning/30 text-warning bg-warning/10"
                            : p.status === "blocked"
                              ? "border-destructive/30 text-destructive bg-destructive/10"
                              : "border-border text-muted-foreground bg-surface",
                      )}
                    >
                      {p.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {fmtRelative(p.created_at)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}