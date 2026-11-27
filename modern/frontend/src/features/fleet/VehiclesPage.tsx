import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type CoachListRow, type Me, type VehicleListRow } from "../../api";
import { Modal, confirmDialog, promptDialog, toast, toastError } from "../../components/ui/feedback";
import { CoachModal, blankCoach, type CoachDraft } from "./CoachModal";
import { VehicleDetail } from "./VehicleDetail";
import { TileMap } from "./TileMap";
import { NiceSelect } from "../../components/ui/NiceSelect";

// React port of legacy GDS → Vehicles / Coaches (public/js/vehicles-parity-v9.js vehiclesPage()/coachesPage() and the
// default grid cards of vehicle-cards-v37.js). Same DOM + classes so the vendored vehicles-parity-v9 / v37 CSS applies.
// Telemetry is the last report stored in PostgreSQL (imported from legacy); nothing is simulated by the UI.
const P: Record<string, string> = {
  bus: '<rect x="3" y="4" width="18" height="15" rx="3"/><path d="M3 11h18M7 19v2m10-2v2M7 15h.01M17 15h.01"/>',
  snowflake: '<path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07M9 5l3 3 3-3M9 19l3-3 3 3"/>',
  bed: '<path d="M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7M3 14h18M5 9V5h14v4M3 18v2m18-2v2"/>',
  armchair: '<path d="M5 11V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5M5 11h14a2 2 0 0 1 2 2v4H3v-4a2 2 0 0 1 2-2ZM6 17v3m12-3v3"/>',
  video: '<rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  activity: '<path d="M2 12h4l3-7 6 14 3-7h4"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/><path d="M4 12h4l2-3 3 6 2-3h5"/>',
  signal: '<path d="M3 20h.01M7 20v-4m4 4v-8m4 8V8m4 12V4"/>',
  sort: '<path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15M15 6v15"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  pencil: '<path d="m14 5 5 5M3 21l5-1 12-12a3.5 3.5 0 0 0-5-5L3 15l0 6Z"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  power: '<path d="M12 2v9M6.3 5.5a9 9 0 1 0 11.4 0"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  play: '<path d="m8 5 11 7-11 7V5Z"/>',
  pause: '<rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/>',
  wifiOff: '<path d="m2 2 20 20M4.9 9.1A14 14 0 0 1 19 9m-9.5 4.5a7 7 0 0 1 5.5 0M12 19h.01M2 6a20 20 0 0 1 20 0"/>',
  alert: '<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3h.01"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6 18.4 18.4"/>',
  fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M3 21h13M7 7h5v6H7zM15 8l3 3v6a2 2 0 0 0 4 0V8l-3-3"/>',
  gauge: '<path d="M5.4 19a9 9 0 1 1 13.2 0M12 12l4-5"/><circle cx="12" cy="12" r="1"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 10h18c0-2-3-3-3-10M10 22h4"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  zap: '<path d="m13 2-9 12h7l-1 8 10-12h-7l0-8Z"/>',
  droplet: '<path d="M12 2s-7 9-7 13a7 7 0 0 0 14 0c0-4-7-13-7-13Z"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5 9-5Zm-9 10 9 5 9-5M3 17l9 5 9-5"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m9 11 6-5m-6 8 6 4"/>',
  expand: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
};
const I = ({ n, s = 19 }: { n: string; s?: number }) => (
  <svg className="vp-i" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.85} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: P[n] ?? P.bus }} />
);
const IconBtn = ({ n, kind, label, ...rest }: { n: string; kind: string; label: string; onClick?: () => void; [k: `data-${string}`]: string | undefined; "aria-pressed"?: boolean; "aria-disabled"?: boolean }) => (
  <button type="button" className={`vp-icon vp-icon--${kind}`} {...rest} title={label} aria-label={label}><I n={n} /></button>
);
const Metric = ({ n, v, label, cl }: { n: string; v: number; label: string; cl: string }) => (
  <div className={`vp-metric ${cl}`}><span className="vp-metric-icon"><I n={n} s={21} /></span><div className="vp-metric-number">{v}</div><small>{label}</small></div>
);
const Tabs = ({ active }: { active: string }) => (
  <nav className="vp-areas" aria-label="Vehicle submenus"><a href="#/fleet/vehicles" className={active === "vehicles" ? "selected" : ""}>Vehicles</a><a href="#/fleet/coaches" className={active === "coaches" ? "selected" : ""}>Coaches</a></nav>
);
const Sel = ({ icon, value, onChange, options, data, sort }: { icon: string; value: string; onChange: (v: string) => void; options: [string, string][]; data: Record<string, string>; sort?: boolean }) => (
  <label className={`vp-select ${sort ? "sort" : ""} ui-dd-hosted`.replace("  ", " ")}><I n={icon} /><NiceSelect value={value} onChange={onChange} options={options} {...data} /><I n="down" s={13} /></label>
);
const OPS = ["owner", "admin", "ops"];
const readLayout = (tab: string) => { try { return localStorage.getItem(`gds_${tab}_layout_v37`) === "list" ? "list" : "grid"; } catch { return "grid"; } };
const saveLayout = (tab: string, v: string) => { try { localStorage.setItem(`gds_${tab}_layout_v37`, v); } catch { /* ignore */ } };

// ---- telemetry helpers (same rules as legacy) ----
const known = (x: unknown) => x !== null && x !== undefined && x !== "" && Number.isFinite(Number(x));
const num = (v: unknown) => (v === null || v === undefined || Number.isNaN(Number(v)) ? "—" : Number(v).toLocaleString("en-IN"));
const pos = (v: VehicleListRow) => v.position ?? {};
const state = (v: VehicleListRow) => String(pos(v).state || "UNKNOWN").toUpperCase();
const healthStatus = (v: VehicleListRow) => String(v.health?.status || "UNKNOWN").toUpperCase();
const validGPS = (p: { lat?: number | null; lng?: number | null }) => p.lat != null && p.lng != null && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)) && Math.abs(Number(p.lat)) <= 90 && Math.abs(Number(p.lng)) <= 180;
const fresh = (p: { ts?: number | string }) => { if (!p.ts) return false; const ms = Date.now() - new Date(p.ts).getTime(); return ms < 15 * 60_000 && ms > -60_000; };
const gpsStatus = (v: VehicleListRow) => (!v.gpsEnabled ? "Offline" : validGPS(pos(v)) && fresh(pos(v)) ? "Connected" : "Offline");
const odo = (v: VehicleListRow) => v.odometerReading ?? v.health?.odometer_km ?? null;
const fuel = (v: VehicleListRow) => v.health?.fuel?.fuel_l ?? v.health?.fuel?.remaining_l ?? null;
const adBlue = (v: VehicleListRow) => v.health?.fuel?.adblue_l ?? null;
const formatAge = (x?: number | string) => {
  if (!x) return "No GPS update"; const ms = Date.now() - new Date(x).getTime();
  if (!Number.isFinite(ms)) return "Unknown update"; if (ms < 0) return "Clock mismatch"; if (ms < 60000) return "Just now";
  if (ms < 3600000) return `${Math.floor(ms / 60000)} min ago`; if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`; return `${Math.floor(ms / 86400000)}d ago`;
};
const sinceAge = (x?: number | string) => {
  const ms = Date.now() - new Date(x ?? "").getTime(); if (!x || !Number.isFinite(ms) || ms < 0) return "Since —";
  if (ms < 3600000) return `Since ${Math.max(1, Math.floor(ms / 60000))} min`; const h = Math.floor(ms / 3600000); return `Since ${h} hr${h === 1 ? "" : "s"}`;
};
const alertCount = (v: VehicleListRow) => (v.health?.alerts ?? []).filter((a) => String(a.status || "").toUpperCase() !== "GOOD").length + (Number(v.docAlerts) || 0);

type Act = (a: string, v: VehicleListRow) => void;
/** The 10 legacy cells (row(v) in vehiclesPage) — shared by list rows and grid cards exactly like legacy. */
function vehicleParts(v: VehicleListRow, canModify: boolean, act: Act, toggle: (v: VehicleListRow, on: boolean) => void): ReactNode[] {
  const p = pos(v), h = v.health ?? {}, st = state(v);
  const stCl = st === "MOVING" ? "moving" : st === "IDLING" ? "idling" : st === "STOPPED" ? "stopped" : "unknown";
  const hs = healthStatus(v), healthCl = hs === "GOOD" ? "good" : hs === "UNKNOWN" ? "unknown" : "warning";
  const n = alertCount(v), gps = gpsStatus(v) === "Connected";
  const tank = (val: unknown, label: string, tone: string) => (
    <div className="vp-tank"><I n={label === "Fuel" ? "fuel" : "droplet"} s={17} /><span className="vp-tank-bar"><span className={tone} style={{ width: `${known(val) ? Math.min(100, Math.max(0, Number(val))) : 0}%` }}></span></span><b>{known(val) ? `${val} L` : "N/A"}</b></div>
  );
  return [
    <><strong className="vp-reg">{v.registrationNumber}</strong><small>{v.coach || "No coach assigned"}</small><small className="vp-fresh"><span className="vp-green-dot"></span>{validGPS(p) ? `Position ${formatAge(p.ts)}` : "No GPS fix"}</small></>,
    <><span className={`vp-state ${stCl}`}><I n={st === "MOVING" ? "play" : st === "IDLING" ? "pause" : "stop"} s={14} /> {st}</span><small>{validGPS(p) ? sinceAge(p.state_since || p.ts) : "No position"}</small></>,
    <><strong>{odo(v) !== null ? `${num(odo(v))} km` : "—"}</strong><small>{known(h.engine_hours) ? `${num(h.engine_hours)} hrs` : "Engine hours N/A"}</small></>,
    <>{tank(fuel(v), "Fuel", "green")}{tank(adBlue(v), "AdBlue", "amber")}</>,
    <button className="vp-clearbtn" data-action="location" data-id={v.id} onClick={() => act("location", v)}>{gps ? <span className="vp-gps ok"><I n="signal" s={18} /> Connected</span> : <span className="vp-gps bad"><I n="wifiOff" s={18} /> Offline</span>}</button>,
    <button className="vp-clearbtn" data-action="health" data-id={v.id} onClick={() => act("health", v)}><span className={`vp-health ${healthCl}`}><I n="check" s={15} /> {hs === "UNKNOWN" ? "N/A" : hs}</span>{n ? <small className="vp-issues">ISSUES {String(n).padStart(2, "0")}</small> : null}</button>,
    validGPS(p)
      ? <><button type="button" className="vp-link vp-loc" data-action="location" data-id={v.id} onClick={() => act("location", v)}><I n="pin" s={16} /> <span>Live location</span></button><small>{`${Number(p.lat).toFixed(4)}, ${Number(p.lng).toFixed(4)}`} · {known(p.speed) ? p.speed : "—"} km/h</small></>
      : <span className="vp-muted">No reported location</span>,
    <button className={`vp-clearbtn vp-bell ${n ? "has" : ""}`} data-action="alerts" data-id={v.id} onClick={() => act("alerts", v)}><I n="bell" s={19} />{n ? <span className="vp-alert-num">{n}</span> : null}</button>,
    <label className="vp-onoff"><input aria-label={`${v.registrationNumber} active status`} type="checkbox" data-active={v.id} checked={v.status === "active"} disabled={!canModify} onChange={(e) => toggle(v, e.target.checked)} /><span className="vp-thumb"></span><b>{v.status === "active" ? "Active" : "Inactive"}</b></label>,
    <div className="vp-actions">
      <IconBtn n="eye" kind="blue" data-action="view" data-id={String(v.id)} label="View vehicle" onClick={() => act("view", v)} />
      {canModify && <IconBtn n="pencil" kind="purple" data-action="edit" data-id={String(v.id)} label="Edit vehicle" onClick={() => act("edit", v)} />}
      {canModify && <IconBtn n="copy" kind="mint" data-action="duplicate" data-id={String(v.id)} label="Duplicate vehicle" onClick={() => act("duplicate", v)} />}
      {canModify && <IconBtn n="trash" kind="red" data-action="delete" data-id={String(v.id)} label="Delete vehicle" onClick={() => act("delete", v)} />}
    </div>,
  ];
}

function VehicleForm({ v, coaches, onClose, onSaved }: { v: VehicleListRow | null; coaches: CoachListRow[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ registrationNumber: v?.registrationNumber ?? "", coachTemplateId: String(v?.coachTemplateId ?? coaches[0]?.id ?? ""), modelName: v?.modelName ?? "",
    vehicleRole: v?.vehicleRole ?? "main", status: v?.status ?? "active", gpsEnabled: v?.gpsEnabled ?? false });
  const [full, setFull] = useState<Record<string, unknown>>();
  useEffect(() => { if (v) void api.vehicles().then((all) => setFull(all.find((x) => x.id === v.id) as unknown as Record<string, unknown>)); }, [v]);
  const save = async () => {
    if (!f.registrationNumber.trim()) return toast("Registration number is required", "bad");
    try {
      await api.saveVehicle({ ...(full ?? {}), registrationNumber: f.registrationNumber, coachTemplateId: Number(f.coachTemplateId) || null, modelName: f.modelName || null,
        vehicleRole: f.vehicleRole, status: f.status, gpsEnabled: f.gpsEnabled }, v?.id);
      toast("Vehicle saved", "ok"); onClose(); onSaved();
    } catch (e) { toastError(e); }
  };
  if (v && !full) return <Modal title={v ? "Edit Vehicle" : "Add Vehicle"} size="lg" onClose={onClose}><p>Loading…</p></Modal>;
  return (
    <Modal title={v ? "Edit Vehicle" : "Add Vehicle"} size="lg" onClose={onClose} foot={<><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="button" className="btn primary" data-vehicle-save onClick={() => void save()}>Save</button></>}>
      <div className="grid2">
        <label>Registration number *<input name="registration_number" value={f.registrationNumber} onChange={(e) => setF({ ...f, registrationNumber: e.target.value })} /></label>
        <label>Coach *<select name="coach_template_id" value={f.coachTemplateId} onChange={(e) => setF({ ...f, coachTemplateId: e.target.value })}>{coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Model<input name="model" value={f.modelName} onChange={(e) => setF({ ...f, modelName: e.target.value })} /></label>
        <label>Vehicle role<select name="vehicle_role" value={f.vehicleRole} onChange={(e) => setF({ ...f, vehicleRole: e.target.value })}><option value="main">Main bus</option><option value="pickup_van">Pickup Van</option><option value="spare">Spare</option></select></label>
        <label>Status<select name="status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{["active", "inactive", "maintenance"].map((x) => <option key={x}>{x}</option>)}</select></label>
        <label><input type="checkbox" name="gps_enabled" checked={f.gpsEnabled} onChange={(e) => setF({ ...f, gpsEnabled: e.target.checked })} /> GPS device configured</label>
      </div>
    </Modal>
  );
}

function InfoModal({ kind, v, onClose }: { kind: string; v: VehicleListRow; onClose: () => void }) {
  const p = pos(v), h = v.health ?? {};
  if (kind === "location") {
    const ok = validGPS(p);
    const share = async () => {
      if (!ok) return toast("No coordinate to share", "bad");
      const url = `https://www.openstreetmap.org/?mlat=${Number(p.lat)}&mlon=${Number(p.lng)}#map=15/${Number(p.lat)}/${Number(p.lng)}`;
      try { await navigator.clipboard.writeText(url); toast("Map link copied", "ok"); } catch { toast("Copy link from the browser address bar"); }
    };
    return (
      <Modal title={<>Live location · {v.registrationNumber} · {v.coach || "Coach"}</>} size="lg" className="vp-overlay-map" onClose={onClose}
        foot={<div className="vp-footer"><button type="button" className="vp-btn outline" data-share-location="" onClick={() => void share()}><I n="share" /> Share</button><button type="button" className="vp-btn primary" data-close-location="" onClick={onClose}>Close</button></div>}>
        <div className="vp-position-label"><span className="vp-dot state">{p.state || "Unknown"}</span> <span className="vp-dot muted">Updated {formatAge(p.ts)}</span>
          <h3><I n="pin" /> {ok ? `${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}` : "No recorded position"}</h3></div>
        <TileMap single pins={ok ? [{ id: v.id, label: v.registrationNumber, lat: Number(p.lat), lng: Number(p.lng) }] : []} />
        <p className="vp-map-disclaimer">{ok ? "Location is the last coordinate stored for this vehicle." : "GPS provider has not returned a position."}</p>
      </Modal>
    );
  }
  const title = kind === "health" ? "Vehicle Health" : kind === "alerts" ? "Alerts" : "View Vehicle";
  return (
    <Modal title={<>{title} · {v.registrationNumber}</>} size="lg" onClose={onClose}>
      {kind === "view" && <dl className="vp-info-card">{([["Registration", v.registrationNumber], ["Coach", v.coach], ["Model", v.modelName], ["Role", v.vehicleRole], ["Status", v.status], ["Odometer", odo(v) == null ? "—" : `${num(odo(v))} km`]] as const).map(([k, x]) => <div key={k}><dt>{k}</dt><dd>{x || "—"}</dd></div>)}</dl>}
      {(kind === "location" || kind === "view") && <p>{validGPS(p) ? `${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}` : "No reported GPS fix"} · {gpsStatus(v)} · last report {formatAge(p.ts)}</p>}
      {(kind === "health" || kind === "alerts" || kind === "view") && <>
        <p>Health: {healthStatus(v)} · {(h.alerts ?? []).length} reported signals{kind === "alerts" ? ` · ${v.docAlerts} document(s) expiring within 30 days` : ""}</p>
        <ul>{(h.alerts ?? []).map((a, i) => <li key={i}>{a.message} — {a.status}{a.reading != null ? ` (${a.reading} ${a.unit ?? ""})` : ""}</li>)}</ul>
      </>}
      <p className="vp-datasource">Values are the last report stored for this vehicle; the modern stack does not poll a live GPS/ECU feed.</p>
    </Modal>
  );
}

function FleetMapModal({ V, onClose, onPin }: { V: VehicleListRow[]; onClose: () => void; onPin: (v: VehicleListRow) => void }) {
  const [fitN, setFitN] = useState(0);
  const pins = V.filter((v) => validGPS(pos(v))).map((v) => ({ id: v.id, label: v.registrationNumber, lat: Number(pos(v).lat), lng: Number(pos(v).lng) }));
  return (
    <Modal title={<>Fleet Map <small>{pins.length} of {V.length} on map · Moving {V.filter((v) => state(v) === "MOVING").length}</small></>} size="lg" className="vp-overlay-map" onClose={onClose}
      foot={<div className="vp-footer"><button type="button" className="vp-btn outline" data-vp-map-show="" onClick={() => setFitN((n) => n + 1)}><I n="expand" /> Show all</button><button type="button" className="vp-btn outline" data-vp-map-close="" onClick={onClose}>Close</button></div>}>
      <TileMap pins={pins} fitSignal={fitN} onPin={(id) => { const v = V.find((x) => x.id === id); if (v) onPin(v); }} />
      <p className="vp-map-disclaimer">Map positions are the last coordinates stored for each vehicle.</p>
    </Modal>
  );
}

export function VehiclesPage({ me }: { me: Me }) {
  const canModify = OPS.includes(me.role);
  const [V, setV] = useState<VehicleListRow[]>(); const [C, setC] = useState<CoachListRow[]>([]); const [error, setError] = useState<string>();
  const [s, setS] = useState({ query: "", state: "All states", health: "All health", gps: "All GPS", sort: "plate", layout: readLayout("vehicles") });
  const [modal, setModal] = useState<{ kind: string; v: VehicleListRow | null }>();
  const [ws, setWs] = useState<{ id: number; mode: "view" | "edit" }>();
  const load = useCallback(async () => {
    try { const [a, b] = await Promise.all([api.vehicleList(), api.coachList()]); setV(a.vehicles); setC(b.coaches); setError(undefined); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const toggle = async (v: VehicleListRow, on: boolean) => {
    try { await api.setVehicleStatus(v.id, on ? "active" : "inactive"); toast("Vehicle status saved", "ok"); await load(); } catch (e) { toastError(e); }
  };
  const act: Act = async (a, v) => {
    if (a === "view" || a === "edit") { setWs({ id: v.id, mode: a }); return; }
    if (a === "delete") {
      if (!(await confirmDialog("Delete this vehicle? A vehicle assigned to upcoming trips cannot be removed.", { danger: true }))) return;
      try { await api.deleteVehicle(v.id); toast("Vehicle removed", "ok"); await load(); } catch (e) { toastError(e); }
      return;
    }
    if (a === "duplicate") {
      if (!(await confirmDialog(`Duplicate ${v.registrationNumber}? A new unique registration is required.`))) return;
      const reg = window.prompt("New registration number");
      if (!reg) return;
      try { await api.saveVehicle({ registrationNumber: reg, coachTemplateId: v.coachTemplateId, modelName: v.modelName, vehicleRole: v.vehicleRole, gpsEnabled: false, status: "inactive" }); toast("Vehicle copied; GPS disabled until configured", "ok"); await load(); } catch (e) { toastError(e); }
      return;
    }
    setModal({ kind: a, v });
  };
  const rows = useMemo(() => {
    if (!V) return [];
    const q = s.query.toLowerCase().trim();
    const r = V.filter((v) => (!q || [v.registrationNumber, v.coach, "", ""].join(" ").toLowerCase().includes(q)) && (s.state === "All states" || state(v) === s.state.toUpperCase())
      && (s.health === "All health" || (s.health === "Good" ? healthStatus(v) === "GOOD" : s.health === "Issues" ? !["GOOD", "UNKNOWN"].includes(healthStatus(v)) : healthStatus(v) === "UNKNOWN"))
      && (s.gps === "All GPS" || gpsStatus(v) === s.gps));
    return r.sort((a, b) => s.sort === "plateDesc" ? b.registrationNumber.localeCompare(a.registrationNumber) : s.sort === "state" ? state(a).localeCompare(state(b)) : s.sort === "health" ? healthStatus(a).localeCompare(healthStatus(b)) : a.registrationNumber.localeCompare(b.registrationNumber));
  }, [V, s]);
  if (error) return <div className="vp-scope"><Tabs active="vehicles" /><div className="vp-empty" role="alert">Unable to load vehicles · {error}</div></div>;
  if (!V) return <div className="vp-scope"><Tabs active="vehicles" /><div className="vp-empty">Loading…</div></div>;
  if (ws) return <div className="vp-scope"><Tabs active="vehicles" /><VehicleDetail id={ws.id} mode={ws.mode} canModify={canModify} onDone={() => { setWs(undefined); void load(); }} /></div>;
  const set = (k: string) => (x: string) => setS({ ...s, [k]: x });
  const layout = (l: string) => { saveLayout("vehicles", l); setS({ ...s, layout: l }); };
  const header = ["REGISTRATION", "STATE", "ODOMETER", "FUEL / ADBLUE", "GPS", "HEALTH", "LOCATION", "ALERTS", "STATUS", "ACTIONS"];
  const hIcons = ["bus", "activity", "gauge", "fuel", "signal", "heart", "pin", "bell", "power", "sort"];
  return (
    <div className="vp-scope">
      <Tabs active="vehicles" />
      <section className="vp-toolbar-card">
        <div className="vp-metrics" data-vp-metrics>
          <Metric n="bus" v={V.length} label="TOTAL" cl="total" /><Metric n="play" v={V.filter((v) => state(v) === "MOVING").length} label="MOVING" cl="moving" />
          <Metric n="pause" v={V.filter((v) => state(v) === "IDLING").length} label="IDLING" cl="idling" /><Metric n="stop" v={V.filter((v) => state(v) === "STOPPED").length} label="STOPPED" cl="stopped" />
          <Metric n="wifiOff" v={V.filter((v) => gpsStatus(v) === "Offline").length} label="GPS OFFLINE" cl="offline" /><Metric n="alert" v={V.filter((v) => healthStatus(v) === "CRITICAL").length} label="CRITICAL" cl="critical" />
          <Metric n="ban" v={V.filter((v) => v.health?.def_inhibit).length} label="DEF INHIBIT" cl="def" />
        </div>
        <div className="vp-controls">
          <label className="vp-search"><I n="search" /><input data-filter="query" placeholder="Search plate or coach…" aria-label="Search plate or coach" value={s.query} onChange={(e) => set("query")(e.target.value)} /></label>
          <Sel icon="activity" value={s.state} onChange={set("state")} data={{ "data-filter": "state" }} options={["All states", "Moving", "Idling", "Stopped", "Unknown"].map((x) => [x, x])} />
          <Sel icon="heart" value={s.health} onChange={set("health")} data={{ "data-filter": "health" }} options={["All health", "Good", "Issues", "Unknown"].map((x) => [x, x])} />
          <Sel icon="signal" value={s.gps} onChange={set("gps")} data={{ "data-filter": "gps" }} options={["All GPS", "Connected", "Offline"].map((x) => [x, x])} />
          <Sel icon="sort" sort value={s.sort} onChange={set("sort")} data={{ "data-filter": "sort" }} options={[["plate", "Sort: Name (A–Z)"], ["plateDesc", "Sort: Name (Z–A)"], ["state", "Sort: State"], ["health", "Sort: Health"]]} />
          <span className="vp-showing" data-showing>Showing {rows.length} of {V.length}</span>
          <div className="vp-view-switch"><IconBtn n="list" kind="plain" data-layout="list" aria-pressed={s.layout === "list"} label="List view" onClick={() => layout("list")} /><IconBtn n="grid" kind="plain" data-layout="grid" aria-pressed={s.layout === "grid"} label="Grid view" onClick={() => layout("grid")} /></div>
        </div>
        <div className="vp-toolbar-actions">
          <button type="button" className="vp-btn outline" data-action="fleet-map" onClick={() => setModal({ kind: "fleet-map", v: null })}><I n="map" /> Fleet Map</button>
          {canModify && <button type="button" className="vp-btn primary" data-action="add-vehicle" onClick={() => setModal({ kind: "form", v: null })}><I n="plus" /> Add Vehicle</button>}
        </div>
      </section>
      <div data-result>
        {!rows.length ? <div className="vp-empty">No vehicles match the current filters. Clear a filter to see more.</div>
          : s.layout === "grid"
            ? <div className="vp-card-grid vp37-cards vp37-vehicles-grid">{rows.map((v) => {
              const p = vehicleParts(v, canModify, act, toggle);
              return (
                <article key={v.id} className="vp37-card vp37-vehicle-card" data-vp37-vehicle={v.id}>
                  <header className="vp37-card-heading"><span className="vp37-card-bus"><I n="bus" s={22} /></span><div className="vp37-card-title vp37-vehicle-title" title={v.registrationNumber}>{p[0]}</div><div className="vp37-card-switch">{p[8]}</div></header>
                  <div className="vp37-vehicle-summary">
                    {([["STATE", 1], ["GPS", 4], ["ODOMETER", 2], ["FUEL / ADBLUE", 3], ["HEALTH", 5], ["ALERTS", 7]] as const).map(([t, i]) => <div key={t} className="vp37-vehicle-section"><small>{t}</small>{p[i]}</div>)}
                    <div className="vp37-vehicle-section vp37-vehicle-location"><small>LOCATION</small>{p[6]}</div>
                  </div>
                  <footer className="vp37-card-footer">{p[9]}</footer>
                </article>
              );
            })}</div>
            : <div className="vp-table-scroll"><table className="vp-table vp-vehicle-table"><thead><tr>{header.map((c, i) => <th key={c}><I n={hIcons[i]} s={18} /> {c}</th>)}</tr></thead>
              <tbody>{rows.map((v) => <tr key={v.id}>{vehicleParts(v, canModify, act, toggle).map((x, i) => <td key={i}>{x}</td>)}</tr>)}</tbody></table></div>}
      </div>
      <p className="vp-datasource">Vehicle position, health and fuel values depend on your connected data feed. The development GDS currently uses simulated positions; this view does not verify physical GPS devices or ECU measurements.</p>
      {modal?.kind === "form" || modal?.kind === "edit" ? <VehicleForm v={modal.v} coaches={C} onClose={() => setModal(undefined)} onSaved={() => void load()} />
        : modal?.kind === "fleet-map" ? <FleetMapModal V={V} onClose={() => setModal(undefined)} onPin={(v) => setModal({ kind: "location", v })} />
        : modal?.v ? <InfoModal kind={modal.kind} v={modal.v} onClose={() => setModal(undefined)} /> : null}
    </div>
  );
}

// ------------------------------------------------------------------ Coaches
const isAc = (c: CoachListRow) => (/non\s*a\/c/i.test(c.name) ? false : /a\/c/i.test(c.name));
const amenKey = (a: string) => String(a).toLowerCase().replace(/[^a-z0-9]/g, "");
const hasVideo = (c: CoachListRow) => c.amenities.some((a) => ["video", "Video/Entertainment"].some((x) => amenKey(a) === amenKey(x)));

export function CoachesPage({ me }: { me: Me }) {
  const canModify = OPS.includes(me.role);
  const [C, setC] = useState<CoachListRow[]>(); const [error, setError] = useState<string>();
  const [s, setS] = useState({ query: "", ac: "all", berths: "all", sort: "asc", layout: readLayout("coaches") });
  const [menu, setMenu] = useState(false);
  const [cm, setCm] = useState<{ c: CoachDraft; editing: boolean }>();
  const coachAct = async (a: string, c: CoachListRow) => {
    try {
      if (a === "view" || a === "edit") { setCm({ c: await api.coach(c.id), editing: a === "edit" }); return; }
      if (a === "duplicate") {
        const v = await promptDialog("Duplicate Coach", [{ name: "name", label: "New coach name", value: `${c.name} Copy`, required: true }]);
        if (!v) return;
        const src = await api.coach(c.id);
        await api.saveCoach({ name: v.name, busType: src.busType, pattern: src.pattern, isAc: src.isAc, amenities: src.amenities, seats: src.seats });
        toast("Coach duplicated", "ok"); await load(); return;
      }
      if (a === "delete") {
        if (!(await confirmDialog("Delete this coach? A coach assigned to a route or vehicle cannot be removed.", { danger: true }))) return;
        await api.deleteCoach(c.id); toast("Coach removed", "ok"); await load();
      }
    } catch (e) { toastError(e); }
  };
  const load = useCallback(async () => { try { setC((await api.coachList()).coaches); setError(undefined); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!menu) return;
    const out = (e: MouseEvent) => { if (!(e.target as Element).closest?.("[data-berth-wrap]")) setMenu(false); };
    document.addEventListener("click", out, true); return () => document.removeEventListener("click", out, true);
  }, [menu]);
  if (error) return <div className="vp-scope"><Tabs active="coaches" /><div className="vp-empty" role="alert">Unable to load coaches · {error}</div></div>;
  if (!C) return <div className="vp-scope"><Tabs active="coaches" /><div className="vp-empty">Loading…</div></div>;
  const q = s.query.toLowerCase().trim();
  const possible = C.filter((c) => (!q || `${c.name} ${c.busType} ${c.pattern}`.toLowerCase().includes(q)) && (s.ac === "all" || (s.ac === "ac" ? isAc(c) : !isAc(c))));
  const facet: Record<string, number> = { all: possible.length, seater: possible.filter((c) => c.seater > 0).length, sleeper: possible.filter((c) => c.sleeper > 0).length };
  const rows = possible.filter((c) => s.berths === "all" || (s.berths === "seater" ? c.seater > 0 : c.sleeper > 0))
    .sort((a, b) => s.sort === "seats" ? b.capacity - a.capacity : s.sort === "desc" ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name));
  const labels: Record<string, string> = { all: "All berths", seater: "Seater", sleeper: "Sleeper" };
  const set = (k: string) => (x: string) => setS({ ...s, [k]: x });
  const layout = (l: string) => { saveLayout("coaches", l); setS({ ...s, layout: l }); };
  const toggle = async (c: CoachListRow, on: boolean) => { try { await api.setCoachStatus(c.id, on ? "active" : "inactive"); await load(); toast("Coach status saved", "ok"); } catch (e) { toastError(e); } };
  const cells = (c: CoachListRow): ReactNode[] => {
    const pickup = /pickup/i.test(c.busType);
    return [
      <b>{c.name || "Unnamed coach"}</b>,
      <span className={`vp-coach-type ${pickup ? "pickup" : ""}`}>{pickup ? "Pickup Van" : "Regular"}</span>,
      <span className="vp-layout-pill">{c.pattern || "—"}</span>,
      <>{[c.seater ? `${c.seater} Seater` : "", c.sleeper ? `${c.sleeper} Sleeper` : ""].filter(Boolean).flatMap((x, i) => (i ? [<br key={i} />, x] : [x]))}{!c.seater && !c.sleeper ? "No seat layout" : null}</>,
      isAc(c) ? <span className="vp-ac-chip"><I n="snowflake" s={14} /> AC</span> : <span className="vp-muted">—</span>,
      <label className="vp-onoff"><input type="checkbox" data-coach-status={c.id} checked={c.status !== "inactive"} disabled={!canModify} onChange={(e) => void toggle(c, e.target.checked)} /><span className="vp-thumb"></span><b>{c.status !== "inactive" ? "Active" : "Inactive"}</b></label>,
      <div className="vp-actions">
        {([["eye", "blue", "view", "View coach", true], ["pencil", "purple", "edit", "Edit coach", canModify], ["copy", "mint", "duplicate", "Duplicate coach", canModify], ["trash", "red", "delete", "Delete coach", canModify]] as const)
          .filter((x) => x[4]).map(([n, k, a, l]) => <IconBtn key={a} n={n} kind={k} data-action={a} data-id={String(c.id)} label={l} onClick={() => void coachAct(a, c)} />)}
      </div>,
    ];
  };
  const cols = ["NAME", "TYPE", "LAYOUT", "SEATS", "FEATURES", "STATUS", "ACTIONS"], colIcons = ["bus", "layers", "grid", "armchair", "zap", "power", "sort"];
  return (
    <div className="vp-scope">
      <Tabs active="coaches" />
      <section className="vp-toolbar-card vp-coaches-tools">
        <div className="vp-metrics vp-coach-metrics">
          <Metric n="bus" v={C.length} label="COACHES" cl="total" /><Metric n="snowflake" v={C.filter(isAc).length} label="AC" cl="ice" />
          <Metric n="bed" v={C.filter((c) => c.sleeper > 0).length} label="SLEEPER" cl="purple" /><Metric n="armchair" v={C.filter((c) => c.seater > 0).length} label="SEATER" cl="amber" />
          <Metric n="video" v={C.filter(hasVideo).length} label="VIDEO" cl="def" />
        </div>
        <div className="vp-controls vp-coach-controls">
          <label className="vp-search"><I n="search" /><input placeholder="Search name or type…" data-coach="query" aria-label="Search coaches" value={s.query} onChange={(e) => set("query")(e.target.value)} /></label>
          <Sel icon="snowflake" value={s.ac} onChange={set("ac")} data={{ "data-coach": "ac" }} options={[["all", "All"], ["ac", "A/C"], ["non", "Non A/C"]]} />
          <div className="vp-berth-filter" data-berth-wrap>
            <button type="button" className="vp-berth-toggle" data-coach-berth-toggle aria-haspopup="listbox" aria-expanded={menu} aria-controls="vp-berth-options" onClick={() => setMenu(!menu)}>
              <span className="vp-berth-icon"><I n="bed" s={21} /></span>{" "}<span data-coach-berth-label>{labels[s.berths]}</span><span className="vp-berth-caret"><I n="down" s={16} /></span></button>
            <div className="vp-berth-menu" id="vp-berth-options" role="listbox" aria-label="Filter coach berths" data-coach-berth-menu hidden={!menu}>
              {(["all", "seater", "sleeper"] as const).map((k) => (
                <button key={k} type="button" role="option" tabIndex={-1} className="vp-berth-option" aria-selected={s.berths === k} data-coach-berth={k} onClick={() => { setS({ ...s, berths: k }); setMenu(false); }}>
                  <span className="vp-berth-optico"><I n={k === "seater" ? "armchair" : "bed"} /></span>{" "}<span>{labels[k]}</span><span className="vp-berth-number" data-coach-berth-count={k}>{facet[k]}</span>{" "}<span className="vp-berth-checked"><I n="check" s={20} /></span></button>
              ))}
            </div>
          </div>
          <Sel icon="sort" sort value={s.sort} onChange={set("sort")} data={{ "data-coach": "sort" }} options={[["asc", "Sort: Name (A–Z)"], ["desc", "Sort: Name (Z–A)"], ["seats", "Sort: Most seats"]]} />
          <span className="vp-showing" data-showing>Showing {rows.length} of {C.length}</span>
          <div className="vp-view-switch"><IconBtn n="list" kind="plain" data-layout="list" aria-pressed={s.layout === "list"} label="List view" onClick={() => layout("list")} /><IconBtn n="grid" kind="plain" data-layout="grid" aria-pressed={s.layout === "grid"} label="Grid view" onClick={() => layout("grid")} /></div>
        </div>
        <div className="vp-toolbar-actions">{canModify && <button type="button" className="vp-btn primary" data-action="add-coach" onClick={() => setCm({ c: blankCoach(), editing: true })}><I n="plus" /> Add Coach</button>}</div>
      </section>
      <div data-result>
        {!rows.length ? <div className="vp-empty">No coaches match your filters.</div>
          : s.layout === "grid"
            ? <div className="vp-card-grid vp37-cards vp37-coaches-grid">{rows.map((c) => {
              const p = cells(c), pickup = /pickup/i.test(c.busType);
              return (
                <article key={c.id} className="vp37-card vp37-coach-card" data-vp37-coach={c.id}>
                  <header className="vp37-card-heading"><span className="vp37-card-bus"><I n="bus" s={22} /></span><div className="vp37-card-title"><strong title={c.name || "Unnamed coach"}>{c.name || "Unnamed coach"}</strong></div><div className="vp37-card-switch">{p[5]}</div></header>
                  <p className="vp37-card-subtitle"><span className={pickup ? "vp37-pickup" : ""}>{pickup ? "Pickup Van" : "Regular"}</span> · {c.pattern || "—"}</p>
                  <div className="vp37-coach-summary">
                    <div><small>SEATS</small><div className="vp37-seats">{c.seater || c.sleeper ? <>{c.seater ? <div>{c.seater} Seater</div> : null}{c.sleeper ? <div>{c.sleeper} Sleeper</div> : null}</> : <div>No seat layout</div>}</div></div>
                    <div><small>FEATURES</small><div className="vp37-features">{p[4]}{hasVideo(c) ? <span className="vp37-video"><I n="video" s={14} /> Video</span> : null}</div></div>
                  </div>
                  <footer className="vp37-card-footer">{p[6]}</footer>
                </article>
              );
            })}</div>
            : <div className="vp-table-scroll"><table className="vp-table vp-coach-table"><thead><tr>{cols.map((c, i) => <th key={c}><I n={colIcons[i]} s={18} /> {c}</th>)}</tr></thead>
              <tbody>{rows.map((c) => <tr key={c.id}>{cells(c).map((x, i) => <td key={i}>{x}</td>)}</tr>)}</tbody></table></div>}
      </div>
      {cm && <CoachModal coach={cm.c} editing={cm.editing} onClose={() => setCm(undefined)} onSaved={() => void load()} />}
    </div>
  );
}
