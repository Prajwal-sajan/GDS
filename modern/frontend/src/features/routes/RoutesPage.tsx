import { useCallback, useEffect, useState } from "react";
import { api, type Me, type RouteListRow } from "../../api";
import { confirmDialog, toast, toastError } from "../../components/ui/feedback";

// React port of the legacy GDS → Routes list (public/js/routes-screenshot-v5.js: listRoutes(), rowRoute(), modal()).
// Same DOM, class names and SVG paths, so the vendored legacy CSS (routes-screenshot-v5.css) renders it identically.
// Actions the .NET backend cannot perform yet (add / duplicate / delete route, GPS bus halts) are rendered but disabled
// with an explanatory tooltip — never faked. See docs/modernization/UI_MIGRATION_GAPS.md.
const ICONS = {
  route: "M3 6l6 3 6-3 6 3v11l-6-3-6 3-6-3V6zm6 3v11m6-14v11",
  calendar: "M8 2v4m8-4v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z",
  clock: "M12 6v6l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  bus: "M5 17h14M4 4h16v12H4V4zm3 12v3m10-3v3M7 10h.01M17 10h.01",
  sliders: "M4 7h16M4 17h16M9 4v6m6 4v6",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  edit: "M12 20h9M16 4l4 4L9 19l-5 1 1-5L16 4z", copy: "M8 7h12v14H8V7zM4 17H3V3h14v1",
  trash: "M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7m4-7v7", plus: "M12 5v14M5 12h14", close: "M5 5l14 14M19 5 5 19",
  bolt: "M13 2 3 14h8l-1 8 11-13h-8z",
} as const;
type IconKey = keyof typeof ICONS;
const I = ({ k, size = 18 }: { k: IconKey; size?: number }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth={1.85} strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[k]} /></svg>
);
const UNSUPPORTED = "Not available yet: the modern backend has no route create/duplicate/delete endpoint (tracked in UI_MIGRATION_GAPS.md)";
const HALTS = "Not available yet: GPS halt evidence is not stored by the modern backend";
const STATUSES: [string, string, string][] = [["active", "Active", "#04bf7b"], ["inactive", "Inactive", "#9da9bc"], ["deleted", "Deleted", "#ff3858"]];
const OPS = ["owner", "admin", "ops"];
const hm = (t: string | null | undefined) => String(t ?? "").slice(0, 5) || "—";
const dmy = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB") : null);
const go = (h: string) => { window.location.hash = h; };

function RouteRowView({ r, i, canOperate, onToggle, onMap }: { r: RouteListRow; i: number; canOperate: boolean; onToggle: (r: RouteListRow, on: boolean) => void; onMap: (r: RouteListRow) => void }) {
  const a = r.origin?.name ?? "Origin", z = r.destination?.name ?? "Destination";
  const line = r.via.slice(1, -1).join(", ");
  const m = r.durationMinutes ?? 0;
  const inactive = r.status !== "active";
  const tools: [string, IconKey][] = [["view", "eye"], ["map", "route"], ["edit", "edit"], ["duplicate", "copy"], ["delete", "trash"]];
  const act = (k: string) => {
    if (k === "view" || k === "edit") go(`#/gds/routes/${r.id}?rvtab=general&rvmode=${k}`);
    else if (k === "map") onMap(r);
  };
  return (
    <article className={`rv-route-row ${i % 4 === 0 ? "warm" : ""}`} data-rv-route-id={r.id}>
      <div className="rv-service"><b className="rv-service-no">{r.serviceNumber}</b>{r.altName && <strong>{r.altName}</strong>}<span>{r.name || `${a} ${z}`}</span>
        <span className="rv-coachpill"><I k="bus" size={16} /> {r.coach?.name ?? "Coach not assigned"} {r.coach ? `· ${r.coach.capacity} seats` : ""}</span></div>
      <div className="rv-tripline">
        <div className="rv-location"><strong>{hm(r.departureTime)}</strong><b>{a}</b><small>{r.origin?.state ?? ""}</small></div>
        <div className="rv-routegraph">
          <small className="rv-duration"><I k="clock" size={14} /> {m ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : "—"}</small>
          <div className="rv-line"><i></i><i></i><i></i><i></i></div>
          <span>via {line || "direct"}</span>
          <small><I k="calendar" size={13} /> {dmy(r.startDate) ?? "—"} → {dmy(r.endDate) ?? "∞"}</small>
        </div>
        <div className="rv-location"><strong>{hm(r.arrivalTime)}<sup>{r.arrivalDay > 1 ? `+${r.arrivalDay - 1}` : ""}</sup></strong><b>{z}</b><small>{r.destination?.state ?? ""}</small></div>
      </div>
      <div className="rv-route-links">
        {([["pickups", "Pickups", "↑"], ["drops", "Drops", "↓"], ["fares", "Fares", "₹"]] as const).map(([t, txt, g]) => (
          <button key={t} type="button" data-rv={`open:${t}`} onClick={() => go(`#/gds/routes/${r.id}?rvtab=${t}&rvmode=view`)}><i>{g}</i>{txt}</button>
        ))}
      </div>
      <div className="rv-route-tools">
        <label className="rv-switch" title={canOperate ? undefined : "Your role cannot change route status"}>
          <input type="checkbox" data-rv-field={`active_${r.id}`} checked={!inactive} disabled={!canOperate} onChange={(e) => onToggle(r, e.currentTarget.checked)} /><span></span>
        </label>
        {tools.map(([k, ico]) => {
          const unsupported = k === "duplicate" || k === "delete";
          return (
            <button key={k} type="button" title={unsupported ? UNSUPPORTED : k === "map" ? "Route map" : `${k[0].toUpperCase()}${k.slice(1)} route`} aria-label={k}
              className={`rv-tool rv-${k}`} data-rv={k} aria-disabled={unsupported || undefined} disabled={k === "edit" && !canOperate}
              onClick={() => (unsupported ? toast(UNSUPPORTED, "warn") : act(k))}><I k={ico} size={19} /></button>
          );
        })}
      </div>
    </article>
  );
}

export function RoutesPage({ me }: { me: Me }) {
  const canOperate = OPS.includes(me.role);
  const [routes, setRoutes] = useState<RouteListRow[]>();
  const [error, setError] = useState<string>();
  const initial = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("status") ?? "active";
  const [status, setStatus] = useState(initial);
  const [map, setMap] = useState<RouteListRow>();

  const load = useCallback(async () => {
    try { setRoutes((await api.routeList()).routes); setError(undefined); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!map) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setMap(undefined); };
    document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k);
  }, [map]);

  const filter = (s: string) => { setStatus(s); window.history.replaceState(null, "", `#/gds/routes?status=${s}`); };
  const toggle = async (r: RouteListRow, on: boolean) => {
    const wants = on ? "active" : "inactive";
    if (!(await confirmDialog(`Change ${r.serviceNumber} to ${wants}?`, { danger: wants === "inactive" }))) return;
    try { await api.setRouteStatus(r.id, wants); toast(`Route ${wants}`, "ok"); await load(); } catch (e) { toastError(e); }
  };

  if (error) return <div className="rv-root rv-list"><div className="rv-empty" role="alert">Could not load routes: {error}</div></div>;
  if (!routes) return <div className="rv-root rv-list"><div className="rv-empty">Loading…</div></div>;
  const selected = routes.filter((r) => status === "all" || r.status === status);
  return (
    <div className="rv-root rv-list">
      <div className="rv-top">
        <div className="rv-statusfilters">
          {STATUSES.map(([s, t, color]) => (
            <button key={s} type="button" className={status === s ? "current" : ""} data-rv={`filter:${s}`} onClick={() => filter(s)}>
              <span style={{ background: color }} className="rv-dot"></span>{t}{s === "deleted" ? null : <b>{routes.filter((r) => r.status === s).length}</b>}
            </button>
          ))}
        </div>
        <button type="button" className="rv-btn sky" data-rv="all-halts" aria-disabled="true" title={HALTS} onClick={() => toast(HALTS, "warn")}><I k="bus" size={17} /> Bus halts</button>
      </div>
      <div className="rv-listframe">
        <header className="rv-listhead">
          <span><b aria-hidden="true" className="rv-hash-icon">#</b> SERVICE ⇅</span>
          <span><I k="route" size={17} /> DEPARTURE → ARRIVAL</span>
          <span><I k="sliders" size={17} /> DETAILS</span>
          <span><I k="bolt" size={17} /> ACTIONS</span>
          <button type="button" className="rv-btn primary" data-rv="add-route" aria-disabled="true" title={UNSUPPORTED} onClick={() => toast(UNSUPPORTED, "warn")}><I k="plus" size={18} /> Add Route</button>
        </header>
        {selected.length
          ? selected.map((r, i) => <RouteRowView key={r.id} r={r} i={i} canOperate={canOperate} onToggle={toggle} onMap={setMap} />)
          : <div className="rv-empty">No routes in this category.</div>}
      </div>
      {map && (
        <div className="rv-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setMap(undefined); }}>
          <section className="rv-modal" role="dialog" aria-modal="true" aria-label={`Route map — ${map.serviceNumber}`}>
            <header><h2>Route map — {map.serviceNumber}</h2><button type="button" className="rv-icon" data-rv-modal-close onClick={() => setMap(undefined)}><I k="close" /></button></header>
            <div className="rv-modal-content">
              <div className="rv-map-route"><b>{map.origin?.name ?? "Origin"} → {map.destination?.name ?? "Destination"}</b><div>{map.via.join(" → ")}</div>
                <p>Map stops are available on the Pickups and Drops tabs. A road-route polyline cannot be inferred from the screenshot.</p>
                <button type="button" className="rv-btn primary" data-rv="open-route-map" onClick={() => { const id = map.id; setMap(undefined); go(`#/gds/routes/${id}?rvtab=cities&rvmode=view`); }}>Open route details</button></div>
            </div>
            <footer><button type="button" className="rv-btn" data-rv-modal-close onClick={() => setMap(undefined)}>Cancel</button></footer>
          </section>
        </div>
      )}
    </div>
  );
}
