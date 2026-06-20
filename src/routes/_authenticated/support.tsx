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
} from "@/lib/support.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Send, Search, UserPlus, Inbox, MessageSquare, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";

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

function SupportCenter() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<string>("new");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload) => {
        qc.invalidateQueries({ queryKey: ["support-tickets"] });
        qc.invalidateQueries({ queryKey: ["support-counts"] });
        const tid = (payload.new as { ticket_id?: string } | null)?.ticket_id;
        if (tid) qc.invalidateQueries({ queryKey: ["support-messages", tid] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      <div className="px-4 lg:px-6 py-4 border-b border-border">
        <h1 className="text-lg font-semibold">Support Center</h1>
        <p className="text-xs text-muted-foreground">Live player chat — accept, reply, assign, resolve.</p>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Left: tabs + list */}
        <div className="w-[360px] shrink-0 border-r border-border flex flex-col min-h-0">
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
                    <span className="text-xs font-medium truncate">
                      {t.player_name || t.player_username || `Player #${t.player_id?.slice(0, 6) ?? "—"}`}
                    </span>
                    {t.unread_count_staff > 0 && (
                      <span className="ml-auto shrink-0 size-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold grid place-items-center">
                        {t.unread_count_staff}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1.5">
                    <span>#{t.ticket_number}</span>
                    {t.player_phone && <><span>·</span><span>{t.player_phone}</span></>}
                    {t.game_provider && <><span>·</span><span>{t.game_provider}</span></>}
                  </div>
                  <div className="text-[11px] text-muted-foreground line-clamp-1">
                    {t.last_message_sender === "staff" && <span className="text-primary">You: </span>}
                    {t.last_message_preview || <span className="italic">No messages yet</span>}
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <Badge variant="outline" className={cn("text-[9px] uppercase", STATUS_STYLE[t.status])}>
                      {t.status.replace("_", " ")}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{timeAgo(t.last_message_at)}</span>
                  </div>
                  {t.assigned_staff_name && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">→ {t.assigned_staff_name}</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: conversation */}
        <div className="flex-1 min-w-0 flex flex-col">
          {selectedId ? (
            <ConversationPane ticketId={selectedId} />
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
    </div>
  );
}

function ConversationPane({ ticketId }: { ticketId: string }) {
  const qc = useQueryClient();
  const fetchTicket = useServerFn(getTicket);
  const fetchMessages = useServerFn(getMessages);
  const fetchNotes = useServerFn(listNotes);
  const fetchStaff = useServerFn(listAssignableStaff);
  const sendReply = useServerFn(sendStaffReply);
  const doAssign = useServerFn(assignTicket);
  const doStatus = useServerFn(setTicketStatus);
  const doNote = useServerFn(addNote);

  const ticket = useQuery({ queryKey: ["support-ticket", ticketId], queryFn: () => fetchTicket({ data: { id: ticketId } }) });
  const messages = useQuery({
    queryKey: ["support-messages", ticketId],
    queryFn: () => fetchMessages({ data: { ticketId } }),
  });
  const notes = useQuery({ queryKey: ["support-notes", ticketId], queryFn: () => fetchNotes({ data: { ticketId } }) });
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
    mutationFn: (toStaffId: string | null | undefined) => doAssign({ data: { ticketId, toStaffId } }),
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

  return (
    <>
      {/* Header */}
      <div className="px-4 lg:px-6 py-3 border-b border-border flex items-center gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">
            {t?.player_name || t?.player_username || "Player"}{" "}
            <span className="text-muted-foreground font-normal">#{t?.ticket_number}</span>
          </div>
          <div className="text-[10px] text-muted-foreground flex items-center gap-2">
            {t?.player_phone && <span>{t.player_phone}</span>}
            {t?.player_username && <span>@{t.player_username}</span>}
            {t?.game_provider && <span>· {t.game_provider}</span>}
            {t?.issue_type && <span>· {t.issue_type}</span>}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {t && (
            <Badge variant="outline" className={cn("text-[10px] uppercase", STATUS_STYLE[t.status])}>
              {t.status.replace("_", " ")}
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={() => assignMut.mutate(undefined)} disabled={assignMut.isPending}>
            <UserPlus className="size-3.5 mr-1" /> Accept
          </Button>
          <Select onValueChange={(v) => assignMut.mutate(v === "__unassign" ? null : v)}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="Transfer to…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__unassign">Unassign</SelectItem>
              {(staff.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={t?.status} onValueChange={(v) => statusMut.mutate(v)}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
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
      <div className="border-b border-border px-4 lg:px-6 flex gap-4">
        <button
          onClick={() => setTab("chat")}
          className={cn(
            "py-2 text-xs uppercase tracking-wider border-b-2 flex items-center gap-1.5",
            tab === "chat" ? "border-primary text-primary" : "border-transparent text-muted-foreground",
          )}
        >
          <MessageSquare className="size-3" /> Conversation
        </button>
        <button
          onClick={() => setTab("notes")}
          className={cn(
            "py-2 text-xs uppercase tracking-wider border-b-2 flex items-center gap-1.5",
            tab === "notes" ? "border-primary text-primary" : "border-transparent text-muted-foreground",
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
          <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-3">
            {items.map((m) => {
              const isPlayer = m.sender_type === "player";
              const isBot = m.sender_type === "bot";
              const isSystem = m.sender_type === "system";
              if (isSystem) {
                return (
                  <div key={m.id} className="text-center text-[10px] text-muted-foreground uppercase tracking-wider">
                    {m.body}
                  </div>
                );
              }
              return (
                <div key={m.id} className={cn("flex", isPlayer || isBot ? "justify-start" : "justify-end")}>
                  <div className="max-w-[70%]">
                    <div className="text-[10px] text-muted-foreground mb-0.5 px-1">
                      {isPlayer ? "Player" : isBot ? "Bot" : m.sender_name ?? "Staff"} · {new Date(m.created_at).toLocaleString()}
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
                      {m.attachment_url && (
                        <a
                          href={m.attachment_url}
                          target="_blank"
                          rel="noreferrer"
                          className="block mt-1 text-xs underline opacity-80"
                        >
                          View attachment
                        </a>
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
              className="min-h-[60px] text-sm resize-none"
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
              <div className="text-xs text-muted-foreground text-center py-6">No internal notes yet.</div>
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