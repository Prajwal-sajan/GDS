import { useEffect, useState } from "react";
import { api, type TripPnlReport, type TripPnlRow } from "../../api";
import "./pnl.css";

const money = (v:number) => "₹" + v.toLocaleString("en-IN", {minimumFractionDigits:2,maximumFractionDigits:2});
const err = (e:unknown) => e instanceof Error ? e.message : String(e);
const provenance = (b:string) => b === "estimate" ? "Estimated" : b === "actual" ? "Recorded" : b === "mixed" ? "Mixed" : "None";
const csvCell = (x:unknown) => {
  let s=String(x??"");
  if(/^[\t\r\n ]*[=+\-@]/.test(s))s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
};
export function tripPnlCsv(row:TripPnlRow):string {
  const records:(string|number|null|undefined)[][]=[
    ["Service",row.service],["Route",row.route],["Travel Date",row.date],
    ["Seat Capacity",row.capacity],["Booked Seats",row.seats],
    ["Net Sales Excluding GST",row.netSales],["Cancellation Charges Excluding GST",row.cancellationCharges],
    ["Total Expense",row.expense],["Actual Expense",row.expenseActual],
    ["Estimated Expense",row.expenseEstimated],["Cost Basis",row.expenseBasis],
    ["Indicative Result",row.profit],
    ["Caution","OTA commission excluded until reconciliation evidence exists"],
    [],["Expense Label","Category","Amount","Basis","Template Estimate"],
    ...row.expenses.map(x=>[x.label,x.type,x.amount,x.basis,x.estimate])
  ];
  return "\uFEFF"+records.map(x=>x.map(csvCell).join(",")).join("\r\n")+"\r\n";
}
function downloadCsv(row:TripPnlRow) {
  const blob=new Blob([tripPnlCsv(row)],{type:"text/csv;charset=utf-8"});
  const href=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=href;link.download="trip-pnl-"+row.service.replace(/[^a-z0-9_-]/gi,"-")+"-"+row.date+".csv";
  document.body.appendChild(link);
  try {link.click();}finally{link.remove();window.setTimeout(()=>URL.revokeObjectURL(href),30000);}
}
/** Financial totals come exclusively from the server's ReportsService.TripPnlAsync. */
export function TripPnlPanel({tripId,date,service,refreshKey=0,onSaved}:{
  tripId:number;date:string;service:string;refreshKey?:number;onSaved?:()=>void;
}) {
  const [pnl,setPnl]=useState<TripPnlRow>();
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [revision,setRevision]=useState(0);
  const [editing,setEditing]=useState(false);
  const [category,setCategory]=useState("");
  const [amount,setAmount]=useState("");
  const [note,setNote]=useState("");
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    let current=true;
    setLoading(true);setError("");setPnl(undefined);
    api.report<TripPnlReport>("trip-pnl",new URLSearchParams({from:date,to:date}).toString())
      .then(data=>{
        if(!current)return;
        const row=data.rows.find(x=>x.tripId===tripId);
        if(!row)throw Error("The service was not found in this operator's financial report.");
        setPnl(row);
      })
      .catch(e=>{if(current)setError(err(e));})
      .finally(()=>{if(current)setLoading(false);});
    return ()=>{current=false;};
  },[tripId,date,refreshKey,revision]);
  const addExpense=async()=>{
    const v=Number(amount);
    if(!category.trim() || category.trim().length>80 || amount.trim()==="" ||
       !Number.isFinite(v) || v<0 || v>10000000) {
      setError("Enter a category (max 80 chars) and a valid non-negative amount.");return;
    }
    if(!note.trim()){setError("An invoice reference or operational reason is required.");return;}
    if(!window.confirm("Record "+money(v)+" for "+category.trim()+" against "+service+
      "? This creates an audited financial entry."))return;
    setBusy(true);setError("");setNotice("");
    try {
      await api.addExpense(tripId,category.trim(),v,note.trim());
      setEditing(false);setCategory("");setAmount("");setNote("");
      setRevision(x=>x+1);onSaved?.();
      setNotice("Recorded the expense and requested fresh PostgreSQL-backed P&L totals.");
    }catch(e){setError(err(e));}finally{setBusy(false);}
  };
  const income=(pnl?.netSales??0)+(pnl?.cancellationCharges??0);
  const margin=income>0?100*(pnl?.profit??0)/income:0;
  return <section className="tp-panel" data-testid="schedule-pnl">
    <header className="tp-header">
      <div><small>ACCOUNTS · TRIP FINANCIALS</small><h3>TRIP P&amp;L</h3>
        <p>{service} · {date} · Actual booked base fares and recorded cost evidence</p></div>
      <div className="tp-actions">
        <button type="button" disabled={busy} onClick={()=>setRevision(x=>x+1)}>↻ Refresh</button>
        <button type="button" disabled={!pnl} onClick={()=>pnl&&downloadCsv(pnl)}>Export CSV</button>
        <button type="button" disabled={!pnl} onClick={()=>window.print()}>Print</button>
      </div>
    </header>
    {error&&<p role="alert" className="tp-error">{error}</p>}
    {notice&&<p role="status" className="tp-success">{notice}</p>}
    {loading&&<p className="tp-muted" role="status">Loading recorded trip financials…</p>}
    {pnl&&<>
      <div className="tp-stats">
        <div><small>Net Ticket Sales</small><strong>{money(pnl.netSales)}</strong><span>Excluding GST</span></div>
        <div><small>Cancellation Charges</small><strong>{money(pnl.cancellationCharges)}</strong><span>Excluding GST</span></div>
        <div><small>Total Income</small><strong>{money(income)}</strong><span>Sales plus charges</span></div>
        <div><small>Total Expenses</small><strong>{money(pnl.expense)}</strong>
          <span>{money(pnl.expenseActual)} recorded · {money(pnl.expenseEstimated)} estimated</span></div>
      </div>
      <div className="tp-columns">
        <div className="tp-cost-pane">
          <header className="tp-section-header"><h4>Operating Expenses</h4>
            <span className="tp-source">{provenance(pnl.expenseBasis)} data</span></header>
          {(["fixed","running","other"] as const).map(kind=>{
            const rows=pnl.expenses.filter(x=>x.type===kind);
            return <section className="tp-expense-group" key={kind}>
              <header><b>{kind==="fixed"?"Fixed Expenses":kind==="running"?"Running Expenses":"Other Expenses"}</b>
                <strong>{money(rows.reduce((n,x)=>n+x.amount,0))}</strong></header>
              {rows.length?rows.map((item,i)=><div key={item.key+":"+i} className="tp-expense-row">
                <div><b>{item.label}</b><small>{provenance(item.basis)}
                  {item.basis==="actual"&&item.estimate!==null?
                    " · Template "+money(item.estimate):""}</small></div>
                <strong>{money(item.amount)}</strong>
              </div>):<p className="tp-muted">No expense lines recorded.</p>}
            </section>;
          })}
          <div className="tp-total"><b>TOTAL EXPENSES</b><strong>{money(pnl.expense)}</strong></div>
          {!editing?<button type="button" className="tp-add" onClick={()=>setEditing(true)}>
            + Record Expense</button>:<form className="tp-form" onSubmit={e=>{e.preventDefault();void addExpense();}}>
            <h4>Record an actual trip expense</h4>
            <p className="tp-muted">An actual expense matching a route template key overrides its estimate for this trip. The record is audited; it is not an editable draft.</p>
            <label>Expense Category *<input aria-label="Expense category" maxLength={80}
              placeholder="Fuel / Toll / Driver Bata" value={category}
              onChange={e=>setCategory(e.target.value)}/></label>
            <label>Amount (₹) *<input type="number" min={0} max={10000000} step=".01"
              aria-label="Expense amount" value={amount}
              onChange={e=>setAmount(e.target.value)}/></label>
            <label>Invoice / Evidence *<textarea aria-label="Expense evidence" maxLength={1000} rows={2}
              value={note} onChange={e=>setNote(e.target.value)}/></label>
            <div className="tp-form-actions"><button type="button" disabled={busy}
              onClick={()=>setEditing(false)}>Cancel</button>
              <button type="submit" disabled={busy}>{busy?"Recording…":"Record Expense"}</button></div>
          </form>}
        </div>
        <aside className="tp-result-pane">
          <div className="tp-profit">
            <small>INDICATIVE PROFIT / LOSS</small>
            <strong className={pnl.profit<0?"negative":"positive"}>{money(pnl.profit)}</strong>
            <p>{pnl.profit<0?"Potential loss":"Potential profit"}</p>
            <div className="tp-progress"><span style={{width:(income>0?Math.min(100,100*pnl.expense/income):0)+"%"}}/></div>
            <div className="tp-progress-labels"><span>Income {money(income)}</span>
              <span>Expenses {money(pnl.expense)}</span></div>
            <div className="tp-margin"><span>Margin</span>
              <b>{income>0?margin.toFixed(1)+"%":"—"}</b></div>
          </div>
          <div className="tp-occupancy"><h4>Occupancy</h4>
            <div><span>Booked seats</span><b>{pnl.seats} / {pnl.capacity}</b></div>
            <div><span>Seat occupancy</span><b>{pnl.occupancyPct.toFixed(1)}%</b></div>
            <div><span>Running status</span><b>{pnl.running?"Active":"Not running"}</b></div>
          </div>
          <div className="tp-disclaimer">
            <b>Financial provenance</b>
            <p>OTA commission is not deducted until verified against actual settlement records.
              Estimated costs are not recorded payments. GST-exclusive sales and
              cancellation charges come from saved bookings, not screenshot example amounts.
              This result is not a finalized settlement or accounting statement.</p>
            {pnl.expenseBasis==="none"&&<p><b>Missing costs:</b> zero recorded expense does not mean a cost-free journey.</p>}
          </div>
        </aside>
      </div>
    </>}
  </section>;
}
