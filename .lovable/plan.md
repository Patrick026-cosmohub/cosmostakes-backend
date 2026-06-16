## Cosmo Stakes — Super Admin Portal completion plan

You already have these modules working: Dashboard, Platforms, Players, Deposits, Cashouts, Payment Methods, Wallet Tools, Audit Log, Reports, Staff, Roles & Permissions, Settings (General + API integrations). This plan closes every remaining gap from your spec, in one coordinated build.

### Stack note (important)

Your spec lists Node/Express + standalone PostgreSQL + Docker. This project actually runs on **TanStack Start + Lovable Cloud (managed Postgres + Auth + Storage + Realtime)**, which already covers: managed Postgres with RLS, JWT auth, file storage, realtime websockets, autoscaling, backups, and cloud deployment. I'll build everything against this stack — functionally identical, no Docker/Express needed. If you want a separate self-hosted Node backend instead, say the word and I'll stop and re-scope.

### What I'll build

**1. Promotions & Bonuses module** (`/promotions`)
- `bonuses` table: type (welcome/referral/reload/cashback/seasonal), name, percentage, min_deposit, max_bonus, starts_at, expires_at, platform scope (all or specific game), active flag.
- CRUD UI with create/edit/delete, activate toggle, per-platform targeting.
- Bonus claims log table for audit.

**2. VIP Management module** (`/vip`)
- `vip_tiers` table: name, icon, color, deposit_required, monthly_activity_required, cashback_pct, perks (jsonb), priority_support, sort_order, active.
- `player_vip` view/column derived from deposit volume.
- Drag-to-reorder, add/edit/delete, instant-apply.

**3. CMS — Announcements** (`/announcements`)
- `announcements` table: title, body, starts_at, ends_at, pinned, push_enabled, platform scope, active.
- Schedule + pin + push flag (push delivery is a stub hook for later).

**4. CMS — Theme & Branding** (`/cms/theme`)
- `site_theme` singleton: mode (dark/light), primary, accent, background_image, banner_image, logo, widget config (jsonb).
- Live preview, storage bucket `cms-assets` for uploads.

**5. CMS — Music** (`/cms/music`)
- `music_tracks` table + `music_settings` singleton (enabled, autoplay, default_volume, playlist order).
- Upload to `cms-music` bucket.

**6. CMS — Game Display** (`/cms/games`)
- Extends existing `games` table with: display_title, description, thumbnail_url, logo_url, featured, sort_order, active.
- Reorder, edit, featured toggle, image upload.

**7. Transactions** (`/transactions`)
- Unified view across deposits + cashouts + wallet_ledger with advanced filters (platform, player, method, status, date range, amount range), search, **CSV + PDF export**, fraud flag column.

**8. Security Settings** (`/security`)
- 2FA enrollment (TOTP) for super admins (Supabase Auth MFA).
- Active sessions list + force-logout (via Auth admin API).
- `security_settings` singleton: password complexity rules, session timeout, IP whitelist (jsonb array).
- Login history table populated from `auth.audit_log_entries` view.
- Change-password flow.

**9. Notifications settings** (`/notifications`)
- `notification_settings` singleton: email/sms/push toggles + sender config (uses existing Resend connector if added later; UI built now, sending wired when secret is provided).

**10. Backup & Recovery** (`/backups`)
- Manual CSV export per major table, scheduled export via `pg_cron` writing to storage, restore UI documents the supported flow (Lovable Cloud manages PITR — surfaced read-only).

**11. System Status** (`/system`)
- Health card: DB latency probe, Auth probe, Storage probe, per-platform API uptime (from `platform_integrations.last_test_at` / status), storage usage estimate.

**12. Platforms enhancements**
- Add to `games` table: maintenance_mode, logo_url, sort_order, card_style (jsonb), sync_frequency_seconds.
- Reorder, maintenance toggle, logo upload, sync log table `platform_sync_logs`.

**13. Players enhancements**
- Add columns: kyc_status, vip_tier_id, last_login_at, login_count, suspended_at, support_notes (already partly there).
- Login history table `player_logins`.
- Reset-password action (Auth admin), suspend/reactivate, KYC status editor.

**14. Audit Logs hardening**
- Add `prev_value` / `new_value` columns (jsonb) — already present; ensure every new mutation server fn writes both.
- Add immutability: revoke UPDATE/DELETE on `audit_logs` from authenticated; only `service_role` can insert via server fns.

**15. Sidebar nav update**
Adds: Transactions, Promotions, VIP, Announcements, CMS (Theme/Music/Games submenu), Security, Notifications, Backups, System. All gated by new permissions in `src/lib/permissions.ts`.

### Technical details

- **Migrations**: one consolidated migration creates all new tables with GRANTs + RLS scoped via `has_role` / `can_handle_finance`. Audit log triggers added for sensitive tables (bonuses, vip_tiers, security_settings, theme, games).
- **Storage buckets** (private, signed URLs): `cms-assets`, `cms-music`, `platform-logos`, `player-kyc`.
- **Server fns** in `src/lib/admin.functions.ts` (or split into `cms.functions.ts`, `promotions.functions.ts`, `security.functions.ts` for readability) — all use `requireSupabaseAuth` + role check; admin operations load `supabaseAdmin` inside the handler.
- **Realtime dashboard**: subscribe to `deposit_requests`, `cashout_requests`, `wallet_ledger` for live KPI updates.
- **Exports**: CSV via in-browser blob; PDF via `pdf-lib` (Worker-compatible).
- **2FA**: `supabase.auth.mfa.enroll` flow with QR; enforce on super_admin login via a check in `_authenticated` layout.
- **Permissions added**: `promotions.manage`, `vip.manage`, `cms.manage`, `transactions.view`, `security.manage`, `notifications.manage`, `backups.manage`, `system.view`.

### Out of scope (call out)

- Actual push/SMS/email delivery wiring — UI and settings built; sending requires Resend/Twilio secrets which I'll request only if/when you want delivery turned on.
- Real-money API calls to Juwa/Firekirin/etc. — integration scaffolding + test-connection already exists; live sync requires real credentials per platform.
- Self-hosted Node/Express/Docker rebuild — covered by Lovable Cloud instead (see stack note).

### Build order (single session)

1. Consolidated migration (all new tables, columns, RLS, GRANTs, audit immutability, storage buckets via tool).
2. Server functions split by domain.
3. New routes + sidebar entries + permissions.
4. Players/Platforms/Audit enhancements.
5. Smoke-test build, verify no SSR/import-graph regressions.

Approve and I'll ship it. This is a large single batch (~15 new routes, ~25 new tables/columns); expect a long build turn.