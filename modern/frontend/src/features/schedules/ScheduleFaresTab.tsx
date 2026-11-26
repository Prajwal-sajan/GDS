import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { confirmDialog, toast, toastError } from "../../components/ui/feedback";
import { can, permissions } from "../settings/legacy";

// Schedule overlay → Fares tab. React port of legacy schedules-screenshot-v6.js faresTab()/saveFare(): same classes and
// layout. Base seat-group fares (SS / SLB / DUB) for the chosen city pair save as a per-trip override via
// PUT /schedules/{id}/fares; "Follow route" clears the override. Auto Pricing and seat rules are route-level in legacy
// too ("managed on the route"), so those controls stay preview-only.
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
const PREVIEW = "Auto Pricing and seat fare rules are managed on the route; this control does not change anything on this trip.";
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
  const load = () => Promise.all([api.admin<Fares>(`/schedules/${sid}/fares`), api.admin<Seat[]>(`/trips/${sid}/seats`), permissions()])
    .then(([fa, se]) => { setF(fa); setSeats(se); setEdits({}); setPair((p) => p ?? (fa.cities.length > 1 ? [fa.cities[0].sequence, fa.cities[fa.cities.length - 1].sequence] : undefined)); })
    .catch((e) => { setErr(String((e as Error)?.message ?? e)); toastError(e); });
  useEffect(() => { void load(); }, [sid]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => { const m = new Map<string, Seat[]>(); for (const s of seats) { const g = groupOf(s); if (!m.has(g)) m.set(g, []); m.get(g)!.push(s); } return [...m.entries()]; }, [seats]);
  if (err) return <div className="sx-empty">{err}</div>;
  if (!f || !pair) return <div className="sx-loading">Loading fares…</div>;
  const fare = f.fares.find((x) => x.fromSequence === pair[0] && x.toSequence === pair[1]) ?? f.fares[0];
  const price = (g: string) => edits[g] ?? (fare ? (g === "SS" ? fare.seater : g === "SLB" ? fare.sleeperLower : fare.sleeperUpper) : 0);
  const bump = (g: string, d: number) => setEdits((e) => ({ ...e, [g]: Math.max(0, price(g) + d) }));
  const preview = () => toast(PREVIEW);
  const writable = can("schedules.fares") || can("schedules.modify");

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
          <label className="sx-switch"><input type="checkbox" aria-disabled="true" checked={false} onChange={preview} /><span></span></label></div>
        <div className="sx-pricing-guard"><b>PRICE GUARD RAILS</b>
          <div>{[["Min ₹", "min_price", 650], ["Max ₹", "max_price", 4500]].map(([l, n, v]) => <label key={n} className="sx-field"><span>{l}</span><input name={String(n)} type="number" defaultValue={v} readOnly aria-disabled="true" onFocus={preview} /></label>)}</div>
          <small>AI never prices a seat below Min or above Max.</small></div>
        <div className="sx-pricing-curve"><label className="sx-field"><span>DEMAND CURVE</span><select name="curve" defaultValue="Max revenue" aria-disabled="true" onChange={preview}>{["Max revenue", "Balanced", "Max occupancy"].map((x) => <option key={x}>{x}</option>)}</select></label>
          <small>Targets: <b>Revenue</b></small>
          <div className="sx-targets">{[["7D", "5%"], ["3D", "10%"], ["1D", "35%"], ["12H", "40%"], ["6H", "45%"], ["TRIP", "100%"]].map(([a, b]) => <div key={a}><small>{a}</small><strong>{b}</strong></div>)}</div></div>
      </div>
      <div className="sx-fare-last">Last change: <b>{f.changedAt ? fdt(f.changedAt) : "No trip override"}</b> · Fares {f.synced ? "follow route" : "custom trip prices"} · Recommended changes are not applied automatically.</div>
      <div className="sx-fare-route"><span><I n="pin" s={13} /> Fares for</span>
        <label>From <select data-sx-fromcity="" value={pair[0]} onChange={(e) => { const a = Number(e.target.value); setEdits({}); setPair([a, Math.max(pair[1], a + 1)]); }}>{froms.map((c) => <option key={c.sequence} value={c.sequence}>{c.name}</option>)}</select></label>
        <label>To <select data-sx-tocity="" value={pair[1]} onChange={(e) => { setEdits({}); setPair([pair[0], Number(e.target.value)]); }}>{tos.map((c) => <option key={c.sequence} value={c.sequence}>{c.name}</option>)}</select>
          <span className="sx-pill">{pair[0] === f.cities[0].sequence && pair[1] === f.cities[f.cities.length - 1].sequence ? "Main route" : "Sub-route"}</span></label>
      </div>
      <div className="sx-fare-controlbar"><span>{f.fares.length} route(s)</span>
        <Bt n="rupee" label="Set Rate" data-sx-fare-mode="set" onClick={preview} /><Bt n="edit" label="CHANGE" data-sx-fare-mode="change" onClick={preview} />
        <Bt n="rupee" label="Fixed ₹" cls="active" data-sx-farekind="fixed" onClick={preview} /><Bt n="chart" label="Percent %" data-sx-farekind="percent" onClick={preview} />
        <Bt n="minus" label="" cls="mini" data-sx-faredelta="-10" onClick={() => groups.forEach(([g]) => bump(g, -10))} />
        <input data-sx-delta="" type="number" defaultValue={0} readOnly />
        <Bt n="plus" label="" cls="mini" data-sx-faredelta="10" onClick={() => groups.forEach(([g]) => bump(g, 10))} />
        <div className="sx-weekdays">{["All", ...WEEK].map((x) => <button key={x} type="button" data-sx-weekday={x} className={x === "All" ? "active" : ""} onClick={x === "All" ? undefined : preview}>{x}</button>)}</div>
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
                  <td><button type="button" className="sx-tiny" data-sx-removefare={g} onClick={preview}><I n="trash" /></button></td>
                </tr>
              ))}
              {!groups.length && <tr><td colSpan={6} className="sx-muted">Seat diagram not available</td></tr>}
            </tbody>
          </table></div>
          <Bt n="plus" label="Add fare group" data-sx-addgroup="" onClick={preview} />
        </div>
        <div className="sx-fare-seatmap"><h4>Seat preview</h4>
          <div className="sx-seatmap">{decks.map((d) => {
            const ds = seats.filter((s) => s.deck === d), rows = Math.max(0, ...ds.map((s) => s.row)) + 1, cols = Math.max(0, ...ds.map((s) => s.col)) + 1;
            return <div key={d} className="sx-deck"><small>{d}</small><div className="sx-grid" style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, auto)`, gap: 4 }}>
              {Array.from({ length: rows * cols }, (_, i) => { const s = ds.find((x) => x.row === Math.floor(i / cols) && x.col === i % cols); return s ? <span key={i} className={`sx-seat ${s.state}`} title={`${s.seatCode} · ₹${price(groupOf(s))}`}>{s.seatCode}</span> : <span key={i} />; })}
            </div></div>;
          })}</div>
        </div>
      </div>
      <div className="sx-fare-rules"><h3>Fare rules</h3>
        <p>Charge more for popular seats and less for the ones passengers avoid. Rules can apply to selected seats, days, trips and city pairs.</p>
        <div className="sx-rules-actions"><Bt n="plus" label="Premium seats" onClick={preview} /><Bt n="minus" label="Discount seats" onClick={preview} /><Bt n="pin" label="City rule" onClick={preview} /></div>
      </div>
      <div className="sx-fare-actions" style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <Bt n="save" label={busy ? "Saving…" : "Save trip fares"} cls="primary" data-sx-save-fares="" disabled={busy || !Object.keys(edits).length} onClick={() => void save()} />
        {!f.synced && <Bt n="link" label="Follow route fares" data-sx-follow-route="" disabled={busy} onClick={() => void follow()} />}
      </div>
      <div className="sx-preview-note"><I n="shield" s={15} /> Trip fares save to this trip only. Auto Pricing and seat rules are managed on the route.</div>
    </div>
  );
}
