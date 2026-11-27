import { useMemo, useState } from "react";
import { api, type CoachDetail, type CoachSeatRow } from "../../api";
import { Modal, confirmDialog, toast, toastError } from "../../components/ui/feedback";

// React port of legacy vehicles-parity-v9.js coachModal(): tabs Coach Type / Amenities / Seat Layout, Generate Layout,
// deck diagram (coachDiagram) and the Seat Configuration table with editable seat IDs. Saves through POST/PUT /coaches.
const AMENITIES: [string, string][] = [["airConditioning", "Air Conditioning"], ["video", "Video/Entertainment"], ["washroom", "Washroom"], ["cctv", "CCTV"], ["emergencyExit", "Emergency Exit"],
  ["firstAidKit", "First Aid Kit"], ["fireExtinguisher", "Fire Extinguisher"], ["gpsTracking", "GPS Tracking"], ["wifi", "WiFi"], ["chargingPoint", "Charging Point"], ["readingLight", "Reading Light"],
  ["waterBottle", "Water Bottle"], ["blankets", "Blankets"], ["pillow", "Pillow"], ["bedSheet", "Bed Sheet"], ["snacks", "Snacks"], ["personalTv", "Personal TV"], ["pushBackSeats", "Push Back Seats"],
  ["emergencyHammer", "Emergency Hammer"], ["seatBelts", "Seat Belts"], ["fireDetectionSystem", "Fire Detection System"], ["panicButton", "Panic Button"]];
const norm = (a: string) => String(a).toLowerCase().replace(/[^a-z0-9]/g, "");
const hasAmen = (list: string[], key: string, label: string) => list.some((a) => norm(a) === norm(key) || norm(a) === norm(label));

export type CoachDraft = Omit<CoachDetail, "id"> & { id: number | null };
export const blankCoach = (): CoachDraft => ({ id: null, name: "", busType: "A/C Seater", pattern: "2+2", isAc: true, status: "active", amenities: [], vehicles: 0, routes: 0, seats: [] });

function Diagram({ seats }: { seats: CoachSeatRow[] }) {
  const decks = ["LOWER", "UPPER"].map((d) => seats.filter((s) => s.deck === d)).filter((x) => x.length);
  if (!decks.length) return <div className="vp-layout-blank">No seat layout configured. Edit this coach and choose Generate Layout to create one.</div>;
  return (
    <div className="vp-decks">{decks.map((ds, i) => {
      const cols = Math.max(4, ...ds.map((s) => s.col + (s.width || 1))), rows = Math.max(8, ...ds.map((s) => s.row + (s.length || 1)));
      return (
        <div key={i} className="vp-deck"><header><b>{ds[0].deck}</b></header>
          <div className="vp-grid-seats" style={{ ["--cols" as string]: cols, ["--rows" as string]: rows }}>
            {ds.map((s) => { const sl = s.seatType === "sleeper"; return (
              <button key={s.code} type="button" className={`vp-seat ${sl ? "sleeper" : "seater"}`} title={`${s.code} · ${sl ? "Sleeper" : "Seater"}`}
                style={{ gridRow: `${s.row + 1} / span ${Math.max(1, s.length || 1)}`, gridColumn: `${s.col + 1} / span ${Math.max(1, s.width || 1)}` }}><span>{s.code}</span>{sl ? <small>SLB</small> : null}</button>
            ); })}
          </div>
        </div>
      );
    })}</div>
  );
}

export function CoachModal({ coach, editing, onClose, onSaved }: { coach: CoachDraft; editing: boolean; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<CoachDraft>(() => JSON.parse(JSON.stringify(coach)));
  const [tab, setTab] = useState<"type" | "amenities" | "seats">("type");
  const [search, setSearch] = useState("");
  const [upper, setUpper] = useState(coach.seats.some((s) => s.deck === "UPPER"));
  const assigned = coach.vehicles + coach.routes > 0;
  const counts = useMemo(() => ({ seater: d.seats.filter((s) => s.seatType !== "sleeper").length, sleeper: d.seats.filter((s) => s.seatType === "sleeper").length }), [d.seats]);
  const bt = d.busType || "A/C Seater";
  const pickup = /pickup/i.test(bt), cat = /seater.*sleeper/i.test(bt) ? "Seater/Sleeper" : /sleeper/i.test(bt) ? "Sleeper" : "Seater", ac = /non a\/c/i.test(bt) ? "Non A/C" : "A/C";
  const setBusType = (p: { pickup?: boolean; ac?: string; cat?: string }) => {
    const a = p.ac ?? ac, c = p.cat ?? cat, pk = p.pickup ?? pickup;
    setD({ ...d, busType: `${a} ${c}${pk ? " Pickup Van" : ""}`, isAc: a === "A/C" });
  };
  const generate = async () => {
    if (!editing) return;
    if (assigned) { toast("Coach is in use. Existing seat layouts cannot be regenerated safely.", "bad"); return; }
    if (d.id && !(await confirmDialog("Regenerate this coach layout? Existing seat positions and labels will be replaced in this unsaved draft."))) return;
    const kind = /seater.*sleeper/i.test(bt) ? "seater_sleeper" : /sleeper/i.test(bt) ? "sleeper" : "seater";
    try {
      let seats = (await api.coachLayoutPreset(kind, d.pattern || "2+2")).seats;
      const hasUpper = seats.some((s) => s.deck === "UPPER");
      if (!upper && hasUpper) seats = seats.filter((s) => s.deck === "LOWER");
      if (upper && !hasUpper) seats = [...seats, ...seats.map((s) => ({ ...s, deck: "UPPER", code: `${s.code}U` }))];
      setD({ ...d, seats }); toast("Layout generated in editor; Save Changes to persist", "ok");
    } catch (e) { toastError(e); }
  };
  const save = async () => {
    if (!d.name.trim()) { toast("Coach Name is required", "bad"); return; }
    try {
      const body = { name: d.name, busType: d.busType, pattern: d.pattern, isAc: d.isAc, amenities: d.amenities, seats: d.seats.length ? d.seats : undefined };
      await api.saveCoach(body, d.id ?? undefined); toast("Coach saved", "ok"); onClose(); onSaved();
    } catch (e) { toastError(e); }
  };
  const dis = !editing;
  const field = (label: string, el: React.ReactNode) => <label className="vp-field"><span>{label}</span>{el}</label>;
  const sel = (label: string, opts: string[], v: string, on: (x: string) => void, name: string) =>
    field(label, <select name={name} value={v} disabled={dis} onChange={(e) => on(e.target.value)}>{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select>);
  const rows = d.seats.map((s, i) => ({ s, i })).filter(({ s }) => !search || `${s.code} ${s.seatType}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <Modal className="vp-overlay vp-overlay-coach" size="lg" onClose={onClose}
      title={<div className="vp-modal-title"><span className="vp-modal-icon">🚌</span><div><strong>{editing ? (d.id ? "Edit Coach" : "Add Coach") : "View Coach"}</strong><small>{coach.name || "New Coach"}</small></div></div>}
      foot={<div className="vp-footer"><button type="button" className="vp-btn outline" data-modal-cancel onClick={onClose}>Cancel</button>{editing && <button type="button" className="vp-btn primary" data-modal-save onClick={() => void save()}>✓ Save Changes</button>}</div>}>
      <div className="vp-coach-modal">
        <nav className="vp-modal-tabs">{([["type", "Coach Type"], ["amenities", "Amenities"], ["seats", "Seat Layout"]] as const).map(([k, l]) =>
          <button key={k} type="button" data-tab={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{l}</button>)}</nav>
        <div className="vp-coach-content" data-coach-content>
          {tab === "type" && <>
            <div className="vp-edit-fields">
              {field("Coach Name *", <input name="name" value={d.name} disabled={dis} onChange={(e) => setD({ ...d, name: e.target.value })} />)}
              {sel("Coach Type *", ["Regular", "Pickup Van"], pickup ? "Pickup Van" : "Regular", (x) => setBusType({ pickup: x === "Pickup Van" }), "coach_type")}
              {sel("A/C Type *", ["A/C", "Non A/C"], ac, (x) => setBusType({ ac: x }), "a_c_type")}
              {sel("Bus Category *", ["Seater", "Sleeper", "Seater/Sleeper"], cat, (x) => setBusType({ cat: x }), "bus_category")}
              {sel("Layout Type *", ["2+2", "2+1", "1+1"], d.pattern || "2+2", (x) => setD({ ...d, pattern: x }), "layout_type")}
              {field("Bus Type", <input name="bus_type" value={d.busType} disabled={dis} onChange={(e) => setD({ ...d, busType: e.target.value })} />)}
              {field("Total Seater Seats", <input name="seater_total" value={counts.seater} readOnly />)}
              {field("Total Sleeper Berths", <input name="sleeper_total" value={counts.sleeper} readOnly />)}
            </div>
            <label className="vp-checkbox"><input type="checkbox" name="upper_deck" checked={upper} disabled={dis} onChange={(e) => setUpper(e.target.checked)} /> Has Upper Deck</label>
          </>}
          {tab === "amenities" && <div className="vp-amenities-grid">{AMENITIES.map(([k, l]) => (
            <label key={k} className="vp-amenity"><input type="checkbox" data-amenity={k} disabled={dis} checked={hasAmen(d.amenities, k, l)}
              onChange={(e) => setD({ ...d, amenities: e.target.checked ? [...d.amenities, l] : d.amenities.filter((a) => !(norm(a) === norm(k) || norm(a) === norm(l))) })} /><span>{l}</span></label>
          ))}</div>}
          {tab === "seats" && <>
            <div className="vp-config-panel"><div><h3>Current Configuration</h3><p><b>Bus Type:</b> {d.busType || d.name || "Unspecified"}</p>
              <p><b>Layout:</b> {d.pattern || "—"} · {new Set(d.seats.map((s) => s.deck)).size} deck(s)</p><p><b>Seaters:</b> {counts.seater} | <b>Semi-Sleepers:</b> 0 | <b>Sleepers:</b> {counts.sleeper}</p>
              <p className="vp-config-total"><b>Total seats:</b> {d.seats.length}</p></div>
              <button type="button" className="vp-btn primary" data-generate disabled={dis} onClick={() => void generate()}>↻ Generate Layout</button></div>
            <div className="vp-seat-legend">{[["Available", "available"], ["Male (Booked)", "male"], ["Female (Booked)", "female"], ["Blocked", "blocked"], ["No-show", "no-show"], ["Selected", "selected"]].map(([t, c]) => <span key={c}><i className={c}></i> {t}</span>)}</div>
            <div className="vp-diagram-wrap"><Diagram seats={d.seats} /></div>
            <div className="vp-config-header"><h3>Seat Configuration <small>({d.seats.length} Total seats)</small></h3>
              <label className="vp-search"><input type="search" data-search-seat value={search} placeholder="Search by seat ID or type…" onChange={(e) => setSearch(e.target.value)} /></label></div>
            <div className="vp-seat-table-scroll"><table className="vp-table vp-seat-config"><thead><tr><th>#</th><th>Display Name (Editable)</th><th>Type</th><th>Deck</th><th>Orientation</th><th>Position (Grid)</th></tr></thead>
              <tbody>{rows.map(({ s, i }) => (
                <tr key={i} data-seat-row={i}><td>{i + 1}</td>
                  <td><input type="text" data-seat-label={i} value={s.code} disabled={dis || assigned} title={assigned ? "Assigned coaches cannot change seat IDs" : undefined}
                    onChange={(e) => { const seats = d.seats.slice(); seats[i] = { ...s, code: e.target.value }; setD({ ...d, seats }); }} /></td>
                  <td><span className={`vp-seat-kind ${s.seatType}`}>{s.seatType.toUpperCase()}</span></td><td>{s.deck === "UPPER" ? "Upper" : "Lower"}</td>
                  <td>{s.seatType === "sleeper" ? "Vertical" : "—"}</td><td>{`R${s.row + 1}C${s.col + 1}Z0`}</td></tr>
              ))}</tbody></table></div>
          </>}
        </div>
      </div>
    </Modal>
  );
}
