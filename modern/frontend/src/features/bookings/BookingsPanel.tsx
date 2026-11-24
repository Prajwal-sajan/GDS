import { useCallback, useEffect, useState } from "react";
import { api, type BookingCancellationQuote, type BookingCancellationResult, type BookingDeskDetail, type TripRow } from "../../api";
import "./bookings.css";

const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const err = (e: unknown) => e instanceof Error ? e.message : String(e);
type Subtab = "ticket" | "cancel" | "shift";

export function BookingsPanel({ initialPnr }: { initialPnr?: string }) {
  const [lookup, setLookup] = useState(initialPnr ?? "");
  const [ticket, setTicket] = useState<BookingDeskDetail>();
  const [subtab, setSubtab] = useState<Subtab>("ticket");
  const [selected, setSelected] = useState<string[]>([]);
  const [quote, setQuote] = useState<BookingCancellationQuote>();
  const [note, setNote] = useState("");
  const [shiftDate, setShiftDate] = useState(day());
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [target, setTarget] = useState("");
  const [seatCodes, setSeatCodes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<BookingCancellationResult>();

  const load = useCallback(async (pnr: string) => {
    setBusy(true); setMessage(""); setError(""); setTicket(undefined);
    setSelected([]); setQuote(undefined); setReceipt(undefined); setSubtab("ticket");
    try {
      const data = await api.bookingDetail(pnr);
      setTicket(data);
      setLookup(data.pnr);
    } catch (e) { setError(err(e)); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => {
    if (initialPnr) void load(initialPnr);
  }, [initialPnr, load]);

  useEffect(() => {
    if (!ticket || subtab !== "shift") return;
    let active = true;
    api.trips(shiftDate).then(rows => { if (active) setTrips(rows); })
      .catch(e => { if (active) setError(err(e)); });
    return () => { active = false; };
  }, [ticket, subtab, shiftDate]);

  const confirmed = ticket?.passengers.filter(p => p.status === "CONFIRMED") ?? [];
  const operatorBooking = ticket ? ["counter", "agent", "branch", "website"].includes(ticket.channel) : false;
  const canMutate = operatorBooking && confirmed.length > 0;

  const toggle = (seat: string) => {
    setQuote(undefined); setReceipt(undefined);
    setSelected(prev => prev.includes(seat) ? prev.filter(s => s !== seat) : [...prev, seat]);
  };
  const estimate = async () => {
    if (!ticket || !selected.length) return;
    setBusy(true); setError(""); setQuote(undefined);
    try { setQuote(await api.cancellationQuote(ticket.pnr, selected)); }
    catch (e) { setError(err(e)); }
    finally { setBusy(false); }
  };
  const cancel = async () => {
    if (!ticket || !quote || !note.trim()) return;
    const text = "Cancel " + quote.seats.join(", ") + " on " + ticket.pnr +
      "?\nEstimated charge " + inr(quote.charge) + ", refund obligation " + inr(quote.refund) +
      ". This releases seats and queues relevant inventory changes; money is NOT paid out automatically.";
    if (!window.confirm(text)) return;
    setBusy(true); setError(""); setReceipt(undefined);
    try {
      const result = await api.cancelBooking(ticket.pnr, quote.seats, note.trim());
      setReceipt(result); setQuote(undefined); setSelected([]);
      setTicket(await api.bookingDetail(ticket.pnr));
      setMessage("Cancellation recorded. Refund settlement remains pending.");
    } catch (e) { setError(err(e)); setQuote(undefined); }
    finally { setBusy(false); }
  };
  const shift = async () => {
    if (!ticket || !target) return;
    const seats = seatCodes.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
    if (seats.length !== confirmed.length || new Set(seats).size !== seats.length) {
      setError("Provide one unique replacement seat code per confirmed passenger."); return;
    }
    if (!window.confirm("Shift all " + confirmed.length + " confirmed passengers of " + ticket.pnr +
      " to service #" + target + "? Target route, inventory and booking conditions are verified by the server.")) return;
    setBusy(true); setError("");
    try {
      await api.shiftBooking(ticket.pnr, Number(target), seats);
      setMessage("Shift committed to the authoritative inventory. Verify new service and OTA delivery separately.");
      setTicket(await api.bookingDetail(ticket.pnr)); setSubtab("ticket");
    } catch (e) { setError(err(e)); }
    finally { setBusy(false); }
  };
  const boarding = async (seat: string, status: "Boarded" | "No-Show" | "Yet-To-Board") => {
    if (!ticket || !window.confirm("Mark " + ticket.pnr + " seat " + seat + " as " + status + "?")) return;
    setBusy(true); setError("");
    try { await api.markBoarding(ticket.pnr, seat, status); setTicket(await api.bookingDetail(ticket.pnr)); setMessage("Boarding status updated."); }
    catch (e) { setError(err(e)); }
    finally { setBusy(false); }
  };

  return <section className="booking-desk" data-testid="booking-desk">
    <div className="desk-title"><div><h2>Tickets & Bookings</h2><p className="muted">Live, tenant-scoped booking records — exact PNR lookup only.</p></div></div>
    <form className="row desk-search" onSubmit={e => {
      e.preventDefault(); const p = lookup.trim();
      if (!p || p.length > 80) { setError("Enter a valid exact PNR."); return; }
      void load(p);
    }}>
      <label>PNR <input aria-label="Find PNR" value={lookup} maxLength={80} onChange={e => setLookup(e.target.value)} autoComplete="off" required /></label>
      <button disabled={busy} type="submit">Find Ticket</button>
      {ticket && <button disabled={busy} type="button" className="link" onClick={() => void load(ticket.pnr)}>Refresh</button>}
    </form>
    {busy && <p role="status">Checking authoritative booking records…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p className="note" role="status">{message}</p>}
    {receipt && <div className="banner" role="status"><strong>Cancellation {receipt.status}</strong> · Charge {inr(receipt.charge)} · Refund obligation {inr(receipt.refund)}. {receipt.notice}</div>}
    {!ticket && <p className="muted">No passenger data is loaded until a PNR is searched.</p>}
    {ticket && <>
      <div className="desk-overview">
        <div><span className="muted">PNR</span><strong>{ticket.pnr}</strong></div>
        <div><span className="muted">Service ID</span><strong>#{ticket.tripId}</strong></div>
        <div><span className="muted">Status</span><strong>{ticket.status}</strong></div>
        <div><span className="muted">Channel</span><strong>{ticket.channel}</strong></div>
        <div><span className="muted">Total fare</span><strong>{inr(ticket.totalFare)}</strong></div>
      </div>
      <nav className="desk-tabs" aria-label="Booking actions">
        {(["ticket", "cancel", "shift"] as const).map(t => <button key={t} type="button" aria-current={subtab === t ? "page" : undefined}
          className={subtab === t ? "active" : "link"} onClick={() => { setSubtab(t); setError(""); }}>
          {t === "ticket" ? "Ticket & Boarding" : t === "cancel" ? "Cancel / Refund" : "Shift"}
        </button>)}
      </nav>
      {subtab === "ticket" && <div className="desk-ticket">
        <div className="row desk-ticket-actions"><h3>Passenger manifest</h3><button className="link" type="button" onClick={() => window.print()}>Print Ticket</button></div>
        <table><thead><tr><th>Seat</th><th>Passenger</th><th>Status</th><th>Boarding</th><th>Action</th></tr></thead>
          <tbody>{ticket.passengers.map(p => <tr key={p.seatCode}><td>{p.seatCode}</td><td>{p.name}</td><td>{p.status}</td>
            <td>{p.boardingStatus}</td><td>{p.status === "CONFIRMED" && <span className="desk-actions">
              <button className="link" disabled={busy} onClick={() => void boarding(p.seatCode, "Boarded")}>Boarded</button>
              <button className="link" disabled={busy} onClick={() => void boarding(p.seatCode, "No-Show")}>No-show</button>
            </span>}</td></tr>)}</tbody></table>
        <h3>Payment entries</h3>
        <table><thead><tr><th>Date</th><th>Method</th><th>Amount</th><th>Status</th><th>Reference (accounts only)</th></tr></thead>
          <tbody>{ticket.payments.map(p => <tr key={p.id}><td>{new Date(p.createdAt).toLocaleString("en-IN")}</td>
            <td>{p.method}</td><td>{inr(p.amount)}</td><td>{p.status}</td><td>{p.reference ?? "—"}</td></tr>)}</tbody></table>
        {ticket.finance && <p className="muted">Accounts evidence: net fare {inr(ticket.finance.netFare)} · GST {inr(ticket.finance.gst)} ·
          OTA commission {ticket.finance.otaCommission == null ? "not evidenced" : inr(ticket.finance.otaCommission)}.</p>}
      </div>}
      {subtab === "cancel" && <div className="desk-task">
        <h3>Passenger cancellation & refund calculation</h3>
        {!canMutate && <div className="banner warn" role="status">This ticket is provider-managed or has no confirmed seats. Cancellation must follow the authorized booking channel.</div>}
        {canMutate && <>
          <p className="muted">Choose seats and request a live server-side quote. The final charge is recalculated under a database lock when you confirm.</p>
          <div className="desk-checks">{confirmed.map(p => <label key={p.seatCode}><input type="checkbox" disabled={busy} checked={selected.includes(p.seatCode)}
            onChange={() => toggle(p.seatCode)} /> {p.seatCode} — {p.name}</label>)}</div>
          <button disabled={!selected.length || busy} onClick={() => void estimate()}>Calculate Refund</button>
          {quote && <div className="desk-quote">
            <h4>Estimated cancellation settlement</h4>
            <div className="desk-overview">
              <div>Selected fare <strong>{inr(quote.fare)}</strong></div>
              <div>Charge rate <strong>{quote.chargePercent}%</strong></div>
              <div>Cancellation charge <strong>{inr(quote.charge)}</strong></div>
              <div>Refund obligation <strong>{inr(quote.refund)}</strong></div>
            </div>
            <p className="muted">Quote at {new Date(quote.quotedAtUtc).toLocaleString("en-IN")}. {quote.settlementNotice}</p>
            <label>Cancellation reason / audit note <textarea aria-label="Cancellation reason" value={note} required maxLength={1000}
              onChange={e => setNote(e.target.value)} /></label>
            <button className="danger" disabled={busy || !note.trim()} onClick={() => void cancel()}>Confirm Cancellation</button>
          </div>}
        </>}
      </div>}
      {subtab === "shift" && <div className="desk-task">
        <h3>Whole-PNR service shift</h3>
        {!canMutate && <p className="banner warn">This booking cannot be shifted in the operator desk. Use the authorized channel.</p>}
        {canMutate && <>
          <p className="muted">All confirmed passengers shift together. The API validates route pair, seat availability, service state and gender constraints. Fare differences and provider approvals are not settled here.</p>
          <div className="row"><label>Target journey date<input type="date" value={shiftDate} onChange={e => { setShiftDate(e.target.value); setTarget(""); }} /></label>
          <label>Target service<select aria-label="Shift target service" value={target} onChange={e => setTarget(e.target.value)}>
            <option value="">Select an active service</option>
            {trips.filter(t => t.id !== ticket.tripId && t.status === "active" && t.bookable).map(t =>
              <option key={t.id} value={t.id}>{t.service} · {t.name} · {t.departure}</option>)}
          </select></label></div>
          <label>Replacement seat codes, in passenger order ({confirmed.map(p => p.seatCode).join(", ")})
            <input aria-label="Replacement seats" placeholder="L1, L2" value={seatCodes} onChange={e => setSeatCodes(e.target.value)} /></label>
          <button disabled={busy || !target || !seatCodes.trim()} onClick={() => void shift()}>Verify & Shift All Seats</button>
        </>}
      </div>}
    </>}
  </section>;
}
