import {useEffect,useMemo,useState} from "react";
import {api,type DailyOpsReport,type Rating} from "../../api";
import {BookingDetailsPanel} from "../bookings/BookingsPanel";
import "./dailyOps.css";

type Page="report"|"ratings";
type ReportTab="overview"|"fleet"|"earnings"|"passengers"|"compliance";
type RatingTab="overview"|"action"|"all"|"unrated";
const today=()=>new Date(Date.now()+330*60_000).toISOString().slice(0,10);
const ago=(d:number)=>new Date(Date.parse(today()+"T12:00:00Z")-d*86400000).toISOString().slice(0,10);
const money=(x:number)=>"₹"+x.toLocaleString("en-IN",{maximumFractionDigits:2});
const errorText=(e:unknown)=>e instanceof Error?e.message:String(e);
const dateLabel=(date:string)=>date?new Date(date.slice(0,10)+"T12:00:00Z")
  .toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}):"—";
const label=(s:string)=>s.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());
function OpsIcon({kind}:{kind:string}){
  const paths:Record<string,string>={
    fleet:"M4 6h16v12H4zM4 12h16M7 18v2m10-2v2M7 15h.01M17 15h.01",
    users:"M12 11a4 4 0 100-8 4 4 0 000 8zM4 21v-2a8 8 0 0116 0v2",
    rupee:"M5 4h14M5 9h14M9 4c10 0 10 10 0 10l6 7",
    warn:"M12 2 22 21H2L12 2zM12 9v5m0 3h.01",
    star:"m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.7 5.8 21l1.2-6.8-5-4.9 6.9-1L12 2z",
    down:"M8 4v12m-5-5 5 5 5-5M17 6v13"
  };
  return <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor"
    fill="none" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={paths[kind]||paths.star}/></svg>;
}
function Metric({icon,title,value,caption,className=""}:{icon:string;title:string;value:string|number;
  caption?:string;className?:string}){
  return <div className={"do-metric "+className}><span className="do-metric-icon" aria-hidden="true"><OpsIcon kind={icon}/></span>
    <small>{title}</small><b>{value}</b>{caption&&<span>{caption}</span>}</div>;
}
function Report({date,setDate,refreshKey,openPnr}:{date:string;setDate:(s:string)=>void;
  refreshKey:number;openPnr:(pnr:string)=>void}) {
  const [tab,setTab]=useState<ReportTab>("overview");
  const [data,setData]=useState<DailyOpsReport>();
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const [selectedTrip,setSelectedTrip]=useState<number>();
  const [search,setSearch]=useState("");
  useEffect(()=>{
    let alive=true;setLoading(true);setError("");setData(undefined);
    api.report<DailyOpsReport>("daily-ops","date="+encodeURIComponent(date))
      .then(d=>{if(alive)setData(d);}).catch(e=>{if(alive)setError(errorText(e));})
      .finally(()=>{if(alive)setLoading(false);});
    return ()=>{alive=false;};
  },[date,refreshKey]);
  const fleet=data?.fleet.trips||[],s=data?.fleet.summary;
  const filteredFleet=fleet.filter(t=>!search||[t.service,t.route,t.vehicle||"",t.status,...t.crew.map(c=>c.name)]
    .some(v=>v.toLowerCase().includes(search.toLowerCase())));
  const trip=fleet.find(t=>t.tripId===selectedTrip);
  return <div className="do-report" data-testid="daily-ops-report">
    <div className="do-head">
      <div><h2>Daily Report</h2><p>Actual operations, staff, earnings and compliance from your operator GDS</p></div>
      <label>Journey Date <input type="date" value={date} aria-label="Daily Ops date"
        onChange={e=>setDate(e.target.value)}/></label>
    </div>
    {error&&<p role="alert" className="do-alert">{error}</p>}
    {loading&&<p role="status" className="do-muted">Loading actual operator daily report…</p>}
    {data&&<>
      <div className="do-metrics">
        <Metric icon="fleet" title="RUNNING / TOTAL" value={(s?.running??0)+" / "+(s?.trips??0)} className="do-blue"/>
        <Metric icon="users" title="PASSENGERS / AVAILABLE SEATS"
          value={(s?.seats??0)+" / "+(s?.capacity??0)} className="do-purple"/>
        <Metric icon="rupee" title="TODAY'S BOOKING COLLECTION" value={money(data.earnings.amount)}
          caption={data.earnings.bookings+" bookings"} className="do-green"/>
        <Metric icon="warn" title="ACTIVE SERVICES WITHOUT BUS"
          value={s?.withoutBus??0} className="do-red"/>
      </div>
      <nav className="do-secondary-nav" aria-label="Daily report categories">
        {([{value:"overview",label:"Overview"},{value:"fleet",label:"Fleet"},
          {value:"earnings",label:"Earnings"},{value:"passengers",label:"Passengers"},
          {value:"compliance",label:"Compliance"}] as const).map(t=><button
            key={t.value} className={tab===t.value?"active":""} onClick={()=>setTab(t.value)}>
            {t.label}</button>)}
      </nav>
      {(tab==="overview"||tab==="fleet")&&<section className="do-panel">
        <header><div><h3>Daily Service Manifest</h3>
          <p>Service-wise vehicle assignments, staff and occupancy</p></div>
          <label>Search<input value={search} onChange={e=>setSearch(e.target.value)}
            aria-label="Search daily trips" placeholder="Route, driver, bus…"/></label></header>
        <div className="do-table-scroll"><table><thead><tr>
          <th>Service</th><th>Route</th><th>Status</th><th>Vehicle</th><th>Driver / Staff</th>
          <th>Booked / Capacity</th><th>Occupancy</th><th>Net Sales</th><th/></tr></thead>
          <tbody>{filteredFleet.map(t=><tr key={t.tripId}>
            <td><b>{t.service}</b></td><td>{t.route}</td>
            <td><span className={"do-status do-"+t.status}>{label(t.status)}</span></td>
            <td>{t.vehicle||<span className="do-warning">Unassigned</span>}</td>
            <td>{t.crew.length?t.crew.map(c=>c.name+" ("+c.role+")").join(", "):"Unassigned"}</td>
            <td>{t.seats} / {t.capacity}</td>
            <td><div className="do-occupancy"><span style={{width:t.occupancyPct+"%"}}/></div>
              <small>{t.occupancyPct.toFixed(1)}%</small></td>
            <td>{money(t.netSales)}</td>
            <td><button type="button" onClick={()=>setSelectedTrip(t.tripId)}>View</button></td>
          </tr>)}</tbody></table></div>
        {!filteredFleet.length&&<p className="do-muted">No services match the current date and search.</p>}
      </section>}
      {(tab==="overview"||tab==="earnings")&&<section className="do-panel">
        <header><div><h3>Ticket Collection &amp; Next 7 Days</h3>
          <p>Ticket sales recorded today, grouped by booking channel</p></div>
          <span className="do-pill">{data.earnings.cancelledToday} cancelled today</span></header>
        <div className="do-earning-kpis">
          <Metric icon="₹" title="COLLECTED" value={money(data.earnings.amount)}/>
          <Metric icon="users" title="ISSUED PNRs" value={data.earnings.bookings}/>
          <Metric icon="♙" title="CONFIRMED PASSENGERS" value={data.earnings.seats}/>
        </div>
        <div className="do-earning-columns">
          <div><h4>By booking channel</h4>
            {data.earnings.byChannel.map(x=><div key={x.channel} className="do-summary-row">
              <span>{label(x.channel)} · {x.bookings} PNRs</span><strong>{money(x.amount)}</strong></div>)}
            {!data.earnings.byChannel.length&&<p className="do-muted">No booking-channel entries.</p>}
          </div>
          <div><h4>Forward 7-day occupancy</h4>
            {data.earnings.next7.map(x=><div key={x.date} className="do-next7-row">
              <b>{dateLabel(x.date)}</b><span>{x.trips} trips</span>
              <div className="do-occupancy"><span style={{width:x.occupancyPct+"%"}}/></div>
              <small>{x.seats}/{x.capacity} · {x.occupancyPct.toFixed(1)}%</small>
            </div>)}
          </div>
        </div>
      </section>}
      {(tab==="overview"||tab==="passengers")&&<section className="do-panel">
        <header><div><h3>No-Shows Yesterday</h3>
          <p>Confirmed passengers recorded as No-Show on the preceding operating day.</p></div>
          <span className="do-pill">{data.passengers.noShowsYesterday.length} recorded</span></header>
        <div className="do-table-scroll"><table><thead><tr>
          <th>PNR</th><th>Service</th><th>Seat</th><th>Passenger</th><th>Contact</th></tr></thead>
          <tbody>{data.passengers.noShowsYesterday.map((x,i)=><tr key={x.pnr+"-"+i}>
            <td><button className="do-link" onClick={()=>openPnr(x.pnr)}>{x.pnr}</button></td>
            <td>{x.service}</td><td>{x.seat}</td><td>{x.passenger}</td><td>{x.contact||"Masked / unavailable"}</td>
          </tr>)}</tbody></table></div>
        {!data.passengers.noShowsYesterday.length&&<p className="do-muted">No no-show events were recorded yesterday.</p>}
      </section>}
      {(tab==="overview"||tab==="compliance")&&<section className="do-panel">
        <header><div><h3>Upcoming Compliance Expiries</h3>
          <p>Vehicle documents and staff licences expiring within 30 days, or already expired.</p></div></header>
        <div className="do-table-scroll"><table><thead><tr>
          <th>Owner</th><th>Document</th><th>Expiry</th><th>Status</th></tr></thead><tbody>
          {data.compliance.vehicleDocuments.map((x,i)=><tr key={"vehicle"+i}>
            <td>{x.vehicle||"Vehicle missing"}</td><td>{x.document}</td>
            <td>{dateLabel(x.expiryDate)}</td><td><span className={"do-status do-"+x.state}>{x.state}</span></td>
          </tr>)}
          {data.compliance.licences.map((x,i)=><tr key={"staff"+i}>
            <td>{x.name} · {x.role}</td><td>Driver / staff licence</td>
            <td>{dateLabel(x.licenseExpiry)}</td><td><span className={"do-status do-"+x.state}>{x.state}</span></td>
          </tr>)}</tbody></table></div>
          {!data.compliance.vehicleDocuments.length&&!data.compliance.licences.length&&
            <p className="do-muted">No upcoming document expiries recorded.</p>}
      </section>}
      {selectedTrip&&trip&&<div className="do-modal-overlay">
        <section className="do-detail-modal" role="dialog" aria-modal="true" aria-label={"Trip "+trip.service}>
          <header><h3>{trip.service} · {date}</h3><button onClick={()=>setSelectedTrip(undefined)}>✕</button></header>
          <p><b>Route:</b> {trip.route}</p><p><b>Vehicle:</b> {trip.vehicle||"Unassigned"}</p>
          <p><b>Confirmed passengers:</b> {trip.seats} / {trip.capacity}</p>
          <p><b>Net Sales:</b> {money(trip.netSales)}</p>
          <h4>Assigned Staff</h4>
          {trip.crew.map((c,i)=><p key={i}>{c.role}: {c.name}</p>)}
          {!trip.crew.length&&<p>No crew assigned.</p>}
          <button onClick={()=>setSelectedTrip(undefined)}>Close</button>
        </section></div>}
    </>}
  </div>;
}
interface Review extends Rating{
  service?:string;serviceNumber?:string;vehicleRegistration?:string;driverName?:string;
  followUpStatus?:string|null;followUpNote?:string|null;phone?:string|null;
}
function Ratings({refreshKey}:{refreshKey:number}){
  const [ratings,setRatings]=useState<Review[]>([]);
  const [error,setError]=useState("");
  const [tab,setTab]=useState<RatingTab>("overview");
  const [provider,setProvider]=useState("all");
  const [days,setDays]=useState(30);
  const [stars,setStars]=useState(0);
  const [search,setSearch]=useState("");
  const [saving,setSaving]=useState<number>();
  const [drafts,setDrafts]=useState<Record<number,{status:string;note:string;reply:string}>>({});
  const [notice,setNotice]=useState("");
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    let live=true;setError("");
    api.ratings().then(x=>{if(live)setRatings(x.rows as Review[]);})
      .catch(e=>{if(live)setError(errorText(e));});
    return ()=>{live=false;};
  },[refreshKey,revision]);
  const providers=Array.from(new Set(ratings.map(x=>x.ota))).sort();
  const cutoff=ago(days-1);
  const filtered=ratings.filter(x=>x.ratedAt.slice(0,10)>=cutoff&&
    (provider==="all"||x.ota===provider));
  const low14=ratings.filter(x=>x.rating<=2&&x.ratedAt.slice(0,10)>=ago(13)&&
    (provider==="all"||x.ota===provider));
  const selected=(tab==="action"?low14:filtered).filter(x=>(!stars||x.rating===stars)&&
    (!search||[x.pnr||"",x.passengerName||"",x.review||"",x.ota].some(v=>
      v.toLowerCase().includes(search.toLowerCase()))));
  const average=(list:Review[])=>list.length?
    (list.reduce((a,x)=>a+x.rating,0)/list.length).toFixed(2):"—";
  const grouped=useMemo(()=>{
    const groups=new Map<string,Review[]>();
    for(const r of filtered){
      const k=r.serviceNumber||r.service||"Service not linked";
      if(!groups.has(k))groups.set(k,[]);
      groups.get(k)!.push(r);
    }
    return [...groups.entries()].map(([name,items])=>({name,items,avg:average(items)}));
  },[ratings,days,provider]);
  const setDraft=(id:number,patch:Partial<{status:string;note:string;reply:string}>)=>
    setDrafts(x=>({...x,[id]:{status:x[id]?.status||"Open",note:x[id]?.note||"",
      reply:x[id]?.reply||"",...patch}}));
  const save=async(r:Review,type:"follow"|"reply")=>{
    const draft=drafts[r.id]||{status:"Open",note:"",reply:""};
    if(type==="reply"&&!draft.reply.trim()){setError("A written reply is required.");return;}
    if(type==="follow"&&!draft.note.trim()){setError("Add a follow-up note before saving.");return;}
    setSaving(r.id);setError("");setNotice("");
    try{
      if(type==="reply")await api.reply(r.id,draft.reply);
      else await api.ratingFollowUp(r.id,draft.status,draft.note);
      setRevision(x=>x+1);
      setNotice(type==="reply"?"Reply saved in GDS only; not published to RedBus or any OTA.":
        "Passenger follow-up recorded with actor and timestamp.");
    }catch(e){setError(errorText(e));}finally{setSaving(undefined);}
  };
  return <div className="do-ratings" data-testid="daily-ops-ratings">
    <div className="do-head"><div><h2>OTA Ratings</h2>
      <p>Reviews available in your GDS. External all-time provider ranking requires an authorized feed.</p></div>
      <button className="do-gradient-button" onClick={()=>setRevision(x=>x+1)}>↻ Refresh Ratings</button></div>
    {error&&<p role="alert" className="do-alert">{error}</p>}
    {notice&&<p role="status" className="do-notice">{notice}</p>}
    <div className="do-rating-controls">
      <label>OTA Provider<select aria-label="OTA ratings provider" value={provider}
        onChange={e=>setProvider(e.target.value)}>
        <option value="all">All providers</option>{providers.map(x=><option key={x}>{x}</option>)}</select></label>
      <div className="do-range-buttons">{[7,30,90,180].map(n=><button key={n}
        className={days===n?"active":""} onClick={()=>setDays(n)}>{n} days</button>)}</div>
    </div>
    <nav className="do-secondary-nav" aria-label="Rating tabs">
      {([{v:"overview",name:"Overview"},{v:"action",name:"Needs action ("+low14.length+")"},
        {v:"all",name:"All ratings"},{v:"unrated",name:"Not rated"}] as const).map(x=>
        <button key={x.v} className={tab===x.v?"active":""} onClick={()=>setTab(x.v)}>{x.name}</button>)}
    </nav>
    <div className="do-metrics">
      <Metric icon="star" title="AVERAGE GDS RATING" value={average(filtered)}
        caption={filtered.length+" submitted reviews"}/>
      <Metric icon="down" title="1–2★ LAST 14 DAYS" value={low14.length}
        caption="Needs operator follow-up" className="do-red"/>
      <Metric icon="◎" title="RATED" value={filtered.length}
        caption="Actual submitted reviews only"/>
      <Metric icon="★" title="5★ RATINGS" value={filtered.filter(x=>x.rating===5).length}/>
    </div>
    {tab==="overview"&&<section className="do-panel">
      <header><h3>Service Ratings</h3>
        <p>Grouped only where a service reference exists in saved review evidence.</p></header>
      <div className="do-table-scroll"><table><thead><tr>
        <th>Service</th><th>Ratings</th><th>Average</th>
        <th>1★</th><th>2★</th><th>3★</th><th>4★</th><th>5★</th></tr></thead>
        <tbody>{grouped.map(g=><tr key={g.name}><td>{g.name}</td><td>{g.items.length}</td>
          <td><b>{g.avg}</b></td>{[1,2,3,4,5].map(n=><td key={n}>
            {g.items.filter(r=>r.rating===n).length}</td>)}</tr>)}</tbody></table></div>
      <p className="do-muted">Provider score, driver-specific reviews, invitation counts and “not rated” passengers require provider or contact evidence; these are not inferred.</p>
    </section>}
    {tab==="unrated"&&<div className="do-panel"><h3>Not rated</h3>
      <p className="do-muted">No authorized invitation/response data is connected to this GDS.
        Listing individual non-respondents from absence of reviews would be misleading.</p></div>}
    {(tab==="action"||tab==="all")&&<section className="do-panel">
      <header><div><h3>{tab==="action"?"1–2★ reviews from last 14 days":"Submitted OTA Ratings"}</h3>
        <p>Reply and follow-up are saved in GDS, never automatically posted to OTA.</p></div>
        <label>Search PNR / review<input aria-label="Search ratings" value={search}
          onChange={e=>setSearch(e.target.value)}/></label></header>
      <div className="do-rating-stars">{[0,5,4,3,2,1].map(n=><button
        className={stars===n?"active":""} key={n} onClick={()=>setStars(n)}>
        {n?String(n)+" ★":"All ratings"}</button>)}</div>
      <div className="do-review-list">
        {selected.map(r=><article className="do-review" key={r.id}>
          <header><div><span className="do-review-stars">{r.rating} ★</span>
            <b>{r.ota} · {r.pnr||"No linked PNR"}</b>
            <small>{dateLabel(r.ratedAt)}</small></div>
            <div><b>{r.passengerName||"Passenger (no name)"}</b></div></header>
          <p>{r.review||"No written review supplied."}</p>
          {r.operatorReply&&<div className="do-reply">GDS operator reply: {r.operatorReply}</div>}
          <div className="do-review-form">
            <label>Follow-up status<select value={drafts[r.id]?.status||r.followUpStatus||"Open"}
              onChange={e=>setDraft(r.id,{status:e.target.value})}>
              {["Open","Called","Working","Resolved"].map(x=><option key={x}>{x}</option>)}</select></label>
            <label>Follow-up note<input value={drafts[r.id]?.note||""}
              aria-label={"Follow-up note "+r.id} onChange={e=>setDraft(r.id,{note:e.target.value})}
              placeholder={r.followUpNote||"What did passenger report?"}/></label>
            <button disabled={saving===r.id}
              onClick={()=>void save(r,"follow")}>Save Follow-up</button>
          </div>
          {!r.operatorReply&&<div className="do-review-form">
            <label>GDS reply draft<input value={drafts[r.id]?.reply||""}
              aria-label={"Rating reply "+r.id} onChange={e=>setDraft(r.id,{reply:e.target.value})}
              placeholder="Reply text (stored in GDS only)"/></label>
            <button disabled={saving===r.id} onClick={()=>void save(r,"reply")}>Save GDS Reply</button>
          </div>}
        </article>)}
        {!selected.length&&<p className="do-muted">No reviews match this filter.</p>}
      </div>
    </section>}
  </div>;
}
export function DailyOpsPanel(){
  const [page,setPage]=useState<Page>("report");
  const [date,setDate]=useState(today());
  const [revision,setRevision]=useState(0);
  const [pnr,setPnr]=useState("");
  return <section className="do-page" data-testid="daily-ops-page">
    <header className="do-page-header">
      <div><small>DAILY OPERATIONS / CONTROL ROOM</small><h1>Daily Ops</h1></div>
      <button className="do-gradient-button" onClick={()=>setRevision(x=>x+1)}>↻ Refresh</button>
    </header>
    <nav className="do-top-nav" aria-label="Daily Ops sections">
      <button className={page==="report"?"selected":""} onClick={()=>setPage("report")}>Daily Report</button>
      <button className={page==="ratings"?"selected":""} onClick={()=>setPage("ratings")}>OTA Ratings</button>
    </nav>
    {page==="report"?<Report date={date} setDate={setDate} refreshKey={revision}
      openPnr={setPnr}/>:<Ratings refreshKey={revision}/>}
    {pnr&&<BookingDetailsPanel pnr={pnr} onClose={()=>setPnr("")}/>}
  </section>;
}
