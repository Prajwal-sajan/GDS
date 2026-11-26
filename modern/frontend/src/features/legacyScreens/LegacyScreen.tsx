/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from "react";
import { api, authHeaders } from "../../api";
import { permissions } from "../settings/legacy";
import { legacyScreens } from "./vendor/screens.legacy";

// Adapter between the vendored legacy screens (legacy /api paths, snake_case JSON) and the .NET admin API (camelCase).
const snakeKey = (k: string) => k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
const camelKey = (k: string) => k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const mapKeys = (v: any, f: (k: string) => string): any =>
  Array.isArray(v) ? v.map((x) => mapKeys(x, f)) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [f(k), mapKeys(x, f)])) : v;

async function call(method: string, url: string, body?: unknown): Promise<any> {
  const [p, q = ""] = url.split("?");
  const qs = q ? "?" + q : "";
  // Endpoints whose legacy shape is served by /legacy/* compat routes.
  if (method === "GET" && p === "/daily-ops") return api.admin("/legacy/daily-ops" + qs);
  if (method === "GET" && p === "/trips") return api.admin("/legacy/trips" + qs);
  const trip = method === "GET" && /^\/trips\/(\d+)$/.exec(p);
  if (trip) {
    const s = mapKeys(await api.admin(`/trip-sheets/${trip[1]}`), snakeKey);
    return { ...s, passengers: (s.passengers ?? []).map((x: any) => ({ ...x, status: x.status === "booked" ? "confirmed" : x.status })) };
  }
  const r = mapKeys(await api.admin(url, method as any, body === undefined ? undefined : mapKeys(body, camelKey)), snakeKey);
  if (p === "/calls" && r?.calls) for (const c of r.calls) { c.schedule_id ??= c.trip_id; c.created_at ??= c.ts ?? c.at; c.recording_url ??= null; }
  if (p === "/ratings" && r?.rows) for (const x of r.rows) { x.schedule_id ??= x.trip_id; x.created_at ??= x.rated_at; }
  if (/^\/chats\/[^/]+$/.test(p) && r?.messages) for (const m of r.messages) m.created_at ??= m.ts;
  return r;
}

let rt: any;
function runtime() {
  if (rt) return rt;
  rt = legacyScreens({
    api: call,
    async download(url: string, name: string) {
      const res = await fetch("/api/admin" + url, { headers: authHeaders() });
      const blob = await res.blob();
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    },
  });
  return rt;
}

/** Mounts legacy G.screens[name](box, params) exactly like legacy main.js route(). */
export function LegacyScreen({ name, seg }: { name: string; seg: string[] }) {
  const hash = location.hash;
  useEffect(() => {
    const main = document.querySelector<HTMLElement>("main[data-content]");
    if (!main) return;
    let on = true, box: HTMLElement | null = null;
    const mount = () => {
      if (!on) return;
      const G = runtime();
      box?.remove();
      box = document.createElement("div");
      main.appendChild(box);
      const params: any = seg.slice(1);
      params.tab = seg[1]; params.id = seg[1];
      G.route = mount;
      Promise.resolve(G.screens[name](box, params)).catch(G.err);
    };
    void permissions().then((p) => { const G = runtime(); G.user ??= { permissions: p, phone: "" }; mount(); });
    return () => { on = false; box?.remove(); };
  }, [name, hash]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
