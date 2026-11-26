import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, type Me, type RouteDetail, type RouteStageRow } from "../../api";
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
const NOT_PERSISTED = "Not available yet: the modern backend does not store this route setting (tracked in UI_MIGRATION_GAPS.md)";
const NO_GPS = "Not available: no verified GPS halt observations are stored, so pins and times cannot be corrected from evidence";

const Field = ({ label, value, type = "text", onChange, ...p }: { label: string; value: string | number | null | undefined; type?: string; onChange?: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) => (
  <label className="rv-field"><span>{label}</span>{onChange
    ? <input type={type} value={value ?? ""} onChange={(e) => onChange(e.currentTarget.value)} {...p} />
    : <input type={type} value={value ?? ""} disabled readOnly />}</label>
);
type Settings = { name: string; altName: string; maxSeatsPerTicket: number; updateCutoffMinutes: number; partialCancellationAllowed: boolean;
  departureTime: string; arrivalTime: string; arrivalDay: number; startDate: string; endDate: string; refundSlabs: RouteDetail["refundSlabs"] };
const hhmm = (t: string | null | undefined) => String(t ?? "").slice(0, 5);
const toSettings = (r: RouteDetail): Settings => ({
  name: r.name, altName: r.altName ?? "", maxSeatsPerTicket: r.maxSeatsPerTicket, updateCutoffMinutes: r.updateCutoffMinutes, partialCancellationAllowed: r.partialCancellationAllowed,
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
  const upd = <K extends keyof Settings>(k: K, v: Settings[K]) => setSt((s) => (s ? { ...s, [k]: v } : s));

  const load = useCallback(async () => {
    try { const r = await api.routeDetail(id); setRoute(r); setFares(r.fares); setExpenses(r.expenses); setSt(toSettings(r)); setError(undefined); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const pick = (t: string) => {
    setTab(t); setStopCity(undefined);
    q.set("rvtab", t); window.history.replaceState(null, "", `#/gds/routes/${id}?${q.toString()}`);
  };
  const dirty = !!route && (JSON.stringify(fares) !== JSON.stringify(route.fares) || JSON.stringify(expenses) !== JSON.stringify(route.expenses) || JSON.stringify(st) !== JSON.stringify(toSettings(route)));
  const cancel = async () => { if (dirty && !(await confirmDialog("Discard unsaved changes?", { ok: "Discard", danger: true }))) return; window.location.hash = "#/gds/routes"; };
  const save = async () => {
    if (!route || !st) return;
    try {
      if (tab === "general") {
        if (!st.name.trim()) return toast("Name is required", "warn");
        if (!(st.maxSeatsPerTicket >= 1)) return toast("Max seats per ticket must be at least 1", "warn");
        if (!(st.updateCutoffMinutes >= 0)) return toast("Update cut-off must be zero or more", "warn");
        await api.saveRouteSettings(id, { name: st.name.trim(), altName: st.altName.trim(), maxSeatsPerTicket: st.maxSeatsPerTicket, updateCutoffMinutes: st.updateCutoffMinutes, partialCancellationAllowed: st.partialCancellationAllowed });
        toast("Route saved", "ok");
      } else if (tab === "cities") {
        if (!st.departureTime || !st.startDate) return toast("Complete the mandatory fields", "warn");
        if (st.endDate && st.endDate < st.startDate) return toast("End date is before start date", "warn");
        await api.saveRouteSettings(id, { departureTime: st.departureTime, ...(st.arrivalTime ? { arrivalTime: st.arrivalTime } : {}), arrivalDay: st.arrivalDay, startDate: st.startDate, ...(st.endDate ? { endDate: st.endDate } : {}) });
        toast("Route saved", "ok");
      } else if (tab === "cancellation") {
        if (st.refundSlabs.some((s) => !(s.hoursBefore >= 0) || !(s.refundPercent >= 0 && s.refundPercent <= 100))) return toast("Hours must be zero or more and refund 0-100%", "warn");
        if (new Set(st.refundSlabs.map((s) => s.hoursBefore)).size !== st.refundSlabs.length) return toast("Each slab needs different hours", "warn");
        await api.saveRouteSettings(id, { refundSlabs: st.refundSlabs });
        toast("Cancellation policy saved", "ok");
      } else if (tab === "fares") {
        if (fares.some((f) => [f.seater, f.sleeperLower, f.sleeperUpper].some((v) => !(v >= 0)))) return toast("Fares must be zero or more", "warn");
        await api.saveFares(id, fares.map(({ fromSequence, toSequence, seater, sleeperLower, sleeperUpper }) => ({ fromSequence, toSequence, seater, sleeperLower, sleeperUpper })));
        toast("Fares saved", "ok");
      } else if (tab === "expenses") {
        if (expenses.some((e) => !e.label.trim() || !(e.perTrip >= 0))) return toast("Every expense needs a label and an amount of zero or more", "warn");
        await api.saveExpenseTemplate(id, expenses.map((e) => ({ type: e.type, key: e.key || null, label: e.label.trim(), perTrip: e.perTrip })));
        toast("Expenses saved", "ok");
      } else return toast(NOT_PERSISTED, "warn");
      await load();
    } catch (e) { toastError(e); }
  };

  if (error) return <div className="rv-root rv-editor"><div className="rv-empty" role="alert">Could not load route: {error}</div></div>;
  if (!route || !st) return <div className="rv-root rv-editor"><div className="rv-empty">Loading…</div></div>;

  const savable = ["general", "cities", "cancellation", "fares", "expenses"].includes(tab);
  const stops = (kind: string) => route.stages.filter((s) => s.kind === kind);
  const stopPanel = (kind: "pickup" | "drop" | "break") => {
    const arr = stops(kind), heading = { pickup: "Pickup Points", drop: "Drop Points", break: "Break Points" }[kind];
    const cities = [...new Set(arr.map((s) => s.city ?? "Other"))]; if (!cities.length) cities.push("All");
    const active = stopCity ?? cities[0];
    const filtered = arr.filter((s) => (s.city ?? "Other") === active);
    return (
      <>
        <div className="rv-stopheader"><h2>{heading}</h2>{mode === "edit" && <Btn cls="sky" aria-disabled="true" title={NOT_PERSISTED} onClick={() => toast(NOT_PERSISTED, "warn")}><I k="edit" size={17} /> Edit</Btn>}</div>
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
            <Field label="Coach*" value={route.coach ? `${route.coach.name} · ${route.coach.capacity} seats` : "Coach not assigned"} />
            <Field label="Total Seats" value={route.coach?.capacity} type="number" /><Field label="Total Sleeper" value={route.coach?.sleepers} type="number" /><Field label="Total Seater" value={route.coach?.seaters} type="number" />
            <Field label="Max seats per ticket" value={st.maxSeatsPerTicket} type="number" min={1} onChange={ed("maxSeatsPerTicket", Number)} /><Field label="Update cut-off (minutes before boarding)" value={st.updateCutoffMinutes} type="number" min={0} onChange={ed("updateCutoffMinutes", Number)} />
            {ro ? <Field label="Partial cancellation" value={route.partialCancellationAllowed ? "Yes" : "No"} />
              : <label className="rv-field"><span>Partial cancellation</span><select value={st.partialCancellationAllowed ? "yes" : "no"} onChange={(e) => upd("partialCancellationAllowed", e.currentTarget.value === "yes")}><option value="yes">Yes</option><option value="no">No</option></select></label>}
          </div>
          {mode === "edit" && <p className="rv-notice">Coach changes are not supported here yet. Assign vehicles and crew per departure from Schedules → Manage.</p>}
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
            <div className="rv-scroll"><table className="rv-table rv-via"><thead><tr><th>#</th><th>State</th><th>City</th><th>Lat</th><th>Lng</th><th>Day</th><th>Time</th></tr></thead>
              <tbody>{route.stops.map((s) => <tr key={s.sequence}><td>{s.sequence + 1}</td><td>{s.state ?? "—"}</td><td>{s.city}</td><td>{s.lat ?? "—"}</td><td>{s.lng ?? "—"}</td><td>D{s.day}</td><td>{fmtTime(s.time)}</td></tr>)}</tbody></table></div>
          </Region>
          <div className="rv-two rv-dates"><Field label="Start Date*" value={st.startDate} type="date" onChange={ed("startDate")} /><Field label="End Date" value={st.endDate} type="date" onChange={ed("endDate")} /></div>
        </>
      );
      case "update": return <p className="rv-notice">{NOT_PERSISTED}. Shifting route timings is not supported by the modern backend yet.</p>;
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
      case "block": return <><h2>Seat Blocking</h2><p className="rv-subtext">Route-level standing blocks are applied per departure. Block or release seats on a specific trip from Schedules → Manage.</p></>;
      case "cancellation": return (
        <>
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
        {!ro && <Btn cls="primary" data-rv="save" aria-disabled={!savable || undefined} title={savable ? undefined : NOT_PERSISTED} onClick={save}><I k="save" size={16} /> {tab === "cities" ? "Save Cities & Schedule" : tab === "fares" ? "Save Fares" : tab === "general" ? "Continue" : "Save Changes"}</Btn>}
      </footer>
    </div>
  );
}
