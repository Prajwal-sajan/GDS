/* eslint-disable @typescript-eslint/no-explicit-any */
import { api } from "../../api";
import { can as canPerm, permissions } from "../../auth/permissions";

// Data adapter for Daily Ops / Sarathi / Chats / Calls: the screens consume the legacy snake_case shapes, the .NET admin
// API speaks camelCase. Pure data mapping — no legacy runtime.
const snakeKey = (k: string) => k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
const camelKey = (k: string) => k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const mapKeys = (v: any, f: (k: string) => string): any =>
  Array.isArray(v) ? v.map((x) => mapKeys(x, f)) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [f(k), mapKeys(x, f)])) : v;

export async function commsApi<T = any>(method: "GET" | "POST" | "PUT" | "DELETE", url: string, body?: unknown): Promise<T> {
  const [p, q = ""] = url.split("?");
  const qs = q ? "?" + q : "";
  if (method === "GET" && p === "/daily-ops") return api.admin("/legacy/daily-ops" + qs);
  if (method === "GET" && p === "/trips") return api.admin("/legacy/trips" + qs);
  const trip = method === "GET" && /^\/trips\/(\d+)$/.exec(p);
  if (trip) {
    const s = mapKeys(await api.admin(`/trip-sheets/${trip[1]}`), snakeKey);
    return { ...s, passengers: (s.passengers ?? []).map((x: any) => ({ ...x, status: x.status === "booked" ? "confirmed" : x.status })) } as T;
  }
  const r = mapKeys(await api.admin(url, method, body === undefined ? undefined : mapKeys(body, camelKey)), snakeKey);
  if (p === "/calls" && r?.calls) for (const c of r.calls) { c.schedule_id ??= c.trip_id; c.created_at ??= c.ts ?? c.at; c.recording_url ??= null; }
  if (p === "/ratings" && r?.rows) for (const x of r.rows) { x.schedule_id ??= x.trip_id; x.created_at ??= x.rated_at; }
  if (/^\/chats\/[^/]+$/.test(p) && r?.messages) for (const m of r.messages) m.created_at ??= m.ts;
  return r;
}
export const get = <T = any>(u: string) => commsApi<T>("GET", u);
export const post = <T = any>(u: string, b: unknown = {}) => commsApi<T>("POST", u, b);
export const put = <T = any>(u: string, b: unknown = {}) => commsApi<T>("PUT", u, b);

/** Loads the caller's permission list once; `can` is then synchronous. */
export const loadPermissions = () => permissions().catch(() => [] as string[]);
export const can = canPerm;

export const qs = (o: Record<string, string | null | undefined>) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "") as [string, string][]).toString();
export const hashQuery = () => Object.fromEntries(new URLSearchParams(location.hash.split("?")[1] || "")) as Record<string, string>;
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const addDays = (s: string, n: number) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const fdate = (s?: string | null) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const fdt = (s?: string | null) => (s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
export const inr = (n?: number | null, d = 0) => (n == null || isNaN(n) ? "—" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d })}`);
