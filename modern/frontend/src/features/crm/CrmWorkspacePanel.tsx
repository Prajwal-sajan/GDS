import {useEffect,useMemo,useState} from "react";
import {api,type BookingView,type CustomerDetail,type CustomerHit,type BookingWorkspaceView} from "../../api";
import {BookingDetailsPanel} from "../bookings/BookingsPanel";
import {SeatLayoutView} from "../schedules/SeatLayoutView";
import {type ScheduleSeatLayout} from "../schedules/seatLayoutModel";
import "./crm.css";

type SearchMode="phone"|"name"|"pnr";
type CustomerTab="trips"|"loyalty"|"notes"|"calls"|"messages"|"ratings";
const money=(x:number)=>"₹"+x.toLocaleString("en-IN",{maximumFractionDigits:2});
const errorText=(e:unknown)=>e instanceof Error?e.message:String(e);
const fmt=(s:string|null)=>s?new Date(s).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}):"—";
const icons:Record<string,string>={
  phone:"M5 4h4l2 5-2 2c1.5 2.5 3.5 4.5 6 6l2-2 5 2v4c-10 3-20-7-17-17z",
  search:"M21 21l-5-5M18 10a8 8 0 11-16 0 8 8 0 0116 0",
  bag:"M4 7h16v14H4zM8 7V5a4 4 0 018 0v2",
  star:"M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z",
  user:"M12 12a4 4 0 110-8 4 4 0 010 8zM4 21a8 8 0 0116 0",
  ticket:"M4 5h16v5a2 2 0 000 4v5H4v-5a2 2 0 000-4V5z",
  note:"M5 3h14v18H5zm3 5h8m-8 4h8",
  close:"M5 5l14 14M19 5 5 19",
};
const Icon=({name}:{name:string})=><svg width="20" height="20" viewBox="0 0 24 24"
  stroke="currentColor" fill="none" strokeWidth="1.8" strokeLinecap="round"
  strokeLinejoin="round" aria-hidden="true"><path d={icons[name]||icons.user}/></svg>;
function CustomerMetric({label,value,variant=""}:{label:string;value:string|number;variant?:string}){
  return <div className={"crm-metric crm-"+variant}><small>{label}</small><b>{value}</b></div>;
}
function RecentJourney({pnr,onClose,onOpenTicket}:{pnr:string;onClose:()=>void;onOpenTicket:()=>void}){
  const [data,setData]=useState<BookingWorkspaceView>();
  const [layout,setLayout]=useState<ScheduleSeatLayout>();
  const [error,setError]=useState("");
  useEffect(()=>{
    let live=true;
    api.bookingWorkspace(pnr).then(booking=>{
      if(!live)return;setData(booking);
      api.scheduleLayout(booking.tripId,booking.fromSeq,booking.toSeq)
        .then(l=>{if(live)setLayout(l);}).catch(e=>{if(live)setError(errorText(e));});
    }).catch(e=>{if(live)setError(errorText(e));});
    return ()=>{live=false;};
  },[pnr]);
  const primary=data?.passengers.find(p=>p.isPrimary)||data?.passengers[0];
  return <div className="crm-overlay"><section role="dialog" aria-modal="true"
    aria-label={"Current journey "+pnr} className="crm-journey">
    <header className="crm-journey-header">
      <div><small>CURRENT JOURNEY</small><h2>{data?.serviceNumber||"Loading service…"}</h2>
        <p>{data?.fromCity||"—"} → {data?.toCity||"—"}</p></div>
      <button onClick={onClose} aria-label="Close current journey">✕</button></header>
    <div className="crm-journey-body">
      {error&&<p role="alert" className="crm-error">{error}</p>}
      {!data&&!error&&<p>Loading authenticated journey details…</p>}
      {data&&<>
        <div className="crm-journey-summary">
          <div><small>PASSENGER</small><b>{primary?.name||"Not recorded"}</b></div>
          <div><small>SEAT</small><b>{primary?.seatCode||"—"}</b></div>
          <div><small>DATE</small><b>{data.travelDate}</b></div>
          <div><small>BOOKING STATUS</small><b>{data.status}</b></div>
          <div><small>BOARDING</small><b>{data.boarding?.name||"—"}</b></div>
          <div><small>DROPPING</small><b>{data.dropping?.name||"—"}</b></div>
        </div>
        <div className="crm-journey-body-grid">
          {layout&&<div className="crm-journey-coach">
            <h3>Seat Layout</h3><p>Selected passenger seat highlighted in green outline.</p>
            <SeatLayoutView layout={layout} selected={data.passengers.map(p=>p.seatCode)}/>
          </div>}
          <div className="crm-journey-side"><h3>Journey Details</h3>
            <p><b>PNR</b> {data.pnr}</p>
            <p><b>Operator route</b> {data.routeName}</p>
            <p><b>Boarding</b> {data.boarding?.name||"—"} · Day {data.boarding?.day??"—"} · {data.boarding?.time||"—"}</p>
            <p><b>Dropping</b> {data.dropping?.name||"—"} · Day {data.dropping?.day??"—"} · {data.dropping?.time||"—"}</p>
            <p><b>Confirmed Fare</b> {money(data.totalFare)}</p>
            <p><b>Passenger</b> {primary?.name||"—"} · {primary?.gender||"—"}</p>
            <p><b>Contact</b> {data.contactMobile||"Not recorded"}</p>
            <div className="crm-journey-alert">Seat status is live for the selected segment.
              Customer details come from the authorized booking record; passenger seat inventory remains PostgreSQL-authoritative.</div>
            <button onClick={onOpenTicket}>Open full ticket and actions</button>
          </div>
        </div>
      </>}
    </div>
    <footer className="crm-journey-footer"><button onClick={onClose}>Close</button></footer>
  </section></div>;
}
function CustomerDialog({customer,onClose,onPnr,onJourney}:{customer:CustomerHit;
  onClose:()=>void;onPnr:(pnr:string)=>void;onJourney:(pnr:string)=>void}){
  const [detail,setDetail]=useState<CustomerDetail>();
  const [tab,setTab]=useState<CustomerTab>("trips");
  const [note,setNote]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    let live=true;
    api.customer(customer.phone).then(x=>{if(live)setDetail(x);})
      .catch(e=>{if(live)setError(errorText(e));});
    return ()=>{live=false;};
  },[customer.phone,revision]);
  const journeys=detail?.bookings||customer.bookings;
  const current=journeys.filter(x=>x.status==="CONFIRMED"&&x.travelDate>=
    new Date(Date.now()+330*60_000).toISOString().slice(0,10));
  const tabs:[CustomerTab,string][]=[
    ["trips","Bookings"],["loyalty","Loyalty"],["notes","Notes"],
    ["calls","Call Logs"],["messages","Messages"],["ratings","Ratings"]
  ];
  const saveNote=async()=>{
    if(!note.trim()||note.length>2000){setError("Enter a note up to 2000 characters.");return;}
    setBusy(true);setError("");
    try{
      await api.addNote(customer.phone,note.trim());setNote("");setRevision(x=>x+1);
      setNotice("Internal customer note saved and reloaded.");
    }catch(e){setError(errorText(e));}finally{setBusy(false);}
  };
  return <div className="crm-overlay"><section role="dialog" aria-modal="true"
    className="crm-customer-dialog" aria-label={"Customer "+customer.name}>
    <header className="crm-dialog-head">
      <div className="crm-avatar"><Icon name="user"/></div>
      <div><h2>{customer.name}</h2><p>{customer.phone}</p></div>
      <span>{customer.tier.toUpperCase()} MEMBER</span>
      <button onClick={onClose} aria-label="Close customer">✕</button></header>
    <div className="crm-dialog-body">
      {error&&<p className="crm-error" role="alert">{error}</p>}
      {notice&&<p className="crm-note" role="status">{notice}</p>}
      <div className="crm-dialog-metrics">
        <CustomerMetric label="TOTAL TRIPS" value={customer.totalTrips}/>
        <CustomerMetric label="TOTAL BOOKINGS" value={customer.totalBookings}/>
        <CustomerMetric label="CANCELLED" value={customer.cancelled}/>
        <CustomerMetric label="TOTAL SPEND" value={money(customer.spend)}/>
      </div>
      <nav className="crm-dialog-tabs" aria-label="Customer detail tabs">
        {tabs.map(([k,title])=><button key={k} className={tab===k?"active":""}
          onClick={()=>setTab(k)}>{title}</button>)}
      </nav>
      {tab==="trips"&&<>
        <div className="crm-dialog-section-head"><h3>Current / Upcoming Journeys</h3>
          <span>{current.length} journeys</span></div>
        {current.map(x=><div className="crm-journey-entry" key={x.pnr}>
          <div><b>{x.service}</b><span>{x.from||"—"} → {x.to||"—"} · {x.travelDate}</span></div>
          <button onClick={()=>onJourney(x.pnr)}>View Current Journey</button></div>)}
        <h3>Past and All Bookings</h3>
        <div className="crm-table-scroll"><table><thead><tr>
          <th>PNR</th><th>Date</th><th>Service</th><th>From / To</th><th>Seats</th><th>Status</th><th>Fare</th><th>Action</th>
        </tr></thead><tbody>{journeys.map((x,i)=><tr key={x.pnr+"-"+i}>
          <td><b>{x.pnr}</b></td><td>{x.travelDate}</td><td>{x.service}</td>
          <td>{x.from||"—"} → {x.to||"—"}</td>
          <td>{x.passengers.map(p=>p.seatCode).join(", ")||"—"}</td>
          <td>{x.status}</td><td>{money(x.amount)}</td>
          <td><button onClick={()=>onPnr(x.pnr)}>Ticket</button></td>
        </tr>)}</tbody></table></div>
      </>}
      {tab==="loyalty"&&<div className="crm-loyalty">
        <div><Icon name="star"/><small>Tier</small><b>{detail?.loyalty.tier||customer.tier}</b></div>
        <div><Icon name="bag"/><small>Loyalty Miles</small><b>{detail?.loyalty.miles??customer.miles}</b></div>
        <div><Icon name="ticket"/><small>Trips completed</small><b>{customer.totalTrips}</b></div>
        <p>Miles and tier are read from the operator's CRM records. No unverified discount or coupon is issued here.</p>
      </div>}
      {tab==="notes"&&<div className="crm-notes">
        <h3>Internal Customer Notes</h3>
        <textarea aria-label="New customer note" rows={3} maxLength={2000}
          placeholder="Record an authorized internal note" value={note}
          onChange={e=>setNote(e.target.value)}/>
        <button onClick={()=>void saveNote()} disabled={busy||!note.trim()}>Add Note</button>
        <div>{detail?.notes.map(n=><article className="crm-note-item" key={n.id}>
          <p>{n.text}</p><small>{n.by} · {fmt(n.at)}</small></article>)}</div>
      </div>}
      {tab==="calls"&&<div className="crm-table-scroll"><table><thead><tr>
        <th>Date</th><th>Direction</th><th>Channel</th><th>Duration</th><th>Status</th><th>Agent</th></tr></thead>
        <tbody>{detail?.calls.map(c=><tr key={c.id}><td>{fmt(c.ts)}</td><td>{c.direction}</td>
          <td>{c.kind}</td><td>{c.durationS}s</td><td>{c.status}</td><td>{c.agent}</td></tr>)}</tbody></table>
        {!detail?.calls.length&&<p className="crm-muted">No call records attached.</p>}</div>}
      {tab==="messages"&&<div className="crm-message-history">
        <h3>Recorded Messages</h3>
        {detail?.messages.map(m=><article className={"crm-message "+m.direction} key={m.id}>
          <p>{m.text}</p><small>{fmt(m.ts)} · {m.deliveryStatus}</small></article>)}
        {!detail?.messages.length&&<p className="crm-muted">No messaging records attached.
          This tab does not claim any WhatsApp message was delivered.</p>}
      </div>}
      {tab==="ratings"&&<div className="crm-ratings">
        <h3>Recorded OTA Ratings</h3>
        {detail?.ratings.map(r=><article key={r.id}>
          <b>{r.ota} · {r.rating} ★</b><p>{r.review||"No text supplied"}</p>
          <small>PNR {r.pnr||"—"} · {fmt(r.ratedAt)}</small></article>)}
        {!detail?.ratings.length&&<p className="crm-muted">No linked ratings.</p>}
      </div>}
    </div>
    <footer className="crm-dialog-footer"><button onClick={onClose}>Close</button></footer>
  </section></div>;
}
export function CrmWorkspacePanel(){
  const [mode,setMode]=useState<SearchMode>("phone");
  const [q,setQ]=useState("");
  const [rows,setRows]=useState<CustomerHit[]>([]);
  const [total,setTotal]=useState(0);
  const [selected,setSelected]=useState<CustomerHit|null>(null);
  const [pnr,setPnr]=useState("");
  const [journey,setJourney]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [searched,setSearched]=useState(false);
  const [filter,setFilter]=useState("all");
  const submit=async()=>{
    const text=q.trim();
    if(mode==="phone"&&text.length<4){setError("Enter at least four phone digits.");return;}
    if(mode==="name"&&text.length<3){setError("Enter at least three name characters.");return;}
    if(mode==="pnr"&&text.length<4){setError("Enter at least four PNR characters.");return;}
    setBusy(true);setError("");setRows([]);
    try{const res=await api.passengerSearch(mode,text);
      setRows(res.customers);setTotal(res.total);setSearched(true);
    }catch(e){setError(errorText(e));}finally{setBusy(false);}
  };
  const filtered=useMemo(()=>rows.filter(x=>filter==="all"||
    (filter==="upcoming"&&x.upcoming>0)||(filter==="cancelled"&&x.cancelled>0)),
    [rows,filter]);
  return <section className="crm-root" data-testid="crm-workspace">
    <header className="crm-page-head"><div><small>CUSTOMER RELATIONSHIP MANAGEMENT</small>
      <h1>CRM</h1><p>Permissioned passenger lookup, service history, loyalty, support and current journeys</p></div>
      <span className="crm-private"><Icon name="user"/> Private operator data</span></header>
    <div className="crm-search-card">
      <h2>Search Passengers</h2>
      <p>Search is gated; no customer directory is downloaded before an authorized query.</p>
      <div className="crm-search-mode" role="group" aria-label="CRM search mode">
        {([{id:"phone",label:"Phone"},{id:"name",label:"Name"},{id:"pnr",label:"PNR"}] as const)
          .map(x=><button type="button" key={x.id} className={mode===x.id?"active":""}
            onClick={()=>{setMode(x.id);setQ("");setRows([]);setSearched(false);}}>{x.label}</button>)}
      </div>
      <form className="crm-search-form" onSubmit={e=>{e.preventDefault();void submit();}}>
        <input aria-label="Search passengers" value={q}
          onChange={e=>setQ(e.target.value)} autoComplete="off"
          placeholder={mode==="phone"?"Mobile number":mode==="name"?"Passenger full name":"Booking PNR"}/>
        <button type="submit" disabled={busy}><Icon name="search"/>
          {busy?"Searching…":"Search"}</button>
      </form>
    </div>
    {error&&<p role="alert" className="crm-error">{error}</p>}
    {searched&&<>
      <div className="crm-results-head"><h2>Passenger Search Results</h2>
        <label>Show<select value={filter} aria-label="Filter CRM customers"
          onChange={e=>setFilter(e.target.value)}>
          <option value="all">All results</option><option value="upcoming">Upcoming trips</option>
          <option value="cancelled">With cancellations</option></select></label>
        <span>{filtered.length} shown · {total} matched</span>
      </div>
      <div className="crm-customers">
        {filtered.map(c=><article key={c.phone} className="crm-customer">
          <header><div className="crm-avatar"><Icon name="user"/></div><div><b>{c.name}</b>
            <span>{c.phone}</span></div>
            <strong className="crm-tier">{c.tier.toUpperCase()}</strong></header>
          <div className="crm-customer-stats">
            <CustomerMetric label="BOOKINGS" value={c.totalBookings}/>
            <CustomerMetric label="TRIPS" value={c.totalTrips}/>
            <CustomerMetric label="UPCOMING" value={c.upcoming}/>
            <CustomerMetric label="CANCELLED" value={c.cancelled}/>
          </div>
          <footer><span>Total spent: <b>{money(c.spend)}</b></span>
            <button onClick={()=>setSelected(c)}>View Customer</button></footer>
        </article>)}
      </div>
      {!filtered.length&&<p className="crm-empty">No matching passengers returned from the authorized search.</p>}
    </>}
    {!searched&&<div className="crm-empty">
      Search by phone, name or PNR to view passenger records.
      No customer information is loaded until a valid query is submitted.
    </div>}
    {selected&&<CustomerDialog customer={selected} onClose={()=>setSelected(null)}
      onPnr={setPnr} onJourney={setJourney}/>}
    {journey&&<RecentJourney pnr={journey} onClose={()=>setJourney("")}
      onOpenTicket={()=>{setPnr(journey);setJourney("");}}/>}
    {pnr&&<BookingDetailsPanel pnr={pnr} onClose={()=>setPnr("")}/>}
  </section>;
}
