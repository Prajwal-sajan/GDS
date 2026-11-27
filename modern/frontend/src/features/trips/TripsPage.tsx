import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type Me, type TripCommRow, type TripSheet, type TripSheetPassenger, type TripSheetRow, type TripSheetStop } from "../../api";
import { Modal, promptDialog, toast, toastError } from "../../components/ui/feedback";
import { addDays, t12, today } from "../../services/format";

// React port of the legacy Trips screen (public/js/trip-parity-v13.js `G.screens.trips` + trips-loyalty-v39.js control).
// Same DOM/classes/SVG paths so the vendored trip-parity-v13.css renders it identically. Data: GET /api/admin/trip-sheets.
// Call status, check-in/drop, stop arrival/departure, manual call logs and communication history are persisted
// (PATCH passengers, POST stop-event, GET communications). Passenger live location, telemetry and ratings are not
// recorded: those render "—" exactly as legacy does when absent.
const PATH = {
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
  bus: "M4 16V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11M4 16h16M4 16v3h3m13-3v3h-3M8 19h8M4 8h16M7 12h2m6 0h2",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  phone: "M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07A19.5 19.5 0 0 1 5.15 12.8 19.8 19.8 0 0 1 2.08 4.2 2 2 0 0 1 4.07 2h3a2 2 0 0 1 2 1.7c.13.96.36 1.92.68 2.84a2 2 0 0 1-.45 2.1L8.1 9.91a16 16 0 0 0 5.98 5.98l1.27-1.2a2 2 0 0 1 2.1-.45c.92.32 1.88.55 2.84.68A2 2 0 0 1 22 16.92Z",
  navigation: "m3 3 7.5 18 2.5-8 8-2.5L3 3Z",
  "map-pin": "M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0ZM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M8 13h8M8 17h8",
  message: "M21 11.5a8.4 8.4 0 0 1-.9 3.8A8.5 8.5 0 0 1 12.5 20a8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3h.5A8.5 8.5 0 0 1 21 11v.5Z",
  train: "M8 3h8a4 4 0 0 1 4 4v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a4 4 0 0 1 4-4ZM4 10h16M8 19l-2 3m10-3 2 3M8 15h.01M16 15h.01",
  "chevron-down": "m6 9 6 6 6-6", "chevron-up": "m18 15-6-6-6 6",
  close: "M18 6 6 18M6 6l12 12", "arrow-right": "M5 12h14m-6-6 6 6-6 6",
  "check-circle": "M20 11a8 8 0 1 1-4.3-7.1M8 11l3 3 9-9",
  "external-link": "M14 3h7v7M21 3l-9 9M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6",
  refresh: "M20 11a8 8 0 0 0-14.6-4.6L3 9m0-6v6h6m-5 4a8 8 0 0 0 14.6 4.6L21 15m0 6v-6h-6",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z",
  leaf: "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10ZM2 21c0-3 1.9-5.4 5.1-6",
  "badge-check": "M12 2l2.4 2.2 3.2-.4.6 3.2 2.8 1.6-1.4 2.9 1.4 2.9-2.8 1.6-.6 3.2-3.2-.4L12 22l-2.4-2.2-3.2.4-.6-3.2-2.8-1.6 1.4-2.9-1.4-2.9 2.8-1.6.6-3.2 3.2.4L12 2Zm-3 10 2 2 4-4",
  "id-card": "M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm6 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm5-5h5m-5 4h4",
  route: "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6 15V9a4 4 0 0 1 4-4h6M18 9v6a4 4 0 0 1-4 4H8",
  stamp: "M5 22h14M5 18h14v-3a2 2 0 0 0-2-2h-3V9.5a3.5 3.5 0 1 0-4 0V13H7a2 2 0 0 0-2 2v3Z",
  satellite: "M13 7 9 3 5 7l4 4m4-4 4 4-4 4m-4-8 8 8m-7 3a6 6 0 0 0 6-6m-9 9a9 9 0 0 0 9-9",
  flame: "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.3.4 1.5 1.5 2.8 2.5 2.8Z",
  interchange: "M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7",
} as const;
type IconName = keyof typeof PATH;
function I({ name, cls = "" }: { name: IconName; cls?: string }) {
  return (
    <svg className={`tp13-icon ${cls}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATH[name]} />
    </svg>
  );
}
/** trips-loyalty-v39 sparkle icon (two paths, size 15) */
function Sparkle() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round">
      <path d="m12 2 2.1 6.1L20 10l-5.9 2.1L12 18l-2.1-5.9L4 10l5.9-1.9L12 2Z" /><path d="m20 15 .8 2.2L23 18l-2.2.8L20 21l-.8-2.2L17 18l2.2-.8L20 15Z" />
    </svg>
  );
}

const OPS = ["owner", "admin", "ops"];
const mask = (x: string | null | undefined) => { const p = String(x || "").replace(/\D/g, ""); return p.length >= 8 ? `${p.slice(0, 3)}xxxx${p.slice(-3)}` : "—"; };
const clock = (x: string | null | undefined) => (x ? t12(String(x).slice(0, 5)) : "—");
const dateLabel = (x: string) => { const [y, m, d] = x.slice(0, 10).split("-"); return `${d}-${m}-${y}`; };
const fdate = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const isP = (p: TripSheetPassenger) => !["cancelled", "hold", "expired"].includes(p.status);
const key = (p: TripSheetPassenger) => `${encodeURIComponent(p.pnr)}|${encodeURIComponent(p.seat)}`;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseIso = (x: string) => { const [y, m, d] = x.split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const pointUrl = (lat: number, lng: number) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
const preview = (what: string, why: string) => toast(`${what} is preview-only: ${why}`);

type Section = "pickup" | "drop" | "timings" | "docs";
const STATUSES: [string, string][] = [["", "__DEFAULT__"], ["call:to_call", "To call"], ["call:called", "Called"], ["call:not_reachable", "Not reachable"], ["state:checked_in", "Check-in: Yes"], ["state:boarded", "Boarded"], ["state:dropped", "Dropped"], ["state:no_show", "No-show"]];
const DOC_ICON: IconName[] = ["id-card", "shield", "leaf", "badge-check", "route", "stamp", "satellite", "flame"];
const DOCS: [string, RegExp][] = [["Registration Certificate (RC)", /^rc$|registration/i], ["Insurance", /insurance/i], ["Pollution Under Control (PUC)", /^puc$|pollution/i], ["Fitness Certificate", /fitness/i], ["AITP Form 2", /aitp.*2|form[\s_-]*2/i], ["AITP Form 3", /aitp.*3|form[\s_-]*3/i], ["VLTD", /vltd|tracking/i], ["FDSS", /fdss|fire/i]];

export function TripsPage({ me }: { me: Me }) {
  const canOps = OPS.includes(me.role);
  const q = useMemo(() => new URLSearchParams(location.hash.split("?")[1] || ""), []);
  const [date, setDate] = useState(q.get("date") || today());
  const [sid, setSid] = useState(q.get("sid") || "");
  const [section, setSection] = useState<Section>((["pickup", "drop", "timings", "docs"].includes(q.get("section") || "") ? q.get("section") : "pickup") as Section);
  const [list, setList] = useState<TripSheetRow[]>([]);
  const [trip, setTrip] = useState<TripSheet | null>(null);
  const [main, setMain] = useState<{ kind: "loading" | "error" | "empty" | "trip"; text?: string }>({ kind: "loading", text: "Loading trip workspace…" });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [pop, setPop] = useState<"cal" | "svc" | null>(null);
  const calDrawn = useRef(false);
  if (pop === "cal") calDrawn.current = true;
  const [calMonth, setCalMonth] = useState(() => { const d = parseIso(date); d.setDate(1); return d; });
  const [docView, setDocView] = useState<number | null>(null);
  const [stopMap, setStopMap] = useState<TripSheetStop | null>(null);
  const feedback = useRef<Record<string, string>>({});
  const seq = useRef(0);
  const [history, setHistory] = useState<{ p: TripSheetPassenger; rows: TripCommRow[] } | null>(null);
  const [stopAct, setStopAct] = useState<TripSheetStop | null>(null);
  const [cust, setCust] = useState<{ p: TripSheetPassenger; left: number; top: number; out: number | null; inn: number | null } | null>(null);
  useEffect(() => {
    if (!cust) return;
    const close = (e: MouseEvent) => { if (!(e.target as Element).closest?.(".tp13-customer-pop,[data-trip-customer]")) setCust(null); };
    document.addEventListener("click", close, true);
    return () => document.removeEventListener("click", close, true);
  }, [cust]);

  useEffect(() => {
    if (!pop) return;
    const outside = (e: MouseEvent) => { if (!(e.target as Element).closest?.(".tp13-datefield,.tp13-svcfield")) setPop(null); };
    document.addEventListener("click", outside, true);
    return () => document.removeEventListener("click", outside, true);
  }, [pop]);

  const loadDetail = useCallback(async (id: string, d: string) => {
    const mine = ++seq.current;
    if (!id) { setTrip(null); setMain({ kind: "empty", text: `No trip scheduled for ${dateLabel(d)}. Choose another date.` }); return; }
    setMain({ kind: "loading", text: "Loading passengers and stops…" });
    try { const t = await api.tripSheet(id); if (mine === seq.current) { setTrip(t); setMain({ kind: "trip" }); } }
    catch (e) { if (mine === seq.current) setMain({ kind: "error", text: `Unable to load trip: ${e instanceof Error ? e.message : e}` }); }
  }, []);
  const loadList = useCallback(async (d: string, chosen: string) => {
    const mine = ++seq.current;
    setMain({ kind: "loading", text: "Loading trip workspace…" });
    try {
      const r = await api.tripSheets(d);
      if (mine !== seq.current) return;
      setList(r.trips);
      const next = r.trips.some((x) => String(x.id) === chosen) ? chosen : r.trips[0] ? String(r.trips[0].id) : "";
      setSid(next);
      await loadDetail(next, d);
    } catch (e) { if (mine === seq.current) setMain({ kind: "error", text: `Could not load trips: ${e instanceof Error ? e.message : e}` }); }
  }, [loadDetail]);
  useEffect(() => { void loadList(date, sid); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pickDate = (v: string) => {
    setDate(v); const m = parseIso(v); m.setDate(1); setCalMonth(m); setPop(null);
    (document.activeElement as HTMLElement | null)?.blur();
    void loadList(v, sid);
  };
  const selected = list.find((t) => String(t.id) === String(sid));
  const findPassenger = (k: string) => { const [pnr, seat] = k.split("|").map(decodeURIComponent); return trip?.passengers.find((p) => p.pnr === pnr && p.seat === seat); };

  const passengerUpdate = async (k: string) => {
    const p = findPassenger(k); if (!p) return;
    const v = feedback.current[k] || "";
    if (!v) { toast("Select an action or feedback status first", ""); return; }
    const [type, status] = v.split(":");
    try {
      if (type === "state" && status === "no_show") await api.setBoarding(p.pnr, p.seat, "No-Show");
      else {
        const body: { status?: string; callStatus?: string; boardingOtp?: string } = type === "call" ? { callStatus: status } : { status };
        if (status === "boarded") {
          const a = await promptDialog("Board passenger", [{ name: "boarding_otp", label: "Passenger boarding OTP (optional)", full: true }]);
          if (!a) return;
          if (a.boarding_otp) body.boardingOtp = String(a.boarding_otp);
        }
        await api.tripPassenger(sid, p.pnr, p.seat, body);
      }
      toast("Passenger updated", "ok"); feedback.current[k] = ""; await loadDetail(sid, date);
    } catch (e) { toastError(e); }
  };
  const openHistory = async (p: TripSheetPassenger) => {
    try { const r = await api.tripPassengerComms(sid, p.pnr); setHistory({ p, rows: r.rows }); } catch (e) { toastError(e); }
  };
  const openCustomer = (p: TripSheetPassenger, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setCust({ p, left: Math.min(Math.max(8, r.left), window.innerWidth - 256), top: Math.min(r.bottom + 8, window.innerHeight - 230), out: null, inn: null });
    api.tripPassengerComms(sid, p.pnr).then((x) => setCust((c) => (c && c.p === p ? { ...c, out: x.outCalls, inn: x.inCalls } : c))).catch(() => { /* leave unknown */ });
  };
  const callNow = async (p: TripSheetPassenger) => {
    const v = await promptDialog("Log phone call (manual — no telephony connected)", [
      { name: "phone", label: "Phone number", required: true, value: p.phone || "" },
      { name: "name", label: "Contact name", value: p.name || "" },
      { name: "pnr", label: "PNR", value: p.pnr },
      { name: "status", label: "Operator-reported outcome", type: "select", options: [["answered", "Answered (self-reported)"], ["missed", "No answer"], ["busy", "Busy"], ["not_reachable", "Not reachable"]] },
      { name: "duration_s", label: "Duration (seconds, if answered)", type: "number", value: 0 },
      { name: "notes", label: "Call notes", type: "textarea", full: true },
    ], { ok: "Save manual call record" });
    if (!v) return;
    try {
      const r = await api.logCall({ phone: v.phone, name: v.name, pnr: v.pnr || null, kind: "manual", direction: "outgoing", status: v.status || "missed",
        durationS: v.status === "answered" ? Number(v.duration_s) || 0 : 0, notes: v.notes || "" });
      toast(r.notice || "Call logged", "ok");
    } catch (e) { toastError(e); }
  };
  const stopEvent = async (s: TripSheetStop, kind: "arrived" | "departed") => {
    try { await api.tripStopEvent(sid, s.id, kind); toast("Stop timing saved", "ok"); setStopAct(null); await loadDetail(sid, date); } catch (e) { toastError(e); }
  };

  return (
    <div className="tp13-root">
      <div className="tp13-filterbar">
        <div className="tp13-field tp13-datefield">
          <span className="tp13-fieldlabel"><i></i> DATE</span>
          <button type="button" className="tp13-control tp13-dropbtn" data-trip-cal-toggle="" aria-haspopup="dialog" aria-label="Choose trip date"
            onClick={() => { if (pop !== "cal") { const m = parseIso(date); m.setDate(1); setCalMonth(m); } setPop(pop === "cal" ? null : "cal"); }}>
            <I name="calendar" cls="tp13-control-icon" /><span className="tp13-date-display" data-trip-date-display="">{dateLabel(date)}</span><I name="chevron-down" cls="tp13-field-caret" />
          </button>
          <input type="hidden" data-trip-date="" value={date} />
          <div className="tp13-cal" data-trip-cal="" role="dialog" aria-label="Calendar" hidden={pop !== "cal"}>
            {calDrawn.current && <Calendar month={calMonth} selected={date} onNav={(n) => { const m = new Date(calMonth); m.setMonth(m.getMonth() + n); setCalMonth(m); }} onPick={pickDate} />}
          </div>
        </div>
        <div className="tp13-field tp13-svcfield">
          <span className="tp13-fieldlabel"><i></i> SERVICE</span>
          <button type="button" className="tp13-control tp13-dropbtn" data-trip-svc-toggle="" aria-haspopup="listbox" aria-label="Choose service" onClick={() => setPop(pop === "svc" ? null : "svc")}>
            <I name="bus" cls="tp13-control-icon" />
            <span className="tp13-svc-current" data-trip-svc-current="">{selected ? <SvcOption t={selected} /> : list.length ? "Choose service" : "No trip for selected date"}</span>
            <I name="chevron-down" cls="tp13-field-caret" />
          </button>
          <select className="tp13-hidden-select" data-trip-service="" aria-hidden="true" tabIndex={-1} value={sid} onChange={(e) => setSid(e.target.value)}>
            {list.length ? list.map((t) => <option key={t.id} value={t.id}>{t.serviceNumber} - {t.registration || t.serviceName || "Bus unassigned"}</option>) : <option value="">No trip for selected date</option>}
          </select>
          <div className="tp13-svc-list" data-trip-svc-list="" role="listbox" hidden={pop !== "svc"}>
            {list.length ? list.map((t) => (
              <button key={t.id} type="button" role="option" className={`tp13-svc-opt ${String(t.id) === String(sid) ? "selected" : ""}`} data-trip-svc-pick={t.id} aria-selected={String(t.id) === String(sid)}
                onClick={() => { setSid(String(t.id)); setPop(null); (document.activeElement as HTMLElement | null)?.blur(); void loadDetail(String(t.id), date); }}>
                <SvcOption t={t} />
              </button>
            )) : <div className="tp13-svc-empty">No trip for selected date</div>}
          </div>
        </div>
        <button className="tp13-submit" data-trip-submit="" onClick={() => void loadList(date, sid)}>Submit <I name="arrow-right" /></button>
      </div>
      <div data-trip-main="" className="tp13-main" aria-live="polite">
        {main.kind === "loading" ? <div className="tp13-empty"><I name="refresh" /> {main.text}</div>
          : main.kind !== "trip" || !trip ? <div className="tp13-empty">{main.text}</div>
          : (
            <>
              <StaffPills t={trip} />
              <nav className="tp13-tabs" aria-label="Trip views" role="tablist">
                {([["pickup", "map-pin", "Pickup"], ["drop", "navigation", "Drop"], ["timings", "clock", "Timings"], ["docs", "file", "Docs"]] as [Section, IconName, string][]).map(([k, i, label]) => (
                  <button key={k} className={section === k ? "selected" : ""} data-trip-tab={k} aria-selected={section === k} onClick={() => setSection(k)}><I name={i} /> {label}</button>
                ))}
              </nav>
              {section !== "docs" && <Summary t={trip} section={section} />}
              <div className="tp13-body">
                {section === "pickup" || section === "drop"
                  ? <Boards t={trip} which={section} canOps={canOps} collapsed={collapsed}
                      onCollapse={(k) => setCollapsed((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; })}
                      onFeedback={(k, v) => { feedback.current[k] = v; }} onUpdate={(k) => void passengerUpdate(k)}
                      acts={{ history: (p) => void openHistory(p), customer: openCustomer, call: (p) => void callNow(p) }} />
                  : section === "timings" ? <Timings t={trip} canOps={canOps} onMap={setStopMap} onStop={setStopAct} />
                  : <Docs t={trip} onView={setDocView} />}
              </div>
            </>
          )}
      </div>
      {docView != null && trip && <DocModal t={trip} i={docView} onClose={() => setDocView(null)} />}
      {history && <HistoryModal p={history.p} rows={history.rows} onClose={() => setHistory(null)} />}
      {stopAct && trip && (
        <Modal title={`Stop timing · ${stopAct.name}`} onClose={() => setStopAct(null)}>
          <p className="tp13-muted">Scheduled {clock(stopAct.time)} · Day {stopAct.day || 1}</p>
          <div className="tp13-actiongrid">
            <button className="btn" data-trip-stop-event="arrived" onClick={() => void stopEvent(stopAct, "arrived")}>Mark arrived</button>
            <button className="btn" data-trip-stop-event="departed" onClick={() => void stopEvent(stopAct, "departed")}>Mark departed</button>
          </div>
        </Modal>
      )}
      {cust && (
        <div className="tp13-customer-pop" style={{ left: cust.left, top: cust.top }}>
          <div className="tp13-pop-title">Customer Rating <button data-trip-close-pop="" onClick={() => setCust(null)}><I name="close" /></button></div>
          <div>Rating: <b className="green">—</b></div>
          <div>Trips: <b>{cust.p.trips ?? "—"}</b></div>
          <div>Out Calls: <b data-trip-outcalls="">{cust.out ?? "—"}</b></div>
          <div>In Calls: <b data-trip-incalls="">{cust.inn ?? "—"}</b></div>
          <div>Check-ins: <b>—</b></div>
        </div>
      )}
      {stopMap && (
        <Modal title={<span className="tp13-map-head"><I name="map-pin" /> <span><small>Passenger / Stop</small><b>{stopMap.name}</b><em>Scheduled stop location</em></span></span>} size="xl" onClose={() => setStopMap(null)}>
          <div className="tp13-mappanel">
            <iframe title={`Map of ${stopMap.name}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(`${stopMap.lng! - 0.018},${stopMap.lat! - 0.012},${stopMap.lng! + 0.018},${stopMap.lat! + 0.012}`)}&layer=mapnik&marker=${encodeURIComponent(`${stopMap.lat},${stopMap.lng}`)}`} />
          </div>
          <div className="tp13-mapfooter"><a className="tp13-openmap" href={pointUrl(stopMap.lat!, stopMap.lng!)} target="_blank" rel="noopener noreferrer"><I name="external-link" /> Open in Maps</a></div>
        </Modal>
      )}
    </div>
  );
}

function SvcOption({ t }: { t: TripSheetRow }) {
  return (
    <>
      <span className="tp13-svc-bus"><I name="bus" /></span><b className="tp13-svc-id">{t.serviceNumber}</b><small className="tp13-svc-reg">{t.registration || "Bus unassigned"}</small>
      <span className="tp13-svc-staff" title={`${t.staff} staff assigned`}><I name="user" />{t.staff}</span>
    </>
  );
}

function Calendar({ month, selected, onNav, onPick }: { month: Date; selected: string; onNav: (n: number) => void; onPick: (v: string) => void }) {
  const y = month.getFullYear(), m = month.getMonth();
  const first = new Date(y, m, 1), start = (first.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate(), td = today();
  return (
    <>
      <div className="tp13-cal-head">
        <button type="button" data-trip-cal-nav="-1" aria-label="Previous month" onClick={() => onNav(-1)}>‹</button>
        <b>{first.toLocaleString("en-IN", { month: "long", year: "numeric" })}</b>
        <button type="button" data-trip-cal-nav="1" aria-label="Next month" onClick={() => onNav(1)}>›</button>
      </div>
      <div className="tp13-cal-week">{["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((x) => <span key={x}>{x}</span>)}</div>
      <div className="tp13-cal-grid">
        {Array.from({ length: start }, (_, i) => <span key={`p${i}`} className="tp13-cal-pad"></span>)}
        {Array.from({ length: days }, (_, i) => { const v = iso(new Date(y, m, i + 1)); return <button key={v} type="button" className={`tp13-cal-day${v === selected ? " selected" : ""}${v === td ? " today" : ""}`} data-trip-cal-day={v} onClick={() => onPick(v)}>{i + 1}</button>; })}
      </div>
      <div className="tp13-cal-quick">
        <button type="button" data-trip-cal-quick="0" onClick={() => onPick(today())}>Today</button>
        <button type="button" data-trip-cal-quick="1" onClick={() => onPick(addDays(today(), 1))}>Tomorrow</button>
        <button type="button" data-trip-cal-quick="7" onClick={() => onPick(addDays(today(), 7))}>+7 days</button>
      </div>
    </>
  );
}

function StaffPills({ t }: { t: TripSheet }) {
  const drivers = t.crew.filter((c) => /driver/i.test(c.role));
  const helpers = t.crew.filter((c) => /helper|conductor|attendant/i.test(c.role));
  const crew = [{ label: "Driver 1", c: drivers[0] }, { label: "Driver 2", c: drivers[1] }, { label: "Helper", c: helpers[0] }];
  const next = t.stops.find((s) => !s.arrivedAt && !s.departedAt);
  return (
    <div className="tp13-crew">
      <span className="tp13-chip tp13-bus-chip"><I name="bus" /> <b>Bus:</b><span>{t.vehicle?.registration || "Unassigned"}</span></span>
      {crew.map(({ label, c }) => (
        <span key={label} className="tp13-crew-pill">
          <I name="user" cls="tp13-person-icon" /><b>{label}:</b> <span className="tp13-ellipsis" title={c?.name || ""}>{String(c?.name || "Unassigned").trim().split(/\s+/)[0]}</span>
          {c?.phone && <a className="tp13-crew-phone" href={`tel:${c.phone}`} title={`Call ${c.name}`}><I name="phone" />{` ${c.phone}`}</a>}
        </span>
      ))}
      <span className="tp13-crew-pill tp13-direction" title={`Next: ${next?.name || "—"}`}><I name="navigation" /><b>Direction:</b> <span className="tp13-ellipsis">{next?.name || "—"}</span></span>
    </div>
  );
}

function Summary({ t, section }: { t: TripSheet; section: Section }) {
  const ps = t.passengers.filter(isP);
  if (section === "pickup") {
    const checked = ps.filter((p) => ["boarded", "dropped"].includes(p.status)).length, called = ps.filter((p) => p.callStatus === "called").length;
    return <div className="tp13-summary pickup"><span className="tp13-summary-label"><I name="map-pin" /> SUMMARY</span><div className="tp13-summary-line"><b>{ps.length} pax</b><span>·</span><strong className="amber">{called}</strong> Called <span>·</span><strong className="green">{checked}</strong> Boarded</div></div>;
  }
  if (section === "drop") {
    const dropped = ps.filter((p) => p.status === "dropped").length;
    return <div className="tp13-summary drop"><span className="tp13-summary-label"><I name="navigation" /> SUMMARY</span><div className="tp13-summary-line"><b>{ps.length} pax</b><span>·</span><strong>{ps.length - dropped}</strong> Yet to drop <span>·</span><strong className="green">—</strong> Feedback</div></div>;
  }
  const val = (label: string, v: string | number | null, cls = "") => <span className={`tp13-metric ${cls}`}>{label} <b>{v == null || v === "" ? "—" : v}</b></span>;
  return (
    <div className="tp13-summary timings">
      <span className="tp13-summary-label"><I name="clock" /> TRIP SUMMARY</span>
      <div className="tp13-metric-row">{val("Total", t.stops.length, "purple")}{val("Pickups", t.stops.filter((s) => s.type === "pickup").length, "blue")}{val("Drops", t.stops.filter((s) => s.type === "drop").length, "amber")}{val("Breaks", t.stops.filter((s) => s.type === "break").length, "amber")}</div>
      <div className="tp13-metric-row">{val("Travelled", "—", "outline-amber")}{val("Fuel", "—", "outline-amber")}{val("Mileage", "—", "outline-amber")}</div>
      <div className="tp13-metric-row"><span className="tp13-muted">Driving</span>{val("Score", null, "green")}{val("Hard brake", null, "red")}{val("Over-speed", null, "red")}{val("Idling", null, "red")}</div>
    </div>
  );
}

type PaxActs = { history: (p: TripSheetPassenger) => void; customer: (p: TripSheetPassenger, el: HTMLElement) => void; call: (p: TripSheetPassenger) => void };
function Boards({ t, which, canOps, collapsed, onCollapse, onFeedback, onUpdate, acts }: {
  t: TripSheet; which: "pickup" | "drop"; canOps: boolean; collapsed: Set<string>;
  onCollapse: (k: string) => void; onFeedback: (k: string, v: string) => void; onUpdate: (k: string) => void; acts: PaxActs;
}) {
  const groups = useMemo(() => {
    const m = new Map<string, { stop: Partial<TripSheetStop>; rows: TripSheetPassenger[] }>();
    for (const p of t.passengers.filter(isP)) {
      const st = which === "pickup" ? p.boarding : p.dropping;
      const id = String(st?.id ?? `${st?.time || "99:99"}::${st?.name || "Unassigned"}`);
      if (!m.has(id)) m.set(id, { stop: st || {}, rows: [] });
      m.get(id)!.rows.push(p);
    }
    return [...m.values()].sort((a, b) => String(a.stop.day || 1).localeCompare(String(b.stop.day || 1)) || String(a.stop.time || "99:99").localeCompare(String(b.stop.time || "99:99")));
  }, [t, which]);
  if (!groups.length) return <div className="tp13-empty">No passengers found for these stops.</div>;
  return (
    <>
      {groups.map((g, index) => {
        const full = t.stops.find((x) => x.id === g.stop.id);
        const st = { ...full, ...g.stop, exchangePoint: g.stop.exchangePoint || full?.exchangePoint, exchangeTime: g.stop.exchangeTime || full?.exchangeTime };
        const id = String(st.id ?? `${which}-${index}`), k = `${which}:${id}`, open = !collapsed.has(k);
        const metro = /metro/i.test(`${st.pickupType || ""} ${st.name || ""}`);
        const pnrs = new Set(g.rows.map((p) => p.pnr)).size;
        return (
          <section key={k} className={`tp13-stop ${which}`}>
            <button className="tp13-stophead" data-trip-collapse={k} aria-expanded={open} onClick={() => onCollapse(k)}>
              <span className="tp13-stop-time"><I name="clock" />{clock(st.time)}</span><strong>{st.name || "Unassigned stop"}</strong>
              <span className="tp13-stopchip">{which === "pickup" ? "PNR" : "PNRs"} {pnrs}</span><span className="tp13-stopchip">{which === "pickup" ? "Passengers" : "PAXs"} {g.rows.length}</span>
              {metro && which === "pickup" && <span className="tp13-metrochip"><I name="train" /> Metro</span>}
              <span className="tp13-expand"><I name={open ? "chevron-up" : "chevron-down"} /></span>
            </button>
            {which === "pickup" && st.exchangePoint && (
              <div className="tp13-exchange"><I name="interchange" cls="tp13-interchange-icon" /><span><b>Bus Pickup:</b> {`${String(st.exchangePoint).replace(/\s*metro(\s*station)?\s*$/i, "")} Metro station ${clock(st.exchangeTime).replace(/\s*[AP]M$/i, "")}`}</span></div>
            )}
            {open && (
              <div className="tp13-tabscroll"><table className="tp13-pax-table">
                <thead><tr>{(which === "pickup" ? ["PASSENGERS", "PHONE", "SEATS/PNR", "RTG", "PASSENGER LOCATION", "STATUS", "ACTIONS"] : ["NAME", "PHONE", "PNR", "RTG", "DROPS", "STATUS", "ACTIONS"]).map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>{g.rows.map((p) => <PaxRow key={key(p)} p={p} which={which} canOps={canOps} onFeedback={onFeedback} onUpdate={onUpdate} acts={acts} />)}</tbody>
              </table></div>
            )}
          </section>
        );
      })}
    </>
  );
}

function PaxRow({ p, which, canOps, onFeedback, onUpdate, acts }: { p: TripSheetPassenger; which: "pickup" | "drop"; canOps: boolean; onFeedback: (k: string, v: string) => void; onUpdate: (k: string) => void; acts: PaxActs }) {
  const k = key(p), stat = p.status || "booked", checked = ["checked_in", "boarded", "dropped"].includes(stat);
  const why = `Check-in: Yes — ${stat === "checked_in" ? "passenger checked in" : stat === "boarded" ? "passenger boarded the bus" : stat === "dropped" ? "passenger boarded and was dropped" : "check-in recorded"}`;
  return (
    <tr>
      <td>
        <div className="tp13-person-name">{checked ? <span className="tp13-check-person" title={why}>{p.name}</span> : <span>{p.name || "Passenger"}</span>}</div>
        {checked && <span className="tp13-checkhint">{why}</span>}
      </td>
      <td>{mask(p.phone)}</td>
      <td>
        <div className="tp13-seat">Seats: {p.seat}</div>
        <span className="tp13-source">Via: <b>{p.source || "—"}</b> <span>PNR: <a href="#" data-trip-history={k} title={`View Communication History for PNR ${p.pnr}`} onClick={(e) => { e.preventDefault(); acts.history(p); }}>{p.pnr.slice(-6)}</a>
          {canOps && <button type="button" className="tp13-booking-shortcut" data-trip-booking={p.pnr} title="View booking details" aria-label={`View booking details for PNR ${p.pnr}`} onClick={(e) => { e.preventDefault(); location.hash = `#/crm?q=${encodeURIComponent(p.pnr)}`; }}><I name="file" /></button>}</span></span>
      </td>
      <td><button className="tp13-rtg" data-trip-customer={k} title="Customer Rating · Trips, calls and check-ins" onClick={(e) => acts.customer(p, e.currentTarget)}>{p.trips == null ? "—" : `${p.trips}T`}, —</button></td>
      <td>{which === "pickup"
        ? <div className="tp13-location"><span>Views: <strong className="tp13-count">—</strong></span><span className="tp13-dash">—</span></div>
        : <><span>{p.dropping?.name || "—"}</span><div className="tp13-location">Views: <strong className="tp13-count">—</strong></div></>}</td>
      <td>{canOps
        ? <div className="tp13-feedback">
            <select data-trip-feedback={k} aria-label={`Status / feedback for ${p.name}`} defaultValue="" onChange={(e) => onFeedback(k, e.target.value)}>
              {STATUSES.map(([v, l]) => <option key={v} value={v}>{l === "__DEFAULT__" ? "Unknown" : l}</option>)}
            </select>
            <button data-trip-update={k} onClick={() => onUpdate(k)}>Update</button>
          </div>
        : <span className="tp13-muted">{stat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>}</td>
      <td>
        <div className="tp13-row-actions">
          {canOps && <button className="tp13-call" data-trip-call={k} title="Call passenger" onClick={() => acts.call(p)}><I name="phone" />{` ${mask(p.phone)}`}</button>}
          {canOps && <button className="tp13-chat" data-trip-history={k} title="Communication History" onClick={() => acts.history(p)}><I name="message" /></button>}
          {canOps && <button type="button" className="lv39-offer-control" data-trip-loyalty-upgrade="1" title="Review loyalty upgrade / record passenger consent" aria-label={`Open seat upgrade for ${p.name}`} aria-disabled="true"
            onClick={() => preview("Loyalty seat upgrade", "the upgrade-offer API is not available yet")}><Sparkle /> Upgrade</button>}
        </div>
      </td>
    </tr>
  );
}

const stamp = (x: string | null) => (x ? new Date(x).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : "—");
function Timings({ t, canOps, onMap, onStop }: { t: TripSheet; canOps: boolean; onMap: (s: TripSheetStop) => void; onStop: (s: TripSheetStop) => void }) {
  const badgeFor = (s: TripSheetStop) => s.departedAt ? <span className="tp13-lag ok">Departed</span> : s.arrivedAt ? <span className="tp13-lag ok">Arrived</span> : <span className="tp13-muted">Awaiting arrival</span>;
  return (
    <div className="tp13-timing-scroll"><table className="tp13-timing-table">
      <thead><tr><th>Type</th><th>Name</th><th>Link</th><th>Status</th><th>Sched:</th><th>Arr:</th><th>Dep:</th></tr></thead>
      <tbody>
        {t.stops.map((s) => (
          <tr key={s.id}>
            <td><span className={`tp13-stoptype ${s.type}`}><I name="map-pin" /><em>{s.type === "pickup" ? "Pickup" : s.type === "drop" ? "Drop" : "Break"}</em></span></td>
            <td className="tp13-stopname">{s.name} <I name="map-pin" /></td>
            <td>{s.lat != null && s.lng != null ? <button className="tp13-mapbutton" data-trip-stop-map={s.id} onClick={() => onMap(s)}><I name="map-pin" /> View Map</button> : <span className="tp13-muted">No location</span>}</td>
            <td>{canOps ? <button className="tp13-lag-button" data-trip-stop-actions={s.id} title="Open stop timing actions" onClick={() => onStop(s)}>{badgeFor(s)}</button> : badgeFor(s)}</td>
            <td><b>{clock(s.time)}</b><small>{fdate(addDays(t.travelDate, (s.day || 1) - 1)).replace(/\d{4}/, "").trim()}</small></td>
            <td>{stamp(s.arrivedAt)}</td><td>{stamp(s.departedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}

const findDoc = (t: TripSheet, i: number) => t.documents.find((d) => DOCS[i][1].test(d.documentType || "") || DOCS[i][1].test(d.documentName || ""));
function Docs({ t, onView }: { t: TripSheet; onView: (i: number) => void }) {
  const T = today();
  return (
    <section className="tp13-docpanel">
      <div className="tp13-summary-label"><I name="file" /> DOCUMENTS</div>
      <div className="tp13-doclist">
        {DOCS.map(([label], i) => {
          const d = findDoc(t, i), exp = d?.expiryDate;
          const state = !exp ? "" : exp < T ? "expired" : exp <= addDays(T, 30) ? "soon" : "ok";
          return (
            <div key={label} className="tp13-docrow">
              <span className="tp13-docicon"><I name={DOC_ICON[i]} /></span>
              <div className="tp13-docmeta"><b>{label}</b>
                {i < 6
                  ? <small className={`tp13-validtill ${state}`}>Valid till: <strong>{exp ? dateLabel(exp) : "—"}</strong>{state === "expired" ? " · Expired" : state === "soon" ? " · Expiring soon" : ""}</small>
                  : <small className="tp13-muted">{d ? "On file" : "Not on file"}</small>}
              </div>
              <button type="button" className="tp13-docview" data-trip-doc-view={i} onClick={() => onView(i)}><I name="external-link" /> View</button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DocModal({ t, i, onClose }: { t: TripSheet; i: number; onClose: () => void }) {
  const [label] = DOCS[i]; const d = findDoc(t, i);
  return (
    <Modal title={<><I name="file" /> {label}</>} onClose={onClose}>
      {d ? (
        <div className="tp13-docpop">
          <div className="tp13-docline"><span>Vehicle</span><strong>{t.vehicle?.registration || "—"}</strong></div>
          <div className="tp13-docline"><span>Document</span><strong>{d.documentName || "—"}</strong></div>
          <div className="tp13-docline"><span>Number</span><strong>—</strong></div>
          {i < 6 && <div className="tp13-docline"><span>Valid till</span><strong>{d.expiryDate ? dateLabel(d.expiryDate) : "—"}</strong></div>}
          <div className="tp13-docline"><span>Verification</span><strong>{d.verificationStatus ? d.verificationStatus.replace(/\b\w/g, (c) => c.toUpperCase()) : "—"}</strong></div>
          <p className="tp13-muted">No file uploaded for this document.</p>
        </div>
      ) : <p className="tp13-muted">{label} is not on file for {t.vehicle?.registration || "—"}. Upload it from Fleet → Vehicles.</p>}
    </Modal>
  );
}

/** legacy trip-parity-v13 communication history modal (.tp13-history-modal) */
function HistoryModal({ p, rows, onClose }: { p: TripSheetPassenger; rows: TripCommRow[]; onClose: () => void }) {
  const [ch, setCh] = useState("all");
  const cnt = (k: string) => rows.filter((r) => r.channel === k).length;
  const list = rows.filter((x) => ch === "all" || x.channel === ch);
  const tabs: [string, string, number, IconName | ""][] = [["all", "All", rows.length, ""], ["calls", "Calls", cnt("calls"), "phone"], ["whatsapp", "WhatsApp", cnt("whatsapp"), "message"], ["sms", "SMS", cnt("sms"), "message"]];
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return (
    <Modal title="Communication History" size="xl" className="tp13-history-modal" onClose={onClose}>
      <p className="tp13-history-sub">{p.name}{"\u00a0 PNR: "}{p.pnr}{" \u00a0\u2022\u00a0 "}{mask(p.phone)}</p>
      <div className="tp13-history-tabs">
        {tabs.map(([id, label, n, icon]) => (
          <button key={id} data-trip-channel={id} className={ch === id ? "active" : ""} onClick={() => setCh(id)}>{icon && <I name={icon} />}<span className="tp13-history-tablabel">{label}</span><small>({n})</small></button>
        ))}
      </div>
      <div className="tp13-history-scroll" data-trip-history-rows="">
        {list.length ? (
          <table className="tp13-history-table">
            <thead><tr>{["TYPE", "DIRECTION", "TIMESTAMP", "MESSAGE TYPE / FROM", "CONTACT / TO", "STATUS", "DURATION", "ADDITIONAL INFO"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{list.map((r, i) => (
              <tr key={i}>
                <td><span className={`tp13-history-type ${r.channel}`}><I name={r.channel === "calls" ? "phone" : "message"} />{cap(r.channel === "calls" ? "Call" : r.channel)}</span></td>
                <td><span className="tp13-history-dir">{r.direction === "out" ? "↗" : "↙"} {r.direction === "out" ? "Outgoing" : "Incoming"}</span></td>
                <td>{new Date(r.ts).toLocaleString("en-IN")}</td>
                <td><span className="tp13-history-name">{r.label}</span><small>{r.from || "—"}</small></td>
                <td>{r.to || "—"}</td>
                <td><span className={`tp13-history-status ${/read|deliver|answer/i.test(r.status) ? "good" : /sent|record/i.test(r.status) ? "sent" : "other"}`}>{r.status}</span></td>
                <td>{r.duration == null ? "—" : `${r.duration}s`}</td>
                <td>{r.content ? <><small>Content:</small> {r.content}</> : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : <div className="tp13-history-empty">No recorded communications in this channel.</div>}
      </div>
    </Modal>
  );
}
