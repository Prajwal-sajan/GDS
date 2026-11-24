import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {api,type InvoiceLine,type InvoiceRow} from "../../api";
import {BookingDetailsPanel} from "../bookings/BookingsPanel";
import "./invoiceVerifier.css";

type View="dashboard"|"tickets"|"breakdown";
type Display="table"|"cards";
type Resolution="accept_ota"|"dispute"|"investigating"|"clear";
interface InvoiceDetail{
  id:number;invoiceNumber:string;status:string;warningsJson:string|null;
  totals:Record<string,unknown>;
}
const today=()=>new Date(Date.now()+330*60000).toISOString().slice(0,10);
const err=(e:unknown)=>e instanceof Error?e.message:String(e);
const money=(v:number|null|undefined)=>v===null||v===undefined?"—":
  "₹"+v.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
const labels:Record<string,string>={
  matched:"Matched",mismatched:"Mismatched",needs_review:"Needs Review",
  unmatched_gds:"Missing in OTA",unmatched_ota:"Missing in GDS",
};
const count=(totals:Record<string,unknown>|undefined,key:string)=>
  typeof totals?.[key]==="number"?totals[key] as number:0;
const normalizeStatus=(status:string)=>
  status==="unmatched_ota"?"Missing in GDS":status==="unmatched_gds"?"Missing in OTA":labels[status]||status;
const pct=(a:number,b:number)=>b>0?Math.min(100,100*a/b):0;
async function toBase64(file:File):Promise<string>{
  if(file.size>20_000_000)throw Error("Statement exceeds 20 MB");
  return await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(Error("File could not be read"));
    reader.onload=()=>resolve(String(reader.result).split(",")[1]||"");
    reader.readAsDataURL(file);
  });
}
function Metric({label,value,hint}:{label:string;value:string|number;hint?:string}){
  return <div className="ov-metric"><small>{label}</small><strong>{value}</strong>{hint&&<span>{hint}</span>}</div>;
}
function LineActions({row,onResolve}:{row:InvoiceLine;onResolve:(r:InvoiceLine,a:Resolution)=>void}){
  return row.status==="matched"&&!row.resolutionAction?<span className="ov-muted">Verified by source evidence</span>:
    <div className="ov-line-actions">
      {row.resolutionAction?<button onClick={()=>onResolve(row,"clear")} type="button">Reopen</button>:<>
        <button type="button" onClick={()=>onResolve(row,"accept_ota")}>Accept RedBus</button>
        <button type="button" onClick={()=>onResolve(row,"investigating")}>Investigate</button>
        <button type="button" className="ov-dispute" onClick={()=>onResolve(row,"dispute")}>Dispute</button>
      </>}
    </div>;
}
function InvoiceLineCard({row,onResolve,onOpenPnr}:{row:InvoiceLine;
  onResolve:(r:InvoiceLine,a:Resolution)=>void;onOpenPnr:(pnr:string)=>void}){
  return <article className="ov-ticket-card">
    <header><button className="ov-link" onClick={()=>onOpenPnr(row.pnr)}>{row.pnr}</button>
      <span className={"ov-status ov-"+row.status}>{normalizeStatus(row.status)}</span>
      <span className="ov-muted">{row.section}</span></header>
    <div className="ov-pnr-values">
      <div><small>GDS / OTA Fare</small><b>{money(row.expectedFare)} / {money(row.fare)}</b></div>
      <div><small>GDS / OTA Take-home</small><b>{money(row.expectedTakeHome)} / {money(row.takeHome)}</b></div>
      <div><small>Impact</small><b>{money(row.delta)}</b></div>
      <div><small>DOJ GDS / OTA</small><b>{row.expectedDoj||"—"} / {row.doj||"—"}</b></div>
    </div>
    <p>{row.why}</p>
    {row.differences.length>0&&<div className="ov-difference-tags">
      {row.differences.map((d,i)=><span key={i}>{d}</span>)}</div>}
    {row.resolutionAction&&<p className="ov-muted">Resolution: {row.resolutionAction}
      {row.resolutionNote?" · "+row.resolutionNote:""}</p>}
    <LineActions row={row} onResolve={onResolve}/>
  </article>;
}
export function OtaInvoiceVerifier(){
  const [invoices,setInvoices]=useState<InvoiceRow[]>([]);
  const [selected,setSelected]=useState<InvoiceRow|null>(null);
  const [detail,setDetail]=useState<InvoiceDetail|null>(null);
  const [lines,setLines]=useState<InvoiceLine[]>([]);
  const [view,setView]=useState<View>("dashboard");
  const [display,setDisplay]=useState<Display>("table");
  const [filter,setFilter]=useState("");
  const [query,setQuery]=useState("");
  const [invoiceLoading,setInvoiceLoading]=useState(true);
  const [detailLoading,setDetailLoading]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [uploadOpen,setUploadOpen]=useState(false);
  const [uploadBusy,setUploadBusy]=useState(false);
  const [file,setFile]=useState<File|null>(null);
  const [form,setForm]=useState({invoiceNumber:"",operatorCode:"",
    periodStart:today(),periodEnd:today()});
  const [resolveRow,setResolveRow]=useState<InvoiceLine|null>(null);
  const [resolveAction,setResolveAction]=useState<Resolution>("investigating");
  const [resolveNote,setResolveNote]=useState("");
  const [resolutionBusy,setResolutionBusy]=useState(false);
  const [openPnr,setOpenPnr]=useState("");
  const [revision,setRevision]=useState(0);
  const inputRef=useRef<HTMLInputElement>(null);
  const reload=useCallback(()=>setRevision(x=>x+1),[]);
  useEffect(()=>{
    let live=true;setInvoiceLoading(true);
    api.invoices().then(x=>{if(live)setInvoices(x);})
      .catch(e=>{if(live)setError(err(e));})
      .finally(()=>{if(live)setInvoiceLoading(false);});
    return ()=>{live=false;};
  },[revision]);
  useEffect(()=>{
    if(!selected)return;
    let live=true;setDetailLoading(true);setError("");
    Promise.all([api.invoice(selected.id),api.invoiceLines(selected.id)])
      .then(([d,l])=>{if(live){setDetail(d);setLines(l);}})
      .catch(e=>{if(live)setError(err(e));})
      .finally(()=>{if(live)setDetailLoading(false);});
    return ()=>{live=false;};
  },[selected?.id,revision]);
  const warnings=useMemo(()=>{
    try{return JSON.parse(detail?.warningsJson||"[]") as string[];}catch{return ["Source invoice warning metadata could not be decoded"];}
  },[detail?.warningsJson]);
  const totals=detail?.totals;
  const matched=count(totals,"matched");
  const all=count(totals,"lines")||lines.length;
  const matchRate=pct(matched,all);
  const visible=useMemo(()=>lines.filter(l=>
    (!filter||l.status===filter) &&
    (!query||[l.pnr,l.section,l.why,l.status,...l.differences].some(x=>
      x.toLowerCase().includes(query.toLowerCase().trim())))),[lines,filter,query]);
  const issues=Object.entries(totals?.issues && typeof totals.issues==="object"?totals.issues as Record<string,number>:{});
  const sectionStats=Object.entries(totals?.bySection && typeof totals.bySection==="object"?
    totals.bySection as Record<string,number>:{});
  const upload=async()=>{
    if(!file){setError("Choose a RedBus payment-advice PDF or approved CSV.");return;}
    const pdf=file.name.toLowerCase().endsWith(".pdf");
    if(file.size>20_000_000){setError("File size exceeds the 20 MB limit.");return;}
    if(!pdf&&!form.invoiceNumber.trim()){setError("CSV files require an invoice number.");return;}
    if(form.periodEnd<form.periodStart){setError("Billing end must be after start.");return;}
    setUploadBusy(true);setError("");setNotice("");
    try{
      const content=pdf?{pdfBase64:await toBase64(file)}:{csv:await file.text()};
      const result=await api.uploadInvoice({
        invoiceNumber:form.invoiceNumber||null,operatorCode:form.operatorCode||null,
        periodStart:form.periodStart,periodEnd:form.periodEnd,fileName:file.name,...content
      });
      const latest=await api.invoices();
      setInvoices(latest);
      const inv=latest.find(x=>x.id===result.id)||null;
      setSelected(inv);setView("dashboard");setUploadOpen(false);setFile(null);
      setNotice(result.duplicate?
        "This advice was previously uploaded; the original import has been opened.":
        "Payment advice parsed and reconciled. Review all unmatched/missing PNR events.");
      reload();
    }catch(e){setError(err(e));}finally{setUploadBusy(false);}
  };
  const recheck=async()=>{
    if(!selected)return;
    setError("");setNotice("");
    try{await api.recheck(selected.id);reload();
      setNotice("Reconciliation recomputed against currently available GDS evidence.");}
    catch(e){setError(err(e));}
  };
  const saveResolution=async()=>{
    if(!selected||!resolveRow)return;
    if(resolveAction==="dispute"&&!resolveNote.trim()){
      setError("Dispute requires an evidence-backed reason.");return;
    }
    setResolutionBusy(true);setError("");
    try{
      await api.resolve(selected.id,resolveRow.id,resolveAction,resolveNote);
      setResolveRow(null);setResolveNote("");setNotice("Reviewer decision saved with actor/time audit.");
      reload();
    }catch(e){setError(err(e));}finally{setResolutionBusy(false);}
  };
  const openResolve=(line:InvoiceLine,action:Resolution)=>{
    setResolveRow(line);setResolveAction(action);setResolveNote("");
  };
  const clear=()=>{setSelected(null);setDetail(null);setLines([]);
    setView("dashboard");setFilter("");setQuery("");setError("");};
  const exportRows=async()=>{
    if(!selected)return;
    try{await api.exportInvoice(selected.id,selected.invoiceNumber);
      setNotice("CSV export prepared using the 18-column source contract. Review missing source fields before posting.");}
    catch(e){setError(err(e));}
  };
  return <section className="ov-root" data-testid="ota-invoice-verifier">
    <header className="ov-page-header">
      <div><small>ACCOUNTS / OTA RECONCILIATION</small>
        <h1>OTA Invoice Verifier</h1>
        <p>RedBus payment advice · PNR-to-PNR matching, dispute tracking and evidence-led settlement review</p></div>
      <div className="ov-actions-top">
        <span className="ov-live-pill">RECONCILIATION</span>
        <button type="button" className="ov-primary" onClick={()=>setUploadOpen(true)}>+ Upload Invoice</button>
      </div>
    </header>
    {error&&<p role="alert" className="ov-alert">{error}</p>}
    {notice&&<p role="status" className="ov-notice">{notice}</p>}
    {!selected&&<div className="ov-ledger">
      <div className="ov-section-title"><h2>Settlement Ledger</h2>
        <button onClick={reload}>↻ Refresh</button></div>
      {invoiceLoading&&<p className="ov-muted">Loading operator payment advice history…</p>}
      <div className="ov-ledger-list">
        {invoices.map(inv=><article key={inv.id} className="ov-ledger-card">
          <div className="ov-redbus">redBus</div>
          <div className="ov-ledger-title"><h3>{inv.invoiceNumber}</h3>
            <p>{inv.periodStart} → {inv.periodEnd}</p>
            <small>{inv.fileName} · {new Date(inv.uploadedAt).toLocaleString("en-IN",
              {timeZone:"Asia/Kolkata"})}</small></div>
          <div className="ov-ledger-metric"><strong>{inv.lines}</strong><small>PNR events</small></div>
          <div className="ov-ledger-metric"><strong>{inv.outstanding}</strong><small>Outstanding</small></div>
          <span className="ov-status ov-needs_review">{inv.status}</span>
          <button className="ov-primary" onClick={()=>{setSelected(inv);setView("dashboard");}}>View</button>
        </article>)}
        {!invoiceLoading&&!invoices.length&&<div className="ov-empty">
          No payment advice has been uploaded for this operator. Import an authorized RedBus statement to begin.</div>}
      </div>
    </div>}
    {selected&&<div className="ov-workspace">
      <div className="ov-workspace-head">
        <button type="button" className="ov-secondary" onClick={clear}>← Settlement Ledger</button>
        <div><h2>{selected.invoiceNumber}</h2>
          <p>RedBus Payment Advice · {selected.periodStart} to {selected.periodEnd}</p></div>
        <button type="button" className="ov-secondary" onClick={()=>void recheck()}>↻ Recheck against GDS</button>
        <button type="button" className="ov-primary" onClick={()=>void exportRows()}>Export CSV</button>
      </div>
      <nav className="ov-tabs" aria-label="Invoice verifier sections">
        {([{id:"dashboard",label:"Reconciliation Dashboard"},
          {id:"tickets",label:"Browse all tickets"},{id:"breakdown",label:"Invoice Breakdown"}] as const)
          .map(x=><button key={x.id} className={view===x.id?"active":""} onClick={()=>setView(x.id)}>
            {x.label}</button>)}
      </nav>
      {warnings.length>0&&<div className="ov-warning">
        <strong>{warnings.length} parsing warning(s) require review</strong>
        <p>{warnings.slice(0,5).join(" · ")}</p>
      </div>}
      {detailLoading&&<p className="ov-muted" role="status">Loading source payment advice evidence…</p>}
      {detail&&view==="dashboard"&&<>
        <div className="ov-payout-hero">
          <div><small>RED BUS · STATEMENT TAKE-HOME (SOLD TICKETS)</small>
            <strong>{money(count(totals,"otaTakeHome"))}</strong>
            <p>This is invoice-row source evidence, not a finalized bank-settlement credit.</p></div>
          <div className="ov-ring" style={{background:"conic-gradient(#fff "+
            matchRate+"%,#ffffff55 "+matchRate+"% 100%)"}}><div>
              <b>{matchRate.toFixed(1)}%</b><small>Matched events</small></div></div>
        </div>
        <div className="ov-stats">
          <Metric label="Ticket events" value={all}/>
          <Metric label="Matched" value={matched}/>
          <Metric label="Mismatched" value={count(totals,"mismatched")}/>
          <Metric label="Needs Review" value={count(totals,"needsReview")}/>
          <Metric label="Missing in GDS" value={count(totals,"missingInGds")}/>
          <Metric label="Missing in OTA" value={count(totals,"missingInOta")}/>
          <Metric label="Outstanding" value={count(totals,"outstanding")}/>
          <Metric label="Amount at risk" value={money(count(totals,"atRisk"))}/>
        </div>
        <div className="ov-workspace-columns">
          <section className="ov-panel">
            <h3>Ticket Check &amp; Reconciliation</h3>
            <p>The source PDF can contain multiple distinct events for the same PNR. They are never silently deduplicated.</p>
            {issues.map(([name,n])=><div key={name} className="ov-summary-row">
              <span>{name.replace(/_/g," ")}</span><strong>{n}</strong></div>)}
            {!issues.length&&<p className="ov-muted">No categorized source mismatches.</p>}
            <button className="ov-primary" onClick={()=>setView("tickets")}>Browse all tickets</button>
          </section>
          <section className="ov-panel">
            <h3>Invoice Sections</h3>
            {sectionStats.map(([name,n])=><div key={name} className="ov-summary-row">
              <span>{name.replace(/_/g," ")}</span><strong>{n} events</strong></div>)}
            <p>Cancellation, bus-cancelled and exceptional adjustments must be reconciled in their own original sections.</p>
            <button className="ov-secondary" onClick={()=>setView("breakdown")}>View Invoice Breakdown</button>
          </section>
        </div>
      </>}
      {detail&&view==="breakdown"&&<div className="ov-panel ov-breakdown">
        <h3>Invoice Amount Breakdown</h3>
        <p>Only amounts supported by the uploaded payment advice and GDS data are shown. Source a–w financial categories not exposed in the current .NET report are explicitly unverified rather than fabricated.</p>
        <div className="ov-breakdown-grid">
          <Metric label="Sold-ticket take home" value={money(count(totals,"otaTakeHome"))}/>
          <Metric label="Potential mismatched payout impact" value={money(count(totals,"atRisk"))}/>
          <Metric label="Matched ticket events" value={matched}/>
          <Metric label="Unresolved events" value={count(totals,"outstanding")}/>
        </div>
        {sectionStats.map(([name,n])=><div key={name} className="ov-summary-row">
          <span>{name.replace(/_/g," ")}</span><strong>{n}</strong></div>)}
        <div className="ov-warning"><b>Evidence boundary</b>
          <p>RedBus payment advice is not a statutory tax invoice. This screen does not post or settle funds, allocate invoice-level TDS/TCS to PNRs, or invent missing commission data.</p></div>
      </div>}
      {detail&&view==="tickets"&&<div className="ov-tickets">
        <div className="ov-tickets-toolbar">
          <div><h3>Browse all tickets</h3><p>{visible.length} / {lines.length} statement events</p></div>
          <label>PNR / difference search<input value={query} aria-label="Search invoice PNR"
            onChange={e=>setQuery(e.target.value)} placeholder="PNR, reason, status…"/></label>
          <label>Status<select value={filter} aria-label="Ticket status filter"
            onChange={e=>setFilter(e.target.value)}>
            <option value="">All tickets</option>
            {Object.entries(labels).map(([k,v])=><option value={k} key={k}>{v}</option>)}
          </select></label>
          <div className="ov-segmented" role="group" aria-label="Ticket layout">
            <button className={display==="table"?"selected":""} onClick={()=>setDisplay("table")}>Table</button>
            <button className={display==="cards"?"selected":""} onClick={()=>setDisplay("cards")}>Cards</button>
          </div>
        </div>
        {display==="table"?<div className="ov-table-scroll">
          <table className="ov-compare"><thead><tr>
            {["PNR","Section","Status","DOJ GDS","DOJ OTA","Fare GDS",
              "Fare OTA","Take home GDS","Take home OTA","Difference",
              "Mismatch evidence","Resolution","Actions"].map(x=><th key={x}>{x}</th>)}
          </tr></thead><tbody>{visible.map(l=><tr key={l.id}>
            <td><button type="button" className="ov-link" onClick={()=>setOpenPnr(l.pnr)}>{l.pnr}</button></td>
            <td>{l.section}</td><td><span className={"ov-status ov-"+l.status}>{normalizeStatus(l.status)}</span></td>
            <td>{l.expectedDoj||"—"}</td><td>{l.doj||"—"}</td>
            <td>{money(l.expectedFare)}</td><td>{money(l.fare)}</td>
            <td>{money(l.expectedTakeHome)}</td><td>{money(l.takeHome)}</td>
            <td>{money(l.delta)}</td><td className="ov-wrap">{l.why}</td>
            <td>{l.resolutionAction||"—"} {l.resolutionNote||""}</td>
            <td><LineActions row={l} onResolve={openResolve}/></td>
          </tr>)}</tbody></table>
          {!visible.length&&<p className="ov-empty">No ticket events match the selected filters.</p>}
        </div>:<div className="ov-ticket-grid">
          {visible.map(l=><InvoiceLineCard key={l.id} row={l}
            onResolve={openResolve} onOpenPnr={setOpenPnr}/>)}
        </div>}
      </div>}
    </div>}
    {uploadOpen&&<div className="ov-modal-overlay">
      <section className="ov-modal" role="dialog" aria-modal="true" aria-label="Upload invoice">
        <header><h2>Upload RedBus Payment Advice</h2>
          <button type="button" onClick={()=>setUploadOpen(false)} aria-label="Close upload invoice">✕</button></header>
        <form onSubmit={e=>{e.preventDefault();void upload();}}>
          <p>Import a source PDF (read invoice fields from the document), or an approved normalized CSV. The service flags missing financial evidence for review.</p>
          <label>PDF or CSV<input ref={inputRef} required type="file" aria-label="Statement file"
            accept=".pdf,application/pdf,.csv,text/csv"
            onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
          <label>Invoice number (CSV)<input aria-label="Invoice number" value={form.invoiceNumber}
            onChange={e=>setForm({...form,invoiceNumber:e.target.value})}/></label>
          <label>Operator code<input value={form.operatorCode}
            onChange={e=>setForm({...form,operatorCode:e.target.value})}/></label>
          <div className="ov-form-pair">
            <label>Period start<input type="date" value={form.periodStart}
              onChange={e=>setForm({...form,periodStart:e.target.value})}/></label>
            <label>Period end<input type="date" value={form.periodEnd}
              onChange={e=>setForm({...form,periodEnd:e.target.value})}/></label>
          </div>
          <footer><button type="button" onClick={()=>setUploadOpen(false)}>Cancel</button>
            <button className="ov-primary" disabled={uploadBusy} type="submit">
              {uploadBusy?"Parsing and comparing…":"Upload & Verify"}</button></footer>
        </form>
      </section>
    </div>}
    {resolveRow&&<div className="ov-modal-overlay">
      <section className="ov-modal" role="dialog" aria-modal="true" aria-label="Resolve invoice difference">
        <header><h2>Review PNR · {resolveRow.pnr}</h2>
          <button type="button" onClick={()=>setResolveRow(null)} aria-label="Close resolution">✕</button></header>
        <form onSubmit={e=>{e.preventDefault();void saveResolution();}}>
          <div className="ov-review-evidence">
            <b>{normalizeStatus(resolveRow.status)}</b><p>{resolveRow.why}</p>
            <p>Expected: {money(resolveRow.expectedTakeHome)} · OTA: {money(resolveRow.takeHome)}</p>
          </div>
          <label>Review action<select value={resolveAction} aria-label="Review action"
            onChange={e=>setResolveAction(e.target.value as Resolution)}>
            <option value="accept_ota">Accept RedBus</option>
            <option value="dispute">Dispute</option>
            <option value="investigating">Investigate</option>
            <option value="clear">Reopen / Clear decision</option>
          </select></label>
          <label>Internal evidence / dispute reason<textarea rows={4}
            aria-label="Review note" maxLength={2000} value={resolveNote}
            onChange={e=>setResolveNote(e.target.value)}/></label>
          <p>Reviewer decisions are audited, not posted to the payment gateway or accounting ledger.</p>
          <footer><button type="button" onClick={()=>setResolveRow(null)}>Cancel</button>
            <button className="ov-primary" type="submit" disabled={resolutionBusy}>
              {resolutionBusy?"Saving…":"Save Reviewer Decision"}</button></footer>
        </form>
      </section>
    </div>}
    {openPnr&&<BookingDetailsPanel pnr={openPnr} onClose={()=>setOpenPnr("")}/>}
  </section>;
}
