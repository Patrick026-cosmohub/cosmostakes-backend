## Scope (MVP)

Admin-side Support Center + shared DB + public chat API. The player frontend (separate project) will be wired to the new endpoints in a follow-up using its own repo.

## What I will NOT touch
- Existing sidebar items, routes, or pages — only **add** a new "Support Center" link + new route files.
- No changes to auth, players table, juwa endpoints, deposits, cashouts, etc.

## Database (one migration)

Tables in `public` (all with GRANTs + RLS):

- **support_tickets** — `id, ticket_number (seq), player_id, player_name, player_phone, player_username, game_provider, issue_type, status (enum: new|waiting|assigned|in_progress|resolved|closed), assigned_staff_id, last_message_at, last_message_preview, unread_count_staff, created_at, updated_at`
- **chat_messages** — `id, ticket_id, sender_type (player|staff|bot|system), sender_id, body, attachment_url, read_by_staff, created_at`
- **ticket_notes** — staff-only notes (`id, ticket_id, staff_id, body, created_at`)
- **ticket_attachments** — `id, message_id, ticket_id, url, mime, size, uploaded_by, created_at`
- **staff_assignments** — audit row per assign/transfer (`id, ticket_id, from_staff_id, to_staff_id, action, created_at`)

Enum `ticket_status`. Trigger to update `last_message_at`/`preview`/`unread_count_staff` on new message. Realtime publication ADD for `support_tickets` and `chat_messages`.

### RLS
- Staff (`support_agent`, `admin`, `super_admin`) read tickets where `assigned_staff_id = auth.uid()` OR `assigned_staff_id IS NULL`.
- `super_admin` and `admin` read all.
- Messages/notes scoped via ticket access (function `can_access_ticket(ticket_id)`).
- Only `super_admin` can delete tickets.
- Public/anon insert is **not** allowed — player writes go through the public API route (service role) which authenticates the player via their existing session token.

Storage bucket `chat-attachments` (private), signed-URL reads.

## Public API (player site calls these)

`src/routes/api/public/chat/`
- `POST start` — creates ticket + bot greeting message. Body: `{ player_id, name, phone, username, game_provider, issue_type }`.
- `POST message` — appends player message. Body: `{ ticket_id, body, attachment_url? }`.
- `GET ticket/$id/messages` — poll fallback / initial load.
- `GET config` — bot greeting, quick replies, chatbot on/off, offline msg (read from `general_settings`).

All routes verify the caller via a lightweight player token (using the existing player auth pattern in juwa routes — `COSMO_ADMIN_API_KEY` header from the player site server).

CORS headers + OPTIONS handler on each.

## Admin UI

New files only:
- `src/routes/_authenticated/support.tsx` — Support Center page with tabs (New, Waiting, Assigned to Me, In Progress, Resolved, Closed). Left: ticket list w/ search. Right: conversation pane.
- `src/components/support/TicketList.tsx`, `Conversation.tsx`, `ReplyComposer.tsx`, `AssignMenu.tsx`, `StatusMenu.tsx`.
- Server fns in `src/lib/support.functions.ts`: `listTickets`, `getTicket`, `getMessages`, `sendStaffReply`, `assignToMe`, `transferTicket`, `setStatus`, `addNote`.
- Permission `support:access` added to `src/lib/permissions.ts`, mapped to staff roles.
- Sidebar entry added to the `NAV` array in `src/routes/_authenticated/route.tsx` (single insertion, no other changes).

Realtime via `supabase.channel('support')` subscribing to `chat_messages` and `support_tickets` inserts/updates; React Query cache invalidation on events.

Audit-log entry on assign/transfer/status-change/reply via existing `audit_logs` table.

## Deferred (next pass, per your "MVP first" choice)
- Bot config editor / quick reply editor UI
- Business hours / offline message
- Export chat history
- Typing indicator
- Ticket archive/delete UI
- Notification fan-out (just realtime for now)
- Player-side widget upgrade (separate repo)

## Risks
- Player site is a different project; I'll output the endpoint contract so you can paste it there.
- Realtime requires player's Supabase client to subscribe with their player auth — depends on how that project authenticates.
