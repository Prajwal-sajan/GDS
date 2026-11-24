import {useEffect,useMemo,useState} from "react";
import {api,type Vehicle,type CoachOption,type ComplianceDocument} from "../../api";
import "./fleet.css";

type Layout="grid"|"list";
type VehicleTab="details"|"compliance"|"location"|"health"|"alerts";
type VehicleForm={
  registrationNumber:string;coachTemplateId:string;status:string;modelName:string;
  manufactureYear:string;ownershipType:string;phoneNumber:string;gpsEnabled:boolean;
  insuranceExpiry:string;permitExpiry:string;fitnessExpiry:string;pucExpiry:string;
};
const fresh=():VehicleForm=>({registrationNumber:"",coachTemplateId:"",status:"active",modelName:"",
  manufactureYear:"",ownershipType:"",phoneNumber:"",gpsEnabled:false,
  insuranceExpiry:"",permitExpiry:"",fitnessExpiry:"",pucExpiry:""});
const fromVehicle=(x:Vehicle):VehicleForm=>({registrationNumber:x.registrationNumber,
  coachTemplateId:x.coachTemplateId?String(x.coachTemplateId):"",status:x.status,
  modelName:x.modelName||"",manufactureYear:x.manufactureYear?String(x.manufactureYear):"",
  ownershipType:x.ownershipType||"",phoneNumber:x.phoneNumber||"",gpsEnabled:x.gpsEnabled,
  insuranceExpiry:x.insuranceExpiry||"",permitExpiry:x.permitExpiry||"",
  fitnessExpiry:x.fitnessExpiry||"",pucExpiry:x.pucExpiry||""});
const msg=(e:unknown)=>e instanceof Error?e.message:String(e);
const expiry=(value:string|null|undefined)=>{
  if(!value)return {label:"Not recorded",kind:"unknown"};
  const days=Math.floor((Date.parse(value+"T12:00:00Z")-Date.now())/86400000);
  return days<0?{label:"Expired",kind:"expired"}:days<=30?
    {label:"Expiring in "+days+" days",kind:"soon"}:{label:"Valid until "+value,kind:"valid"};
};
function BusIcon({name}:{name:"bus"|"eye"|"edit"|"copy"|"refresh"}){
 const paths:Record<string,string>={
  bus:"M3 6h18v12H3zM3 12h18M7 17v3M17 17v3M7 15h.01M17 15h.01",
  eye:"M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zm10-3a3 3 0 110 6 3 3 0 010-6",
  edit:"M12 20h9M4 15v5h5L20 9l-5-5L4 15",
  copy:"M8 4h12v14H8zM4 8H2v14h14v-2",
  refresh:"M21 12a9 9 0 11-2.6-6.4M21 3v6h-6"
 };
 return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"
   fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
   <path d={paths[name]}/></svg>;
}
function VehicleFormFields({form,setForm,coaches}:{form:VehicleForm;setForm:(x:VehicleForm)=>void;coaches:CoachOption[]}){
 const update=(p:Partial<VehicleForm>)=>setForm({...form,...p});
 return <div className="vf-form-grid">
   <label>Registration Number *<input aria-label="Vehicle registration" required maxLength={24}
     value={form.registrationNumber} onChange={e=>update({registrationNumber:e.target.value.toUpperCase()})}/></label>
   <label>Coach Template<select aria-label="Vehicle coach template" value={form.coachTemplateId}
     onChange={e=>update({coachTemplateId:e.target.value})}>
     <option value="">Not assigned</option>
     {coaches.map(c=><option value={c.id} key={c.id}>{c.name} · {c.pattern} · {c.seatCount} seats</option>)}
   </select></label>
   <label>Status<select value={form.status} aria-label="Vehicle status"
     onChange={e=>update({status:e.target.value})}>
     <option value="active">Active</option><option value="maintenance">Maintenance</option>
     <option value="retired">Retired</option>
   </select></label>
   <label>Vehicle Model<input value={form.modelName} onChange={e=>update({modelName:e.target.value})}/></label>
   <label>Manufacture Year<input type="number" min="1980" max="2100" aria-label="Manufacture year"
     value={form.manufactureYear} onChange={e=>update({manufactureYear:e.target.value})}/></label>
   <label>Ownership<select aria-label="Ownership type" value={form.ownershipType}
     onChange={e=>update({ownershipType:e.target.value})}>
     <option value="">Not recorded</option>
     <option value="owned">Owned</option><option value="leased">Leased</option>
     <option value="contracted">Contracted</option></select></label>
   <label>Assigned Contact Mobile<input aria-label="Vehicle contact mobile" inputMode="tel"
     value={form.phoneNumber} onChange={e=>update({phoneNumber:e.target.value})}/></label>
   <label className="vf-checkbox"><input type="checkbox" checked={form.gpsEnabled}
     onChange={e=>update({gpsEnabled:e.target.checked})}/>GPS configured on vehicle</label>
   {(["insuranceExpiry","permitExpiry","fitnessExpiry","pucExpiry"] as const).map(key=>
     <label key={key}>{key.replace("Expiry"," expiry").toUpperCase()}<input type="date"
       aria-label={key} value={form[key]} onChange={e=>update({[key]:e.target.value})}/></label>)}
 </div>;
}
function VehicleDialog({vehicle,coaches,onClose,onEdit}:{vehicle:Vehicle;coaches:CoachOption[];
  onClose:()=>void;onEdit:()=>void}){
 const [tab,setTab]=useState<VehicleTab>("details");
 const [docs,setDocs]=useState<ComplianceDocument[]>([]);
 const [error,setError]=useState("");
 useEffect(()=>{
  let live=true;
  api.vehicleDocuments(vehicle.id).then(x=>{if(live)setDocs(x);})
    .catch(e=>{if(live)setError(msg(e));});
  return ()=>{live=false;};
 },[vehicle.id]);
 const coach=coaches.find(c=>c.id===vehicle.coachTemplateId);
 const fields=[
  ["Registration",vehicle.registrationNumber],["Coach",coach?.name||"Not assigned"],
  ["Model",vehicle.modelName||"Not recorded"],["Year",vehicle.manufactureYear||"Not recorded"],
  ["Ownership",vehicle.ownershipType||"Not recorded"],["Status",vehicle.status],
  ["Vehicle contact",vehicle.phoneNumber||"Not recorded"],
  ["GPS configured",vehicle.gpsEnabled?"Yes (location feed not verified)":"No"]
 ];
 const dates=[
  ["Insurance",vehicle.insuranceExpiry],["Permit",vehicle.permitExpiry],
  ["Fitness",vehicle.fitnessExpiry],["PUC",vehicle.pucExpiry]
 ] as const;
 return <div className="vf-overlay">
  <section className="vf-modal" role="dialog" aria-modal="true" aria-label={"Vehicle "+vehicle.registrationNumber}>
   <header className="vf-dialog-head"><span className="vf-modal-bus"><BusIcon name="bus"/></span>
     <div><h2>{vehicle.registrationNumber}</h2><p>Vehicle Overview &amp; Compliance</p></div>
     <button aria-label="Close vehicle detail" onClick={onClose}>✕</button></header>
   <nav className="vf-modal-tabs" aria-label="Vehicle detail tabs">
     {([{id:"details",label:"Vehicle Details"},{id:"compliance",label:"Documents & Compliance"},
       {id:"location",label:"Location"},{id:"health",label:"Vehicle Health"},
       {id:"alerts",label:"Alerts"}] as const).map(x=><button key={x.id}
       className={tab===x.id?"active":""} onClick={()=>setTab(x.id)}>{x.label}</button>)}
   </nav>
   <div className="vf-dialog-body">
     {error&&<p role="alert" className="vf-alert">{error}</p>}
     {tab==="details"&&<div className="vf-info-grid">{fields.map(([k,v])=>
       <div className="vf-info-card" key={k}><small>{k}</small><b>{v}</b></div>)}</div>}
     {tab==="compliance"&&<>
       <div className="vf-info-grid">{dates.map(([name,value])=>{
         const info=expiry(value);
         return <div className="vf-info-card" key={name}><small>{name}</small>
           <b>{value||"Not recorded"}</b>
           <span className={"vf-expiry "+info.kind}>{info.label}</span></div>;
       })}</div>
       <h3>Recorded document metadata</h3>
       <div className="vf-table-scroll"><table><thead><tr><th>Document</th><th>Category</th>
         <th>Expires</th><th>Verification</th><th>Evidence</th></tr></thead><tbody>
       {docs.map(d=><tr key={d.id}><td>{d.documentName}</td><td>{d.category||"—"}</td>
         <td>{d.expiryDate||"—"}</td><td>{d.verificationStatus||"Not verified"}</td>
         <td><span className="vf-unavailable">Metadata only · original file unavailable</span></td></tr>)}
       </tbody></table></div>
       {!docs.length&&<p className="vf-muted">No compliance document records are attached to this vehicle.</p>}
       <button disabled title="File-object storage / verification service not integrated">Upload document</button>
     </>}
     {tab==="location"&&<div className="vf-provider-state"><h3>Live Vehicle Location</h3>
       <p>{vehicle.gpsEnabled?"GPS is marked configured, but no authorized Track Now/live location feed is connected to this modern view.":
         "No authorized live GPS feed is configured for this vehicle."}</p>
       <p>Do not display a fabricated location or claim that this bus is online.</p>
       <button disabled title="Provider GPS integration not connected">Open live map</button>
     </div>}
     {tab==="health"&&<div className="vf-provider-state"><h3>Vehicle Health</h3>
       <p>Health fault codes and realtime telemetry require a verified device/provider connection.
         Vehicle registration and recorded compliance data remain available above.</p>
       <button disabled title="CAN/OBD telemetry feed not configured">Refresh fault codes</button>
     </div>}
     {tab==="alerts"&&<div className="vf-info-grid">{dates.filter(x=>expiry(x[1]).kind!=="valid")
       .map(([name,v])=><div className="vf-info-card" key={name}>
         <small>{name} alert</small><b>{expiry(v).label}</b>
         <span>{v||"Operator must record this expiry"}</span></div>)}
       {dates.every(x=>expiry(x[1]).kind==="valid")&&<p className="vf-muted">
         No recorded vehicle expiry warnings.</p>}</div>}
   </div>
   <footer className="vf-dialog-footer">
     <button className="vf-outline" onClick={onClose}>Close</button>
     <button className="vf-primary" onClick={()=>{onClose();onEdit();}}>Edit Vehicle</button>
   </footer>
  </section>
 </div>;
}
function VehicleEditor({value,onClose,onSave,coaches}:{value:Vehicle|null;onClose:()=>void;
  onSave:(form:VehicleForm)=>Promise<void>;coaches:CoachOption[]}){
 const [form,setForm]=useState<VehicleForm>(()=>value?fromVehicle(value):fresh());
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const save=async()=>{
   if(!/^[A-Z0-9 -]{5,24}$/.test(form.registrationNumber.trim())){
     setError("Enter a valid bus registration number.");return;
   }
   if(form.phoneNumber&&!/^[0-9]{10,13}$/.test(form.phoneNumber)){
     setError("Vehicle contact must be 10–13 digits.");return;
   }
   setBusy(true);setError("");
   try{await onSave(form);}catch(e){setError(msg(e));}finally{setBusy(false);}
 };
 return <div className="vf-overlay">
   <section className="vf-modal" role="dialog" aria-modal="true" aria-label={value?"Edit vehicle":"Add vehicle"}>
     <header className="vf-dialog-head"><span className="vf-modal-bus"><BusIcon name="edit"/></span>
       <div><h2>{value?.id?"Edit Vehicle":"Add Vehicle"}</h2><p>All validated fields are persisted through ASP.NET Core</p></div>
       <button aria-label="Close vehicle editor" onClick={onClose}>✕</button></header>
     <form className="vf-dialog-body" onSubmit={e=>{e.preventDefault();void save();}}>
       {error&&<p role="alert" className="vf-alert">{error}</p>}
       <VehicleFormFields form={form} setForm={setForm} coaches={coaches}/>
       <div className="vf-dialog-footer">
         <button type="button" className="vf-outline" onClick={onClose}>Cancel</button>
         <button type="submit" className="vf-primary" disabled={busy}>{busy?"Saving…":"Save Vehicle"}</button>
       </div>
     </form>
   </section></div>;
}
export function VehiclesPanel(){
 const [vehicles,setVehicles]=useState<Vehicle[]>([]);
 const [coaches,setCoaches]=useState<CoachOption[]>([]);
 const [search,setSearch]=useState("");
 const [status,setStatus]=useState("all");
 const [layout,setLayout]=useState<Layout>("grid");
 const [selected,setSelected]=useState<Vehicle|null>(null);
 const [editing,setEditing]=useState<Vehicle|null|undefined>();
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [loading,setLoading]=useState(true);
 const [revision,setRevision]=useState(0);
 useEffect(()=>{
   let live=true;setLoading(true);setError("");
   Promise.all([api.vehicles(),api.coaches()])
     .then(([v,c])=>{if(live){setVehicles(v);setCoaches(c);}})
     .catch(e=>{if(live)setError(msg(e));})
     .finally(()=>{if(live)setLoading(false);});
   return ()=>{live=false;};
 },[revision]);
 const results=useMemo(()=>vehicles.filter(v=>(status==="all"||v.status===status)&&
   [v.registrationNumber,v.modelName||"",coaches.find(c=>c.id===v.coachTemplateId)?.name||""]
     .some(x=>x.toLowerCase().includes(search.toLowerCase()))),[vehicles,search,status,coaches]);
 const active=vehicles.filter(x=>x.status==="active").length;
 const due=vehicles.filter(x=>["insuranceExpiry","permitExpiry","fitnessExpiry","pucExpiry"]
   .some(k=>expiry(x[k as keyof Vehicle] as string|null|undefined).kind!=="valid")).length;
 const onSave=async(form:VehicleForm)=>{
   const value={
     registrationNumber:form.registrationNumber.trim(),
     coachTemplateId:form.coachTemplateId?Number(form.coachTemplateId):null,status:form.status,
     modelName:form.modelName||null,manufactureYear:form.manufactureYear?Number(form.manufactureYear):null,
     ownershipType:form.ownershipType||null,phoneNumber:form.phoneNumber||null,
     gpsEnabled:form.gpsEnabled,
     insuranceExpiry:form.insuranceExpiry||null,permitExpiry:form.permitExpiry||null,
     fitnessExpiry:form.fitnessExpiry||null,pucExpiry:form.pucExpiry||null
   };
   const result=await api.saveVehicle(value,editing?.id);
   setEditing(undefined);setSelected(null);setRevision(x=>x+1);
   setNotice("Vehicle "+result.registrationNumber+" saved in operator database.");
 };
 const duplicate=(v:Vehicle)=>{
   setSelected(null);
   setEditing({...v,id:0,registrationNumber:"",status:"active"});
   setNotice("Duplicate vehicle: enter a new unique registration. Existing bus and route assignments are not copied.");
 };
 const cards=results.map(v=><article className="vf-card" key={v.id}>
   <header><span className="vf-card-icon"><BusIcon name="bus"/></span>
     <div><h3>{v.registrationNumber}</h3>
       <p>{v.modelName||"Model not specified"}</p></div>
     <span className={"vf-status "+v.status}>{v.status}</span></header>
   <div className="vf-card-details">
     <span>COACH <b>{coaches.find(c=>c.id===v.coachTemplateId)?.name||"Not assigned"}</b></span>
     <span>GPS <b>{v.gpsEnabled?"Configured (feed unverified)":"Off"}</b></span>
     <span>Insurance <b className={expiry(v.insuranceExpiry).kind}>
       {expiry(v.insuranceExpiry).label}</b></span>
     <span>Fitness <b className={expiry(v.fitnessExpiry).kind}>
       {expiry(v.fitnessExpiry).label}</b></span>
   </div>
   <footer><button onClick={()=>setSelected(v)}><BusIcon name="eye"/> View</button>
     <button onClick={()=>setEditing(v)}><BusIcon name="edit"/> Edit</button>
     <button onClick={()=>duplicate(v)}><BusIcon name="copy"/> Duplicate</button>
     <button disabled title="Vehicle deletion requires a service-assignment impact and audit policy">Delete</button></footer>
 </article>);
 return <section className="vf-page" data-testid="vehicles-page">
   <header className="vf-page-head"><div><small>VEHICLES / FLEET MANAGEMENT</small>
     <h1>Vehicles</h1><p>Registration, coach mapping, compliance, status and operational metadata</p></div>
     <button className="vf-primary" onClick={()=>setEditing(null)}>+ Add Vehicle</button></header>
   {error&&<p className="vf-alert" role="alert">{error}</p>}
   {notice&&<p className="vf-notice" role="status">{notice}</p>}
   <div className="vf-metrics">
     <div><b>{vehicles.length}</b><small>ALL VEHICLES</small></div>
     <div><b>{active}</b><small>ACTIVE</small></div>
     <div><b>{vehicles.length-active}</b><small>NON-ACTIVE</small></div>
     <div><b>{due}</b><small>EXPIRING / MISSING COMPLIANCE</small></div>
   </div>
   <div className="vf-toolbar">
     <label>Search Fleet<input aria-label="Search fleet" placeholder="Registration or model…"
       value={search} onChange={e=>setSearch(e.target.value)}/></label>
     <label>Status<select aria-label="Vehicle status filter" value={status}
       onChange={e=>setStatus(e.target.value)}>
       <option value="all">All statuses</option>
       <option value="active">Active</option><option value="maintenance">Maintenance</option>
       <option value="retired">Retired</option></select></label>
     <div className="vf-layout-toggle">
       <button className={layout==="grid"?"active":""} onClick={()=>setLayout("grid")}>Grid</button>
       <button className={layout==="list"?"active":""} onClick={()=>setLayout("list")}>List</button></div>
     <button onClick={()=>setRevision(x=>x+1)}><BusIcon name="refresh"/> Refresh</button>
   </div>
   {loading&&<p className="vf-muted" role="status">Loading registered buses…</p>}
   {layout==="grid"?<div className="vf-card-grid">{cards}</div>:<div className="vf-table-scroll">
     <table><thead><tr><th>Registration</th><th>Model</th><th>Coach</th>
       <th>Status</th><th>Insurance</th><th>Permit</th><th>Actions</th></tr></thead>
       <tbody>{results.map(v=><tr key={v.id}><td>{v.registrationNumber}</td>
         <td>{v.modelName||"—"}</td><td>{coaches.find(c=>c.id===v.coachTemplateId)?.name||"—"}</td>
         <td>{v.status}</td><td>{expiry(v.insuranceExpiry).label}</td><td>{expiry(v.permitExpiry).label}</td>
         <td><button onClick={()=>setSelected(v)}>View</button>
           <button onClick={()=>setEditing(v)}>Edit</button></td></tr>)}</tbody>
     </table></div>}
   {!loading&&!results.length&&<p className="vf-empty">No buses match the current search and status.</p>}
   {selected&&<VehicleDialog vehicle={selected} coaches={coaches} onClose={()=>setSelected(null)}
     onEdit={()=>setEditing(selected)}/>}
   {editing!==undefined&&<VehicleEditor value={editing||null} onClose={()=>setEditing(undefined)}
     onSave={onSave} coaches={coaches}/>}
 </section>;
}
