import type { NavIcon } from "../components/ui/icons";

// Legacy navigation model (public/js/main.js TOP/SUB/sectionOf; public/js/settings-parity.js SETTINGS_MENU),
// with legacy permission keys translated to the .NET roles. The API remains the enforcement point.
export type Role = "owner" | "admin" | "ops" | "accounts" | "viewer" | "agent";
const ALL: Role[] = ["owner", "admin", "ops", "accounts", "viewer"];
const OPS: Role[] = ["owner", "admin", "ops"];
const ACC: Role[] = ["owner", "admin", "accounts"];
const ADMIN: Role[] = ["owner", "admin"];

export interface NavItem { key: NavIcon; label: string; href: string; roles: Role[] }
/** Top pills — legacy order Trips, GDS, Chats, Calls. */
export const TOP: NavItem[] = [
  { key: "trips", label: "Trips", href: "#/trips", roles: ALL },
  { key: "gds", label: "GDS", href: "#/gds/schedules", roles: [...ALL, "agent"] },
  { key: "chats", label: "Chats", href: "#/chats", roles: OPS },
  { key: "calls", label: "Calls", href: "#/calls", roles: OPS },
];
/** GDS sub-pills — legacy order Schedules, Routes, CRM, Vehicles, Accounts, Staff, Daily Ops, Sarathi. */
export const SUB: NavItem[] = [
  { key: "schedules", label: "Schedules", href: "#/gds/schedules", roles: ALL },
  { key: "routes", label: "Routes", href: "#/gds/routes", roles: ALL },
  { key: "crm", label: "CRM", href: "#/crm", roles: ALL },
  { key: "vehicles", label: "Vehicles", href: "#/fleet/vehicles", roles: OPS },
  { key: "accounts", label: "Accounts", href: "#/accounts", roles: [...ACC, "ops", "viewer", "agent"] },
  { key: "staff", label: "Staff", href: "#/fleet/staff", roles: OPS },
  { key: "dailyops", label: "Daily Ops", href: "#/dailyops", roles: ALL },
  { key: "sarathi", label: "Sarathi", href: "#/sarathi", roles: ALL },
];
export interface SettingsItem { key: string; label: string; desc: string; icon: string; color: string; roles: Role[] }
export const SETTINGS_MENU: SettingsItem[] = [
  { key: "team-access", label: "Team & access", desc: "Staff, agents, branches and who can do what", icon: "users", color: "violet", roles: ADMIN },
  { key: "branding", label: "Branding", desc: "Logo, colors, fonts & signin page", icon: "brush", color: "pink", roles: ADMIN },
  { key: "configuration", label: "Configuration", desc: "Notifications, alerts, loyalty & bot settings", icon: "sliders", color: "gray", roles: ADMIN },
  { key: "integrations", label: "Integrations", desc: "RedBus provider, outbox, resync & delivery attempts", icon: "key", color: "violet", roles: ALL },
  { key: "whatsapp", label: "WhatsApp", desc: "Send messages from your own WhatsApp number", icon: "chat", color: "green", roles: ADMIN },
  { key: "loyalty-program", label: "Loyalty Program", desc: "Miles redemption, day rates, tiers & seat upgrades", icon: "spark", color: "orange", roles: ADMIN },
  { key: "switch-user", label: "Switch User", desc: "View the app as another user", icon: "switchUser", color: "violet", roles: ADMIN },
  { key: "change-password", label: "Change Password", desc: "Update your account password", icon: "lock", color: "red", roles: [...ALL, "agent"] },
  { key: "my-devices", label: "My devices", desc: "See and log out where you're signed in", icon: "phoneDevice", color: "red", roles: [...ALL, "agent"] },
  { key: "about", label: "About", desc: "App version & check for updates", icon: "info", color: "gray", roles: [...ALL, "agent"] },
];
export const LANGUAGES = ["English", "हिन्दी", "తెలుగు", "தமிழ்", "ಕನ್ನಡ", "मराठी", "বাংলা", "ગુજરાતી", "മലയാളം", "ਪੰਜਾਬੀ", "ଓଡ଼ିଆ", "অসমীয়া", "اردو"];

/** Which top pill and GDS sub-pill a route belongs to (legacy sectionOf). */
export function sectionOf(seg: string[]): [string, string | null] {
  const [name, tab] = seg;
  if (name === "gds") return ["gds", tab === "routes" ? "routes" : "schedules"];
  if (name === "fleet") return ["gds", ["vehicles", "coaches"].includes(tab || "vehicles") ? "vehicles" : "staff"];
  if (["crm", "accounts", "dailyops", "sarathi"].includes(name)) return ["gds", name];
  return [name, null];
}
export const settingsHref = (key: string) => (key === "team-access" ? "#/settings/team-access/office-staff" : `#/settings/${key}`);
