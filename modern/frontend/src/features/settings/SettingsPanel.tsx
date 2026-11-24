import { useEffect, useMemo, useState } from "react";
import { api, type BookingSiteSettings } from "../../api";
import "./settings.css";

const errText=(e:unknown)=>e instanceof Error?e.message:String(e);
type Section = "website" | "organization" | "access";
type CityMapping = BookingSiteSettings["cityMappings"][number];

export function SettingsPanel({ onOpenUsers }: { onOpenUsers: () => void }) {
  const [data,setData]=useState<BookingSiteSettings>();
  const [url,setUrl]=useState("");
  const [cities,setCities]=useState<CityMapping[]>([]);
  const [filter,setFilter]=useState("");
  const [onlyMissing,setOnlyMissing]=useState(false);
  const [section,setSection]=useState<Section>("website");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [changed,setChanged]=useState(false);
  const load = async () => {
    setBusy(true);setError("");
    try {
      const d=await api.bookingSite();
      setData(d);setUrl(d.searchUrl);setCities(d.cityMappings.map(x=>({...x})));
      setChanged(false);
    }catch(e){setError(errText(e));}
    finally{setBusy(false);}
  };
  useEffect(()=>{void load();},[]);
  const mapped=cities.filter(x=>x.publicCityId!=null).length;
  const filtered=useMemo(()=>cities.filter(x=>
    (!onlyMissing||x.publicCityId==null) &&
    (x.name.toLowerCase().includes(filter.toLowerCase())||String(x.cityId).includes(filter))),
    [cities,filter,onlyMissing]);
  const updateCity=(cityId:number, value:string)=>{
    const parsed=value.trim()===""?null:Number(value);
    setCities(a=>a.map(c=>c.cityId===cityId?{...c,publicCityId:parsed}:c));
    setChanged(true);setNotice("");
  };
  const problems=()=>{
    const errors:string[]=[];
    if(url.trim() && (!/^https:\/\/[^\s/]+(?:\/[^?#]*)?$/i.test(url.trim())||
      url.includes("@")||url.includes("?")||url.includes("#"))) errors.push("Enter a public HTTPS URL without credentials, query or fragment.");
    const publicIds=cities.filter(x=>x.publicCityId!=null).map(x=>x.publicCityId!);
    if(publicIds.some(x=>!Number.isSafeInteger(x)||x<=0)||new Set(publicIds).size!==publicIds.length)
      errors.push("Each external city ID must be a distinct positive integer.");
    if(!url.trim()&&mapped)errors.push("Configure an HTTPS site before entering city mappings.");
    return errors;
  };
  const errors=problems();
  const save=async()=>{
    if(errors.length) {setError(errors[0]);return;}
    setBusy(true);setError("");setNotice("");
    try{
      const next=await api.saveBookingSite({searchUrl:url.trim(),
        cityMappings:cities.filter(x=>x.publicCityId!=null)
          .map(x=>({cityId:x.cityId,publicCityId:x.publicCityId}))});
      setData(next);setCities(next.cityMappings.map(x=>({...x})));setUrl(next.searchUrl);
      setChanged(false);setNotice("Operator website configuration saved and audited.");
    }catch(e){setError(errText(e));}
    finally{setBusy(false);}
  };
  const disconnect=async()=>{
    if(!window.confirm("Remove the public booking link and ALL external city mappings for this operator? Future Share requests will be unavailable."))return;
    setBusy(true);setError("");setNotice("");
    try{
      const next=await api.saveBookingSite({searchUrl:"",cityMappings:[]});
      setData(next);setCities(next.cityMappings.map(x=>({...x})));setUrl("");
      setChanged(false);setNotice("Public booking website disconnected. Share will remain unavailable until configured.");
    }catch(e){setError(errText(e));}
    finally{setBusy(false);}
  };
  return <section className="modern-settings" data-testid="operator-settings">
    <div className="settings-head"><div><h2>Operator Settings</h2>
      <p className="muted">Configuration is stored per operator and permissions are enforced by the API.</p></div>
      <span className="settings-operator">{data?.operatorName||"Operator"}</span></div>
    <nav className="settings-tabs" aria-label="Settings sections">
      {([["website","Booking Website"],["organization","Company"],["access","Team Access"]] as [Section,string][])
        .map(([key,label])=><button type="button" key={key} aria-current={section===key?"page":undefined}
          className={section===key?"active":"link"} onClick={()=>setSection(key)}>{label}</button>)}
    </nav>
    {busy&&<p role="status">Updating operator configuration…</p>}
    {error&&<p className="error" role="alert">{error}</p>}
    {notice&&<p className="note" role="status">{notice}</p>}
    {section==="website"&&<>
      <div className="settings-summary">
        <div><small>Booking website</small><strong>{data?.configured?"Configured":"Not configured"}</strong></div>
        <div><small>Website city mappings</small><strong>{mapped} of {cities.length}</strong></div>
        <div><small>Configuration source</small><strong>{data?.source==="database"?"Operator-controlled":"Server configuration"}</strong></div>
      </div>
      <h3>Public passenger booking search</h3>
      <p className="muted">This URL is used when an authorized operator selects Share on a scheduled service.
        Only the route cities and journey date are passed to the website; a particular service is <strong>not</strong> preselected.</p>
      <label className="settings-url">Operator's HTTPS search URL
        <input type="url" aria-label="Public booking search URL" value={url}
          placeholder="https://your-operator-domain.example/bus/search/"
          maxLength={512} onChange={e=>{setUrl(e.target.value);setChanged(true);setNotice("");}}/>
      </label>
      <div className="banner warn">Only configure a passenger website you own or are authorized to use.
        The URL and external city IDs must come from that website's verified booking integration.
        Missing mappings will block Share for that route segment.</div>
      <div className="settings-map-head"><div><h3>Website city ID mappings</h3>
        <p className="muted">GDS city IDs and public booking website IDs are separate.
          Do not copy them blindly or assume they match.</p></div></div>
      <div className="settings-map-tools">
        <label>Search cities<input aria-label="Search mapping cities" value={filter} onChange={e=>setFilter(e.target.value)}/></label>
        <label className="check"><input type="checkbox" checked={onlyMissing} onChange={e=>setOnlyMissing(e.target.checked)}/> Unmapped only</label>
      </div>
      <div className="settings-map-scroll"><table>
        <thead><tr><th>GDS city</th><th>GDS city ID</th><th>Public website city ID</th><th>Mapping</th></tr></thead>
        <tbody>{filtered.map(city=><tr key={city.cityId}>
          <td>{city.name}</td><td>{city.cityId}</td><td><input aria-label={"Public city ID for "+city.name}
            inputMode="numeric" type="number" min="1" step="1" placeholder="Not mapped"
            value={city.publicCityId??""} onChange={e=>updateCity(city.cityId,e.target.value)}/></td>
          <td>{city.publicCityId==null?"Not configured":"Mapped"}</td>
        </tr>)}
        {filtered.length===0&&<tr><td colSpan={4}>No cities match your filter</td></tr>}
        </tbody></table></div>
      {errors.length>0&&<ul className="settings-errors" role="alert">{errors.map(e=><li key={e}>{e}</li>)}</ul>}
      <div className="settings-actions">
        <button type="button" disabled={busy||!changed||errors.length>0} onClick={()=>void save()}>Save Website Settings</button>
        <button type="button" className="link" disabled={busy} onClick={()=>void load()}>Reload</button>
        <button type="button" className="link danger" disabled={busy||(!data?.configured&&mapped===0)} onClick={()=>void disconnect()}>Disconnect Website</button>
      </div>
      {data?.updatedAt&&<p className="muted">Last updated {new Date(data.updatedAt).toLocaleString("en-IN")} by {data.updatedBy||"operator"}.</p>}
    </>}
    {section==="organization"&&<div className="settings-simple">
      <h3>Operator identity</h3>
      <dl><dt>Operator code</dt><dd>{data?.operatorCode||"—"}</dd>
        <dt>Operator name</dt><dd>{data?.operatorName||"—"}</dd></dl>
      <p className="muted">Financial identity, GST registration, legal address and payment/bank details
        must be verified through the operator onboarding and accounts workflows. They cannot be silently
        changed through an unverified frontend form.</p>
    </div>}
    {section==="access"&&<div className="settings-simple">
      <h3>Team access & permissions</h3>
      <p>Manage operator users, credentials, invite codes, roles and audit activity in the authenticated Users workspace.</p>
      <button type="button" onClick={onOpenUsers}>Open Users & Access</button>
      <p className="muted">Branch-level Off/Own/Branch/Company policies remain a separate migration gate; role labels alone
        do not provide complete branch permissions.</p>
    </div>}
  </section>;
}
