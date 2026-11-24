import {useEffect,useMemo,useState} from "react";
import {api,type Staff,type StaffDuty,type ComplianceDocument} from "../../api";
import "./staff.css";

type Section="staff"|"attendance"|"advances"|"reimbursements"|"payouts";
type EditorTab="personal"|"payables"|"bank"|"ledger"|"docs";
const message=(e:unknown)=>e instanceof Error?e.message:String(e);
const money=(x:number)=>"₹"+x.toLocaleString("en-IN",{maximumFractionDigits:2});
const roles=["driver","helper","attendant","conductor","manager","operations","cleaner","other"];
const sections:[Section,string][]=[
  ["staff","Staff"],["attendance","Attendance"],["advances","Advances"],
  ["reimbursements","Reimbursements"],["payouts","Payouts"]
];
const editorTabs:[EditorTab,string][]=[
  ["personal","Personal Info"],["payables","Payables"],
  ["bank","Bank Details"],["ledger","Ledger"],["docs","Documents"]
];
type StaffDraft={
  name:string;phone:string;role:string;status:string;designation:string;
  licenseNumber:string;licenseExpiry:string;salaryType:string;salaryAmount:string;bataPerTrip:string
};
const blank=():StaffDraft=>({name:"",phone:"",role:"driver",status:"active",designation:"",
  licenseNumber:"",licenseExpiry:"",salaryType:"per_trip",salaryAmount:"0",bataPerTrip:"0"});
const fromStaff=(s:Staff):StaffDraft=>({name:s.name,phone:s.phone,role:s.role,status:s.status,
  designation:s.designation||"",licenseNumber:s.licenseNumber||"",
  licenseExpiry:s.licenseExpiry||"",salaryType:s.salaryType||"per_trip",
  salaryAmount:String(s.salaryAmount??0),bataPerTrip:String(s.bataPerTrip??0)});
function Icon({kind}:{kind:string}){
  const path:Record<string,string>={
    users:"M7 7a4 4 0 118 0 4 4 0 01-8 0zm-4 14v-2a8 8 0 0116 0v2",
    calendar:"M8 3v4m8-4v4M3 9h18M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z",
    wallet:"M4 5h15v4H4zM2 8h20v12H2zm15 5h3",
    receipt:"M5 3h14v19l-4-3-3 3-3-3-4 3V3zm4 5h6m-6 4h6",
    cash:"M2 6h20v12H2zm5 6h.01M17 12h.01M12 9a3 3 0 100 6 3 3 0 000-6z",
    book:"M4 3h13v18H4zm4 3h6m-6 5h6",
    bank:"M2 10l10-7 10 7M4 21h16M6 10v9m4-9v9m4-9v9m4-9v9",
    file:"M5 3h9l5 5v13H5zM14 3v5h5M8 13h8m-8 4h8",
    edit:"M4 19v-4L17 2l5 5L9 20H4z",
    plus:"M12 5v14M5 12h14",
    close:"M5 5l14 14M19 5 5 19",
    search:"M21 21l-5-5M18 10a8 8 0 11-16 0 8 8 0 0116 0"
  };
  return <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={path[kind]||path.users}/></svg>;
}
function StaffEditor({value,onClose,onSaved}:{value:Staff|null;onClose:()=>void;onSaved:()=>void}){
  const [draft,setDraft]=useState<StaffDraft>(()=>value?fromStaff(value):blank());
  const [tab,setTab]=useState<EditorTab>("personal");
  const [docs,setDocs]=useState<ComplianceDocument[]>([]);
  const [duties,setDuties]=useState<StaffDuty[]>([]);
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);
  const [readonly,setReadonly]=useState(false);
  const update=(p:Partial<StaffDraft>)=>setDraft(old=>({...old,...p}));
  useEffect(()=>{
    let live=true;
    if(!value)return;
    Promise.all([api.staffDocuments(value.id),api.staffDuties(value.id)])
      .then(([d,u])=>{if(live){setDocs(d);setDuties(u);}})
      .catch(e=>{if(live)setError(message(e));});
    return ()=>{live=false;};
  },[value?.id]);
  const save=async()=>{
    if(saving||readonly)return;
    if(!draft.name.trim() || draft.name.length>120){setError("Full name is required.");return;}
    if(!/^[0-9]{10,13}$/.test(draft.phone)){setError("Enter a valid 10–13 digit staff mobile.");return;}
    if(!Number.isFinite(Number(draft.salaryAmount))||
      !Number.isFinite(Number(draft.bataPerTrip))||
      Number(draft.salaryAmount)<0||Number(draft.bataPerTrip)<0){
      setError("Pay rates must be valid non-negative amounts.");return;
    }
    setSaving(true);setError("");
    try{
      await api.saveStaff({
        name:draft.name.trim(),phone:draft.phone,role:draft.role,status:draft.status,
        designation:draft.designation||null,licenseNumber:draft.licenseNumber||null,
        licenseExpiry:draft.licenseExpiry||null,salaryType:draft.salaryType,
        salaryAmount:Number(draft.salaryAmount),bataPerTrip:Number(draft.bataPerTrip)
      },value?.id);
      onSaved();
    }catch(e){setError(message(e));}finally{setSaving(false);}
  };
  const showBank=tab==="bank";
  return <div className="sf-overlay">
    <section className="sf-modal" role="dialog" aria-modal="true" aria-label={value?"Staff member "+value.name:"Add staff member"}>
      <header className="sf-modal-head">
        <span className="sf-user-icon"><Icon kind="users"/></span>
        <div><h2>{value?value.name:"Add Staff"}</h2><p>{draft.role.toUpperCase()} · {draft.phone||"New profile"}</p></div>
        <button aria-label="Close staff editor" onClick={onClose}><Icon kind="close"/></button>
      </header>
      <nav className="sf-editor-tabs" aria-label="Staff editor tabs">
        {editorTabs.map(([k,title])=><button key={k} className={tab===k?"active":""}
          onClick={()=>setTab(k)}><Icon kind={k==="personal"?"users":k==="payables"?"wallet":k==="ledger"?"book":k==="docs"?"file":"bank"}/>{title}</button>)}
      </nav>
      <div className="sf-modal-body">
        {error&&<p role="alert" className="sf-error">{error}</p>}
        {tab==="personal"&&<>
          <section className="sf-card"><h3>Basic Information</h3><div className="sf-fields">
            <label>Role *<select aria-label="Staff role" value={draft.role}
              onChange={e=>update({role:e.target.value})}>
              {roles.map(x=><option key={x}>{x}</option>)}</select></label>
            <label>Full Name *<input aria-label="Staff full name" value={draft.name}
              maxLength={120} onChange={e=>update({name:e.target.value})}/></label>
            <label>Phone Number *<input aria-label="Staff phone number" value={draft.phone}
              inputMode="numeric" maxLength={13} onChange={e=>update({phone:e.target.value})}/></label>
            <label>Designation<input aria-label="Staff designation" value={draft.designation}
              onChange={e=>update({designation:e.target.value})}/></label>
            <label>Status<select aria-label="Staff status" value={draft.status}
              onChange={e=>update({status:e.target.value})}>
              <option value="active">Active</option><option value="inactive">Inactive</option>
            </select></label>
          </div></section>
          <section className="sf-card"><h3>License Information</h3><div className="sf-fields">
            <label>License Number<input aria-label="Staff driving license" value={draft.licenseNumber}
              onChange={e=>update({licenseNumber:e.target.value})}/></label>
            <label>License Expiry<input type="date" aria-label="Staff license expiry"
              value={draft.licenseExpiry} onChange={e=>update({licenseExpiry:e.target.value})}/></label>
          </div><p className="sf-muted">Expired licences are rejected by the service assignment business rule.</p></section>
        </>}
        {tab==="payables"&&<section className="sf-card">
          <h3>Payables</h3>
          <p className="sf-muted">This tab manages pay-rate configuration only. It does not post or run payroll.</p>
          <div className="sf-pay-types">
            {([{id:"per_trip",name:"Daily Wages / Per Trip",icon:"wallet"},
              {id:"monthly",name:"Monthly Salary",icon:"cash"}] as const).map(x=>
              <button className={draft.salaryType===x.id?"active":""} key={x.id}
                onClick={()=>update({salaryType:x.id})}><Icon kind={x.icon}/>{x.name}</button>)}
          </div>
          <div className="sf-fields">
            <label>{draft.salaryType==="monthly"?"Monthly salary (₹)":"Rate per trip / duty (₹)"}
              <input type="number" min={0} step=".01" aria-label="Staff salary amount"
                value={draft.salaryAmount} onChange={e=>update({salaryAmount:e.target.value})}/></label>
            <label>Bata per trip (₹)<input type="number" min={0} step=".01"
              aria-label="Staff bata per trip" value={draft.bataPerTrip}
              onChange={e=>update({bataPerTrip:e.target.value})}/></label>
          </div>
          <div className="sf-unavailable">
            <strong>Bonuses, Deductions, Overtime, and Retention</strong>
            <p>The original UI has these policy editors, but the modern .NET payroll calculation,
            approval and accounting models have not yet been migrated. These fields must not silently alter wages or settlements.</p>
            <button disabled title="Requires audited payroll-policy engine">+ Add Bonus</button>
            <button disabled title="Requires audited payroll-policy engine">+ Add Deduction</button>
            <button disabled title="Requires audited payroll-policy engine">Set Overtime</button>
          </div>
        </section>}
        {showBank&&<section className="sf-card">
          <h3>Bank Details</h3>
          <div className="sf-unavailable">
            <p>Bank holder name, bank, branch, account number, IFSC and UPI ID are present in the original Staff editor.
              Secure encrypted storage, field-level RBAC and payout tokenization are not migrated.
              Do not enter bank credentials into unsupported fields or audit logs.</p>
            <button disabled title="Encrypted employee bank vault and access policy needed">
              Add verified bank account
            </button>
          </div>
        </section>}
        {tab==="ledger"&&<section className="sf-card">
          <h3>Staff Ledger &amp; Duties</h3>
          <div className="sf-unavailable"><strong>Financial ledger not migrated</strong>
            <p>Earned wages, advances, payments and running balances must come from an audited payroll journal.
              Existing service assignments are not proof of duty completion, attendance, wage earnings or payout.</p>
          </div>
          <h4>Assigned service history (source evidence)</h4>
          <div className="sf-table-scroll"><table><thead><tr>
            <th>Journey Date</th><th>Service</th><th>Route</th><th>Role</th><th>Assignment</th></tr></thead>
            <tbody>{duties.map(d=><tr key={d.id}><td>{d.travelDate}</td><td>{d.serviceNumber}</td>
              <td>{d.routeName}</td><td>{d.role}</td><td>{d.isActive?"Active":"Replaced"}</td></tr>)}</tbody></table></div>
          {!duties.length&&<p className="sf-muted">No service assignments recorded.</p>}
        </section>}
        {tab==="docs"&&<section className="sf-card"><h3>Documents</h3>
          <p className="sf-muted">Aadhaar, Driving License, PAN and Bank Cheque are listed in the original editor.
            Only metadata records are currently available; encrypted file storage is not integrated.</p>
          <div className="sf-document-list">
            {(["AADHAAR","LICENSE","PAN","BANK_CHEQUE"] as const).map(code=>{
              const matched=docs.filter(x=>x.documentType===code);
              const last=matched[matched.length-1];
              return <div className="sf-document" key={code}>
                <span className="sf-document-icon"><Icon kind="file"/></span>
                <div><b>{code.replace("_"," ")}</b>
                  <small>{last?last.documentName+" · "+(last.expiryDate||"No expiry"):"Not uploaded"}</small></div>
                <button disabled title="Original document bytes not accessible via .NET storage">View / Upload</button>
              </div>;
            })}
          </div>
        </section>}
      </div>
      <footer className="sf-modal-footer"><label className="sf-readonly">
        <input type="checkbox" checked={readonly} onChange={e=>setReadonly(e.target.checked)}/>
        View-only mode
      </label>
      <button type="button" onClick={onClose}>Cancel</button>
      <button type="button" disabled={saving||readonly} onClick={()=>void save()}>
        {saving?"Saving…":value?"Update Staff":"Add Staff"}
      </button></footer>
    </section>
  </div>;
}
export function StaffWorkspacePanel(){
  const [section,setSection]=useState<Section>("staff");
  const [staff,setStaff]=useState<Staff[]>([]);
  const [search,setSearch]=useState("");
  const [role,setRole]=useState("all");
  const [status,setStatus]=useState("all");
  const [selected,setSelected]=useState<Staff|null|undefined>();
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [loading,setLoading]=useState(true);
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    let live=true;setLoading(true);setError("");
    api.staff().then(x=>{if(live)setStaff(x);}).catch(e=>{if(live)setError(message(e));})
      .finally(()=>{if(live)setLoading(false);});
    return ()=>{live=false;};
  },[revision]);
  const results=useMemo(()=>staff.filter(x=>(role==="all"||role===x.role)&&
    (status==="all"||status===x.status)&&[x.name,x.phone,x.role,x.designation||""]
    .some(v=>v.toLowerCase().includes(search.toLowerCase()))),[staff,role,status,search]);
  const rolesPresent=Array.from(new Set(staff.map(x=>x.role))).sort();
  const byRole=(kind:string)=>staff.filter(x=>x.role===kind).length;
  return <section className="sf-page" data-testid="staff-workspace">
    <header className="sf-page-head"><div><small>STAFF / OPERATOR MANAGEMENT</small>
      <h1>Staff</h1><p>People, roles, licence compliance, pay configuration and recorded service duties</p></div>
      <button onClick={()=>setSelected(null)}><Icon kind="plus"/> Add Staff</button></header>
    <nav className="sf-subnav" aria-label="Staff module sections">
      {sections.map(([key,title])=><button className={section===key?"active":""}
        key={key} onClick={()=>setSection(key)}>
        <Icon kind={key==="staff"?"users":key==="attendance"?"calendar":
          key==="advances"?"wallet":key==="reimbursements"?"receipt":"cash"}/>{title}</button>)}
    </nav>
    {error&&<p className="sf-error" role="alert">{error}</p>}
    {notice&&<p className="sf-notice" role="status">{notice}</p>}
    {section==="staff"&&<>
      <div className="sf-metrics">
        <div><small>ALL STAFF</small><b>{staff.length}</b></div>
        <div><small>ACTIVE</small><b>{staff.filter(x=>x.status==="active").length}</b></div>
        <div><small>DRIVERS</small><b>{byRole("driver")}</b></div>
        <div><small>HELPERS / ATTENDANTS</small><b>{byRole("helper")+byRole("attendant")}</b></div>
      </div>
      <div className="sf-filters">
        <label>Search Staff<input aria-label="Search staff" placeholder="Name, phone, role"
          value={search} onChange={e=>setSearch(e.target.value)}/></label>
        <label>Role<select aria-label="Filter staff role" value={role}
          onChange={e=>setRole(e.target.value)}>
          <option value="all">All roles</option>
          {rolesPresent.map(x=><option value={x} key={x}>{x}</option>)}</select></label>
        <label>Status<select aria-label="Filter staff status" value={status}
          onChange={e=>setStatus(e.target.value)}>
          <option value="all">All statuses</option><option value="active">Active</option>
          <option value="inactive">Inactive</option></select></label>
        <button onClick={()=>setRevision(x=>x+1)}>↻ Refresh</button>
      </div>
      {loading&&<p role="status" className="sf-muted">Loading operator staff records…</p>}
      <div className="sf-table-scroll"><table className="sf-table"><thead><tr>
        {["Staff","Role","Mobile","Designation","Salary Type","Salary Rate","License Expiry","Status","Actions"]
          .map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>
        {results.map(s=><tr key={s.id}>
          <td><b>{s.name}</b></td><td>{s.role}</td><td>{s.phone}</td>
          <td>{s.designation||"—"}</td><td>{s.salaryType||"—"}</td>
          <td>{s.salaryAmount!==null&&s.salaryAmount!==undefined?money(s.salaryAmount):"—"}</td>
          <td>{s.licenseExpiry||"Not recorded"}</td>
          <td><span className={"sf-status "+s.status}>{s.status}</span></td>
          <td><button onClick={()=>setSelected(s)}><Icon kind="edit"/> View / Edit</button></td>
        </tr>)}</tbody></table></div>
      {!loading&&!results.length&&<p className="sf-muted">No staff member matches these filters.</p>}
    </>}
    {section!=="staff"&&<div className="sf-unmigrated" role="region"
      aria-label={sections.find(x=>x[0]===section)?.[1]+" workspace"}>
      <span className="sf-unmigrated-icon"><Icon kind={
        section==="attendance"?"calendar":section==="reimbursements"?"receipt":
          section==="payouts"?"cash":"wallet"}/></span>
      <h2>{sections.find(x=>x[0]===section)?.[1]}</h2>
      <p>The original GDS contains {section} workflows. The modern ASP.NET Core payroll,
        attendance and approval journal has not yet been migrated.
        These actions cannot safely be simulated or treated as financial postings.</p>
      <div className="sf-unmigrated-actions">
        <button disabled title="Requires an audited .NET attendance and payroll API">
          + Add {section==="attendance"?"Attendance":section==="advances"?"Advance":
            section==="reimbursements"?"Reimbursement":"Payout"}
        </button>
        <button disabled title="No verified payroll journal for this module">Export Ledger</button>
      </div>
    </div>}
    {selected!==undefined&&<StaffEditor value={selected} onClose={()=>setSelected(undefined)}
      onSaved={()=>{setSelected(undefined);setRevision(x=>x+1);setNotice("Staff profile persisted to PostgreSQL.");}}/>}
  </section>;
}
