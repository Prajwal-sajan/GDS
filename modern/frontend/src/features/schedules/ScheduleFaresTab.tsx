import { useEffect, useMemo, useRef, useState } from "react";
import { api, type ScheduleUiSettings, type TripSeatRule } from "../../api";
import { confirmDialog, promptDialog, toast, toastError } from "../../components/ui/feedback";
import { can, permissions } from "../../auth/permissions";

// Schedule overlay → Fares tab. React port of legacy schedules-screenshot-v6.js faresTab()/saveFare()/sxSaveRule: same
// classes and layout. Base seat-group fares (SS / SLB / DUB) for the chosen city pair save as a per-trip override via
// PUT /schedules/{id}/fares; "Follow route" clears the override. Seat fare rules (selected seats + weekday, flat or %)
// save via PUT /schedules/{id}/seat-fare-rules and are priced after route rules. Fare mode / kind / weekday toggles and
// fare-group add/remove are client-side in legacy too (toasts mirror it); Auto Pricing settings persist in ui_settings.
type Fare = { fromSequence: number; toSequence: number; from: string; to: string; seater: number; sleeperLower: number; sleeperUpper: number };
type Fares = { synced: boolean; changedAt: string | null; cities: { sequence: number; cityId: number; name: string }[]; fares: Fare[]; routeFares: Fare[] };
type Seat = { seatCode: string; deck: string; row: number; col: number; seatType: string; state: string };

const P: Record<string, string> = {
  spark: "m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z", minus: "M5 12h14", plus: "M12 5v14M5 12h14",
  rupee: "M7 5h11M7 9h11m-9-4a5 5 0 0 1 0 10l7 5", chart: "M3 3v18h18M8 17v-5m5 5V7m5 10v-8", edit: "M12 20h9M16 3a2 2 0 0 1 3 3L7 18l-4 1 1-4L16 3Z",
  pin: "M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Zm-8 2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z", trash: "M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v6m4-6v6",
  save: "M5 3h12l4 4v14H3V3h2Zm2 0v6h10V3M7 21v-9h10v9", shield: "M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z", link: "M10 13a5 5 0 0 0 7 .3l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7-.3l-3 3a5 5 0 0 0 7 7l1.5-1.5",
};
const I = ({ n, s = 16 }: { n: string; s?: number }) => <svg className="sx-svg" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[n]} /></svg>;
const Bt = ({ n, label, cls = "", onClick, ...a }: { n: string; label: string; cls?: string; onClick?: () => void } & Record<string, unknown>) =>
  <button type="button" className={`sx-btn ${cls}`} onClick={onClick} {...a}><I n={n} /><span>{label}</span></button>;
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** weekday button label → JS getDay() number (0=Sun) as stored in seat_fare_rules.days */
const dayNo = (w: string) => (WEEK.indexOf(w) + 1) % 7;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ruleLabel = (r: TripSeatRule) => `${r.value >= 0 ? "+" : "−"}${r.kind === "percent" ? `${Math.abs(r.value)}%` : `₹${Math.abs(r.value)}`} · ${r.seats.length} seats${r.days.length ? ` · ${r.days.map((d) => DAYS[d]).join(",")}` : ""}`;
/** legacy faresTab(): SS = numeric seats, SLB = lower sleepers, DUB = upper berths (code ending U, col > 0). */
const groupOf = (s: Seat) => /^[0-9]+[LU]$/.test(s.seatCode) ? (s.seatCode.endsWith("U") && s.col > 0 ? "DUB" : "SLB") : /^[0-9]+$/.test(s.seatCode) ? "SS" : (s.seatType || "OTHER").toUpperCase();
const fdt = (s: string) => new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export function FaresTab({ sid }: { sid: number }) {
  const [f, setF] = useState<Fares>();
  const [seats, setSeats] = useState<Seat[]>([]);
  const [pair, setPair] = useState<[number, number]>();
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [ap, setAp] = useState<ScheduleUiSettings>({});
  const apTimer = useRef<ReturnType<typeof setTimeout>>();
  const [rules, setRules] = useState<TripSeatRule[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [mode, setMode] = useState("set");
  const [kind, setKind] = useState("fixed");
  const [day, setDay] = useState("All");
  const [removed, setRemoved] = useState<string[]>([]);
  const [draft, setDraft] = useState<{ name: string; dir: "inc" | "dec"; amount: number; unit: "flat" | "percent" }>();
  useEffect(() => { api.scheduleDetail(sid).then((d) => { setAp(d.uiSettings ?? {}); setRules(d.seatFareRules ?? []); }).catch(() => undefined); }, [sid]);
  const setPricing = (patch: ScheduleUiSettings) => {
    if (!(can("schedules.fares") || can("schedules.modify"))) return toast("No permission to edit trip fares", "bad");
    const next = { ...ap, ...patch };
    setAp(next);
    clearTimeout(apTimer.current);
    apTimer.current = setTimeout(() => {
      if ((next.min_price ?? 650) > (next.max_price ?? 4500)) return toast("Fare min/max not valid", "bad");
      api.saveScheduleUiSettings(sid, patch.min_price !== undefined || patch.max_price !== undefined ? { min_price: next.min_price ?? 650, max_price: next.max_price ?? 4500 } : patch).catch(toastError);
    }, 400);
  };
  const load = () => Promise.all([api.admin<Fares>(`/schedules/${sid}/fares`), api.admin<Seat[]>(`/trips/${sid}/seats`), permissions()])
    .then(([fa, se]) => { setF(fa); setSeats(se); setEdits({}); setPair((p) => p ?? (fa.cities.length > 1 ? [fa.cities[0].sequence, fa.cities[fa.cities.length - 1].sequence] : undefined)); })
    .catch((e) => { setErr(String((e as Error)?.message ?? e)); toastError(e); });
  useEffect(() => { void load(); }, [sid]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const m = new Map<string, Seat[]>(); for (const s of seats) { const g = groupOf(s); if (!m.has(g)) m.set(g, []); m.get(g)!.push(s); }
    const ag = ap.added_group;
    if (ag?.name && !m.has(ag.name)) m.set(ag.name, ag.seat_ids.map((c) => seats.find((s) => s.seatCode === c) ?? { seatCode: c, deck: "", row: 0, col: 0, seatType: "", state: "" }));
    return [...m.entries()].filter(([g]) => !removed.includes(g));
  }, [seats, removed, ap.added_group]);
  if (err) return <div className="sx-empty">{err}</div>;
  if (!f || !pair) return <div className="sx-loading">Loading fares…</div>;
  const fare = f.fares.find((x) => x.fromSequence === pair[0] && x.toSequence === pair[1]) ?? f.fares[0];
  const price = (g: string) => edits[g] ?? (fare ? (g === "SS" ? fare.seater : g === "SLB" ? fare.sleeperLower : fare.sleeperUpper) : 0);
  const bump = (g: string, d: number) => setEdits((e) => ({ ...e, [g]: Math.max(0, price(g) + d) }));
  const writable = can("schedules.fares") || can("schedules.modify");
  const ruleWritable = can("schedules.fares");
  const putRules = async (next: TripSeatRule[], okMsg: string) => {
    if (!ruleWritable) return toast("No permission to edit seat fare rules", "bad");
    setBusy(true);
    try { await api.saveTripSeatRules(sid, next); setRules(next.filter((r) => r.seats.length && r.value)); toast(okMsg, "ok"); await load(); }
    catch (e) { toastError(e); } finally { setBusy(false); }
  };
  const saveRule = () => {
    if (!draft) return;
    const value = Math.abs(Number(draft.amount) || 0) * (draft.dir === "dec" ? -1 : 1);
    if (!value) return toast("Enter a fare change amount", "bad");
    if (draft.unit === "percent" && Math.abs(value) > 100) return toast("Percent change must be within 100%", "bad");
    const rule: TripSeatRule = { name: draft.name.trim() || `Rule ${rules.length + 1}`, seats: [...sel], days: day === "All" ? [] : [dayNo(day)], kind: draft.unit, value };
    if (!rule.seats.length) return toast("Rule saved — select seats on the layout to make it apply", "warn");
    void putRules([...rules, rule], "Seat fare rule published for this trip").then(() => { setDraft(undefined); setSel([]); });
  };
  const removeRule = async (i: number) => {
    if (!(await confirmDialog(`Remove fare rule "${rules[i].name}" from this trip?`, { ok: "Remove rule" }))) return;
    void putRules(rules.filter((_, j) => j !== i), "Seat fare rule removed");
  };
  const addGroup = async () => {
    const v = await promptDialog("Add fare group", [{ name: "name", label: "Group name", required: true }, { name: "seat_ids", label: "Seat IDs (comma separated)", value: sel.join(","), required: true }], { ok: "Add group" });
    const name = String(v?.name ?? "").trim();
    if (!v || !name) return;
    const ids = String(v.seat_ids ?? "").split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
    if (!ids.length) return toast("Enter at least one seat ID", "bad");
    const next = { ...ap, added_group: { name, seat_ids: ids } };
    try { await api.saveScheduleUiSettings(sid, { added_group: next.added_group }); setAp(next); setRemoved((r) => r.filter((x) => x !== name)); toast("Fare group captured in preview", "ok"); }
    catch (e) { toastError(e); }
  };
  const toggleSeat = (c: string) => setSel((s) => s.includes(c) ? s.filter((x) => x !== c) : [...s, c]);

  const save = async () => {
    if (!writable) return toast("No permission to edit trip fares", "bad");
    if (!fare) return;
    if (!(await confirmDialog("Save these base seat-group fares as an override for this trip?", { ok: "Save trip fares" }))) return;
    const fares = f.fares.map((x) => x === fare ? { ...x, seater: edits.SS ?? x.seater, sleeperLower: edits.SLB ?? x.sleeperLower, sleeperUpper: edits.DUB ?? x.sleeperUpper } : x)
      .map(({ fromSequence, toSequence, seater, sleeperLower, sleeperUpper }) => ({ fromSequence, toSequence, seater, sleeperLower, sleeperUpper }));
    setBusy(true);
    try { await api.admin(`/schedules/${sid}/fares`, "PUT", { syncWithRoute: false, fares }); toast("Trip fare override saved", "ok"); await load(); }
    catch (e) { toastError(e); } finally { setBusy(false); }
  };
  const follow = async () => {
    if (!writable) return toast("No permission to edit trip fares", "bad");
    if (!(await confirmDialog("Discard this trip's fare override and follow the route fares again?", { ok: "Follow route" }))) return;
    setBusy(true);
    try { await api.admin(`/schedules/${sid}/fares`, "PUT", { syncWithRoute: true }); toast("Trip fares now follow the route", "ok"); await load(); }
    catch (e) { toastError(e); } finally { setBusy(false); }
  };
  const froms = f.cities.slice(0, -1), tos = f.cities.filter((c) => c.sequence > pair[0]);
  const decks = [...new Set(seats.map((s) => s.deck))];

  return (
    <div className="sx-fares-ui" data-sx-fares="">
      <div className="sx-pricing-top">
        <div className="sx-pricing-mode"><b><I n="spark" s={21} /> Auto Pricing</b><p>AI sets fares for this trip.</p>
          <label className="sx-switch"><input type="checkbox" data-sx-draft-toggle="auto_price" checked={!!ap.auto_price} onChange={(e) => setPricing({ auto_price: e.target.checked })} /><span></span></label></div>
        <div className="sx-pricing-guard"><b>PRICE GUARD RAILS</b>
          <div>{([["Min ₹", "min_price", 650], ["Max ₹", "max_price", 4500]] as const).map(([l, n, v]) => <label key={n} className="sx-field"><span>{l}</span><input name={n} type="number" min="0" value={ap[n] ?? v} onChange={(e) => setPricing({ [n]: Math.max(0, Number(e.target.value) || 0) })} /></label>)}</div>
          <small>AI never prices a seat below Min or above Max.</small></div>
        <div className="sx-pricing-curve"><label className="sx-field"><span>DEMAND CURVE</span><select name="curve" value={ap.curve ?? "Max revenue"} onChange={(e) => setPricing({ curve: e.target.value })}>{["Max revenue", "Balanced", "Max occupancy"].map((x) => <option key={x}>{x}</option>)}</select></label>
          <small>Targets: <b>{(ap.curve ?? "Max revenue") === "Max revenue" ? "Revenue" : ap.curve}</b></small>
          <div className="sx-targets">{[["7D", "5%"], ["3D", "10%"], ["1D", "35%"], ["12H", "40%"], ["6H", "45%"], ["TRIP", "100%"]].map(([a, b]) => <div key={a}><small>{a}</small><strong>{b}</strong></div>)}</div></div>
      </div>
      <div className="sx-fare-last">Last change: <b>{f.changedAt ? fdt(f.changedAt) : "No trip override"}</b> · Fares {f.synced ? "follow route" : "custom trip prices"} · Recommended changes are not applied automatically.</div>
      <div className="sx-fare-route"><span><I n="pin" s={13} /> Fares for</span>
        <label>From <select data-sx-fromcity="" value={pair[0]} onChange={(e) => { const a = Number(e.target.value); setEdits({}); setPair([a, Math.max(pair[1], a + 1)]); }}>{froms.map((c) => <option key={c.sequence} value={c.sequence}>{c.name}</option>)}</select></label>
        <label>To <select data-sx-tocity="" value={pair[1]} onChange={(e) => { setEdits({}); setPair([pair[0], Number(e.target.value)]); }}>{tos.map((c) => <option key={c.sequence} value={c.sequence}>{c.name}</option>)}</select>
          <span className="sx-pill">{pair[0] === f.cities[0].sequence && pair[1] === f.cities[f.cities.length - 1].sequence ? "Main route" : "Sub-route"}</span></label>
      </div>
      <div className="sx-fare-controlbar"><span>{f.fares.length} route(s)</span>
        <Bt n="rupee" label="Set Rate" cls={mode === "set" ? "active" : ""} data-sx-fare-mode="set" onClick={() => { setMode("set"); toast("Fare edit mode: Set Rate"); }} /><Bt n="edit" label="CHANGE" cls={mode === "change" ? "active" : ""} data-sx-fare-mode="change" onClick={() => { setMode("change"); toast("Fare edit mode: CHANGE"); }} />
        <Bt n="rupee" label="Fixed ₹" cls={kind === "fixed" ? "active" : ""} data-sx-farekind="fixed" onClick={() => setKind("fixed")} /><Bt n="chart" label="Percent %" cls={kind === "percent" ? "active" : ""} data-sx-farekind="percent" onClick={() => setKind("percent")} />
        <Bt n="minus" label="" cls="mini" data-sx-faredelta="-10" onClick={() => groups.forEach(([g]) => bump(g, -10))} />
        <input data-sx-delta="" type="number" defaultValue={0} readOnly />
        <Bt n="plus" label="" cls="mini" data-sx-faredelta="10" onClick={() => groups.forEach(([g]) => bump(g, 10))} />
        <div className="sx-weekdays">{["All", ...WEEK].map((x) => <button key={x} type="button" data-sx-weekday={x} className={x === day ? "active" : ""} onClick={() => setDay(x)}>{x}</button>)}</div>
      </div>
      <div className="sx-fare-flex">
        <div className="sx-faregroup-table">
          <div className="sx-table-outer"><table className="sx-table">
            <thead><tr>{["", "NAME", "SEAT ID(S)", "NET PRICE", "PRICE (₹)", "ACTIONS"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {groups.map(([g, arr]) => (
                <tr key={g}>
                  <td><input type="checkbox" defaultChecked data-sx-groupcheck={g} /></td><td><b>{g}</b></td>
                  <td><div className="sx-seat-chips">{arr.map((x) => <span key={x.seatCode}>{x.seatCode}</span>)}</div></td>
                  <td><span className="sx-pill blue">{arr.length} seats</span></td>
                  <td><button type="button" className="sx-tiny" data-sx-groupminus={g} onClick={() => bump(g, -10)}><I n="minus" /></button>
                    <input className="sx-short" data-sx-groupfare={g} type="number" min={0} value={price(g)} onChange={(e) => setEdits((x) => ({ ...x, [g]: Math.max(0, Number(e.target.value) || 0) }))} />
                    <button type="button" className="sx-tiny" data-sx-groupplus={g} onClick={() => bump(g, 10)}><I n="plus" /></button></td>
                  <td><button type="button" className="sx-tiny" data-sx-removefare={g} onClick={() => { setRemoved((r) => [...r, g]); toast("Fare group removed from preview only", "warn"); }}><I n="trash" /></button></td>
                </tr>
              ))}
              {!groups.length && <tr><td colSpan={6} className="sx-muted">Seat diagram not available</td></tr>}
            </tbody>
          </table></div>
          <Bt n="plus" label="Add fare group" data-sx-addgroup="" onClick={() => void addGroup()} />
        </div>
        <div className="sx-fare-seatmap"><h4>Seat preview</h4>
          <div className="sx-seatmap">{decks.map((d) => {
            const ds = seats.filter((s) => s.deck === d), rows = Math.max(0, ...ds.map((s) => s.row)) + 1, cols = Math.max(0, ...ds.map((s) => s.col)) + 1;
            return <div key={d} className="sx-deck"><small>{d}</small><div className="sx-grid" style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, auto)`, gap: 4 }}>
              {Array.from({ length: rows * cols }, (_, i) => { const s = ds.find((x) => x.row === Math.floor(i / cols) && x.col === i % cols); return s ? <button type="button" key={i} data-sx-ruleseat={s.seatCode} aria-pressed={sel.includes(s.seatCode)} className={`sx-seat ${s.state}${sel.includes(s.seatCode) ? " selected" : ""}`} style={sel.includes(s.seatCode) ? { outline: "2px solid #2563eb" } : undefined} title={`${s.seatCode} · ₹${price(groupOf(s))}`} onClick={() => toggleSeat(s.seatCode)}>{s.seatCode}</button> : <span key={i} />; })}
            </div></div>;
          })}</div>
        </div>
      </div>
      <div className="sx-fare-rules"><h3>Fare rules</h3>
        <p>Charge more for popular seats and less for the ones passengers avoid. Rules can apply to selected seats, days, trips and city pairs.</p>
        <div className="sx-rules-actions">
          <Bt n="plus" label="Premium seats" data-sx-rule="premium" onClick={() => setDraft({ name: "Premium seats", dir: "inc", amount: 100, unit: "flat" })} />
          <Bt n="minus" label="Discount seats" data-sx-rule="discount" onClick={() => setDraft({ name: "Discount seats", dir: "dec", amount: 100, unit: "flat" })} />
          <Bt n="pin" label="City rule" data-sx-rule="city" onClick={() => setDraft({ name: `${f.cities.find((c) => c.sequence === pair[0])?.name ?? "City"} rule`, dir: "inc", amount: 100, unit: "flat" })} />
        </div>
        {!!rules.length && <div className="sx-seat-chips" data-sx-rulelist="">{rules.map((r, i) => <span key={i} title={r.seats.join(", ")}>{r.name}: {ruleLabel(r)} <button type="button" className="sx-tiny" data-sx-removerule={i} aria-label={`Remove ${r.name}`} onClick={() => void removeRule(i)}><I n="trash" s={12} /></button></span>)}</div>}
        {draft && <div className="sx-rule-editor" data-sx-ruleeditor="" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end", marginTop: 8 }}>
          <label className="sx-field"><span>Rule name</span><input name="rule_name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label className="sx-field"><span>Change</span><select name="rule_dir" value={draft.dir} onChange={(e) => setDraft({ ...draft, dir: e.target.value as "inc" | "dec" })}><option value="inc">Increase</option><option value="dec">Decrease</option></select></label>
          <label className="sx-field"><span>Amount</span><input name="rule_amount" type="number" min={0} value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: Math.max(0, Number(e.target.value) || 0) })} /></label>
          <label className="sx-field"><span>Mode</span><select name="rule_unit" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value as "flat" | "percent" })}><option value="flat">₹</option><option value="percent">%</option></select></label>
          <span className="sx-muted">{sel.length} seat(s) selected · {day === "All" ? "all days" : day}</span>
          <Bt n="save" label="Save fare rules" cls="primary" data-sx-saverule="" disabled={busy} onClick={saveRule} />
          <Bt n="minus" label="Cancel" onClick={() => setDraft(undefined)} />
        </div>}
      </div>
      <div className="sx-fare-actions" style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <Bt n="save" label={busy ? "Saving…" : "Save trip fares"} cls="primary" data-sx-save-fares="" disabled={busy || !Object.keys(edits).length} onClick={() => void save()} />
        {!f.synced && <Bt n="link" label="Follow route fares" data-sx-follow-route="" disabled={busy} onClick={() => void follow()} />}
      </div>
      <div className="sx-preview-note"><I n="shield" s={15} /> Seat rules and trip fares save to this trip. Auto Pricing settings are managed on the route.</div>
    </div>
  );
}
