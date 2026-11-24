import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Port of legacy G.niceDate + G.calendarPop (public/js/ui-common.js): native <input type=date class="ui-dd-native"> keeps
// the value / form semantics, followed by <button class="ui-date-btn">; clicking the host label opens a body-level
// <div class="ui-calpop" role=dialog>. Same DOM → same legacy CSS.
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmt = (v: string) => { const d = v ? new Date(`${v}T00:00:00`) : null; return d && !isNaN(+d) ? d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }) : "Select date"; };

function CalendarPop({ anchor, value, onPick, onClose, clear }: { anchor: Element; value: string; onPick: (v: string) => void; onClose: () => void; clear?: boolean }) {
  const pop = useRef<HTMLDivElement>(null);
  const [cur, setCur] = useState(() => { const d = value ? new Date(`${value}T00:00:00`) : new Date(); const c = isNaN(+d) ? new Date() : d; return new Date(c.getFullYear(), c.getMonth(), 1); });
  const r = anchor.getBoundingClientRect();
  const style = { left: Math.max(8, Math.min(r.right - 320, innerWidth - 336)), top: r.bottom + 400 > innerHeight ? Math.max(8, r.top - 396) : r.bottom + 6 };
  useEffect(() => {
    const off = (e: MouseEvent) => { if (!pop.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("click", off, true); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("click", off, true); document.removeEventListener("keydown", key); };
  }, [anchor, onClose]);
  const y = cur.getFullYear(), m = cur.getMonth(), start = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate(), td = iso(new Date());
  const pick = (v: string) => { onClose(); onPick(v); };
  const quick = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); pick(iso(d)); };
  return createPortal(
    <div ref={pop} className="ui-calpop" role="dialog" aria-label="Choose date" style={style} onClick={(e) => e.stopPropagation()}>
      <div className="ui-cal-head">
        <button type="button" data-nav="-1" aria-label="Previous month" onClick={() => setCur(new Date(y, m - 1, 1))}>‹</button>
        <b>{cur.toLocaleString("en-IN", { month: "long", year: "numeric" })}</b>
        <button type="button" data-nav="1" aria-label="Next month" onClick={() => setCur(new Date(y, m + 1, 1))}>›</button>
      </div>
      <div className="ui-cal-week">{["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((x) => <span key={x}>{x}</span>)}</div>
      <div className="ui-cal-grid">
        {Array.from({ length: start }, (_, i) => <span key={`s${i}`}></span>)}
        {Array.from({ length: days }, (_, i) => { const v = iso(new Date(y, m, i + 1)); return <button key={v} type="button" className={`${v === value ? "selected" : ""}${v === td ? " today" : ""}`} data-day={v} onClick={() => pick(v)}>{i + 1}</button>; })}
      </div>
      <div className="ui-cal-quick">
        <button type="button" data-quick="0" onClick={() => quick(0)}>Today</button>
        <button type="button" data-quick="1" onClick={() => quick(1)}>Tomorrow</button>
        <button type="button" data-quick="7" onClick={() => quick(7)}>+7 days</button>
        {clear && <button type="button" data-clear="" onClick={() => pick("")}>Clear</button>}
      </div>
    </div>, document.body);
}

/** Renders `<input type=date class=ui-dd-native>` + `<button class=ui-date-btn>`; place inside the host `<label>` (as legacy). */
export function NiceDate({ name, value, onChange, label, clear }: { name?: string; value: string; onChange: (v: string) => void; label?: string; clear?: boolean }) {
  const btn = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<Element | null>(null);
  useEffect(() => {
    const host = btn.current?.closest("label") ?? btn.current;
    if (!host) return;
    const open = (e: Event) => {
      if ((e.target as Element).closest(".ui-calpop")) return;
      e.preventDefault(); e.stopPropagation();
      setAnchor((a) => (a ? null : host));
    };
    host.addEventListener("click", open);
    return () => host.removeEventListener("click", open);
  }, []);
  return (
    <>
      <input type="date" name={name} value={value} aria-label={label} className="ui-dd-native" onChange={(e) => onChange(e.target.value)} />
      <button ref={btn} type="button" className="ui-date-btn" aria-haspopup="dialog" aria-label={label ?? "Choose date"}>
        <span>{fmt(value)}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {anchor && <CalendarPop anchor={anchor} value={value} clear={clear} onClose={() => setAnchor(null)} onPick={onChange} />}
    </>
  );
}
