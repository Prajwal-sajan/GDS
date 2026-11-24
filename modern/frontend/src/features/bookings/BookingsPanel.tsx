import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type BookingCancelQuote, type BookingHistoryEvent, type BookingListRow,
  type BookingShiftOption, type BookingWorkspaceView } from "../../api";
import { SeatLayoutView } from "../schedules/SeatLayoutView";
import { type ScheduleSeatLayout } from "../schedules/seatLayoutModel";
import "./bookings.css";

const todayIndia=()=>new Date(Date.now()+330*60000).toISOString().slice(0,10);
const message=(e:unknown)=>e instanceof Error?e.message:String(e);
const price=(v:number)=>"₹"+v.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
const timestamp=(v:string|null)=>v?new Date(v).toLocaleString("en-IN",
  {dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Kolkata"}):"—";
type Tab="ticket"|"update"|"history"|"shift"|"cancel"|"comment";
function StatusPill({status}:{status:string}){
  return <span className={"bw-status bw-"+status.toLowerCase().replace(/[^a-z]+/g,"-")}>{status}</span>;
}
function TicketView({booking,onBoarding}:{booking:BookingWorkspaceView;
  onBoarding:(seat:string,status:string)=>void}) {
  const active=booking.passengers.filter(x=>x.status==="CONFIRMED").length;
  return <article className="bw-ticket" data-testid="booking-ticket">
    <header className="bw-ticket-orange">
      <div><span>JOURNEY TICKET</span><h2>{booking.serviceNumber} · {booking.fromCity} → {booking.toCity}</h2>
        <p>{booking.routeName} · {booking.coachName||"Coach type not provided"}</p></div>
      <div className="bw-ticket-badge"><small>PNR</small><b>{booking.pnr}</b></div>
    </header>
    <div className="bw-ticket-meta">
      <div><small>BOOKING STATUS</small><StatusPill status={booking.status}/></div>
      <div><small>JOURNEY DATE</small><b>{booking.travelDate}</b></div>
      <div><small>BOOKED ON</small><b>{timestamp(booking.dateOfIssue)}</b></div>
      <div><small>BOOKING SOURCE</small><b>{booking.channel}</b></div>
      <div><small>CONFIRMED SEATS</small><b>{active}</b></div>
    </div>
    <div className="bw-stops">
      <section><small>BOARDING POINT</small><h3>{booking.boarding?.name||"Not recorded"}</h3>
        <p>{booking.fromCity}</p><p>Day {booking.boarding?.day??"—"} · {booking.boarding?.time?.slice(0,5)||"—"}</p>
        <p>{booking.boarding?.address||""} {booking.boarding?.landmark||""}</p></section>
      <section><small>DROPPING POINT</small><h3>{booking.dropping?.name||"Not recorded"}</h3>
        <p>{booking.toCity}</p><p>Day {booking.dropping?.day??"—"} · {booking.dropping?.time?.slice(0,5)||"—"}</p>
        <p>{booking.dropping?.address||""} {booking.dropping?.landmark||""}</p></section>
    </div>
    <div className="bw-ticket-section">
      <h3>Passenger Details</h3>
      <div className="bw-table-scroll"><table><thead><tr><th>Seat</th><th>Passenger</th><th>Gender</th>
        <th>Age</th><th>Ticket Status</th><th>Base</th><th>GST</th><th>Fare</th>
        <th className="bw-no-print">Boarding</th></tr></thead><tbody>
        {booking.passengers.map(p=><tr key={p.id}>
          <td><b>{p.seatCode}</b></td><td>{p.name}</td><td>{p.gender}</td><td>{p.age}</td>
          <td><StatusPill status={p.status}/></td>
          <td>{price(p.baseFare)}</td><td>{price(p.gst)}</td><td>{price(p.fare)}</td>
          <td className="bw-no-print">{p.status==="CONFIRMED"?
            <select aria-label={"Boarding status "+p.seatCode} value={p.boardingStatus}
              onChange={e=>onBoarding(p.seatCode,e.target.value)}>
              <option value="Yet-To-Board">Yet-To-Board</option>
              <option value="Boarded">Boarded</option>
              <option value="No-Show">No-Show</option>
            </select>:p.status}</td>
        </tr>)}</tbody></table></div>
      <div className="bw-totals">
        <span>Recorded ticket total</span><strong>{price(booking.totalFare)}</strong>
      </div>
    </div>
    <div className="bw-ticket-section">
      <h3>Booking Contact</h3>
      <p>Mobile: {booking.contactMobile||"Not recorded"} · Email: {booking.contactEmail||"Not recorded"}</p>
      <h3>Cancellation Policy</h3>
      <p>{booking.cancellationPolicy||"No policy text is available on this booking. Contact operator accounts before cancellation."}</p>
      {booking.refunds.length>0&&<div className="bw-pending-refund"><b>Refund obligations</b>
        {booking.refunds.map((r,i)=><p key={i}>{price(r.amount)} · {r.status} · {timestamp(r.createdAt)}
          · seats {r.seats.join(", ")}</p>)}
        <small>A refund obligation is not evidence of actual payout or bank settlement.</small></div>}
    </div>
    <footer className="bw-ticket-foot">
      <b>Operator-issued booking information</b>
      <p>Amounts, passengers and journey points originate from the authorized GDS booking record.
        This ticket view does not imply a statutory tax invoice, verified refund payment,
        or outbound WhatsApp delivery. Original operator legal branding must be configured separately.</p>
    </footer>
  </article>;
}
export function BookingDetailsPanel({pnr,onClose,onChanged}:{pnr:string;onClose:()=>void;onChanged?:()=>void}) {
  const [booking,setBooking]=useState<BookingWorkspaceView>();
  const [tab,setTab]=useState<Tab>("ticket");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [revision,setRevision]=useState(0);
  const [history,setHistory]=useState<BookingHistoryEvent[]>([]);
  const [mobile,setMobile]=useState("");
  const [boarding,setBoarding]=useState<number>();
  const [dropping,setDropping]=useState<number>();
  const [shiftDate,setShiftDate]=useState(todayIndia());
  const [options,setOptions]=useState<BookingShiftOption[]>([]);
  const [targetId,setTargetId]=useState("");
  const [targetLayout,setTargetLayout]=useState<ScheduleSeatLayout>();
  const [targetSeats,setTargetSeats]=useState<Record<string,string>>({});
  const [cancelSeats,setCancelSeats]=useState<string[]>([]);
  const [quote,setQuote]=useState<BookingCancelQuote>();
  const [cancelReason,setCancelReason]=useState("customer");
  const [cancelNote,setCancelNote]=useState("");
  const [comment,setComment]=useState("");
  const closeRef=useRef<HTMLButtonElement>(null);
  const load=useCallback(()=>setRevision(v=>v+1),[]);
  useEffect(()=>{closeRef.current?.focus();
    const handle=(e:KeyboardEvent)=>{if(e.key==="Escape")onClose();};
    document.addEventListener("keydown",handle);
    return ()=>document.removeEventListener("keydown",handle);},[onClose]);
  useEffect(()=>{
    let live=true;setError("");
    api.bookingWorkspace(pnr).then(x=>{
      if(!live)return;
      setBooking(x);setMobile(x.contactMobile||"");
      setBoarding(x.boardingStageId);setDropping(x.droppingStageId);
    }).catch(e=>{if(live)setError(message(e));});
    return ()=>{live=false;};
  },[pnr,revision]);
  useEffect(()=>{
    if(tab!=="history")return;
    let active=true;
    api.bookingHistory(pnr).then(x=>{if(active)setHistory(x);})
      .catch(e=>{if(active)setError(message(e));});
    return ()=>{active=false;};
  },[tab,pnr,revision]);
  useEffect(()=>{
    if(tab!=="shift")return;
    let live=true;
    setOptions([]);setTargetLayout(undefined);setTargetId("");setTargetSeats({});
    api.bookingShiftOptions(pnr,shiftDate).then(x=>{if(live)setOptions(x);})
      .catch(e=>{if(live)setError(message(e));});
    return ()=>{live=false;};
  },[tab,pnr,shiftDate]);
  const target=options.find(x=>x.id===Number(targetId));
  useEffect(()=>{
    if(!target){setTargetLayout(undefined);return;}
    let current=true;setTargetLayout(undefined);
    api.scheduleLayout(target.id,target.fromSequence,target.toSequence)
      .then(x=>{if(current)setTargetLayout(x);}).catch(e=>{if(current)setError(message(e));});
    return ()=>{current=false;};
  },[target?.id,target?.fromSequence,target?.toSequence]);
  useEffect(()=>{
    if(tab!=="cancel"||!cancelSeats.length){setQuote(undefined);return;}
    let active=true;setQuote(undefined);
    api.bookingCancellationQuote(pnr,cancelSeats)
      .then(q=>{if(active)setQuote(q);}).catch(e=>{if(active)setError(message(e));});
    return ()=>{active=false;};
  },[tab,pnr,cancelSeats]);
  const change=async(fn:()=>Promise<unknown>,ok:string)=>{
    setBusy(true);setError("");setNotice("");
    try{await fn();load();onChanged?.();setNotice(ok);}
    catch(e){setError(message(e));}finally{setBusy(false);}
  };
  const saveEdit=()=>{
    if(mobile&&!/^\d{10,13}$/.test(mobile)){setError("Mobile must contain 10–13 digits.");return;}
    if(!window.confirm("Save booking mobile and selected stages? Existing fare/route segment will not change."))return;
    void change(()=>api.bookingUpdate(pnr,{mobile:mobile||null,boardingAt:boarding??null,dropOff:dropping??null}),
      "Booking updated and reloaded from the server.");
  };
  const notifyBoarding=(seat:string,status:string)=>{
    void change(()=>api.bookingBoarding(pnr,seat,status),
      "Boarding status saved. No external message was claimed or sent.");
  };
  const confirmed=booking?.passengers.filter(p=>p.status==="CONFIRMED")||[];
  const assignedSeats=confirmed.map(p=>targetSeats[p.seatCode]||"");
  const shiftReady=Boolean(targetLayout&&confirmed.length>0&&assignedSeats.every(x=>x)&&
    new Set(assignedSeats).size===confirmed.length);
  const shift=()=>{
    if(!target||!shiftReady)return;
    if(!window.confirm("Shift all "+confirmed.length+" confirmed passengers to "+target.serviceNumber+
      " on "+target.travelDate+"? This changes seat inventory transactionally."))return;
    void change(async()=>{
      await api.bookingShift(pnr,target.id,assignedSeats);
      setTab("ticket");setTargetId("");setTargetLayout(undefined);setTargetSeats({});
    },"Booking shift recorded; both old and new service inventories must be refreshed.");
  };
  const cancel=()=>{
    if(!quote||!cancelSeats.length||!cancelNote.trim()){setError("Select seats, obtain a refund quote and enter cancellation reason.");return;}
    if(!window.confirm("CANCEL "+cancelSeats.join(", ")+" on PNR "+pnr+
      "? Approximate cancellation charge "+price(quote.charge)+
      ", refund obligation "+price(quote.refund)+
      ". Final amounts are recalculated at confirmation. No gateway refund will be sent now."))return;
    void change(async()=>{
      const result=await api.bookingCancel(pnr,cancelSeats,cancelReason,cancelNote);
      setCancelSeats([]);setQuote(undefined);setTab("ticket");
      setNotice("Cancelled. Charge "+price(result.charge)+"; refund obligation "+
        price(result.refund)+" ("+result.refundObligation+"). Not yet paid.");
    },"Cancellation recorded.");
  };
  const saveComment=()=>{
    if(!comment.trim()){setError("Enter an internal comment.");return;}
    void change(async()=>{await api.bookingComment(pnr,comment.trim());setComment("");setTab("history");},
      "Staff-only PNR comment recorded.");
  };
  const title=booking?.serviceNumber||"PNR";
  return <div className="bw-overlay">
    <section className="bw-modal" role="dialog" aria-modal="true" aria-label={"Booking "+pnr}>
      <header className="bw-modal-header">
        <div><h2>Booking Details <span>{pnr}</span></h2>
          <p>{title} · {booking?.fromCity||"—"} → {booking?.toCity||"—"}</p></div>
        <button ref={closeRef} type="button" aria-label="Close booking details" onClick={onClose}>✕ Close</button>
      </header>
      <nav className="bw-actions" aria-label="Booking actions">
        {([{id:"ticket",label:"Ticket"},{id:"update",label:"Update Ticket"},
          {id:"shift",label:"Shift Passenger"},{id:"cancel",label:"Cancel Ticket"},
          {id:"history",label:"Show History"},{id:"comment",label:"Comment"}] as const).map(x=>
            <button key={x.id} type="button" className={tab===x.id?"active":""}
              onClick={()=>{setTab(x.id);setError("");setNotice("");}}>{x.label}</button>)}
        <button type="button" disabled={!booking} onClick={()=>window.print()}>Print Ticket</button>
        <button type="button" disabled title="Statutory invoice issuance is not yet implemented in modern .NET">Print Invoice</button>
        <button type="button" disabled title="External notifications require verified provider delivery">Notify</button>
        <button type="button" disabled title="Live outbound WhatsApp integration not yet certified">Chat Pax</button>
      </nav>
      <div className="bw-modal-body">
        {error&&<p className="bw-alert" role="alert">{error}</p>}
        {notice&&<p className="bw-notice" role="status">{notice}</p>}
        {!booking&&!error&&<p role="status">Loading authorized ticket details…</p>}
        {booking&&tab==="ticket"&&<TicketView booking={booking} onBoarding={notifyBoarding}/>}
        {booking&&tab==="update"&&<section className="bw-edit-card">
          <h3>Edit Booking</h3><p>Only updates supported by the validated .NET booking API are enabled.
            Passenger identity, gender and fare edits cannot bypass the original booking contract.</p>
          <div className="bw-edit-grid">
            <label>Mobile number<input aria-label="Booking mobile" value={mobile}
              maxLength={13} inputMode="numeric" onChange={e=>setMobile(e.target.value)}/></label>
            <label>Pickup point<select aria-label="Pickup point" value={boarding??""}
              onChange={e=>setBoarding(Number(e.target.value))}>
              {booking.availableBoarding.map(s=><option key={s.id} value={s.id}>
                {s.name} · Day {s.day} · {s.time.slice(0,5)}</option>)}</select></label>
            <label>Drop point<select aria-label="Drop point" value={dropping??""}
              onChange={e=>setDropping(Number(e.target.value))}>
              {booking.availableDropping.map(s=><option key={s.id} value={s.id}>
                {s.name} · Day {s.day} · {s.time.slice(0,5)}</option>)}</select></label>
            <label>Passenger email (read only)<input value={booking.contactEmail||""} readOnly/></label>
          </div>
          <div className="bw-form-footer"><button onClick={()=>setTab("ticket")}>Back</button>
            <button disabled={busy||booking.status==="CANCELLED"} onClick={saveEdit}>Save Changes</button></div>
        </section>}
        {booking&&tab==="history"&&<section className="bw-edit-card">
          <h3>Booking History</h3><p>Chronological events actually present in the booking and audit tables.</p>
          <ol className="bw-timeline">{history.map((h,i)=><li key={h.id+"-"+i}>
            <time dateTime={h.at}>{timestamp(h.at)}</time>
            <div><b>{h.action.replace(/_/g," ")}</b><small>{h.actor}</small>
              {h.comment&&<p>{h.comment}</p>}</div>
          </li>)}</ol>
          {!history.length&&<p className="bw-muted">No additional recorded events.</p>}
        </section>}
        {booking&&tab==="comment"&&<section className="bw-edit-card">
          <h3>Internal Comment</h3><p>This note is private to authorized GDS staff and is not sent to the passenger.</p>
          <textarea rows={5} maxLength={2000} value={comment} aria-label="Internal PNR comment"
            placeholder="Write a staff-only note about this booking…" onChange={e=>setComment(e.target.value)}/>
          <div className="bw-form-footer"><button onClick={()=>setTab("ticket")}>Back</button>
            <button disabled={busy||!comment.trim()} onClick={saveComment}>Save Comment</button></div>
        </section>}
        {booking&&tab==="shift"&&<section className="bw-edit-card">
          <h3>Shift Passenger</h3><p>All currently confirmed passengers are shifted together.
            The .NET inventory service verifies route compatibility, stops, seat conflicts and availability.</p>
          <div className="bw-edit-grid">
            <label>Target service departure date<input type="date" value={shiftDate}
              onChange={e=>setShiftDate(e.target.value)}/></label>
            <label>Available service<select aria-label="Shift target service" value={targetId}
              onChange={e=>{setTargetId(e.target.value);setTargetSeats({});}}>
              <option value="">Select compatible active service…</option>
              {options.map(x=><option key={x.id} value={x.id}>{x.serviceNumber} · {x.departure}
                · {x.routeName} · {x.coachName||""}</option>)}</select></label>
          </div>
          {!options.length&&<p className="bw-muted">No compatible active service found for this date.</p>}
          {targetLayout&&<div className="bw-shift-content">
            <SeatLayoutView layout={targetLayout}/>
            <div><h4>Seat assignment</h4>
              {confirmed.map(p=><label className="bw-shift-row" key={p.id}>
                <span><b>{p.seatCode}</b> · {p.name}</span>
                <select aria-label={"New seat for "+p.seatCode} value={targetSeats[p.seatCode]||""}
                  onChange={e=>setTargetSeats(x=>({...x,[p.seatCode]:e.target.value}))}>
                  <option value="">Choose a seat…</option>
                  {targetLayout.seats.filter(s=>s.state==="available")
                    .map(s=><option key={s.seatCode} value={s.seatCode}>{s.seatCode} · {s.deck}</option>)}
                </select></label>)}
            </div></div>}
          <div className="bw-form-footer"><button onClick={()=>setTab("ticket")}>Back</button>
            <button disabled={busy||!shiftReady} onClick={shift}>Confirm Shift</button></div>
        </section>}
        {booking&&tab==="cancel"&&<section className="bw-edit-card">
          <h3>Cancel Ticket</h3><p>Select confirmed seats, review the cancellation quote and record an
            explicit reason. No refund payment is considered successful until separately settled.</p>
          <div className="bw-cancel-seats">{confirmed.map(p=><label key={p.id}>
            <input type="checkbox" checked={cancelSeats.includes(p.seatCode)}
              onChange={e=>setCancelSeats(old=>e.target.checked?[...old,p.seatCode]:
                old.filter(x=>x!==p.seatCode))}/>
            <span><b>{p.seatCode}</b> · {p.name} · {price(p.fare)}</span></label>)}</div>
          {quote&&<div className="bw-refund-quote">
            <h4>Estimated cancellation quotation</h4>
            <div><span>Selected fare</span><strong>{price(quote.totalFare)}</strong></div>
            <div><span>Policy charge ({quote.percent}%)</span><strong>{price(quote.charge)}</strong></div>
            <div><span>Refund obligation (not yet paid)</span><strong>{price(quote.refund)}</strong></div>
            <p>Final cancellation amounts are recalculated transactionally at confirmation.
              Payout status remains pending settlement.</p>
          </div>}
          <div className="bw-edit-grid">
            <label>Cancellation reason<select value={cancelReason}
              onChange={e=>setCancelReason(e.target.value)} aria-label="Cancellation reason">
              <option value="customer">Customer requested</option>
              <option value="operator_request">Operator request</option>
            </select></label>
            <label>Notes / evidence<textarea aria-label="Cancellation note" rows={3}
              value={cancelNote} maxLength={2000} onChange={e=>setCancelNote(e.target.value)}/></label>
          </div>
          <div className="bw-form-footer"><button onClick={()=>setTab("ticket")}>Back</button>
            <button className="bw-danger-button" disabled={busy||!quote||!cancelNote.trim()}
              onClick={cancel}>Confirm Cancellation</button></div>
        </section>}
      </div>
      <footer className="bw-modal-footer"><button onClick={onClose}>✕ Close</button></footer>
    </section>
  </div>;
}
export function BookingsPanel() {
  const [date,setDate]=useState(todayIndia());
  const [query,setQuery]=useState("");
  const [rows,setRows]=useState<BookingListRow[]>([]);
  const [pnr,setPnr]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    let live=true;setBusy(true);setError("");
    api.bookingSearch(date,query).then(x=>{if(live)setRows(x);})
      .catch(e=>{if(live)setError(message(e));})
      .finally(()=>{if(live)setBusy(false);});
    return ()=>{live=false;};
  },[date,query,revision]);
  const active=useMemo(()=>rows.filter(x=>x.status!=="CANCELLED").length,[rows]);
  return <section className="bw-page" data-testid="bookings-page">
    <header className="bw-page-heading">
      <div><small>GDS / BOOKING OPERATIONS</small><h1>Bookings</h1>
        <p>Search PNRs, inspect tickets, manage boarding, change stops, shift and cancel passengers.</p></div>
      <span>{active} active PNRs in current results</span>
    </header>
    <div className="bw-searchbar">
      <label>Journey Date<input type="date" value={date} onChange={e=>setDate(e.target.value)}
        aria-label="Booking journey date"/></label>
      <label>Search PNR or passenger<input value={query} onChange={e=>setQuery(e.target.value)}
        placeholder="PNR or passenger name…" aria-label="Search bookings"/></label>
      <button onClick={()=>setRevision(v=>v+1)}>↻ Refresh</button>
      <span>Showing {rows.length} bookings</span>
    </div>
    {error&&<p className="bw-alert" role="alert">{error}</p>}
    {busy&&<p className="bw-muted" role="status">Loading authorized booking records…</p>}
    <div className="bw-list">
      {rows.map(row=><article className="bw-list-row" key={row.pnr}>
        <div><b>{row.pnr}</b><small>{row.channel} · {timestamp(row.dateOfIssue)}</small></div>
        <div>{row.passengers.map(p=>p.name).join(", ")||"Passenger not recorded"}</div>
        <div><b>{row.seatCount} seats</b><small>{row.passengers.map(p=>p.seatCode).join(", ")}</small></div>
        <div><strong>{price(row.totalFare)}</strong><StatusPill status={row.status}/></div>
        <button type="button" onClick={()=>setPnr(row.pnr)}>View Ticket</button>
      </article>)}
      {!busy&&!rows.length&&<p className="bw-empty">No bookings found on this journey date.</p>}
    </div>
    {pnr&&<BookingDetailsPanel pnr={pnr} onClose={()=>setPnr("")}
      onChanged={()=>setRevision(v=>v+1)}/>}
  </section>;
}
