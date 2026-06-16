import type { Role } from "./format";

/**
 * Permission keys used to gate UI surfaces.
 * Server-side access is enforced by RLS policies and server-fn role checks;
 * these flags shape what each role can see and do in the admin UI.
 */
export type Permission =
  | "dashboard.view"
  | "platforms.view"
  | "players.view"
  | "players.manage"
  | "deposits.view"
  | "deposits.manage"
  | "cashouts.view"
  | "cashouts.manage"
  | "payment_methods.view"
  | "payment_methods.manage"
  | "wallet_tools.use"
  | "reports.view"
  | "audit.view"
  | "staff.manage"
  | "settings.manage"
  | "roles.manage";

/**
 * Role → permission map.
 *
 * - Super Admin: full access to everything.
 * - Admin: manage players and transactions (deposits, cashouts, payment methods).
 * - Finance Agent: financial reports + audit + wallet tools (no player/staff management).
 * - Support Agent: view-only with limited player actions (note / status edits).
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: [
    "dashboard.view",
    "platforms.view",
    "players.view",
    "players.manage",
    "deposits.view",
    "deposits.manage",
    "cashouts.view",
    "cashouts.manage",
    "payment_methods.view",
    "payment_methods.manage",
    "wallet_tools.use",
    "reports.view",
    "audit.view",
    "staff.manage",
    "settings.manage",
    "roles.manage",
  ],
  admin: [
    "dashboard.view",
    "platforms.view",
    "players.view",
    "players.manage",
    "deposits.view",
    "deposits.manage",
    "cashouts.view",
    "cashouts.manage",
    "payment_methods.view",
    "payment_methods.manage",
    "audit.view",
  ],
  finance_agent: [
    "dashboard.view",
    "reports.view",
    "audit.view",
    "wallet_tools.use",
    "deposits.view",
    "cashouts.view",
  ],
  support_agent: [
    "dashboard.view",
    "players.view",
    "deposits.view",
    "cashouts.view",
  ],
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  super_admin: "Full access to every section, including staff, roles, and platform settings.",
  admin: "Manage players and all transactions (deposits, cashouts, payment methods).",
  finance_agent: "Access to financial reports, audit log, and wallet tools.",
  support_agent: "View-only access plus limited player actions (notes, status changes).",
};

export function permissionsFor(roles: Role[]): Set<Permission> {
  const set = new Set<Permission>();
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r] ?? []) set.add(p);
  return set;
}

export function hasPermission(roles: Role[], permission: Permission): boolean {
  return permissionsFor(roles).has(permission);
}

/** Human-readable groupings for the Roles & Permissions matrix screen. */
export const PERMISSION_GROUPS: { label: string; items: { key: Permission; label: string }[] }[] = [
  {
    label: "Overview",
    items: [
      { key: "dashboard.view", label: "View dashboard" },
      { key: "platforms.view", label: "View platforms" },
    ],
  },
  {
    label: "Players",
    items: [
      { key: "players.view", label: "View players" },
      { key: "players.manage", label: "Manage players" },
    ],
  },
  {
    label: "Transactions",
    items: [
      { key: "deposits.view", label: "View deposits" },
      { key: "deposits.manage", label: "Approve / reject deposits" },
      { key: "cashouts.view", label: "View cashouts" },
      { key: "cashouts.manage", label: "Approve / reject cashouts" },
      { key: "payment_methods.view", label: "View payment methods" },
      { key: "payment_methods.manage", label: "Manage payment methods" },
      { key: "wallet_tools.use", label: "Use wallet tools (adjust balances)" },
    ],
  },
  {
    label: "Finance & Audit",
    items: [
      { key: "reports.view", label: "View financial reports" },
      { key: "audit.view", label: "View audit log" },
    ],
  },
  {
    label: "Administration",
    items: [
      { key: "staff.manage", label: "Manage staff accounts" },
      { key: "roles.manage", label: "Manage roles & permissions" },
      { key: "settings.manage", label: "Manage platform settings" },
    ],
  },
];