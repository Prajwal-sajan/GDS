import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PnlTab, type LeaveGuard } from "./SchedulePnlTab";
import { FaresTab } from "./ScheduleFaresTab";
import { UpdateTab } from "./ScheduleUpdateTab";
import { BlockTab } from "./ScheduleBlockTab";
import { api, type Me, type ScheduleDetail, type ScheduleEditRow, type ScheduleRow, type ScheduleStage, type ScheduleUiSettings, type StageOverrideInput } from "../../api";
import { confirmDialog, infoDialog, Modal, promptDialog, toast, toastError } from "../../components/ui/feedback";
import { can } from "../../auth/permissions";
import { inr, shortDate, t12 } from "../../services/format";

// React port of the legacy schedule management overlay (public/js/schedules-screenshot-v6.js: openModal(), tabs, bt(),
// previewNote()). Same DOM/classes so the vendored legacy CSS renders it identically. Data comes from
// GET /api/admin/schedule-detail/{id}. Per-trip stop edits (PUT stage-overrides), Apply delay (POST trips/{id}/delay),
// Edit history (GET schedules/{id}/history) and Save changes follow the legacy sxEditStops/sxApplyDelay/sxSave flows.
const P = {
  bus: "M4 17V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11M4 13h16M4 17h16M7 17v3m10-3v3M7 9h2m6 0h2",
  map: "M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15",
  users: "M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m13-15a4 4 0 0 1 0 8m7 7v-2a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  pin: "M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Zm-8 2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.5 3a2 2 0 0 1-.6 1.7L7.3 10a16 16 0 0 0 6.7 6.7l1.6-1.7a2 2 0 0 1 1.7-.6l3 .5a2 2 0 0 1 1.7 2Z",
  x: "M18 6 6 18M6 6l12 12", check: "M20 6 9 17l-5-5", plus: "M12 5v14M5 12h14", trash: "M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v6m4-6v6",
  edit: "M12 20h9M16 3a2 2 0 0 1 3 3L7 18l-4 1 1-4L16 3Z", shield: "M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z",
  history: "M3 12a9 9 0 1 0 3-6.7M3 3v5h5m4-1v5l3 2", clock: "M12 6v6l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  save: "M5 3h12l4 4v14H3V3h2Zm2 0v6h10V3M7 21v-9h10v9",
  arrowUp: "M12 19V5m-6 6 6-6 6 6", arrowDown: "M12 5v14m-6-6 6 6 6-6",
  link: "M10 13a5 5 0 0 0 7 .3l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7-.3l-3 3a5 5 0 0 0 7 7l1.5-1.5",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm9-3-2.2-1 .2-2.4-2.4-2.4-2.4.2L12 4l-2.2 2.4-2.4-.2L5 8.6l.2 2.4L3 12l2.2 1-.2 2.4L7.4 18l2.4-.2L12 20l2.2-2.2 2.4.2 2.4-2.4-.2-2.4Z",
  rupee: "M7 5h11M7 9h11m-9-4a5 5 0 0 1 0 10l7 5", chart: "M3 3v18h18M8 17v-5m5 5V7m5 10v-8",
} as const;
type IconName = keyof typeof P;
function I({ name, size = 16 }: { name: IconName; size?: number }) {
  return <svg className="sx-svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[name]} /></svg>;
}

/** legacy bt(): <button type=button class="sx-btn {cls}">svg<span>label</span></button> */
function Bt({ icon, label, cls = "", onClick, disabled, attrs }: { icon: IconName; label: string; cls?: string; onClick?: () => void; disabled?: boolean; attrs?: Record<string, string> }) {
  return (
    <button type="button" className={`sx-btn ${cls}`} disabled={disabled} {...attrs} onClick={() => onClick?.()}>
      <I name={icon} /><span>{label}</span>
    </button>
  );
}
function PreviewNote({ children = "Interface preview only — no live provider or OTA changes are submitted." }: { children?: ReactNode }) {
  return <div className="sx-preview-note"><I name="shield" size={15} /> {children}</div>;
}

const TABS: [string, IconName, string][] = [
  ["bookings", "users", "Bookings"], ["block", "shield", "Block"], ["update", "settings", "Update"], ["cities", "pin", "Cities"],
  ["pickups", "arrowUp", "Pickups"], ["drops", "arrowDown", "Drops"], ["fares", "rupee", "Fares"], ["pnl", "chart", "P&L"], ["history", "history", "History"],
];
/** legacy fdt: 23 Nov, 07:36 pm */
const fdt = (s: string) => new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export function ScheduleOverlay({ row, tab: initialTab, onClose: close, me }: { row: ScheduleRow; tab: string; onClose: () => void; me?: Me }) {
  const [tab, setTabRaw] = useState(TABS.some(([k]) => k === initialTab) ? initialTab : "bookings");
  const modal = useRef<HTMLDivElement>(null);
  const [min, setMin] = useState(false);
  const guard: LeaveGuard = useRef(null);
  const [pnlFoot, setPnlFoot] = useState<HTMLElement | null>(null);
  // legacy handleOverlayClick: leaving a tab with unsaved edits (tab switch or close) confirms first
  const leave = async () => !guard.current || (await guard.current());
  const setTab = (k: string) => { void leave().then((ok) => ok && setTabRaw(k)); };
  const onClose = () => { void leave().then((ok) => ok && close()); };
  const [detail, setDetail] = useState<ScheduleDetail>();
  const [error, setError] = useState<string>();
  const reload = () => api.scheduleDetail(row.id).then(setDetail).catch(toastError);
  const citySave = useRef<() => Promise<void>>();
  /** legacy sxSave: fares → saveFare; cities → PUT ui_settings; other tabs have nothing pending on the server. */
  const saveChanges = async () => {
    if (tab === "fares") {
      const b = modal.current?.querySelector<HTMLButtonElement>("[data-sx-save-fares]");
      if (b && !b.disabled) b.click(); else toast("No fare changes to save");
    } else if (tab === "cities" && citySave.current) {
      try { await citySave.current(); toast("Schedule city settings saved", "ok"); } catch (e) { toastError(e); }
    } else toast("This tab has no unsaved server changes");
  };

  useEffect(() => {
    let live = true;
    api.scheduleDetail(row.id).then((d) => live && setDetail(d)).catch((e) => { if (live) { setError(String(e?.message ?? e)); toastError(e); } });
    return () => { live = false; };
  }, [row.id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key); window.addEventListener("hashchange", onClose);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("hashchange", onClose); };
  }, [onClose]);

  let body: ReactNode;
  if (tab === "update") body = <UpdateTab row={row} />;
  else if (error) body = <div className="sx-empty">{error}</div>;
  else if (!detail) body = <div className="sx-loading">Loading schedule…</div>;
  else if (tab === "history") body = <HistoryTab d={detail} />;
  else if (tab === "block") body = <BlockTab row={row} detail={detail} />;
  else if (tab === "bookings") body = <BlockTab key="bookings" row={row} detail={detail} mode="bookings" me={me} />;
  else if (tab === "pickups" || tab === "drops") body = <StopsTab key={tab} d={detail} kind={tab === "pickups" ? "pickup" : "drop"} reload={reload} />;
  else if (tab === "cities") body = <CitiesTab d={detail} reload={reload} saveRef={citySave} />;
  else if (tab === "pnl") body = <PnlTab sid={row.id} footer={pnlFoot} guard={guard} onClose={onClose} />;
  else body = <FaresTab sid={row.id} />;

  return (
    <div className={`sx-backdrop sx38-workspace${tab === "bookings" ? " sx48-workspace" : ""}${min ? " sx-minimized" : ""}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sx-modal${tab === "pnl" ? " sxp-active" : ""}`} role="dialog" aria-modal="true" aria-label="Schedule management" ref={modal}>
        <header data-sx-modal-head="">
          {tab === "pnl" ? <>
            <div className="sx-head-identity"><div><h2>Schedule <small>{row.serviceNumber} - {row.serviceName || `${row.origin} ${row.destination}`}</small></h2></div></div>
            <div className="sx-head-actions"><button type="button" data-sx-minimize="" title="Minimize" onClick={() => setMin((m) => !m)}>−</button><button type="button" data-sx-close="" title="Close schedule" onClick={onClose}><I name="x" size={26} /></button></div>
          </> : <>
          <div className="sx-head-identity">
            <span className="sx-head-logo"><I name="bus" size={23} /></span>
            <div><h2>{row.serviceNumber} <small>{row.serviceName}</small></h2><p>{row.origin} → {row.destination} <span>• {shortDate(row.travelDate)}</span></p></div>
          </div>
          <div className="sx-head-actions"><button className="sx-close-round" data-sx-close="" title="Close schedule" onClick={onClose}><I name="x" /></button></div>
          </>}
        </header>
        <nav data-sx-modal-tabs="">
          {TABS.map(([k, icon, label]) => (
            <button key={k} data-sx-tab={k} className={k === tab ? "on" : ""} onClick={() => setTab(k)}><I name={icon} size={14} /> {label}</button>
          ))}
        </nav>
        <main data-sx-modal-body="">{body}</main>
        {tab === "pnl" ? <footer key="pnl" className="sx-modal-footer" ref={setPnlFoot} /> : <footer key="std" className="sx-modal-footer">
          <span data-sx-footer-info="" className="sx-muted">{tab === "update" ? "" : tab === "fares" ? "Fare and seat-rule changes apply to this trip only" : "Stop, delay and city changes apply to this trip only"}</span>
          <div>
            {tab === "bookings" || tab === "update"
              ? <Bt icon="x" label="Close" cls="primary" attrs={{ "data-sx-close": "" }} onClick={onClose} />
              : <><Bt icon="x" label="Close" attrs={{ "data-sx-close": "" }} onClick={onClose} /><Bt icon="check" label="Save changes" cls="primary" attrs={{ "data-sx-save": "" }} onClick={() => void saveChanges()} /></>}
          </div>
        </footer>}
      </div>
    </div>
  );
}

function HistoryTab({ d }: { d: ScheduleDetail }) {
  const [q, setQ] = useState("");
  const route = `${d.origin} → ${d.destination}`;
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? d.history.filter((h) => [h.pnr, h.seats.join(" "), route, h.contactName].join(" ").toLowerCase().includes(n)) : d.history;
  }, [d.history, q, route]);
  const count = (s: string) => d.history.filter((h) => h.status === s).length;
  return (
    <section className="sx-history-ui">
      <header>
        <h3><I name="history" /> Schedule history</h3>
        <input data-sx-historysearch="" placeholder="Search PNR, seat, city or name" value={q} onChange={(e) => setQ(e.target.value)} />
        <Bt icon="history" label="Edit history" attrs={{ "data-sx-edithistory": "" }} onClick={() => void showEditHistory(d.id)} />
      </header>
      <div className="sx-timeline-badges"><span>All {d.history.length}</span><span>Bookings {count("confirmed")}</span><span>Holds 0</span><span>Cancelled {count("cancelled")}</span></div>
      <div className="sx-table-outer"><table className="sx-table">
        <thead><tr>{["PNR", "ROUTE", "SEATS", "FARE", "BOOKED BY", "SOURCE", "BOOKED ON", "STATUS"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.pnr}>
              <td><button data-sx-pnr={h.pnr} className="sx-link" onClick={() => { location.hash = `#/bookings?q=${encodeURIComponent(h.pnr)}`; }}>{h.pnr}</button></td>
              <td>{route}</td><td>{h.seats.join(", ")}</td><td>{inr(h.totalAmount)}</td><td>{h.contactName}</td><td>{h.source}</td><td>{fdt(h.bookedAt)}</td><td>{h.status}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={8} className="sx-empty">No bookings yet</td></tr>}
        </tbody>
      </table></div>
    </section>
  );
}

function StopsTab({ d, kind, reload }: { d: ScheduleDetail; kind: "pickup" | "drop"; reload: () => Promise<void> }) {
  const stages = useMemo(() => d.stages.filter((s) => s.kind === kind).sort((a, b) => a.day - b.day || a.time.localeCompare(b.time)), [d.stages, kind]);
  const cities = useMemo(() => [...new Set(stages.map((s) => s.city))], [stages]);
  const [city, setCity] = useState(cities[0]);
  const [editing, setEditing] = useState<ScheduleStage[]>();
  const shown = stages.filter((s) => s.city === city);
  const open = (list: ScheduleStage[]) => (can("schedules.modify") || can("schedules.stops")) ? setEditing(list) : toast("No permission to edit stops", "bad");
  return (
    <div className="sx-stops-ui">
      <div className="sx-stop-header">
        <div><small><I name="link" size={11} /> Data Source: Route{d.stageOverrides?.length ? ` · ${d.stageOverrides.length} trip edit(s)` : ""}</small><h3>{kind === "pickup" ? "Pickup Points" : "Drop-off Points"}</h3></div>
        <Bt icon="edit" label="Edit" cls="outline" attrs={{ "data-sx-editstops": "" }} disabled={!shown.length} onClick={() => open(shown)} />
      </div>
      <div className="sx-stop-cities">
        {cities.map((c) => <button key={c} data-sx-stopcity={c} className={c === city ? "on" : ""} onClick={() => setCity(c)}>{c} <small>{stages.filter((s) => s.city === c).length}</small></button>)}
      </div>
      <div className="sx-stop-cards">
        {shown.map((s, i) => <StopCard key={s.id} s={s} n={i + 1} onEdit={() => open([s])} />)}
        {!shown.length && <div className="sx-empty">No {kind} stops for this city.</div>}
      </div>
      <PreviewNote>Edits apply to this trip only; the route pickup/drop template is unchanged.</PreviewNote>
      {editing && <StopEditor sid={d.id} stages={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); void reload(); }} />}
    </div>
  );
}

type StopForm = { name: string; time: string; day: string; landmark: string; contact_number: string; lat: string; lng: string; reset: boolean };
const formOf = (s: ScheduleStage): StopForm => ({ name: s.name, time: s.time.slice(0, 5), day: String(s.day || 1), landmark: s.landmark ?? "", contact_number: s.contactNumber ?? "", lat: s.lat == null ? "" : String(s.lat), lng: s.lng == null ? "" : String(s.lng), reset: false });
const FIELDS: [Exclude<keyof StopForm, "reset">, string, string][] = [["name", "Name", "text"], ["time", "Time", "time"], ["day", "Day", "number"], ["landmark", "Landmark", "text"], ["contact_number", "Contact number", "tel"], ["lat", "Latitude", "text"], ["lng", "Longitude", "text"]];

/** legacy sxEditStops popup "Edit pickup/drop points": per-stop name/time/day/landmark/contact/lat/lng → PUT stage_overrides. */
function StopEditor({ sid, stages, onClose, onSaved }: { sid: number; stages: ScheduleStage[]; onClose: () => void; onSaved: () => void }) {
  const [forms, setForms] = useState<Record<number, StopForm>>(() => Object.fromEntries(stages.map((s) => [s.id, formOf(s)])));
  const [busy, setBusy] = useState(false);
  const set = (id: number, k: keyof StopForm, v: string | boolean) => setForms((f) => ({ ...f, [id]: { ...f[id], [k]: v } }));
  const save = async () => {
    const overrides: Record<string, StageOverrideInput> = {}; const reset: number[] = [];
    for (const s of stages) {
      const f = forms[s.id], o = formOf(s);
      if (f.reset) { reset.push(s.id); continue; }
      const diff: Record<string, string> = {};
      for (const [k] of FIELDS) if (f[k] !== o[k]) diff[k] = f[k].trim();
      if (Object.keys(diff).length) overrides[s.id] = diff;
    }
    if (!Object.keys(overrides).length && !reset.length) return toast("No stop changes to save");
    setBusy(true);
    try { await api.saveStageOverrides(sid, overrides, reset); toast("Stop changes saved for this trip", "ok"); onSaved(); }
    catch (e) { toastError(e); } finally { setBusy(false); }
  };
  return (
    <Modal title={stages[0]?.kind === "drop" ? "Edit drop points" : "Edit pickup points"} size="lg" portal onClose={onClose}
      foot={<><button className="btn" type="button" onClick={onClose}>Cancel</button><button className="btn p" type="button" data-sx-savestops="" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save stops"}</button></>}>
      <p className="muted">Edits apply to this trip only; the route pickup/drop template is unchanged.</p>
      {stages.map((s) => {
        const f = forms[s.id];
        return (
          <div key={s.id} data-sx-stopform={s.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, marginBottom: 10 }}>
            <b>{s.name}</b>{s.overridden && <span className="pill" style={{ marginLeft: 6 }}>Trip edit</span>}
            <div className="grid g2">
              {FIELDS.map(([k, label, type]) => <label key={k} className="f">{label}<input name={k} type={type} disabled={f.reset} value={f[k]} onChange={(e) => set(s.id, k, e.target.value)} /></label>)}
              <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
                <button type="button" className="btn sm" data-sx-movepin={s.id} onClick={() => toast("Map pin moves need a configured map provider — enter latitude/longitude instead", "warn")}>Move pin</button>
                <button type="button" className="btn sm" data-sx-settime={s.id} disabled={f.reset} onClick={() => set(s.id, "time", new Date().toTimeString().slice(0, 5))}>Set time</button>
              </div>
              {s.overridden && <label className="chk" style={{ gridColumn: "1/-1" }}><input type="checkbox" data-sx-resetstop={s.id} checked={f.reset} onChange={(e) => set(s.id, "reset", e.target.checked)} /> Reset to route template</label>}
            </div>
          </div>
        );
      })}
    </Modal>
  );
}

/** legacy sxEditHistory: GET /schedules/:id/history → table [When, Section, By, Changes]. */
async function showEditHistory(id: number) {
  try {
    const { history } = await api.scheduleEditHistory(id);
    await infoDialog("Edit history", history.length ? (
      <div className="sx-table-outer" data-sx-edithistory-table=""><table className="sx-table">
        <thead><tr><th>When</th><th>Section</th><th>By</th><th>Changes</th></tr></thead>
        <tbody>{history.map((h: ScheduleEditRow, i) => <tr key={i}><td>{fdt(h.at)}</td><td>{h.section}</td><td>{h.name || h.by}</td><td><code style={{ whiteSpace: "pre-wrap", fontSize: 11 }}>{JSON.stringify(h.changes)}</code></td></tr>)}</tbody>
      </table></div>
    ) : <p className="muted">No edits recorded for this schedule yet.</p>, "lg");
  } catch (e) { toastError(e); }
}

function StopCard({ s, n, onEdit }: { s: ScheduleStage; n: number; onEdit: () => void }) {
  const metro = s.pickupType?.toLowerCase() === "metro" || /metro/i.test(s.name);
  return (
    <article className="sx-stop-card">
      <span className="sx-stop-time">{t12(s.time)} {s.day > 1 && <small>DAY {s.day}</small>}</span>
      <div className="sx-stop-content">
        <div className="sx-stop-name"><span className="sx-circle">{n}</span><b>{s.name}</b></div>
        {metro && <span className="sx-metro"><I name="bus" size={13} /> Free metro Pickup</span>}
        <p>{s.landmark || s.address || ""}</p>
        <span className="sx-stop-type"><I name="pin" size={14} />{` ${s.pickupType || "Bus Stop"}`}</span>
        {s.contactNumber && <a href={`tel:${s.contactNumber}`} className="sx-stop-phone"><I name="phone" size={13} />{` ${s.contactNumber}`}</a>}
        {s.lat != null && s.lng != null && <a href={`https://www.google.com/maps?q=${s.lat},${s.lng}`} target="_blank" rel="noopener" className="sx-stop-coords"><I name="pin" size={13} />{` ${s.lat}, ${s.lng}`}</a>}
        <div className="sx-stop-count"><span>{s.passengers} passengers{s.overridden ? " · trip edit" : ""}</span><Bt icon="edit" label="Edit" cls="mini" attrs={{ "data-sx-editstop": String(s.id) }} onClick={onEdit} /></div>
      </div>
    </article>
  );
}

function CitiesTab({ d, reload, saveRef }: { d: ScheduleDetail; reload: () => Promise<void>; saveRef: React.MutableRefObject<(() => Promise<void>) | undefined> }) {
  const [dir, setDir] = useState<"Delay" | "Advance">("Delay");
  const [hr, setHr] = useState("0"), [mn, setMn] = useState("00");
  const [busy, setBusy] = useState(false);
  /** legacy sxApplyDelay: h 0–12 + m 0–59 (1–720 min) → reason prompt → confirm → POST /trips/:id/delay. */
  const applyDelay = async () => {
    if (!(can("trips.update_passengers") || can("schedules.modify"))) return toast("No permission to adjust trip time", "bad");
    const h = Number(hr), m = Number(mn);
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 12 || m < 0 || m > 59) return toast("Enter hours 0–12 and minutes 0–59", "bad");
    const total = h * 60 + m;
    if (total < 1 || total > 720) return toast("Timing change must be between 1 and 720 minutes", "bad");
    const v = await promptDialog(`${dir} reason`, [{ name: "reason", label: "Reason", required: true, full: true }], { ok: "Continue" });
    const reason = String(v?.reason ?? "").trim();
    if (!reason) return;
    if (!(await confirmDialog(`${dir} ${d.serviceNumber} by ${total} min? Only unreached stops will move.`, { ok: `Apply ${dir.toLowerCase()}` }))) return;
    setBusy(true);
    try {
      const r = await api.admin<{ adjusted_stops: number }>(`/trips/${d.id}/delay`, "POST", { minutes: dir === "Advance" ? -total : total, reason, notify: false });
      toast(`Trip ${dir === "Advance" ? "advanced" : "delayed"} by ${total} min; ${r.adjusted_stops ?? 0} unreached stops adjusted`, "ok");
      await reload();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  const cities = d.stops;
  const first = cities[0], last = cities[cities.length - 1];
  const pairs = cities.flatMap((a, i) => cities.slice(i + 1).map((b) => [a, b] as const));
  const [ui, setUi] = useState<ScheduleUiSettings>(() => d.uiSettings ?? {});
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const save = (next: ScheduleUiSettings) => {
    setUi(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { api.saveScheduleUiSettings(d.id, next).catch(toastError); }, 400);
  };
  saveRef.current = async () => { clearTimeout(timer.current); await api.saveScheduleUiSettings(d.id, { via_city_enabled: ui.via_city_enabled ?? {}, rates: ui.rates ?? {} }); };
  const via = (id: number, k: "origin" | "destination") => ui.via_city_enabled?.[id]?.[k] ?? true;
  const toggleVia = (id: number, k: "origin" | "destination") => {
    const cur = { origin: via(id, "origin"), destination: via(id, "destination") };
    save({ ...ui, via_city_enabled: { ...(ui.via_city_enabled ?? {}), [id]: { ...cur, [k]: !cur[k] } } });
  };
  const rate = (i: number) => ui.rates?.[i] ?? (i === 0 ? 100 : 99);
  const setRate = (i: number, v: string) => {
    const n = Math.max(0, Math.min(100, Number(v) || 0));
    save({ ...ui, rates: { ...(ui.rates ?? {}), [i]: n } });
  };
  const addSubroute = () => infoDialog("Add sub-route", <div><p>Create an additional city-pair service segment in the Routes editor, then return to the schedule.</p><a className="btn primary" href={`#/gds/routes/${d.routeId}?rvtab=cities`}>Open route editor</a></div>);
  return (
    <div className="sx-cities-editor sx48-cities">
      <div className="sx-source-chip"><I name="link" /> Data Source: Route</div>
      <div className="sx-time-shift sx48-adjust">
        <b>Adjust Trip Time</b>
        <div className="sx-segment">{(["Delay", "Advance"] as const).map((k) => <button key={k} data-sx-shift-direction={k} className={dir === k ? "active" : ""} onClick={() => setDir(k)}>{k}</button>)}</div>
        <label><input type="number" name="delay_hr" value={hr} onChange={(e) => setHr(e.target.value)} min="0" max="12" aria-label="Delay hours" /><span>h</span></label>
        <label><input type="number" name="delay_min" value={mn} onChange={(e) => setMn(e.target.value)} min="0" max="59" aria-label="Delay minutes" /><span>m</span></label>
        <Bt icon="clock" label={dir === "Delay" ? "Apply delay" : "Apply advance"} cls="primary" attrs={{ "data-sx-applydelay": "" }} disabled={busy} onClick={() => void applyDelay()} />
        <p>Applies as soon as you press it — it does not wait for Save. Only unreached stops will move. Changes to the route template are not made.{d.delayMinutes ? ` Current: ${d.delayMinutes > 0 ? "delayed" : "advanced"} ${Math.abs(d.delayMinutes)} min.` : ""}</p>
      </div>
      <div className="sx-two-card sx48-city-endpoints">
        <div className="sx-origin"><span className="sx48-city-symbol"><I name="pin" size={24} /></span><div><small>ORIGIN</small><h3>{d.origin}</h3><p>{first?.state ?? ""} <span className="sx48-daychip">Day {first?.day ?? 1} · {t12(d.departureTime)}</span></p></div></div>
        <div className="sx-destination"><span className="sx48-city-symbol"><I name="pin" size={24} /></span><div><small>DESTINATION</small><h3>{d.destination}</h3><p>{last?.state ?? ""} <span className="sx48-daychip">Day {last?.day ?? d.arrivalDay} · {t12(d.arrivalTime)}</span></p></div></div>
      </div>
      <section className="sx-light-card">
        <header><b><I name="pin" /> Via Cities <span>{Math.max(0, cities.length - 2)}</span></b></header>
        <div className="sx-table-outer"><table className="sx-table">
          <thead><tr>{["STATE", "CITY", "DAY", "TIME", "ORIGIN", "DESTINATION"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {cities.slice(1, -1).map((c) => (
              <tr key={c.cityId}>
                <td>{c.state || "—"}</td><td><I name="pin" size={12} />{` ${c.name}`}</td><td><span className="sx-pill">{c.day || 2}</span></td><td>{t12(c.time)}</td>
                {(["origin", "destination"] as const).map((k) => <td key={k}><label className="sx-switch sx-small"><input data-sx-via={`${c.cityId}|${k}`} type="checkbox" checked={via(c.cityId, k)} onChange={() => toggleVia(c.cityId, k)} /><span></span></label></td>)}
              </tr>
            ))}
            {cities.length <= 2 && <tr><td colSpan={6} className="sx-empty">No via cities</td></tr>}
          </tbody>
        </table></div>
      </section>
      <section className="sx-light-card sx48-route-pairs">
        <header><b><I name="map" /> Routes <span className="sx48-combination-count">{pairs.length} city pairs</span></b><button data-sx-add-subroute="" onClick={addSubroute}><I name="plus" /> Add sub-route</button></header>
        <div className="sx-table-outer"><table className="sx-table">
          <thead><tr>{["ROUTE / SLOT ID", "ORIGIN → DESTINATION", "TIMING", "FARE %", "ACTIONS"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {pairs.map(([a, b], i) => (
              <tr key={`${a.cityId}-${b.cityId}`}>
                <td><small>{i === 0 ? d.routeId : "—"}</small><span className="sx48-route-kind">{i === 0 ? "MAIN-ROUTE" : "SUB-ROUTE"}</span></td>
                <td>{a.name} → {b.name}</td>
                <td><span className="sx-pill">{t12(a.time || d.departureTime)} → {t12(b.time || d.arrivalTime)}</span></td>
                <td><input className="sx-short" type="number" data-sx-subrate={i} value={rate(i)} min="0" max="100" onChange={(e) => setRate(i, e.target.value)} /></td>
                <td>{i === 0 ? "—" : <button data-sx-remove-subroute={i} onClick={() => toast("Deleting a real route slot requires the Routes editor.", "warn")}><I name="trash" /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </section>
      <PreviewNote>Via-city toggles and fare percentages are saved automatically as schedule preferences. Published city-pair routes and fares are managed in the Routes/Fares editors.</PreviewNote>
    </div>
  );
}
