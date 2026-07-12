import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  listTickets,
  ticketCounts,
  getTicket,
  getMessages,
  sendStaffReply,
  assignTicket,
  setTicketStatus,
  addNote,
  listNotes,
  listAssignableStaff,
  listMessengerPages,
  saveMessengerPage,
  testMessengerPage,
} from "@/lib/support.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Send,
  Search,
  UserPlus,
  Inbox,
  MessageSquare,
  StickyNote,
  ExternalLink,
  Link2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/support")({
  component: SupportCenter,
});

const TABS = [
  { id: "new", label: "New", countKey: "new" as const },
  { id: "waiting", label: "Waiting", countKey: "waiting" as const },
  { id: "mine", label: "Assigned to Me", countKey: "mine" as const },
  { id: "in_progress", label: "In Progress", countKey: "in_progress" as const },
  { id: "resolved", label: "Resolved", countKey: "resolved" as const },
  { id: "closed", label: "Closed", countKey: "closed" as const },
];

const STATUS_STYLE: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  waiting: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  assigned: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  in_progress: "bg-primary/10 text-primary border-primary/20",
  resolved: "bg-success/10 text-success border-success/20",
  closed: "bg-muted text-muted-foreground border-border",
};

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function isFacebookUsername(value?: string | null) {
  return Boolean(value?.startsWith("fb:"));
}

function SupportCenter() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<string>("new");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pagesOpen, setPagesOpen] = useState(false);

  const fetchList = useServerFn(listTickets);
  const fetchCounts = useServerFn(ticketCounts);

  const tickets = useQuery({
    queryKey: ["support-tickets", tab, search],
    queryFn: () => fetchList({ data: { tab, search } }),
  });
  const counts = useQuery({ queryKey: ["support-counts"], queryFn: () => fetchCounts() });

  // Realtime: invalidate on any ticket/message change
  useEffect(() => {
    const channel = supabase
      .channel("support-center")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => {
        qc.invalidateQueries({ queryKey: ["support-tickets"] });
        qc.invalidateQueries({ queryKey: ["support-counts"] });
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          qc.invalidateQueries({ queryKey: ["support-tickets"] });
          qc.invalidateQueries({ queryKey: ["support-counts"] });
          const tid = (payload.new as { ticket_id?: string } | null)?.ticket_id;
          if (tid) qc.invalidateQueries({ queryKey: ["support-messages", tid] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return (
    <div className="h-[calc(100dvh-3.5rem)] flex flex-col overflow-hidden">
      <div className="px-4 lg:px-6 py-4 border-b border-border">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Support Center</h1>
            <p className="text-xs text-muted-foreground">
              Live player chat — accept, reply, assign, resolve.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setPagesOpen(true)}>
            <Link2 className="mr-2 size-3.5" /> Messenger Pages
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/* Left: tabs + list */}
        <div
          className={cn(
            "w-full md:w-[360px] md:shrink-0 border-r border-border flex flex-col min-h-0",
            selectedId && "hidden md:flex",
          )}
        >
          <div className="px-3 pt-3 pb-2 border-b border-border space-y-2">
            <div className="relative">
              <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ticket #, name, phone, username"
                className="pl-8 h-8 text-xs"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {TABS.map((t) => {
                const c = counts.data?.[t.countKey] ?? 0;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "px-2 py-1 rounded text-[10px] uppercase tracking-wider border transition-colors",
                      tab === t.id
                        ? "bg-primary/10 text-primary border-primary/30"
                        : "text-muted-foreground border-border hover:bg-surface-hover",
                    )}
                  >
                    {t.label}
                    {c > 0 && <span className="ml-1 text-foreground">{c}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {tickets.isLoading && (
              <div className="p-6 text-xs text-muted-foreground text-center">Loading…</div>
            )}
            {tickets.data && tickets.data.length === 0 && (
              <div className="p-8 text-center text-xs text-muted-foreground">
                <Inbox className="size-6 mx-auto mb-2 opacity-50" />
                No tickets in this view.
              </div>
            )}
            {tickets.data?.map((t) => {
              const active = t.id === selectedId;
              const displayName =
                t.messenger_user_name ||
                t.player_name ||
                t.player_username ||
                `Player #${t.player_id?.slice(0, 6) ?? "-"}`;
              const pageName =
                t.messenger_page_name ||
                (isFacebookUsername(t.player_username) ? t.game_provider : null);
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 border-b border-border hover:bg-surface-hover transition-colors",
                    active && "bg-primary/5 border-l-2 border-l-primary",
                  )}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium truncate">{displayName}</span>
                    {pageName && (
                      <Badge variant="outline" className="shrink-0 text-[9px] px-1.5 py-0">
                        {pageName}
                      </Badge>
                    )}
                    <span className="hidden">
                      {t.player_name ||
                        t.player_username ||
                        `Player #${t.player_id?.slice(0, 6) ?? "—"}`}
                    </span>
                    {t.unread_count_staff > 0 && (
                      <span className="ml-auto shrink-0 size-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold grid place-items-center">
                        {t.unread_count_staff}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1.5">
                    <span>#{t.ticket_number}</span>
                    {t.player_phone && (
                      <>
                        <span>·</span>
                        <span>{t.player_phone}</span>
                      </>
                    )}
                    {t.player_username && !isFacebookUsername(t.player_username) && (
                      <>
                        <span>·</span>
                        <span>@{t.player_username}</span>
                      </>
                    )}
                    {pageName && <span>Page: {pageName}</span>}
                  </div>
                  <div className="text-[11px] text-muted-foreground line-clamp-1">
                    {t.last_message_sender === "staff" && (
                      <span className="text-primary">You: </span>
                    )}
                    {t.last_message_preview || <span className="italic">No messages yet</span>}
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <Badge
                      variant="outline"
                      className={cn("text-[9px] uppercase", STATUS_STYLE[t.status])}
                    >
                      {t.status.replace("_", " ")}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {timeAgo(t.last_message_at)}
                    </span>
                  </div>
                  {t.assigned_staff_name && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      → {t.assigned_staff_name}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: conversation */}
        <div
          className={cn("flex-1 min-w-0 min-h-0 flex flex-col", !selectedId && "hidden md:flex")}
        >
          {selectedId ? (
            <ConversationPane ticketId={selectedId} onBack={() => setSelectedId(null)} />
          ) : (
            <div className="flex-1 grid place-items-center text-sm text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="size-8 mx-auto mb-3 opacity-30" />
                Select a ticket to open the conversation.
              </div>
            </div>
          )}
        </div>
      </div>

      <MessengerPagesDialog open={pagesOpen} onOpenChange={setPagesOpen} />
    </div>
  );
}

function MessengerPagesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const fetchPages = useServerFn(listMessengerPages);
  const savePage = useServerFn(saveMessengerPage);
  const testPage = useServerFn(testMessengerPage);
  const pages = useQuery({
    queryKey: ["messenger-pages"],
    queryFn: () => fetchPages(),
    enabled: open,
  });

  const [pageId, setPageId] = useState("");
  const [pageName, setPageName] = useState("");
  const [pageAccessToken, setPageAccessToken] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);

  const resetForm = () => {
    setPageId("");
    setPageName("");
    setPageAccessToken("");
    setIsEnabled(true);
  };

  const saveMut = useMutation({
    mutationFn: () =>
      savePage({
        data: {
          pageId: pageId.trim(),
          pageName: pageName.trim() || undefined,
          pageAccessToken: pageAccessToken.trim() || undefined,
          isEnabled,
        },
      }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["messenger-pages"] });
      setPageAccessToken("");
      if (result.lastError) {
        toast.warning("Page saved, but token test failed", { description: result.lastError });
      } else {
        toast.success("Messenger page saved");
      }
    },
    onError: (error: Error) => toast.error(error.message || "Could not save Messenger page"),
  });

  const testMut = useMutation({
    mutationFn: (id: string) => testPage({ data: { pageId: id } }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["messenger-pages"] });
      toast.success(`${result.pageName} token is connected`);
    },
    onError: (error: Error) => toast.error(error.message || "Token test failed"),
  });

  const copyWebhook = async () => {
    if (!pages.data?.webhookUrl) return;
    await navigator.clipboard.writeText(pages.data.webhookUrl);
    toast.success("Webhook URL copied");
  };

  const editPage = (page: { page_id: string; page_name: string; is_enabled: boolean }) => {
    setPageId(page.page_id);
    setPageName(page.page_name);
    setPageAccessToken("");
    setIsEnabled(page.is_enabled);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Messenger Pages</DialogTitle>
          <DialogDescription>
            Connect Facebook pages to Support Center. Page tokens stay server-side.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-md border border-border p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Meta webhook
            </div>
            <div className="flex gap-2">
              <Input
                readOnly
                value={pages.data?.webhookUrl ?? "/api/meta/webhook"}
                className="font-mono text-xs"
              />
              <Button type="button" variant="outline" size="sm" onClick={copyWebhook}>
                Copy
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
              <span>
                Verify token: {pages.data?.verifyTokenConfigured ? "configured" : "default/local"}
              </span>
              <span>
                App secret: {pages.data?.appSecretConfigured ? "configured" : "not configured"}
              </span>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="messenger-page-id">Page ID</Label>
              <Input
                id="messenger-page-id"
                value={pageId}
                onChange={(e) => setPageId(e.target.value.replace(/\D/g, ""))}
                placeholder="612225081965764"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="messenger-page-name">Page name</Label>
              <Input
                id="messenger-page-name"
                value={pageName}
                onChange={(e) => setPageName(e.target.value)}
                placeholder="Cosmo Stakes"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="messenger-page-token">Page access token</Label>
              <Input
                id="messenger-page-token"
                value={pageAccessToken}
                onChange={(e) => setPageAccessToken(e.target.value)}
                placeholder="Paste a new token only when adding or replacing it"
                type="password"
                autoComplete="off"
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={isEnabled}
                onCheckedChange={setIsEnabled}
                id="messenger-page-enabled"
              />
              <Label htmlFor="messenger-page-enabled">Enabled</Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={resetForm}>
                Clear
              </Button>
              <Button
                type="button"
                onClick={() => saveMut.mutate()}
                disabled={!pageId.trim() || saveMut.isPending}
              >
                {saveMut.isPending && <RefreshCw className="mr-2 size-3.5 animate-spin" />}
                Save Page
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Connected pages
            </div>
            {pages.isLoading && (
              <div className="text-xs text-muted-foreground">Loading pages...</div>
            )}
            {pages.data?.pages.length === 0 && (
              <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                No Messenger pages saved yet.
              </div>
            )}
            {pages.data?.pages.map((page) => (
              <div
                key={page.page_id}
                className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{page.page_name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {page.is_enabled ? "Enabled" : "Disabled"}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        page.token_status === "connected" &&
                          "border-emerald-500/30 text-emerald-500",
                        page.token_status === "invalid" && "border-destructive/30 text-destructive",
                      )}
                    >
                      {page.has_token ? page.token_status : "no token"}
                    </Badge>
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {page.page_id}
                    {page.token_source ? ` | ${page.token_source}` : ""}
                  </div>
                  {page.last_error && (
                    <div className="mt-1 line-clamp-2 text-[10px] text-destructive">
                      {page.last_error}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => editPage(page)}>
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => testMut.mutate(page.page_id)}
                    disabled={!page.has_token || testMut.isPending}
                  >
                    Test
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConversationPane({ ticketId, onBack }: { ticketId: string; onBack?: () => void }) {
  const qc = useQueryClient();
  const fetchTicket = useServerFn(getTicket);
  const fetchMessages = useServerFn(getMessages);
  const fetchNotes = useServerFn(listNotes);
  const fetchStaff = useServerFn(listAssignableStaff);
  const sendReply = useServerFn(sendStaffReply);
  const doAssign = useServerFn(assignTicket);
  const doStatus = useServerFn(setTicketStatus);
  const doNote = useServerFn(addNote);

  const ticket = useQuery({
    queryKey: ["support-ticket", ticketId],
    queryFn: () => fetchTicket({ data: { id: ticketId } }),
  });
  const messages = useQuery({
    queryKey: ["support-messages", ticketId],
    queryFn: () => fetchMessages({ data: { ticketId } }),
  });
  const notes = useQuery({
    queryKey: ["support-notes", ticketId],
    queryFn: () => fetchNotes({ data: { ticketId } }),
  });
  const staff = useQuery({ queryKey: ["support-staff"], queryFn: () => fetchStaff() });

  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [tab, setTab] = useState<"chat" | "notes">("chat");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.data?.length]);

  const replyMut = useMutation({
    mutationFn: () => sendReply({ data: { ticketId, body: reply.trim() } }),
    onSuccess: () => {
      setReply("");
      qc.invalidateQueries({ queryKey: ["support-messages", ticketId] });
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
      qc.invalidateQueries({ queryKey: ["support-ticket", ticketId] });
    },
  });
  const noteMut = useMutation({
    mutationFn: () => doNote({ data: { ticketId, body: note.trim() } }),
    onSuccess: () => {
      setNote("");
      qc.invalidateQueries({ queryKey: ["support-notes", ticketId] });
    },
  });
  const assignMut = useMutation({
    mutationFn: (toStaffId: string | null | undefined) =>
      doAssign({ data: { ticketId, toStaffId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-ticket", ticketId] });
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
      qc.invalidateQueries({ queryKey: ["support-counts"] });
    },
  });
  const statusMut = useMutation({
    mutationFn: (status: string) => doStatus({ data: { ticketId, status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-ticket", ticketId] });
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
      qc.invalidateQueries({ queryKey: ["support-counts"] });
    },
  });

  const t = ticket.data;
  const items = useMemo(() => messages.data ?? [], [messages.data]);
  const pageName =
    t?.messenger_page_name || (isFacebookUsername(t?.player_username) ? t?.game_provider : null);

  return (
    <>
      {/* Header */}
      <div className="px-3 sm:px-4 lg:px-6 py-3 border-b border-border flex items-start gap-3 flex-wrap">
        {onBack && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="md:hidden size-8 shrink-0"
            onClick={onBack}
            aria-label="Back to tickets"
          >
            <ArrowLeft className="size-4" />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold break-words">
            {t?.player_name || t?.player_username || "Player"}{" "}
            <span className="text-muted-foreground font-normal whitespace-nowrap">
              #{t?.ticket_number}
            </span>
            {pageName && (
              <Badge variant="outline" className="ml-2 align-middle text-[10px]">
                Page: {pageName}
              </Badge>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 break-all">
            {t?.player_phone && <span>{t.player_phone}</span>}
            {t?.player_username && !isFacebookUsername(t.player_username) && (
              <span>@{t.player_username}</span>
            )}
            {pageName && <span>Messenger page: {pageName}</span>}
            {t?.game_provider && <span>· {t.game_provider}</span>}
            {t?.issue_type && <span>· {t.issue_type}</span>}
          </div>
        </div>
        <div className="w-full sm:w-auto sm:ml-auto flex flex-wrap items-center gap-2">
          {t && (
            <Badge
              variant="outline"
              className={cn("text-[10px] uppercase", STATUS_STYLE[t.status])}
            >
              {t.status.replace("_", " ")}
            </Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => assignMut.mutate(undefined)}
            disabled={assignMut.isPending}
          >
            <UserPlus className="size-3.5 mr-1" /> Accept
          </Button>
          <Select onValueChange={(v) => assignMut.mutate(v === "__unassign" ? null : v)}>
            <SelectTrigger className="h-8 w-[min(10rem,calc(50vw-1rem))] sm:w-[160px] text-xs">
              <SelectValue placeholder="Transfer to…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__unassign">Unassign</SelectItem>
              {(staff.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={t?.status} onValueChange={(v) => statusMut.mutate(v)}>
            <SelectTrigger className="h-8 w-[min(8.75rem,calc(50vw-1rem))] sm:w-[140px] text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="waiting">Waiting</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border px-3 sm:px-4 lg:px-6 flex gap-4 overflow-x-auto">
        <button
          onClick={() => setTab("chat")}
          className={cn(
            "py-2 text-xs uppercase tracking-wider border-b-2 flex items-center gap-1.5",
            tab === "chat"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground",
          )}
        >
          <MessageSquare className="size-3" /> Conversation
        </button>
        <button
          onClick={() => setTab("notes")}
          className={cn(
            "py-2 text-xs uppercase tracking-wider border-b-2 flex items-center gap-1.5",
            tab === "notes"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground",
          )}
        >
          <StickyNote className="size-3" /> Internal Notes
          {notes.data && notes.data.length > 0 && (
            <span className="text-[10px] text-foreground">({notes.data.length})</span>
          )}
        </button>
      </div>

      {tab === "chat" ? (
        <>
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 space-y-3">
            {items.map((m) => {
              const isPlayer = m.sender_type === "player";
              const isBot = m.sender_type === "bot";
              const isSystem = m.sender_type === "system";
              if (isSystem) {
                return (
                  <div
                    key={m.id}
                    className="text-center text-[10px] text-muted-foreground uppercase tracking-wider"
                  >
                    {m.body}
                  </div>
                );
              }
              return (
                <div
                  key={m.id}
                  className={cn("flex", isPlayer || isBot ? "justify-start" : "justify-end")}
                >
                  <div className="max-w-[88%] sm:max-w-[70%] min-w-0">
                    <div className="text-[10px] text-muted-foreground mb-0.5 px-1 break-words">
                      {isPlayer
                        ? (m.sender_name ?? "Player")
                        : isBot
                          ? "Bot"
                          : (m.sender_name ?? "Staff")}{" "}
                      · {new Date(m.created_at).toLocaleString()}
                    </div>
                    <div className="hidden">
                      {isPlayer ? "Player" : isBot ? "Bot" : (m.sender_name ?? "Staff")} ·{" "}
                      {new Date(m.created_at).toLocaleString()}
                    </div>
                    <div
                      className={cn(
                        "rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words border",
                        isPlayer && "bg-surface border-border",
                        isBot && "bg-muted/40 border-border text-muted-foreground italic",
                        !isPlayer && !isBot && "bg-primary text-primary-foreground border-primary",
                      )}
                    >
                      {m.body}
                      {m.attachment_proxy_url && (
                        <div className="mt-2 space-y-1.5">
                          {m.attachment_is_image && (
                            <a href={m.attachment_proxy_url} target="_blank" rel="noreferrer">
                              <img
                                src={m.attachment_proxy_url}
                                alt="Message attachment"
                                className="max-h-72 w-auto max-w-full rounded-md border border-border object-contain bg-background"
                                loading="lazy"
                              />
                            </a>
                          )}
                          <a
                            href={m.attachment_proxy_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs underline opacity-80"
                          >
                            Open attachment <ExternalLink className="size-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          <div className="border-t border-border p-3 flex gap-2 items-end">
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && reply.trim()) {
                  e.preventDefault();
                  replyMut.mutate();
                }
              }}
              placeholder="Reply to player… (⌘/Ctrl+Enter to send)"
              className="min-h-[60px] text-sm resize-none min-w-0"
            />
            <Button
              onClick={() => replyMut.mutate()}
              disabled={!reply.trim() || replyMut.isPending}
              size="sm"
              className="h-[60px] w-[60px] shrink-0"
            >
              <Send className="size-4" />
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-2">
            {notes.data?.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-6">
                No internal notes yet.
              </div>
            )}
            {notes.data?.map((n) => (
              <div key={n.id} className="bg-amber-500/5 border border-amber-500/20 rounded-md p-3">
                <div className="text-[10px] text-muted-foreground mb-1">
                  {n.staff_name} · {new Date(n.created_at).toLocaleString()}
                </div>
                <div className="text-sm whitespace-pre-wrap">{n.body}</div>
              </div>
            ))}
          </div>
          <div className="border-t border-border p-3 flex gap-2 items-end">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Internal note (staff-only, not shown to player)"
              className="min-h-[60px] text-sm resize-none"
            />
            <Button
              onClick={() => noteMut.mutate()}
              disabled={!note.trim() || noteMut.isPending}
              size="sm"
              variant="outline"
              className="h-[60px]"
            >
              Save Note
            </Button>
          </div>
        </>
      )}
    </>
  );
}
