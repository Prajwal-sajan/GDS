import { useEffect, useMemo, useState } from "react";
import { api, type CityOption, type CoachOption, type FullRoute, type RouteDraft, type RouteStageDraft, type RouteStopDraft, type RouteRow, type Fare } from "../../api";
import "./routes.css";

type RouteTab = "General" | "Cities & Schedule" | "Pickups" | "Drops" | "Fares" | "Cancellation" | "Generate";
type DraftState = RouteDraft & { id?:number; structuralLocked:boolean };
const tabs:RouteTab[] = ["General","Cities & Schedule","Pickups","Drops","Fares","Cancellation","Generate"];
const msg = (err:unknown) => err instanceof Error ? err.message : String(err);
const clock = (value:string) => value?.slice(0,5) || "17:30";
const wireTime = (value:string) => clock(value) + ":00";
const todayIndia = () => new Date(Date.now()+330*60_000).toISOString().slice(0,10);
function pairs(stops:RouteStopDraft[], earlier:Fare[]=[]): Fare[] {
  const found = new Map(earlier.map(f=>[f.fromSequence+":"+f.toSequence,f]));
  return stops.flatMap((_,fromSequence)=>stops.slice(fromSequence+1).map((__,k)=>{
    const toSequence = fromSequence+k+1;
    return found.get(fromSequence+":"+toSequence) ?? {
      fromSequence,toSequence,seater:0,sleeperLower:0,sleeperUpper:0
    };
  }));
}
const clean = (f:DraftState):RouteDraft => ({
  serviceNumber:f.serviceNumber.trim(),name:f.name.trim(),coachTemplateId:f.coachTemplateId,
  departureTime:wireTime(f.stops[0]?.time || f.departureTime),status:f.status,
  partialCancellationAllowed:f.partialCancellationAllowed,
  primaryPaxCancellable:f.primaryPaxCancellable,
  maxSeatsPerTicket:f.maxSeatsPerTicket,updateCutoffMinutes:f.updateCutoffMinutes,
  stops:f.stops.map(x=>({...x,time:wireTime(x.time)})),
  stages:f.stages.map(x=>({...x,name:x.name.trim(),time:wireTime(x.time)})),
  fares:f.fares.map(x=>({...x}))
});
const initial = (cities:CityOption[],coaches:CoachOption[]):DraftState => {
  const stops:RouteStopDraft[]=[{cityId:cities[0]?.id||0,day:1,time:"17:30"},
    {cityId:cities[1]?.id||0,day:2,time:"07:30"}];
  return {serviceNumber:"",name:"",coachTemplateId:coaches[0]?.id||0,
    departureTime:"17:30",status:"draft",partialCancellationAllowed:true,
    primaryPaxCancellable:false,maxSeatsPerTicket:6,updateCutoffMinutes:120,
    stops,stages:[{stopSequence:0,kind:"pickup",name:"Main boarding point",
      day:1,time:"17:30",address:null,landmark:null,contactNumber:null,prime:true},
      {stopSequence:1,kind:"drop",name:"Main dropping point",
      day:2,time:"07:30",address:null,landmark:null,contactNumber:null,prime:true}],
    fares:pairs(stops),structuralLocked:false};
};
const existing = (route:FullRoute):DraftState => ({
  id:route.id,serviceNumber:route.serviceNumber,name:route.name,coachTemplateId:route.coachTemplateId,
  departureTime:clock(route.departureTime),status:route.status,
  partialCancellationAllowed:route.partialCancellationAllowed,
  primaryPaxCancellable:route.primaryPaxCancellable,
  maxSeatsPerTicket:route.maxSeatsPerTicket,updateCutoffMinutes:route.updateCutoffMinutes,
  stops:route.stops.map(x=>({cityId:x.cityId,day:x.day,time:clock(x.time)})),
  stages:route.stages.map(x=>({
    stopSequence:x.stopSequence,kind:x.kind,name:x.name,day:x.day,time:clock(x.time),
    address:x.address,landmark:x.landmark,contactNumber:x.contactNumber,prime:x.prime
  })),
  fares:route.fares.map(x=>({...x})),structuralLocked:route.structuralLocked
});
export function RoutesPanel(){
  const [routes,setRoutes]=useState<RouteRow[]>([]);
  const [cities,setCities]=useState<CityOption[]>([]);
  const [coaches,setCoaches]=useState<CoachOption[]>([]);
  const [draft,setDraft]=useState<DraftState>();
  const [activeTab,setActiveTab]=useState<RouteTab>("General");
  const [query,setQuery]=useState("");
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [generation,setGeneration]=useState({from:todayIndia(),to:todayIndia()});
  const [generationReason,setGenerationReason]=useState("");
  const getCatalog = async () => {
    const [r,c,h] = await Promise.all([api.routes(),api.cities(),api.coaches()]);
    setRoutes(r);setCities(c);setCoaches(h);
    return {r,c,h};
  };
  useEffect(()=>{
    let alive=true;
    Promise.all([api.routes(),api.cities(),api.coaches()]).then(([r,c,h])=>{
      if(alive){setRoutes(r);setCities(c);setCoaches(h);}
    }).catch(e=>{if(alive)setError(msg(e));}).finally(()=>{if(alive)setLoading(false);});
    return ()=>{alive=false;};
  },[]);
  const filtered=useMemo(()=>routes.filter(x=>[x.serviceNumber,x.name,x.status]
    .some(v=>(v||"").toLowerCase().includes(query.toLowerCase()))),[routes,query]);
  const cityName=(id:number)=>cities.find(x=>x.id===id)?.name ?? "Unknown city";
  const byStop=(index:number)=>draft?.stops[index]?cityName(draft.stops[index].cityId):"Unknown";
  const coach=coaches.find(x=>x.id===draft?.coachTemplateId);
  const update = (patch:Partial<DraftState>)=>setDraft(prev=>prev?{...prev,...patch}:prev);
  const newRoute=()=>{
    setDraft(initial(cities,coaches));setError("");setNotice("");setActiveTab("General");
  };
  const open = async (id:number) => {
    setBusy(true);setError("");setNotice("");
    try {const data=await api.routeFull(id);setDraft(existing(data));setActiveTab("General");}
    catch(e){setError(msg(e));}finally{setBusy(false);}
  };
  const copyVersion=()=>{
    if(!draft)return;
    setDraft({...draft,id:undefined,structuralLocked:false,status:"draft",serviceNumber:draft.serviceNumber+"-NEW"});
    setActiveTab("General");setNotice("Editing a new route version; the original service and its bookings remain unchanged.");
  };
  const updateStop=(index:number,part:Partial<RouteStopDraft>)=>{
    if(!draft)return;
    const stops=draft.stops.map((s,j)=>j===index?{...s,...part}:s);
    const stages=draft.stages.map(s=>s.stopSequence===index?
      {...s,day:stops[index].day,time:s.time===draft.stops[index].time?stops[index].time:s.time}:s);
    update({stops,stages,departureTime:stops[0].time});
  };
  const addStop=()=>{
    if(!draft || draft.stops.length>=30)return;
    const pos=draft.stops.length-1;
    const available=cities.find(c=>!draft.stops.some(s=>s.cityId===c.id));
    if(!available){setError("There are no additional cities in this operator catalog.");return;}
    const stops=[...draft.stops];
    const previous=stops[pos-1];
    stops.splice(pos,0,{cityId:available.id,day:previous.day,time:previous.time});
    const shifted=draft.fares.map(f=>({
      ...f,fromSequence:f.fromSequence>=pos?f.fromSequence+1:f.fromSequence,
      toSequence:f.toSequence>=pos?f.toSequence+1:f.toSequence
    }));
    update({stops,stages:draft.stages.map(s=>s.stopSequence>=pos?
      {...s,stopSequence:s.stopSequence+1}:s),fares:pairs(stops,shifted)});
  };
  const removeStop=(index:number)=>{
    if(!draft || index===0 || index===draft.stops.length-1)return;
    const stops=draft.stops.filter((_,j)=>j!==index);
    const remapped=draft.fares.filter(f=>f.fromSequence!==index&&f.toSequence!==index)
      .map(f=>({...f,fromSequence:f.fromSequence>index?f.fromSequence-1:f.fromSequence,
        toSequence:f.toSequence>index?f.toSequence-1:f.toSequence}));
    update({stops,stages:draft.stages.filter(s=>s.stopSequence!==index)
      .map(s=>({...s,stopSequence:s.stopSequence>index?s.stopSequence-1:s.stopSequence})),
      fares:pairs(stops,remapped)});
  };
  const addStage=(kind:"pickup"|"drop")=>{
    if(!draft)return;
    const pos=kind==="pickup"?0:draft.stops.length-1;
    const stop=draft.stops[pos];
    update({stages:[...draft.stages,{stopSequence:pos,kind,name:"",
      day:stop.day,time:stop.time,address:null,landmark:null,
      contactNumber:null,prime:false}]});
  };
  const updateStage=(i:number,patch:Partial<RouteStageDraft>)=>{
    if(!draft)return;
    const stages=draft.stages.map((s,j)=>j===i?{...s,...patch}:s);
    if(patch.stopSequence!==undefined) {
      const st=draft.stops[patch.stopSequence];
      stages[i].day=st.day;stages[i].time=st.time;
    }
    update({stages});
  };
  const changeFare=(index:number,key:"seater"|"sleeperLower"|"sleeperUpper",v:number)=>
    update({fares:draft?.fares.map((f,j)=>j===index?{...f,[key]:v}:f)});
  const validate = (r:RouteDraft):string|undefined => {
    if(!r.serviceNumber || !r.name || !r.coachTemplateId)return "Service number, name and coach are required.";
    if(r.stops.some(s=>!s.cityId)||new Set(r.stops.map(s=>s.cityId)).size!==r.stops.length)
      return "All route cities must be different, valid catalog entries.";
    for(let i=1;i<r.stops.length;i++){
      const a=r.stops[i-1],b=r.stops[i];
      if(b.day<a.day||(b.day===a.day&&b.time<a.time))
        return "Route city times must be chronological; check journey days.";
    }
    if(!r.stages.some(x=>x.kind==="pickup"&&x.stopSequence<r.stops.length-1) ||
       !r.stages.some(x=>x.kind==="drop"&&x.stopSequence>0) || r.stages.some(x=>!x.name))
      return "Add named pickup and dropping stages in the correct route order.";
    if(r.fares.some(f=>Object.values(f).some(x=>typeof x!=="number"||!Number.isFinite(x)||x<0)))
      return "Fares must be non-negative finite numbers.";
    if(r.status==="active"&&r.fares.some(f=>f.seater<=0&&f.sleeperLower<=0&&f.sleeperUpper<=0))
      return "Set fares on every city pair before activating the route.";
    return undefined;
  };
  const save=async()=>{
    if(!draft||busy||draft.structuralLocked)return;
    const data=clean(draft),problem=validate(data);
    if(problem){setError(problem);return;}
    setBusy(true);setError("");setNotice("");
    try{
      const saved=await api.saveRoute(data,draft.id);
      const catalog=await getCatalog();
      const full=await api.routeFull(saved.id);
      setDraft(existing(full));setActiveTab("General");
      setNotice("Route "+(draft.id?"updated":"created")+" and reloaded from PostgreSQL. "+catalog.r.length+" routes in operator catalog.");
    }catch(e){setError(msg(e));}finally{setBusy(false);}
  };
  const generate=async()=>{
    if(!draft?.id || draft.status!=="active"||busy)return;
    if(!generationReason.trim()){setError("Enter the operational reason for generating services.");return;}
    const days=(Date.parse(generation.to)-Date.parse(generation.from))/86400000;
    if(!Number.isFinite(days)||days<0||days>120){setError("Choose a 0–120 day date range.");return;}
    if(!window.confirm("Generate services for "+draft.serviceNumber+" from "+generation.from+" through "+generation.to+"?"))return;
    setBusy(true);setError("");setNotice("");
    try{
      const x=await api.generateRoute(draft.id,generation.from,generation.to);
      const full=await api.routeFull(draft.id);
      setDraft(existing(full));
      setNotice("Created "+x.created+" scheduled services. Existing service dates were not duplicated.");
      setGenerationReason("");
    }catch(e){setError(msg(e));}finally{setBusy(false);}
  };
  const immutable=Boolean(draft?.structuralLocked);
  const disable=busy||immutable;
  return <section className="rm-page" data-testid="routes-page">
    <header className="rm-head"><div><small>GDS / ROUTE MANAGEMENT</small><h1>Routes</h1>
      <p>Configure cities, boarding points, dropping points, service classes and passenger fares</p>
    </div><button onClick={newRoute} disabled={busy||!coaches.length||cities.length<2}>+ Add Route</button></header>
    {error&&<div className="rm-error" role="alert">{error}</div>}
    {notice&&<div className="rm-success" role="status">{notice}</div>}
    <div className="rm-workspace">
      <aside className="rm-route-list">
        <label className="rm-search">Search routes<input aria-label="Search routes" value={query}
          onChange={e=>setQuery(e.target.value)} placeholder="Route, service or status"/></label>
        {loading?<p>Loading route catalog…</p>:filtered.map(r=>
          <button key={r.id} type="button" className={"rm-route-entry"+(draft?.id===r.id?" active":"")}
            disabled={busy} onClick={()=>void open(r.id)}>
            <strong>{r.serviceNumber} <span className={"rm-pill "+r.status}>{r.status}</span></strong>
            <span>{r.name}</span><small>Departs {clock(r.departureTime)}</small>
          </button>)}
        {!loading&&!filtered.length&&<p className="rm-muted">No routes match the search.</p>}
      </aside>
      <main className="rm-editor">
        {!draft?<div className="rm-no-selection"><h2>Select or create a route</h2>
          <p>All route changes here are saved to PostgreSQL through the audited .NET API.</p></div>:<>
          <div className="rm-editor-heading">
            <div><h2>{draft.id?"Edit route · "+draft.serviceNumber:"Create route"}</h2>
              <p>{draft.id?"Service #"+draft.id+" · ":""}{draft.structuralLocked?
                "Read-only: generated trips exist. Clone this route to change its structure.":
                "Unpublished changes do not affect the original route until saved."}</p></div>
            <div className="rm-heading-actions">
              {draft.structuralLocked&&<button className="rm-secondary" onClick={copyVersion}>Clone route version</button>}
              <button className="rm-secondary" onClick={()=>setDraft(undefined)}>Close</button>
              <button disabled={disable} onClick={()=>void save()}> {busy?"Saving…":"Save Route"}</button>
            </div>
          </div>
          <nav className="rm-tabs" aria-label="Route editor sections">
            {tabs.map(t=><button key={t} type="button" className={activeTab===t?"active":""}
              onClick={()=>setActiveTab(t)}>{t}</button>)}
          </nav>
          <fieldset disabled={disable} className="rm-fieldset" aria-label="Route editor">
            {activeTab==="General"&&<div className="rm-card">
              <h3>General</h3><div className="rm-form-grid">
                <label>Service No. *<input aria-label="Service number" maxLength={32} value={draft.serviceNumber}
                  onChange={e=>update({serviceNumber:e.target.value})}/></label>
                <label>Route Name *<input aria-label="Route name" value={draft.name} maxLength={120}
                  onChange={e=>update({name:e.target.value})}/></label>
                <label>Coach Type *<select aria-label="Route coach template" value={draft.coachTemplateId}
                  onChange={e=>update({coachTemplateId:Number(e.target.value)})}>
                  {coaches.map(x=><option key={x.id} value={x.id}>{x.name} · {x.pattern} · {x.seatCount} seats</option>)}
                </select></label>
                <label>Publication status<select aria-label="Route status" value={draft.status}
                  onChange={e=>update({status:e.target.value as RouteDraft["status"]})}>
                  <option value="draft">Draft</option><option value="inactive">Inactive</option>
                  <option value="active">Active</option>
                </select></label>
                <label>Departure time<input type="time" aria-label="Route departure time" value={clock(draft.stops[0].time)}
                  onChange={e=>update({stops:draft.stops.map((s,i)=>i===0?{...s,time:e.target.value}:s),
                    departureTime:e.target.value,
                    stages:draft.stages.map(x=>x.stopSequence===0?{...x,time:e.target.value}:x)})}/></label>
              </div>
              {coach&&<div className="rm-coach-stats"><strong>{coach.name}</strong>
                <span>{coach.busType} · {coach.isAc?"Air-conditioned":"Non-AC"}</span>
                <span>{coach.seatCount} berths / seats · {coach.seaterCount} seater · {coach.sleeperCount} sleeper</span>
              </div>}
            </div>}
            {activeTab==="Cities & Schedule"&&<div className="rm-card">
              <h3>Cities &amp; Schedule</h3><p className="rm-muted">Journey days start at 1; times must advance chronologically across overnight services.</p>
              {draft.stops.map((s,i)=><div className="rm-stop" key={i}>
                <span className="rm-index">{i+1}</span>
                <label>City<select aria-label={"City "+(i+1)} value={s.cityId}
                  onChange={e=>updateStop(i,{cityId:Number(e.target.value)})}>
                  {cities.map(c=><option value={c.id} key={c.id}>{c.name}{c.state?" · "+c.state:""}</option>)}
                </select></label>
                <label>Day<input type="number" min={1} max={14} aria-label={"Day "+(i+1)} value={s.day}
                  onChange={e=>updateStop(i,{day:Number(e.target.value)})}/></label>
                <label>Time<input type="time" aria-label={"City time "+(i+1)} value={clock(s.time)}
                  onChange={e=>updateStop(i,{time:e.target.value})}/></label>
                {i>0&&i<draft.stops.length-1&&<button type="button" className="rm-danger"
                  onClick={()=>removeStop(i)} aria-label={"Remove city "+(i+1)}>Remove</button>}
                {i===0&&<span className="rm-tag">Origin</span>}
                {i===draft.stops.length-1&&<span className="rm-tag">Destination</span>}
              </div>)}
              <button className="rm-secondary" type="button" onClick={addStop}>+ Add Via City</button>
            </div>}
            {(activeTab==="Pickups"||activeTab==="Drops")&&<div className="rm-card">
              <h3>{activeTab} (boarding and dropping points)</h3>
              {draft.stages.map((s,i)=>({s,i})).filter(({s})=>s.kind===(activeTab==="Pickups"?"pickup":"drop"))
                .map(({s,i})=><div key={i} className="rm-stage">
                  <label>Point Name *<input value={s.name} aria-label={"Stage name "+i} maxLength={180}
                    onChange={e=>updateStage(i,{name:e.target.value})}/></label>
                  <label>City<select value={s.stopSequence} aria-label={"Stage city "+i}
                    onChange={e=>updateStage(i,{stopSequence:Number(e.target.value)})}>
                    {draft.stops.map((_,j)=><option value={j} key={j}>{byStop(j)}</option>)}
                  </select></label>
                  <label>Day<input type="number" min={1} max={14} value={s.day}
                    aria-label={"Stage day "+i} readOnly/></label>
                  <label>Time<input type="time" value={clock(s.time)} aria-label={"Stage time "+i}
                    onChange={e=>updateStage(i,{time:e.target.value})}/></label>
                  <label>Address<input value={s.address||""} aria-label={"Stage address "+i}
                    onChange={e=>updateStage(i,{address:e.target.value})}/></label>
                  <label>Landmark<input value={s.landmark||""} aria-label={"Stage landmark "+i}
                    onChange={e=>updateStage(i,{landmark:e.target.value})}/></label>
                  <label>Contact<input value={s.contactNumber||""} aria-label={"Stage contact "+i}
                    onChange={e=>updateStage(i,{contactNumber:e.target.value})}/></label>
                  <label className="rm-check"><input type="checkbox" checked={s.prime}
                    onChange={e=>updateStage(i,{prime:e.target.checked})}/>Prime</label>
                  <button type="button" className="rm-danger" aria-label={"Remove stage "+i}
                    onClick={()=>update({stages:draft.stages.filter((_,j)=>j!==i)})}>Remove point</button>
                </div>)}
              <button type="button" className="rm-secondary"
                onClick={()=>addStage(activeTab==="Pickups"?"pickup":"drop")}>+ Add {activeTab==="Pickups"?"Pickup":"Drop"}</button>
            </div>}
            {activeTab==="Fares"&&<div className="rm-card">
              <h3>Fare Matrix</h3><p className="rm-muted">Amounts are base fares before applicable GST. All journey pairs are shown.</p>
              <div className="rm-overflow"><table><thead><tr><th>Journey segment</th><th>Seater ₹</th>
                <th>Lower Sleeper ₹</th><th>Upper Sleeper ₹</th></tr></thead><tbody>
                {draft.fares.map((f,i)=><tr key={f.fromSequence+":"+f.toSequence}>
                  <th>{byStop(f.fromSequence)} → {byStop(f.toSequence)}</th>
                  {(["seater","sleeperLower","sleeperUpper"] as const).map(key=><td key={key}>
                    <input type="number" min={0} max={1000000} step=".01" value={f[key]}
                      aria-label={key+" fare "+f.fromSequence+" "+f.toSequence}
                      onChange={e=>changeFare(i,key,Number(e.target.value))}/>
                  </td>)}
                </tr>)}</tbody></table></div>
              <p className="rm-muted">Existing paid tickets and active holds retain their recorded financial evidence.</p>
            </div>}
            {activeTab==="Cancellation"&&<div className="rm-card">
              <h3>Booking and Cancellation Rules</h3>
              <div className="rm-form-grid">
                <label className="rm-check"><input type="checkbox" checked={draft.partialCancellationAllowed}
                  onChange={e=>update({partialCancellationAllowed:e.target.checked})}/>Allow partial cancellation</label>
                <label className="rm-check"><input type="checkbox" checked={draft.primaryPaxCancellable}
                  onChange={e=>update({primaryPaxCancellable:e.target.checked})}/>Allow primary-passenger cancellation</label>
                <label>Maximum seats per ticket<input type="number" min={1} max={12}
                  value={draft.maxSeatsPerTicket} onChange={e=>update({maxSeatsPerTicket:Number(e.target.value)})}/></label>
                <label>Booking update cutoff (minutes before boarding)<input type="number" min={0} max={10080}
                  value={draft.updateCutoffMinutes} onChange={e=>update({updateCutoffMinutes:Number(e.target.value)})}/></label>
              </div>
              <p className="rm-muted">Cancellation refund slabs require their separate audited policy editor. The current route backend retains those slabs without changing them.</p>
            </div>}
          </fieldset>
          {activeTab==="Generate"&&<div className="rm-card">
            <h3>Generate Schedule Services</h3><p className="rm-muted">Only active saved routes can generate schedules. Each route/date is unique; retrying will not duplicate services.</p>
            <div className="rm-form-grid">
              <label>From date<input type="date" value={generation.from} onChange={e=>setGeneration({...generation,from:e.target.value})}/></label>
              <label>To date<input type="date" value={generation.to} onChange={e=>setGeneration({...generation,to:e.target.value})}/></label>
              <label>Operational reason<input value={generationReason} maxLength={160}
                onChange={e=>setGenerationReason(e.target.value)} placeholder="Schedule publishing request"/></label>
              <button disabled={!draft.id||draft.status!=="active"||busy} onClick={()=>void generate()}>
                Generate Services
              </button>
            </div>
          </div>}
          <div className="rm-bottom">
            {immutable?<><strong>Editing locked:</strong> Generated trips reference this route version.
              <button type="button" className="rm-secondary" onClick={copyVersion}>Clone as new route</button>
            </>:<><span>Changes require an explicit save.</span>
              <button type="button" disabled={busy} onClick={()=>void save()}>Save Route</button></>}
          </div>
        </>}
      </main>
    </div>
  </section>;
}
