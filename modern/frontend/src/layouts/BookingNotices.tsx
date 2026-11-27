import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, type Me } from "../api";
import { BookingOverlay } from "../features/crm/BookingOverlay";

// React port of legacy public/js/booking-notices-v39.js: global timed "new booking" notices (b39-* classes).
// Feed: GET /api/admin/bookings/live-events-v39 — first call is a baseline (no history replay), then poll every 3 s.
// Max 2 visible, 12 s each, pause on hover/focus, progress rail; PNR opens the booking overlay.
type Ev = { id: number; pnr: string; ticket_number: string | null; kind: string; vehicle_registration: string | null; service: string;
  passenger_count: number; passenger_name: string; seats: string[]; boarding: string; dropping: string };
const DURATION = 12000, MAX_VISIBLE = 2;

const Svg = ({ d, s }: { d: JSX.Element; s: number }) => <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;

function Card({ ev, onClose, onPnr }: { ev: Ev; onClose: () => void; onPnr: () => void }) {
  const [left, setLeft] = useState(DURATION);
  const [exit, setExit] = useState(false);
  const paused = useRef(false);
  useEffect(() => {
    let last = Date.now();
    const t = setInterval(() => {
      const now = Date.now(), el = now - last; last = now;
      if (paused.current || document.hidden) return;
      setLeft((l) => Math.max(0, l - el));
    }, 125);
    return () => clearInterval(t);
  }, []);
  const close = () => { setExit(true); setTimeout(onClose, 200); };
  useEffect(() => { if (left <= 0) close(); }, [left]); // eslint-disable-line react-hooks/exhaustive-deps
  const pct = Math.round((100 * left) / DURATION);
  const vehicle = ev.vehicle_registration || ev.service || "Unassigned vehicle";
  const passenger = `${ev.passenger_name || "Passenger"} · ${ev.passenger_count} seat${ev.passenger_count === 1 ? "" : "s"}`;
  return (
    <section className={`b39-card${exit ? " b39-exit" : ""}`} role="status" aria-label={`New passenger booking ${passenger}`}
      onMouseEnter={() => { paused.current = true; }} onMouseLeave={() => { paused.current = false; }}
      onFocus={() => { paused.current = true; }} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) paused.current = false; }}>
      <div className="b39-icon"><Svg s={25} d={<><circle cx="12" cy="12" r="10" /><path d="M12 11v6m0-10h.01" /></>} /></div>
      <div className="b39-copy"><div className="b39-title">{ev.kind === "in_trip_booking" ? "In-trip booking" : "New booking"} — {vehicle}</div>
        <div className="b39-line">{passenger}</div>
        <div className="b39-line">Seat{ev.seats.length === 1 ? "" : "s"}: {ev.seats.join(", ")}</div>
        <div className="b39-line">Board: {ev.boarding || "Not assigned"}</div>
        <div className="b39-line">Drop: {ev.dropping || "Not assigned"}</div>
        <div className="b39-line">PNR: <button type="button" className="b39-pnr" data-b39-pnr="" onClick={() => { close(); onPnr(); }}>{ev.ticket_number || ev.pnr}</button></div></div>
      <button className="b39-dismiss" type="button" data-b39-close="" title="Dismiss notification" aria-label="Dismiss booking notification" onClick={close}><Svg s={21} d={<path d="M18 6 6 18M6 6l12 12" />} /></button>
      <div className="b39-progress-rail" role="progressbar" aria-label="Time remaining before notification closes" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <span className="b39-progress-fill" style={{ width: `${pct}%` }}></span></div>
    </section>
  );
}

export function BookingNotices({ me }: { me: Me }) {
  const [shown, setShown] = useState<Ev[]>([]);
  const [open, setOpen] = useState<string>();
  const queue = useRef<Ev[]>([]);
  const seen = useRef(new Set<number>());
  const pump = () => setShown((s) => { const n = [...s]; while (n.length < MAX_VISIBLE && queue.current.length) n.push(queue.current.shift()!); return n; });
  useEffect(() => {
    let cursor: string | null = null, running = false, alive = true;
    const poll = async () => {
      if (running || !alive) return; running = true;
      try {
        const r = await api.admin<{ cursor: number; events: Ev[] }>(`/bookings/live-events-v39${cursor === null ? "" : `?since_id=${encodeURIComponent(cursor)}`}`);
        if (!alive) return;
        for (const e of r.events) {
          if (!e?.pnr || seen.current.has(e.id)) continue;
          seen.current.add(e.id); queue.current.push(e); if (queue.current.length > 30) queue.current.shift();
        }
        cursor = String(r.cursor); pump();
      } catch (e) { if ((e as { status?: number }).status === 400) cursor = null; } // cursor reset → baseline again
      finally { running = false; }
    };
    void poll(); const t = setInterval(poll, 3000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const dismiss = (id: number) => { setShown((s) => s.filter((x) => x.id !== id)); setTimeout(pump, 0); };
  return <>
    {createPortal(<div id="b39-booking-notices" className="b39-notice-stack" aria-label="New booking notifications">
      {shown.map((e) => <Card key={e.id} ev={e} onClose={() => dismiss(e.id)} onPnr={() => setOpen(e.pnr)} />)}</div>, document.body)}
    {open && <BookingOverlay me={me} pnr={open} onClose={() => setOpen(undefined)} />}
  </>;
}
