import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, type CoachListRow, type Me, type RouteAssignment, type RouteCoachSeat, type RouteDetail, type RouteSettingsJson, type RouteShiftPreview, type RouteStageInput, type RouteStageRow, type Staff, type VehicleListRow } from "../../api";
import { confirmDialog, toast, toastError } from "../../components/ui/feedback";

// React port of the legacy route editor (public/js/routes-screenshot-v5.js editor(): render(), general(), citiesTab(),
// stopPanel(), fares(), cancellation(), expenses(), history()). Same DOM/classes so routes-screenshot-v5.css applies.
// Data is PostgreSQL only. Where legacy shows client-side preview values (fare groups with hard-coded day prices, simulated
// GPS halt evidence, localStorage-only edits) this port shows the persisted data instead and says what is not available.
const TABS: [string, string][] = [["general", "General"], ["cities", "Cities & Schedule"], ["update", "Update"], ["pickups", "Pickups"], ["drops", "Drops"], ["breaks", "Breaks"], ["fares", "Fares"], ["block", "Block"], ["cancellation", "Cancellation"], ["expenses", "Expenses"], ["history", "History"]];
const ICONS = {
  route: "M3 6l6 3 6-3 6 3v11l-6-3-6 3-6-3V6zm6 3v11m6-14v11", back: "m15 18-6-6 6-6", save: "M4 3h13l3 3v15H4V3zm3 0v6h10V3M7 21v-9h10v9",
  pin: "M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  metro: "M7 3h10a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM4 11h16M8 18l-2 3m10-3 2 3M8 14.5h.01M16 14.5h.01M9 7h6",
  phone: "M5 3h4l2 5-3 2a15 15 0 0 0 6 6l2-3 5 2v4c0 1.1-1 2-2 2A17 17 0 0 1 3 5c0-1 1-2 2-2z",
  star: "M12 2l3.1 6.3L22 9.3l-5 4.9 1.2 7-6.2-3.3-6.2 3.3 1.2-7L2 9.3l6.9-1z", plus: "M12 5v14M5 12h14",
  trash: "M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7m4-7v7", edit: "M12 20h9M16 4l4 4L9 19l-5 1 1-5L16 4z",
  tag: "M3 3h9l9 9-9 9-9-9V3zm5 4h.01", clock: "M12 6v6l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
} as const;
type IconKey = keyof typeof ICONS;
const I = ({ k, size = 18 }: { k: IconKey; size?: number }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth={1.85} strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[k]} /></svg>
);
const fmtTime = (x: string | null | undefined) => { const m = String(x ?? "").match(/^(\d\d?):(\d\d)/); return m ? `${((+m[1] + 11) % 12) + 1}:${m[2]} ${+m[1] >= 12 ? "PM" : "AM"}` : "—"; };
const money = (n: number) => `₹${(Number(n) || 0).toLocaleString("en-IN")}`;
const isMetro = (s: RouteStageRow) => s.pickupType === "Metro" || /free metro/i.test([s.name, s.address, s.landmark].join(" "));
const minusMin = (t: string | null, m: number) => { const x = String(t ?? "").match(/^(\d\d?):(\d\d)/); if (!x) return ""; const v = (+x[1] * 60 + +x[2] - m + 1440) % 1440; return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`; };
const metroText = (s: RouteStageRow) => s.metroDescription || `Avail Free Metro Pickup by showing your PNR. Drop @ ${s.exchangePoint || "the interchange Metro station"}${s.exchangeTime ? `, before ${fmtTime(minusMin(s.exchangeTime, 10))}` : ""} for Bus Pickup.`;
const OPS = ["owner", "admin", "ops"];
const OWN_BUTTONS = "Changes on this tab are saved with the buttons on the tab itself";
const NO_GPS = "Not available: no verified GPS halt observations are stored, so pins and times cannot be corrected from evidence";

type Via = { key: string; id: number | null; cityId: number; day: number; time: string };
const toVias = (r: RouteDetail): Via[] => r.stops.map((s) => ({ key: `s${s.id}`, id: s.id, cityId: s.cityId, day: s.day, time: String(s.time).slice(0, 5) }));
type StageForm = RouteStageInput & { id: number | null };
const blankStage = (kind: string, cityId: number, day = 1, time = ""): StageForm => ({ id: null, kind, cityId, name: "", address: null, landmark: null, contactNumber: null, lat: null, lng: null,
  day, time, prime: false, pickupType: null, exchangePoint: null, exchangeTime: null, metroDescription: null });
const stageForm = (s: RouteStageRow): StageForm => ({ id: s.id, kind: s.kind, cityId: s.cityId, name: s.name, address: s.address, landmark: s.landmark, contactNumber: s.contactNumber,
  lat: s.lat, lng: s.lng, day: s.day, time: String(s.time).slice(0, 5), prime: s.prime, pickupType: s.pickupType, exchangePoint: s.exchangePoint,
  exchangeTime: s.exchangeTime ? String(s.exchangeTime).slice(0, 5) : null, metroDescription: s.metroDescription });
const nz = (v: string) => (v.trim() === "" ? null : v);

function RvModal({ title, onClose, foot, children }: { title: string; onClose: () => void; foot: ReactNode; children: ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="rv-modal-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rv-modal" role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button type="button" aria-label="Close" onClick={onClose}>×</button></header>
        <section style={{ padding: 22, overflow: "auto" }}>{children}</section>
        <footer style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 22px", borderTop: "1px solid #e4e9f2" }}>{foot}</footer>
      </div>
    </div>
  );
}

/** Coach seat map (legacy busDeck): one panel per deck, seats placed by row/col/size. */
function SeatMap({ seats, chosen, blocked, onToggle }: { seats: RouteCoachSeat[]; chosen: Set<string>; blocked: Map<string, string>; onToggle?: (code: string) => void }) {
  const decks = [...new Set(seats.map((s) => s.deck))].sort((a, b) => (a === "LOWER" ? -1 : b === "LOWER" ? 1 : a.localeCompare(b)));
  if (!seats.length) return <div className="rv-emptydiagram">This coach has no seats configured.</div>;
  return (
    <div className="rv-coach-decks" data-testid="route-seatmap">
      {decks.map((d) => {
        const ds = seats.filter((s) => s.deck === d);
        const c0 = Math.min(...ds.map((s) => s.col)), r0 = Math.min(...ds.map((s) => s.row));
        const cols = Math.max(...ds.map((s) => s.col - c0 + Math.max(1, s.width))), rows = Math.max(...ds.map((s) => s.row - r0 + Math.max(1, s.length)));
        return (
          <div key={d} className="rv-deck">
            <header><span>{d === "LOWER" ? "Lower deck" : d === "UPPER" ? "Upper deck" : d}</span>{d === "LOWER" && <span className="rv-steering" aria-hidden="true">⎈</span>}</header>
            <div className="rv-seatgrid" style={{ ["--rv-cols" as string]: cols, ["--rv-rows" as string]: rows * 2 }}>
              {ds.map((s) => {
                const b = blocked.get(s.code), on = chosen.has(s.code);
                return (
                  <button key={s.code} type="button" data-seat={s.code} aria-pressed={on} disabled={!onToggle}
                    title={b ? `${s.code} · blocked: ${b}` : s.code} className={`rv-berth ${s.seatType === "sleeper" ? "sleeper" : ""} ${on ? "chosen" : ""}`}
                    style={{ gridColumn: `${s.col - c0 + 1} / span ${Math.max(1, s.width)}`, gridRow: `${(s.row - r0) * 2 + 1} / span ${Math.max(1, s.length) * 2}`,
                      ...(b && !on ? { background: "#324254", color: "#fff", borderStyle: "solid" } : {}) }}
                    onClick={() => onToggle?.(s.code)}>{s.code}</button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const Field = ({ label, value, type = "text", onChange, ...p }: { label: string; value: string | number | null | undefined; type?: string; onChange?: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) => (
  <label className="rv-field"><span>{label}</span>{onChange
    ? <input type={type} value={value ?? ""} onChange={(e) => onChange(e.currentTarget.value)} {...p} />
    : <input type={type} value={value ?? ""} disabled readOnly />}</label>
);
type Gen = { hub: string; rules: Record<string, string>; call: Record<string, boolean>; escalation: string; cabs: string; assignments: Required<Pick<RouteAssignment, "vehicle_id" | "crew" | "pickup_vans">>[]; tags: Record<string, string> };
const RULES: [string, string, string[], string?][] = [
  ["gents_next_to_ladies", "Allow Gents Next to Ladies", ["No", "Yes"]],
  ["ladies_next_to_gents", "Allow Ladies Next to Gents", ["No", "Yes"]],
  ["ladies_fill_doubles_first", "Ladies Fill Half-Booked Doubles First", ["Yes", "No"], "A lady travelling alone must take a free seat next to another lady before opening a new double. Stops ladies-only seats piling up."],
  ["seat_sharing", "Seat Sharing", ["City Based", "Disabled", "Full Journey"], "Seat is free for the next passenger as soon as the bus reaches the city."],
  ["boarding_check", "Boarding Check", ["Passenger OTP", "Manual Check"], "Drivers and conductors enter a passenger's 4-digit OTP to mark boarded. Managers can board without it."],
];
const CALLS: [string, string, boolean][] = [["cloud_calling", "Cloud Calling", true], ["number_masking", "Passenger Number Masking", true], ["direct_to_vehicle", "Direct to Vehicle", true], ["driver_gps", "Driver Mobile GPS", false]];
const CREW_ROLES = ["Driver", "Helper", "Conductor", "Attendant"];
const yn = (v: unknown, d: string) => (v === true ? "Yes" : v === false ? "No" : typeof v === "string" && v ? v : d);
const toGen = (s: RouteSettingsJson | null | undefined): Gen => {
  const br = s?.business_rules ?? {}, cs = (s?.call_settings ?? {}) as Record<string, unknown>;
  const rules: Record<string, string> = { allow_cancellation: yn(br.allow_cancellation, "Yes") };
  RULES.forEach(([k, , o]) => { rules[k] = yn(br[k], o[0]); });
  const call: Record<string, boolean> = {}; CALLS.forEach(([k, , d]) => { call[k] = typeof cs[k] === "boolean" ? (cs[k] as boolean) : d; });
  const a = (s?.assignments ?? []).slice(0, 2);
  while (a.length < 2) a.push({});
  const tags: Record<string, string> = Array.isArray(s?.tags) ? Object.fromEntries(s!.tags.map((t) => [t.name, t.value])) : { ...(s?.tags ?? {}) };
  return { hub: s?.hub ?? "", rules, call, escalation: s?.escalation_contacts ?? "", cabs: s?.cabs ?? "Off", tags,
    assignments: a.map((x) => ({ vehicle_id: x.vehicle_id ?? null, crew: x.crew?.length ? x.crew.map((c) => ({ ...c })) : [{ role: "Driver", staff_id: null }], pickup_vans: x.pickup_vans ?? [] })) };
};
const genPatch = (g: Gen, orig: RouteSettingsJson | null | undefined) => ({
  hub: g.hub.trim() || null, escalation_contacts: g.escalation.trim() || null, cabs: g.cabs, tags: g.tags,
  business_rules: { ...(orig?.business_rules ?? {}), ...g.rules },
  call_settings: { ...((orig?.call_settings ?? {}) as Record<string, unknown>), ...g.call },
  assignments: g.assignments.map((a) => ({ ...a, crew: a.crew.filter((c) => c.staff_id || c.name) })),
});
type Settings = { name: string; altName: string; maxSeatsPerTicket: number; updateCutoffMinutes: number; partialCancellationAllowed: boolean; distanceKm: string; gen: Gen;
  departureTime: string; arrivalTime: string; arrivalDay: number; startDate: string; endDate: string; refundSlabs: RouteDetail["refundSlabs"] };
const hhmm = (t: string | null | undefined) => String(t ?? "").slice(0, 5);
const toSettings = (r: RouteDetail): Settings => ({
  name: r.name, altName: r.altName ?? "", maxSeatsPerTicket: r.maxSeatsPerTicket, updateCutoffMinutes: r.updateCutoffMinutes, partialCancellationAllowed: r.partialCancellationAllowed,
  distanceKm: r.distanceKm == null ? "" : String(r.distanceKm), gen: toGen(r.settings),
  departureTime: hhmm(r.departureTime), arrivalTime: hhmm(r.arrivalTime), arrivalDay: r.arrivalDay ?? 1, startDate: r.startDate ?? "", endDate: r.endDate ?? "", refundSlabs: r.refundSlabs,
});
const Region = ({ title, children, cls = "" }: { title?: ReactNode; children: ReactNode; cls?: string }) => (
  <section className={`rv-region ${cls}`}>{title && <h3>{title}</h3>}{children}</section>
);
const Btn = ({ children, cls = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { cls?: string }) => <button type="button" className={`rv-btn ${cls}`} {...p}>{children}</button>;

export function RouteEditorPage({ me, id }: { me: Me; id: number }) {
  const q = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  const canOperate = OPS.includes(me.role);
  const mode = q.get("rvmode") === "edit" && canOperate ? "edit" : "view";
  const initialTab = TABS.some(([t]) => t === q.get("rvtab")) ? q.get("rvtab")! : "general";
  const [tab, setTab] = useState(mode === "view" && initialTab === "update" ? "general" : initialTab);
  const [route, setRoute] = useState<RouteDetail>();
  const [error, setError] = useState<string>();
  const [stopCity, setStopCity] = useState<string>();
  const [haltDays, setHaltDays] = useState(15);
  const [fares, setFares] = useState<RouteDetail["fares"]>([]);
  const [expenses, setExpenses] = useState<RouteDetail["expenses"]>([]);
  const [st, setSt] = useState<Settings>();
  const [coachId, setCoachId] = useState<number>(0);
  const [vias, setVias] = useState<Via[]>([]);
  const [coaches, setCoaches] = useState<CoachListRow[]>([]);
  const [cityCatalog, setCityCatalog] = useState<{ id: number; name: string; state: string | null }[]>([]);
  const [stageEdit, setStageEdit] = useState<StageForm>();
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [blk, setBlk] = useState<{ id: number | null; reason: string; fromDate: string; toDate: string; autoReleaseHours: string }>({ id: null, reason: "", fromDate: "", toDate: "", autoReleaseHours: "" });
  const [shift, setShift] = useState<{ direction: "delay" | "advance"; hours: number; minutes: number }>({ direction: "delay", hours: 0, minutes: 15 });
  const [preview, setPreview] = useState<{ key: string; data: RouteShiftPreview }>();
  const [vehicles, setVehicles] = useState<VehicleListRow[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [tagIn, setTagIn] = useState({ name: "", value: "" });
  const [vanAdd, setVanAdd] = useState<{ i: number; label: string }>();
  const upd = <K extends keyof Settings>(k: K, v: Settings[K]) => setSt((s) => (s ? { ...s, [k]: v } : s));
  const updGen = (f: (g: Gen) => Gen) => setSt((s) => (s ? { ...s, gen: f(s.gen) } : s));

  const load = useCallback(async (live: () => boolean = () => true) => {
    try { const r = await api.routeDetail(id); if (!live()) return; setRoute(r); setFares(r.fares); setExpenses(r.expenses); setSt(toSettings(r)); setCoachId(r.coachTemplateId); setVias(toVias(r)); setError(undefined); }
    catch (e) { if (live()) setError(e instanceof Error ? e.message : String(e)); }
  }, [id]);
  // Only the live effect applies its result: a stale response (StrictMode double effect, fast id change) must not overwrite edits in progress.
  useEffect(() => { let alive = true; void load(() => alive); return () => { alive = false; }; }, [load]);
  useEffect(() => {
    api.vehicleList().then((x) => setVehicles(x.vehicles)).catch(() => setVehicles([]));
    api.staff().then(setStaff).catch(() => setStaff([]));
  }, []);
  useEffect(() => {
    if (mode !== "edit") return;
    api.coachList().then((x) => setCoaches(x.coaches)).catch(toastError);
    api.cityList().then((x) => setCityCatalog(x.cities)).catch(toastError);
  }, [mode]);

  const pick = (t: string) => {
    setTab(t); setStopCity(undefined);
    q.set("rvtab", t); window.history.replaceState(null, "", `#/gds/routes/${id}?${q.toString()}`);
  };
  const viasDirty = !!route && JSON.stringify(vias.map(({ key: _k, ...v }) => v)) !== JSON.stringify(toVias(route).map(({ key: _k, ...v }) => v));
  const dirty = !!route && (JSON.stringify(fares) !== JSON.stringify(route.fares) || JSON.stringify(expenses) !== JSON.stringify(route.expenses) || JSON.stringify(st) !== JSON.stringify(toSettings(route))
    || coachId !== route.coachTemplateId || viasDirty);
  const cancel = async () => { if (dirty && !(await confirmDialog("Discard unsaved changes?", { ok: "Discard", danger: true }))) return; window.location.hash = "#/gds/routes"; };
  const save = async () => {
    if (!route || !st) return;
    try {
      if (tab === "general") {
        if (!st.name.trim()) return toast("Name is required", "warn");
        if (!st.gen.hub.trim()) return toast("Hub is required", "warn");
        const km = st.distanceKm.trim() === "" ? null : Number(st.distanceKm);
        if (km != null && !(km >= 0 && km <= 10000)) return toast("KMs must be between 0 and 10000", "warn");
        if (coachId !== route.coachTemplateId) {
          const name = coaches.find((c) => c.id === coachId)?.name ?? `coach ${coachId}`;
          if (!(await confirmDialog(`Change the coach of every upcoming departure to ${name}? Sold, held and blocked seats move to the same seat number in the new layout.`, { ok: "Change coach" }))) return;
          const r = await api.changeRouteCoach(id, coachId);
          toast(`Coach changed to ${r.coach ?? name}${r.remappedSeats ? ` · ${r.remappedSeats} seat allocation(s) moved` : ""}`, "ok");
        }
        await api.saveRouteSettings(id, { name: st.name.trim(), altName: st.altName.trim(), distanceKm: km, settings: genPatch(st.gen, route.settings) });
        toast("Route saved", "ok");
      } else if (tab === "cities") {
        if (!st.startDate) return toast("Complete the mandatory fields", "warn");
        if (st.endDate && st.endDate < st.startDate) return toast("End date is before start date", "warn");
        if (viasDirty) {
          if (vias.length < 2) return toast("A route needs an origin and a destination", "warn");
          if (vias.some((v) => !v.cityId || !v.time)) return toast("Choose a city and time for every row", "warn");
          if (new Set(vias.map((v) => v.cityId)).size !== vias.length) return toast("A city can appear only once on a route", "warn");
          const r = await api.saveRouteStops(id, vias.map(({ id: sid, cityId, day, time }) => ({ id: sid, cityId, day, time })));
          toast(`Cities saved${r.added ? ` · ${r.added} added` : ""}${r.removed ? ` · ${r.removed} removed` : ""}`, "ok");
          if (r.pairsWithoutFare.length) toast(`${r.pairsWithoutFare.length} city pair(s) have no fare and are not on sale (e.g. ${r.pairsWithoutFare.slice(0, 3).map((p) => `${p.from} → ${p.to}`).join(", ")}). Add them on the Fares tab.`, "warn");
          await api.saveRouteSettings(id, { startDate: st.startDate, ...(st.endDate ? { endDate: st.endDate } : {}) });
        } else {
          if (!st.departureTime) return toast("Complete the mandatory fields", "warn");
          await api.saveRouteSettings(id, { departureTime: st.departureTime, ...(st.arrivalTime ? { arrivalTime: st.arrivalTime } : {}), arrivalDay: st.arrivalDay, startDate: st.startDate, ...(st.endDate ? { endDate: st.endDate } : {}) });
          toast("Route saved", "ok");
        }
      } else if (tab === "cancellation") {
        if (st.refundSlabs.some((s) => !(s.hoursBefore >= 0) || !(s.refundPercent >= 0 && s.refundPercent <= 100))) return toast("Hours must be zero or more and refund 0-100%", "warn");
        if (new Set(st.refundSlabs.map((s) => s.hoursBefore)).size !== st.refundSlabs.length) return toast("Each slab needs different hours", "warn");
        if (!(st.maxSeatsPerTicket >= 1)) return toast("Max seats per ticket must be at least 1", "warn");
        if (!(st.updateCutoffMinutes >= 0)) return toast("Update cut-off must be zero or more", "warn");
        await api.saveRouteSettings(id, { refundSlabs: st.refundSlabs, maxSeatsPerTicket: st.maxSeatsPerTicket, updateCutoffMinutes: st.updateCutoffMinutes, partialCancellationAllowed: st.partialCancellationAllowed,
          settings: { business_rules: { ...(route.settings?.business_rules ?? {}), allow_cancellation: st.gen.rules.allow_cancellation } } });
        toast("Cancellation policy saved", "ok");
      } else if (tab === "fares") {
        if (fares.some((f) => [f.seater, f.sleeperLower, f.sleeperUpper].some((v) => !(v >= 0)))) return toast("Fares must be zero or more", "warn");
        await api.saveFares(id, fares.map(({ fromSequence, toSequence, seater, sleeperLower, sleeperUpper }) => ({ fromSequence, toSequence, seater, sleeperLower, sleeperUpper })));
        toast("Fares saved", "ok");
      } else if (tab === "expenses") {
        if (expenses.some((e) => !e.label.trim() || !(e.perTrip >= 0))) return toast("Every expense needs a label and an amount of zero or more", "warn");
        await api.saveExpenseTemplate(id, expenses.map((e) => ({ type: e.type, key: e.key || null, label: e.label.trim(), perTrip: e.perTrip })));
        toast("Expenses saved", "ok");
      } else return toast(OWN_BUTTONS, "warn");
      await load();
    } catch (e) { toastError(e); }
  };

  const run = async (f: () => Promise<void>) => { if (busy) return; setBusy(true); try { await f(); } catch (e) { toastError(e); } finally { setBusy(false); } };
  const saveStage = () => run(async () => {
    const f = stageEdit; if (!f) return;
    if (!f.name.trim()) return toast("Point name is required", "warn");
    if (!f.time) return toast("Time is required", "warn");
    if ((f.lat == null) !== (f.lng == null)) return toast("Enter both latitude and longitude, or neither", "warn");
    const { id: sid, ...body } = f;
    await api.saveRouteStage(id, sid, { ...body, name: body.name.trim() });
    toast(sid == null ? "Point added" : "Point saved", "ok");
    setStageEdit(undefined); await load();
  });
  const deleteStage = (s: RouteStageRow) => run(async () => {
    if (!(await confirmDialog(`Delete ${s.name}? Points used by bookings cannot be deleted.`, { ok: "Delete", danger: true }))) return;
    await api.deleteRouteStage(id, s.id); toast("Point deleted", "ok"); await load();
  });
  const saveBlock = () => run(async () => {
    if (!sel.size) return toast("Choose at least one seat on the seat map", "warn");
    if (blk.fromDate && blk.toDate && blk.toDate < blk.fromDate) return toast("To date is before from date", "warn");
    const hours = blk.autoReleaseHours === "" ? null : Number(blk.autoReleaseHours);
    if (hours != null && !(hours >= 0 && hours <= 168)) return toast("Auto-release must be 0-168 hours", "warn");
    const r = await api.saveRouteSeatBlock(id, blk.id, { seats: [...sel], reason: nz(blk.reason), fromDate: nz(blk.fromDate), toDate: nz(blk.toDate), autoReleaseHours: hours });
    toast(`Block saved · ${r.result.seatsBlocked} seat(s) blocked on ${r.result.departures} departure(s)${r.result.seatsReleased ? ` · ${r.result.seatsReleased} released` : ""}`, "ok");
    if (r.result.skipped.length) toast(`Already sold or held, not blocked: ${r.result.skipped.slice(0, 6).join(", ")}${r.result.skipped.length > 6 ? " …" : ""}`, "warn");
    setSel(new Set()); setBlk({ id: null, reason: "", fromDate: "", toDate: "", autoReleaseHours: "" }); await load();
  });
  const deleteBlock = (b: RouteDetail["seatBlocks"][number]) => run(async () => {
    if (!(await confirmDialog(`Release standing block "${b.reason}" (${b.seats.join(", ")}) on all upcoming departures?`, { ok: "Release", danger: true }))) return;
    const r = await api.deleteRouteSeatBlock(id, b.id);
    toast(`Block removed · ${r.result.seatsReleased} seat(s) released`, "ok");
    if (blk.id === b.id) { setSel(new Set()); setBlk({ id: null, reason: "", fromDate: "", toDate: "", autoReleaseHours: "" }); }
    await load();
  });
  const shiftKey = `${shift.direction}:${shift.hours}:${shift.minutes}`;
  const previewShift = () => run(async () => {
    if (!(shift.hours >= 0) || !(shift.minutes >= 0 && shift.minutes <= 59) || shift.hours * 60 + shift.minutes === 0) return toast("Enter hours and minutes (0-59) to shift", "warn");
    setPreview({ key: shiftKey, data: await api.shiftRouteTime(id, { ...shift, dryRun: true }) });
  });
  const applyShift = () => run(async () => {
    if (!preview || preview.key !== shiftKey) return toast("Preview the change first", "warn");
    const p = preview.data;
    if (!(await confirmDialog(`${shift.direction === "delay" ? "Delay" : "Advance"} the whole timetable by ${shift.hours}h ${shift.minutes}m on ${p.departures} upcoming departure(s)${p.passengers ? `, affecting ${p.passengers} booked passenger(s)` : ""}?`, { ok: "Apply", danger: p.passengers > 0 }))) return;
    await api.shiftRouteTime(id, { ...shift, dryRun: false });
    toast(`Timetable shifted${p.passengers ? ` · notify ${p.passengers} passenger(s) from Schedules → Notify` : ""}`, "ok");
    setPreview(undefined); await load();
  });

  if (error) return <div className="rv-root rv-editor"><div className="rv-empty" role="alert">Could not load route: {error}</div></div>;
  if (!route || !st) return <div className="rv-root rv-editor"><div className="rv-empty">Loading…</div></div>;

  const savable = ["general", "cities", "cancellation", "fares", "expenses"].includes(tab);
  const stops = (kind: string) => route.stages.filter((s) => s.kind === kind);
  const stopPanel = (kind: "pickup" | "drop" | "break") => {
    const arr = stops(kind), heading = { pickup: "Pickup Points", drop: "Drop Points", break: "Break Points" }[kind];
    const lastSeq = Math.max(...route.stops.map((s) => s.sequence)), firstSeq = Math.min(...route.stops.map((s) => s.sequence));
    const eligible = route.stops.filter((s) => !(kind === "pickup" && s.sequence === lastSeq) && !(kind === "drop" && s.sequence === firstSeq));
    const cities = [...new Set([...arr.map((s) => s.city ?? "Other"), ...(mode === "edit" ? eligible.map((s) => s.city ?? "Other") : [])])]; if (!cities.length) cities.push("All");
    const active = stopCity && cities.includes(stopCity) ? stopCity : cities[0];
    const filtered = arr.filter((s) => (s.city ?? "Other") === active);
    const activeStop = eligible.find((s) => (s.city ?? "Other") === active) ?? eligible[0];
    return (
      <>
        <div className="rv-stopheader"><h2>{heading}</h2>{mode === "edit" && activeStop && <Btn cls="sky" data-rv="add-point" onClick={() => setStageEdit(blankStage(kind, activeStop.cityId, activeStop.day, String(activeStop.time).slice(0, 5)))}><I k="plus" size={17} /> Add {kind === "break" ? "break" : `${kind} point`}</Btn>}</div>
        <div className="rv-haltbar"><div><b>Where the bus really halts.</b> {arr.length} {kind} point{arr.length === 1 ? "" : "s"} configured. A pin within 50 m and a time within 10 min are fine. <small>No GPS halt evidence is stored by the modern backend.</small></div>
          <label>Last <select data-rv-ignore data-rv-days value={haltDays} onChange={(e) => setHaltDays(Number(e.currentTarget.value))}><option value="15">15 days</option><option value="7">7 days</option><option value="30">30 days</option></select></label>
          {mode === "edit" && <Btn cls="success" data-rv="halt-fix-all" aria-disabled="true" title={NO_GPS} onClick={() => toast(NO_GPS, "warn")}>Fix all</Btn>}</div>
        <div className="rv-citytabs">{cities.map((c) => <button key={c} type="button" className={c === active ? "chosen" : ""} data-rv-stopcity={c} onClick={() => setStopCity(c)}>{c} <span>{arr.filter((s) => (s.city ?? "Other") === c).length}</span></button>)}</div>
        <div className="rv-stopgrid">
          {filtered.length ? filtered.map((s, i) => (
            <article key={s.id} className="rv-stopcard">
              <div className="rv-stoptime">{fmtTime(s.time)}{s.day > 1 && <small>DAY {s.day}</small>}</div>
              <div className="rv-stopinfo">
                <h3><span className="rv-circleindex">{i + 1}</span> {s.name} </h3>
                {isMetro(s) ? <><span className="rv-badge metro"><I k="metro" size={14} /> Free metro Pickup</span><p className="rv-metro-desc">{metroText(s)}</p></> : <p>{s.address || s.landmark || "Address not recorded"}</p>}
                {s.landmark && s.address && <small>{s.landmark}</small>}
                {s.contactNumber && <div className="rv-contact"><I k="phone" size={14} /> {s.contactNumber}</div>}
                {s.lat != null && s.lng != null
                  ? <a className="rv-coord" target="_blank" rel="noopener noreferrer" href={`https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lng}#map=16/${s.lat}/${s.lng}`} title="Open in map"><I k="pin" size={16} /><span>{s.lat}, {s.lng}</span></a>
                  : <span className="rv-badge muted">Pin not set</span>}
              </div>
              <div className="rv-haltevidence rv-nodata"><span>Not enough verified trips to assess this pin or time.</span></div>
              {mode === "edit" && <div className="rv-right" style={{ marginTop: 8 }}>
                <Btn cls="icon" aria-label={`Edit ${s.name}`} disabled={busy} onClick={() => setStageEdit(stageForm(s))}><I k="edit" size={16} /></Btn>
                <Btn cls="icon danger" aria-label={`Delete ${s.name}`} disabled={busy} onClick={() => deleteStage(s)}><I k="trash" size={16} /></Btn></div>}
              {s.prime && <span className="rv-chip ok" title="Default point for this city"><I k="star" size={12} /> Prime</span>}
            </article>
          )) : <div className="rv-empty">No points in this city yet.</div>}
        </div>
      </>
    );
  };

  const ro = mode === "view";
  const ed = <K extends keyof Settings>(k: K, conv: (v: string) => Settings[K] = (v) => v as Settings[K]) => (ro ? undefined : (v: string) => upd(k, conv(v)));
  const body = (() => {
    switch (tab) {
      case "general": return (
        <>
          <div className="rv-two rv-general">
            <Field label="Service No. *" value={route.serviceNumber} /><Field label="Name*" value={st.name} onChange={ed("name")} /><Field label="Alt Name / Nickname" value={ro ? route.altName : st.altName} onChange={ed("altName")} />
            {ro ? <Field label="Coach*" value={route.coach ? `${route.coach.name} · ${route.coach.capacity} seats` : "Coach not assigned"} />
              : <label className="rv-field"><span>Coach*</span><select data-rv="coach" value={coachId} onChange={(e) => setCoachId(Number(e.currentTarget.value))}>
                {!coaches.some((c) => c.id === route.coachTemplateId) && <option value={route.coachTemplateId}>{route.coach?.name ?? `Coach ${route.coachTemplateId}`}</option>}
                {coaches.filter((c) => c.status === "active" || c.id === route.coachTemplateId).map((c) => <option key={c.id} value={c.id}>{c.name} · {c.capacity} seats{c.pattern ? ` · ${c.pattern}` : ""}</option>)}</select></label>}
            <Field label="Hub*" value={st.gen.hub} onChange={ro ? undefined : (v) => updGen((g) => ({ ...g, hub: v }))} /><Field label="KMs" type="number" min={0} value={st.distanceKm} onChange={ed("distanceKm")} />
            <Field label="Total Seats" value={route.coach?.capacity} type="number" /><Field label="Total Sleeper" value={route.coach?.sleepers} type="number" /><Field label="Total Seater" value={route.coach?.seaters} type="number" />
            {RULES.map(([k, label, opts, help]) => (
              <div key={k}><label className="rv-field"><span>{label}</span><select data-rv-rule={k} disabled={ro} value={st.gen.rules[k]} onChange={(e) => { const v = e.currentTarget.value; updGen((g) => ({ ...g, rules: { ...g.rules, [k]: v } })); }}>
                {opts.map((o) => <option key={o}>{o}</option>)}</select></label>{help && <p className="rv-help">{help}</p>}</div>
            ))}
          </div>
          <div className="rv-ruleline"><h3>Call Routing</h3><div className="rv-two rv-callrouting">
            {CALLS.map(([k, label]) => (
              <div key={k} className="rv-toggle-row"><span>{label}</span><label className="rv-switch"><input type="checkbox" aria-label={label} disabled={ro} checked={st.gen.call[k]} onChange={(e) => { const v = e.currentTarget.checked; updGen((g) => ({ ...g, call: { ...g.call, [k]: v } })); }} /><span /></label></div>
            ))}
            <Field label="Escalation Contacts" value={st.gen.escalation} onChange={ro ? undefined : (v) => updGen((g) => ({ ...g, escalation: v }))} />
          </div></div>
          <div className="rv-ruleline rv-cabs"><div><h3>Autos &amp; Cabs</h3><p>Pickups: a ride to the boarding point. Drops: a ride from the drop point. Booked from the passenger's tracking link.</p></div>
            <div className="rv-segment">{["Off", "Pickups", "Drops", "Both"].map((c) => <button key={c} type="button" disabled={ro} className={st.gen.cabs === c ? "selected" : ""} onClick={() => updGen((g) => ({ ...g, cabs: c }))}>{c}</button>)}</div></div>
          <Region title="Staff & Vehicle Assignment">
            <p className="rv-subtext">The two assignments alternate every trip, on the days this route runs.</p>
            <div className="rv-two rv-crew-wrap">{st.gen.assignments.map((a, ai) => {
              const setA = (p: Partial<Gen["assignments"][number]>) => updGen((g) => ({ ...g, assignments: g.assignments.map((x, j) => (j === ai ? { ...x, ...p } : x)) }));
              const day = new Date(Date.now() + ai * 86400000).toLocaleDateString("en-GB", { weekday: "short", month: "short", day: "2-digit", year: "numeric" }).toUpperCase();
              const v = vehicles.find((x) => x.id === a.vehicle_id);
              return (
                <section key={ai} className={`rv-crew-panel ${ai ? "green" : "blue"}`}>
                  <p className="rv-crew-kicker">{ai ? "NEXT TRIP" : "THIS TRIP"} · {day}</p>
                  <div className="rv-crew-inner">
                    <label className="rv-field"><span>Vehicle</span><select disabled={ro} aria-label={`Vehicle ${ai + 1}`} value={a.vehicle_id ?? ""} onChange={(e) => setA({ vehicle_id: e.currentTarget.value ? Number(e.currentTarget.value) : null })}>
                      <option value="">Select vehicle</option>{a.vehicle_id && !v && <option value={a.vehicle_id}>Vehicle {a.vehicle_id}</option>}
                      {vehicles.map((x) => <option key={x.id} value={x.id}>{x.registrationNumber}</option>)}</select></label>
                    <div className="rv-vehicle-place"><I k="pin" size={15} /> <span>Vehicle location not connected · {v?.position?.ts ? "GPS update available" : "No verified update"}</span></div>
                    <div className="rv-crew-rows">{a.crew.map((c, ci) => {
                      const setC = (p: Partial<typeof c>) => setA({ crew: a.crew.map((x, j) => (j === ci ? { ...x, ...p } : x)) });
                      const s = staff.find((x) => x.id === c.staff_id);
                      return (
                        <div key={ci} className="rv-staffrow">
                          <select disabled={ro} aria-label="Role" value={c.role} onChange={(e) => setC({ role: e.currentTarget.value })}>{CREW_ROLES.map((r) => <option key={r}>{r}</option>)}</select>
                          <select disabled={ro} aria-label="Staff" value={c.staff_id ?? ""} onChange={(e) => { const sid = e.currentTarget.value ? Number(e.currentTarget.value) : null; const x = staff.find((y) => y.id === sid); setC({ staff_id: sid, name: x?.name, phone: x?.phone }); }}>
                            <option value="">Select staff</option>{c.staff_id && !s && <option value={c.staff_id}>{c.name ?? `Staff ${c.staff_id}`}</option>}
                            {staff.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
                          <input aria-label="Phone" value={s?.phone ?? c.phone ?? ""} disabled readOnly placeholder="Phone" />
                          {ci > 0 && !ro && <Btn cls="icon danger" aria-label="Remove staff" onClick={() => setA({ crew: a.crew.filter((_, j) => j !== ci) })}><I k="trash" size={16} /></Btn>}
                        </div>
                      );
                    })}</div>
                    <Btn cls="link" disabled={ro || a.crew.length >= 8} onClick={() => setA({ crew: [...a.crew, { role: "Helper", staff_id: null }] })}><I k="plus" size={15} /> Add Staff</Btn>
                    <div className="rv-van-title">PICKUP VANS</div>
                    {a.pickup_vans.map((pv, pi) => (
                      <div key={pi} className="rv-vanitem">{pv.label || pv.name || "Pickup Van"} <Btn cls="danger" aria-label="Remove pickup van" disabled={ro} onClick={() => setA({ pickup_vans: a.pickup_vans.filter((_, j) => j !== pi) })}><I k="trash" size={13} /></Btn></div>
                    ))}
                    <Btn cls="link" disabled={ro || a.pickup_vans.length >= 10} onClick={() => setVanAdd({ i: ai, label: "" })}><I k="plus" size={15} /> Add Pickup Van</Btn>
                  </div>
                </section>
              );
            })}</div>
          </Region>
          <Region title={<><I k="tag" size={17} /> Tags</>} cls="rv-tags-panel">
            <p className="rv-muted">{Object.keys(st.gen.tags).length ? "" : "No tags"}</p>
            <div className="rv-tags">{Object.entries(st.gen.tags).map(([n, v]) => (
              <span key={n}>{n} = {v} {!ro && <Btn cls="tiny" aria-label={`Remove tag ${n}`} onClick={() => updGen((g) => { const t = { ...g.tags }; delete t[n]; return { ...g, tags: t }; })}>×</Btn>}</span>
            ))}</div>
            <div className="rv-inline-add">
              <input placeholder="Name, e.g. corridor" disabled={ro} value={tagIn.name} onChange={(e) => { const v = e.currentTarget.value; setTagIn((t) => ({ ...t, name: v })); }} /><b>=</b>
              <input placeholder="Value, e.g. mumbai" disabled={ro} value={tagIn.value} onChange={(e) => { const v = e.currentTarget.value; setTagIn((t) => ({ ...t, value: v })); }} />
              <Btn cls="primary" disabled={ro} onClick={() => {
                const n = tagIn.name.trim().toLowerCase(), v = tagIn.value.trim().toLowerCase();
                if (!n || !v) return toast("Enter a tag name and value", "warn");
                if (Object.keys(st.gen.tags).length >= 30 && !(n in st.gen.tags)) return toast("At most 30 tags", "warn");
                updGen((g) => ({ ...g, tags: { ...g.tags, [n]: v } })); setTagIn({ name: "", value: "" });
              }}><I k="plus" size={16} /> Add</Btn></div>
            <p className="rv-help">Labels like corridor = mumbai. A branch or a person set to “routes with this tag” covers this route automatically.</p>
          </Region>
          {mode === "edit" && coachId !== route.coachTemplateId && <p className="rv-notice">Changing the coach moves every sold, held and blocked seat on upcoming departures to the same seat number in the new layout. It is refused if a seat number does not exist there or a bus with a different layout is assigned.</p>}
        </>
      );
      case "cities": return (
        <>
          <div className="rv-two rv-timings">
            <div><h3>Origin Departure Time*</h3><div className="rv-time-entry"><Field label="Day" value={1} type="number" />{ro ? <Field label="Time" value={fmtTime(route.departureTime)} /> : <Field label="Time" type="time" value={st.departureTime} onChange={ed("departureTime")} />}</div></div>
            <div><h3>Destination Arrival Time*</h3><div className="rv-time-entry">{ro ? <><Field label="Day" value={route.arrivalDay} type="number" /><Field label="Time" value={fmtTime(route.arrivalTime)} /></>
              : <><Field label="Day" value={st.arrivalDay} type="number" min={1} max={7} onChange={ed("arrivalDay", Number)} /><Field label="Time" type="time" value={st.arrivalTime} onChange={ed("arrivalTime")} /></>}</div></div>
          </div>
          <Region title="Cities" cls="rv-vias">
            {ro ? <div className="rv-scroll"><table className="rv-table rv-via"><thead><tr><th>#</th><th>State</th><th>City</th><th>Lat</th><th>Lng</th><th>Day</th><th>Time</th></tr></thead>
              <tbody>{route.stops.map((s) => <tr key={s.sequence}><td>{s.sequence + 1}</td><td>{s.state ?? "—"}</td><td>{s.city}</td><td>{s.lat ?? "—"}</td><td>{s.lng ?? "—"}</td><td>D{s.day}</td><td>{fmtTime(s.time)}</td></tr>)}</tbody></table></div>
              : <>
                <div className="rv-scroll"><table className="rv-table rv-via" data-testid="route-vias"><thead><tr><th>#</th><th>City</th><th>State</th><th>Day</th><th>Time</th><th /></tr></thead>
                  <tbody>{vias.map((v, i) => {
                    const set = (p: Partial<Via>) => setVias((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));
                    const cat = cityCatalog.find((c) => c.id === v.cityId), old = route.stops.find((s) => s.cityId === v.cityId);
                    const known = { name: cat?.name ?? old?.city ?? String(v.cityId), state: cat?.state ?? old?.state ?? null };
                    return (
                      <tr key={v.key}>
                        <td>{i + 1}</td>
                        <td>{v.id != null ? <b>{known.name}</b>
                          : <select aria-label={`City ${i + 1}`} value={v.cityId || ""} onChange={(e) => set({ cityId: Number(e.currentTarget.value) })}>
                            <option value="">Choose city…</option>
                            {cityCatalog.filter((c) => c.id === v.cityId || !vias.some((x) => x.cityId === c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}{c.state ? `, ${c.state}` : ""}</option>)}</select>}</td>
                        <td>{v.cityId ? known.state ?? "—" : "—"}</td>
                        <td><input aria-label={`Day ${i + 1}`} type="number" min={1} max={7} value={v.day} disabled={i === 0} style={{ width: 70 }} onChange={(e) => set({ day: e.currentTarget.valueAsNumber || 1 })} /></td>
                        <td><input aria-label={`Time ${i + 1}`} type="time" value={v.time} onChange={(e) => set({ time: e.currentTarget.value })} /></td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <Btn cls="icon" aria-label={`Insert city after ${i + 1}`} disabled={i === vias.length - 1} title="Insert a city after this one"
                            onClick={() => setVias((xs) => [...xs.slice(0, i + 1), { key: `n${Date.now()}`, id: null, cityId: 0, day: xs[i].day, time: "" }, ...xs.slice(i + 1)])}><I k="plus" size={16} /></Btn>
                          <Btn cls="icon danger" aria-label={`Remove city ${i + 1}`} disabled={vias.length <= 2} onClick={() => setVias((xs) => xs.filter((_, j) => j !== i))}><I k="trash" size={16} /></Btn>
                        </td>
                      </tr>
                    );
                  })}</tbody></table></div>
                <p className="rv-help">Insert cities between existing ones and edit their day and time; stored bookings, holds, blocks and fares move with their cities. Cities already on the route cannot be reordered, and a city with points or sales cannot be removed. New city pairs go on sale once their fares are entered on the Fares tab.{viasDirty && " Saving the city list also sets the origin departure and destination arrival from the first and last rows."}</p>
              </>}
          </Region>
          <div className="rv-two rv-dates"><Field label="Start Date*" value={st.startDate} type="date" onChange={ed("startDate")} /><Field label="End Date" value={st.endDate} type="date" onChange={ed("endDate")} /></div>
        </>
      );
      case "update": return (
        <>
          <h2>Update Timings</h2>
          <p className="rv-subtext">Shift the whole timetable — origin departure, every city and every pickup, drop and break — for all departures that have not left yet. Sold tickets keep their PNR and seats.</p>
          <div className="rv-two" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            <label className="rv-field"><span>Direction</span><select data-rv="shift-direction" value={shift.direction} onChange={(e) => setShift((s) => ({ ...s, direction: e.currentTarget.value as "delay" | "advance" }))}><option value="delay">Delay (later)</option><option value="advance">Advance (earlier)</option></select></label>
            <Field label="Hours" type="number" min={0} max={12} value={shift.hours} onChange={(v) => setShift((s) => ({ ...s, hours: Number(v) || 0 }))} />
            <Field label="Minutes" type="number" min={0} max={59} value={shift.minutes} onChange={(v) => setShift((s) => ({ ...s, minutes: Number(v) || 0 }))} />
          </div>
          <div className="rv-right">
            <Btn data-rv="shift-preview" disabled={busy} onClick={previewShift}><I k="clock" size={16} /> Preview</Btn>
            <Btn cls="primary" data-rv="shift-apply" disabled={busy || !preview || preview.key !== shiftKey} onClick={applyShift}>Apply to timetable</Btn>
          </div>
          {preview && preview.key === shiftKey && (
            <Region title={`Preview · ${preview.data.deltaMinutes > 0 ? "+" : "−"}${Math.abs(preview.data.deltaMinutes)} min`} cls="rv-shift-preview">
              <p className="rv-subtext" data-testid="shift-impact">{preview.data.departures} upcoming departure(s) · {preview.data.bookings} booking(s) · {preview.data.passengers} passenger(s) to notify</p>
              <div className="rv-cards2">
                <div className="rv-scroll"><table className="rv-table"><thead><tr><th>City</th><th>Now</th><th>After</th></tr></thead>
                  <tbody>{preview.data.cities.map((c, i) => <tr key={i}><td>{c.city}</td><td>{c.before}</td><td><b>{c.after}</b></td></tr>)}</tbody></table></div>
                <div className="rv-scroll"><table className="rv-table"><thead><tr><th>Point</th><th>Now</th><th>After</th></tr></thead>
                  <tbody>{preview.data.points.length ? preview.data.points.map((c, i) => <tr key={i}><td>{c.name} <small>{c.kind}</small></td><td>{c.before}</td><td><b>{c.after}</b></td></tr>) : <tr><td colSpan={3}>No points.</td></tr>}</tbody></table></div>
              </div>
            </Region>
          )}
        </>
      );
      case "pickups": return stopPanel("pickup");
      case "drops": return stopPanel("drop");
      case "breaks": return stopPanel("break");
      case "fares": return (
        <>
          <div className="rv-between rv-seat-pricing"><h2>Seat Pricing</h2></div>
          <p className="rv-subtext">Fares per city pair as stored for this route. Changes publish to OTAs for upcoming trips.</p>
          <div className="rv-scroll"><table className="rv-table rv-faretable" data-testid="route-fares"><thead><tr><th>FROM</th><th>TO</th><th>SEATER ₹</th><th>SLEEPER LOWER ₹</th><th>SLEEPER UPPER ₹</th></tr></thead>
            <tbody>{fares.map((f, i) => (
              <tr key={`${f.fromSequence}-${f.toSequence}`}><td>{f.from}</td><td>{f.to}</td>
                {(["seater", "sleeperLower", "sleeperUpper"] as const).map((k) => (
                  <td key={k}><input className="rv-dayfare" type="number" min={0} step={1} aria-label={`${f.from} to ${f.to} ${k}`} value={f[k]} disabled={ro}
                    onChange={(e) => { const v = e.currentTarget.valueAsNumber; setFares((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x))); }} /></td>
                ))}</tr>
            ))}</tbody></table></div>
          <Region title={<><I k="tag" size={17} /> Fare rules</>} cls="rv-fare-rules">
            <div className="rv-rulecards">{route.seatFareRules.length ? route.seatFareRules.map((x, i) => (
              <div key={i} className="rv-rulecard"><span className="rv-chip ok">{x.value < 0 ? "−" : "+"}{x.kind === "percent" ? "" : "₹"}{Math.abs(x.value)}{x.kind === "percent" ? "%" : ""}</span><b>{x.label || `Rule ${i + 1}`}</b><small>{x.seats.length} seats · {x.days.length ? x.days.join(", ") : "Every day"}</small></div>
            )) : <p className="rv-help">No fare rules.</p>}</div>
          </Region>
        </>
      );
      case "block": {
        const blocked = new Map<string, string>(); route.seatBlocks.forEach((b) => { if (b.id !== blk.id) b.seats.forEach((s) => blocked.set(s, b.reason)); });
        const fmtD = (d: string | null) => (d ? new Date(d + "T00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "");
        return (
          <>
            <h2>Seat Blocking</h2>
            <p className="rv-subtext">Standing blocks hold seats back on every departure in the date range (crew berths, staff quota). Seats already sold on a departure are never displaced. Release a seat on a single departure from Schedules → Manage; it stays released there.</p>
            <div className="rv-fare-grid">
              <div className="rv-fare-diagram">
                <SeatMap seats={route.coach?.seats ?? []} chosen={sel} blocked={blocked} onToggle={ro ? undefined : (c) => setSel((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; })} />
                <div className="rv-legend"><span /> Available <span className="selected" /> Selected <span className="blocked" /> Blocked</div>
              </div>
              {!ro && <div className="rv-rule-controls">
                <h3>{blk.id == null ? "New standing block" : "Edit standing block"}</h3>
                <p className="rv-help">Selected: {sel.size ? [...sel].join(", ") : "none — click seats on the map"}</p>
                <Field label="Reason" value={blk.reason} maxLength={80} placeholder="Crew berth" onChange={(v) => setBlk((b) => ({ ...b, reason: v }))} />
                <div className="rv-two"><Field label="From date" type="date" value={blk.fromDate} onChange={(v) => setBlk((b) => ({ ...b, fromDate: v }))} /><Field label="To date" type="date" value={blk.toDate} onChange={(v) => setBlk((b) => ({ ...b, toDate: v }))} /></div>
                <Field label="Auto-release (hours before departure)" type="number" min={0} max={168} value={blk.autoReleaseHours} placeholder="Never" onChange={(v) => setBlk((b) => ({ ...b, autoReleaseHours: v }))} />
                <div className="rv-right">
                  {(blk.id != null || sel.size > 0) && <Btn onClick={() => { setSel(new Set()); setBlk({ id: null, reason: "", fromDate: "", toDate: "", autoReleaseHours: "" }); }}>Clear</Btn>}
                  <Btn cls="primary" data-rv="block-save" disabled={busy} onClick={saveBlock}>{blk.id == null ? "Block seats" : "Save block"}</Btn>
                </div>
              </div>}
            </div>
            <Region title="Standing blocks">
              {route.seatBlocks.length ? <div className="rv-scroll"><table className="rv-table" data-testid="route-seat-blocks"><thead><tr><th>Seats</th><th>Reason</th><th>Dates</th><th>Auto-release</th><th>By</th>{!ro && <th />}</tr></thead>
                <tbody>{route.seatBlocks.map((b) => (
                  <tr key={b.id}><td><div className="rv-seat-ids">{b.seats.map((s) => <span key={s} className="rv-chip seat">{s}</span>)}</div></td><td>{b.reason}</td>
                    <td>{b.fromDate || b.toDate ? `${fmtD(b.fromDate) || "Start"} – ${fmtD(b.toDate) || "Open"}` : "All departures"}</td>
                    <td>{b.autoReleaseHours != null ? `${b.autoReleaseHours} h before` : "Never"}</td><td>{b.createdBy}</td>
                    {!ro && <td style={{ whiteSpace: "nowrap" }}>
                      <Btn cls="icon" aria-label={`Edit block ${b.reason}`} onClick={() => { setSel(new Set(b.seats)); setBlk({ id: b.id, reason: b.reason, fromDate: b.fromDate ?? "", toDate: b.toDate ?? "", autoReleaseHours: b.autoReleaseHours == null ? "" : String(b.autoReleaseHours) }); }}><I k="edit" size={16} /></Btn>
                      <Btn cls="icon danger" aria-label={`Remove block ${b.reason}`} disabled={busy} onClick={() => deleteBlock(b)}><I k="trash" size={16} /></Btn></td>}
                  </tr>
                ))}</tbody></table></div> : <p className="rv-help">No standing blocks on this route.</p>}
            </Region>
          </>
        );
      }
      case "cancellation": return (
        <>
          <div className="rv-two">
            <label className="rv-field"><span>Allow Cancellation</span><select data-rv-rule="allow_cancellation" disabled={ro} value={st.gen.rules.allow_cancellation} onChange={(e) => { const v = e.currentTarget.value; updGen((g) => ({ ...g, rules: { ...g.rules, allow_cancellation: v } })); }}><option>Yes</option><option>No</option></select></label>
            {ro ? <Field label="Partial cancellation" value={route.partialCancellationAllowed ? "Yes" : "No"} />
              : <label className="rv-field"><span>Partial cancellation</span><select value={st.partialCancellationAllowed ? "yes" : "no"} onChange={(e) => upd("partialCancellationAllowed", e.currentTarget.value === "yes")}><option value="yes">Yes</option><option value="no">No</option></select></label>}
            <Field label="Max seats per ticket" value={st.maxSeatsPerTicket} type="number" min={1} onChange={ed("maxSeatsPerTicket", Number)} /><Field label="Update cut-off (minutes before boarding)" value={st.updateCutoffMinutes} type="number" min={0} onChange={ed("updateCutoffMinutes", Number)} />
          </div>
          <h2>Cancellation Policy</h2><p className="rv-subtext">Refund percentages by time before departure, as enforced by the booking engine.</p>
          <div className="rv-cancel-rows">{st.refundSlabs.map((s, i) => {
            const set = (k: "hoursBefore" | "refundPercent", v: number) => upd("refundSlabs", st.refundSlabs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
            return ro
              ? <div key={i} className="rv-slab"><label>Before departure (hours)<input type="number" value={s.hoursBefore} disabled readOnly /></label><label>Refund percentage<input type="number" value={s.refundPercent} disabled readOnly /></label></div>
              : <div key={i} className="rv-slab"><label>Before departure (hours)<input type="number" min={0} value={s.hoursBefore} onChange={(e) => set("hoursBefore", e.currentTarget.valueAsNumber)} /></label><label>Refund percentage<input type="number" min={0} max={100} value={s.refundPercent} onChange={(e) => set("refundPercent", e.currentTarget.valueAsNumber)} /></label>
                <Btn cls="icon danger" aria-label={`Remove slab ${i + 1}`} onClick={() => upd("refundSlabs", st.refundSlabs.filter((_, j) => j !== i))}><I k="trash" size={17} /></Btn></div>;
          })}</div>
          {!ro && <Btn onClick={() => upd("refundSlabs", [...st.refundSlabs, { hoursBefore: 0, refundPercent: 0 }])}><I k="plus" size={17} /> Add slab</Btn>}
        </>
      );
      case "expenses": {
        const group = (k: string, l: string) => (
          <Region title={l}>
            {expenses.filter((e) => e.type === k).length ? expenses.map((e, i) => e.type !== k ? null : (
              <div key={i} className="rv-expense">
                {ro ? <span>{e.label}</span> : <input aria-label={`${l} label`} value={e.label} onChange={(ev) => { const v = ev.currentTarget.value; setExpenses((xs) => xs.map((x, j) => (j === i ? { ...x, label: v } : x))); }} />}
                {ro ? <b>{money(e.perTrip)} / trip</b> : <input type="number" min={0} aria-label={`${e.label} amount`} value={e.perTrip} onChange={(ev) => { const v = ev.currentTarget.valueAsNumber; setExpenses((xs) => xs.map((x, j) => (j === i ? { ...x, perTrip: v } : x))); }} />}
                {!ro && <Btn cls="icon danger" aria-label={`Remove ${e.label}`} onClick={() => setExpenses((xs) => xs.filter((_, j) => j !== i))}><I k="trash" size={17} /></Btn>}
              </div>
            )) : <p className="rv-muted">No entries yet.</p>}
            {!ro && <Btn onClick={() => setExpenses((xs) => [...xs, { type: k, key: "", label: "", perTrip: 0 }])}><I k="plus" size={17} /> Add {l}</Btn>}
          </Region>
        );
        return <><h2>Expenses</h2><div className="rv-two">{group("fixed", "Fixed costs")}{group("running", "Running costs")}</div></>;
      }
      default: return (
        <>
          <h2>History</h2>
          {route.history.length ? <div className="rv-scroll"><table className="rv-table"><thead><tr><th>When</th><th>Action</th><th>By</th></tr></thead>
            <tbody>{route.history.map((h, i) => <tr key={i}><td>{new Date(h.at).toLocaleString("en-IN")}</td><td>{h.action}</td><td>{h.actor}</td></tr>)}</tbody></table></div>
            : <p className="rv-subtext">No recorded changes for this route yet.</p>}
        </>
      );
    }
  })();

  return (
    <div className="rv-root rv-editor" data-testid="route-editor">
      <header className="rv-gradient">
        <div className="rv-grad-icon"><I k="route" size={27} /></div>
        <div><h1>{ro ? "View Route" : "Edit Route"} <span>{ro ? "VIEWING" : "EDITING"}</span></h1><p>{ro ? "View the route details." : "Update the route details below."}</p></div>
        <a className="rv-back" href="#/gds/routes"><I k="back" size={17} /> Back</a>
      </header>
      <nav className="rv-tabbar" aria-label="Route editor tabs">
        {TABS.filter(([t]) => !ro || t !== "update").map(([t, name]) => <button key={t} type="button" className={t === tab ? "selected" : ""} data-rv-tab={t} onClick={() => pick(t)}>{name}</button>)}
      </nav>
      <div className="rv-editor-body" data-rv-tab-body>{body}</div>
      <footer className="rv-editor-footer">
        <Btn data-rv="cancel" onClick={cancel}>Cancel</Btn>
        {!ro && <Btn cls="primary" data-rv="save" aria-disabled={!savable || undefined} title={savable ? undefined : OWN_BUTTONS} onClick={save}><I k="save" size={16} /> {tab === "cities" ? "Save Cities & Schedule" : tab === "fares" ? "Save Fares" : tab === "general" ? "Continue" : "Save Changes"}</Btn>}
      </footer>
      {vanAdd && (() => {
        const add = () => {
          const label = vanAdd.label.trim(); if (!label) return toast("Enter a vehicle / van label", "warn");
          updGen((g) => ({ ...g, assignments: g.assignments.map((x, j) => (j === vanAdd.i ? { ...x, pickup_vans: [...x.pickup_vans, { label }] } : x)) })); setVanAdd(undefined);
        };
        return (
          <RvModal title="Add Pickup Van" onClose={() => setVanAdd(undefined)} foot={<><Btn onClick={() => setVanAdd(undefined)}>Cancel</Btn><Btn cls="primary" onClick={add}>Add van</Btn></>}>
            <Field label="Vehicle / van label" value={vanAdd.label} maxLength={60} autoFocus onChange={(v) => setVanAdd((x) => (x ? { ...x, label: v } : x))} />
          </RvModal>
        );
      })()}
      {stageEdit && (() => {
        const f = stageEdit, set = (p: Partial<StageForm>) => setStageEdit((x) => (x ? { ...x, ...p } : x));
        const lastSeq = Math.max(...route.stops.map((s) => s.sequence)), firstSeq = Math.min(...route.stops.map((s) => s.sequence));
        const eligible = route.stops.filter((s) => !(f.kind === "pickup" && s.sequence === lastSeq) && !(f.kind === "drop" && s.sequence === firstSeq));
        const num = (v: string) => (v.trim() === "" ? null : Number(v));
        const label = f.kind === "break" ? "break" : `${f.kind} point`;
        return (
          <RvModal title={f.id == null ? `Add ${label}` : `Edit ${label}`} onClose={() => setStageEdit(undefined)}
            foot={<><Btn onClick={() => setStageEdit(undefined)}>Cancel</Btn><Btn cls="primary" data-rv="point-save" disabled={busy} onClick={saveStage}><I k="save" size={16} /> Save</Btn></>}>
            <div className="rv-two">
              <label className="rv-field"><span>City*</span><select aria-label="Point city" value={f.cityId} onChange={(e) => set({ cityId: Number(e.currentTarget.value) })}>
                {eligible.map((s) => <option key={s.cityId} value={s.cityId}>{s.city}</option>)}</select></label>
              <Field label="Name*" value={f.name} maxLength={120} onChange={(v) => set({ name: v })} />
              <Field label="Address" value={f.address} onChange={(v) => set({ address: nz(v) })} />
              <Field label="Landmark" value={f.landmark} onChange={(v) => set({ landmark: nz(v) })} />
              <Field label="Day*" type="number" min={1} max={7} value={f.day} onChange={(v) => set({ day: Number(v) || 1 })} />
              <Field label="Time*" type="time" value={f.time} onChange={(v) => set({ time: v })} />
              <Field label="Contact number" value={f.contactNumber} inputMode="numeric" maxLength={13} onChange={(v) => set({ contactNumber: nz(v.replace(/\D/g, "")) })} />
              <label className="rv-field"><span>Prime (default) point</span><select value={f.prime ? "yes" : "no"} onChange={(e) => set({ prime: e.currentTarget.value === "yes" })}><option value="no">No</option><option value="yes">Yes</option></select></label>
              <Field label="Latitude" type="number" step="any" value={f.lat} onChange={(v) => set({ lat: num(v) })} />
              <Field label="Longitude" type="number" step="any" value={f.lng} onChange={(v) => set({ lng: num(v) })} />
              {f.kind === "pickup" && <label className="rv-field"><span>Pickup type</span><select value={f.pickupType ?? ""} onChange={(e) => set({ pickupType: e.currentTarget.value || null })}><option value="">Bus stop</option><option value="Metro">Free metro pickup</option></select></label>}
              {f.pickupType === "Metro" && <>
                <Field label="Interchange metro station" value={f.exchangePoint} onChange={(v) => set({ exchangePoint: nz(v) })} />
                <Field label="Bus pickup time at interchange" type="time" value={f.exchangeTime} onChange={(v) => set({ exchangeTime: nz(v) })} />
                <label className="rv-field rv-full"><span>Passenger instructions</span><textarea rows={3} value={f.metroDescription ?? ""} onChange={(e) => set({ metroDescription: nz(e.currentTarget.value) })} /></label>
              </>}
            </div>
            <p className="rv-help">Points used by bookings keep their type and city; name, address, pin and time can always be corrected and are published to OTAs for upcoming departures.</p>
          </RvModal>
        );
      })()}
    </div>
  );
}
