import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Search, Wallet, Plus, Minus } from "lucide-react";
import { adjustPlayerDashboardWallet, searchPlayerWallets } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtUSD } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/wallet-tools")({
  component: WalletToolsPage,
});

type WalletProfile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  gold_coins: number | string | null;
  sweeps_coins: number | string | null;
};

function displayName(profile: WalletProfile) {
  const full = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
  return full || profile.email || profile.phone || profile.id;
}

function WalletToolsPage() {
  const searchFn = useServerFn(searchPlayerWallets);
  const adjustFn = useServerFn(adjustPlayerDashboardWallet);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<WalletProfile | null>(null);
  const [currency, setCurrency] = useState<"sweeps" | "gold">("sweeps");
  const [kind, setKind] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("10");
  const [reason, setReason] = useState("Test wallet load");

  const walletsQ = useQuery({
    queryKey: ["player-wallets", q],
    queryFn: () => searchFn({ data: { q } }),
    placeholderData: (prev) => prev,
  });

  const adjustM = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Select a player first");
      return adjustFn({
        data: {
          user_id: selected.id,
          currency,
          kind,
          amount: Number(amount),
          reason,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(`${currency === "sweeps" ? "Sweeps" : "Gold"} balance updated`);
      qc.invalidateQueries({ queryKey: ["player-wallets"] });
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              [currency === "sweeps" ? "sweeps_coins" : "gold_coins"]: res.balance,
            }
          : prev,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (walletsQ.data ?? []) as WalletProfile[];

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Wallet Tools</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manually credit or debit the player dashboard Cosmo wallet for testing game loads.
          </p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, or phone"
            className="pl-8 h-9 text-sm"
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Player Wallets</CardTitle>
            <CardDescription>Click Select next to the player profile you want to adjust.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Sweeps</TableHead>
                  <TableHead className="text-right">Gold</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {walletsQ.isLoading && rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                      No player wallets found.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((profile) => {
                    const active = selected?.id === profile.id;
                    return (
                      <TableRow
                        key={profile.id}
                        className={cn("cursor-pointer", active && "bg-primary/10")}
                        onClick={() => setSelected(profile)}
                      >
                        <TableCell className="font-medium">{displayName(profile)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{profile.email || profile.phone || "-"}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtUSD(Number(profile.sweeps_coins ?? 0))}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(profile.gold_coins ?? 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant={active ? "default" : "outline"}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected(profile);
                            }}
                          >
                            {active ? "Selected" : "Select"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="size-4 text-primary" />
              Adjust Balance
            </CardTitle>
            <CardDescription>
              {selected ? displayName(selected) : "Choose a player from the table."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selected && (
              <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-surface/60 p-3 text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Sweeps</div>
                  <div className="font-semibold tabular-nums">{fmtUSD(Number(selected.sweeps_coins ?? 0))}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Gold</div>
                  <div className="font-semibold tabular-nums">{Number(selected.gold_coins ?? 0).toLocaleString()}</div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as "sweeps" | "gold")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sweeps">Sweeps</SelectItem>
                    <SelectItem value="gold">Gold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Action</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as "credit" | "debit")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit">Credit</SelectItem>
                    <SelectItem value="debit">Debit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input
                type="number"
                min={0.01}
                step={0.01}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>

            <Button
              className="w-full"
              disabled={!selected || adjustM.isPending || !Number(amount) || reason.trim().length < 3}
              onClick={() => adjustM.mutate()}
            >
              {selected && (kind === "credit" ? <Plus className="mr-2 size-4" /> : <Minus className="mr-2 size-4" />)}
              {!selected
                ? "Select a player first"
                : `${kind === "credit" ? "Credit" : "Debit"} ${currency === "sweeps" ? "Sweeps" : "Gold"}`}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
