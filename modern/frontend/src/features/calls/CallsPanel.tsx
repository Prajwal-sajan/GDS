import { useEffect, useMemo, useState } from "react";
import { api, type CallRow } from "../../api";
import "./calls.css";
const errorText = (e: unknown) => e instanceof Error ? e.message : String(e);

type StatusFilter = "all" | "answered" | "missed" | "busy" | "not_reachable" | "logged";
export function CallsPanel({ onOpenBooking }: { onOpenBooking: (pnr: string) => void }) {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [stats, setStats] = useState({ total: 0, answered: 0, missed: 0, avgDuration: 0 });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [direction, setDirection] = useState("all");
  const [form, setForm] = useState({phone:"",name:"",pnr:"",direction:"outgoing",status:"logged",durationS:"0",notes:""});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const load = async () => {
    setBusy(true); setError("");
    try {
      const x = await api.calls();
      setCalls(x.calls); setStats(x.stats);
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, []);
  const filtered = useMemo(() => calls.filter(c =>
    (status === "all" || c.status === status) && (direction === "all" || c.direction === direction) &&
    (c.phone + " " + (c.passengerName ?? "") + " " + (c.pnr ?? "") + " " + c.agent).toLowerCase().includes(q.toLowerCase())
  ),[calls,q,status,direction]);

  const log = async () => {
    setError(""); setSuccess("");
    if (!/^\d{10,13}$/.test(form.phone.trim())) { setError("Enter a 10–13 digit phone number."); return; }
    const length = Number(form.durationS);
    if (!Number.isInteger(length) || length < 0 || length > 86400) { setError("Duration must be 0–86400 seconds."); return; }
    setBusy(true);
    try {
      const r = await api.logCall({phone:form.phone, name:form.name.trim()||null,
        pnr:form.pnr.trim()||null,direction:form.direction,kind:"manual",
        status:form.status,durationS:length,notes:form.notes.trim()||null});
      setSuccess(r.notice);
      setForm({phone:"",name:"",pnr:"",direction:"outgoing",status:"logged",durationS:"0",notes:""});
      const next=await api.calls();setCalls(next.calls);setStats(next.stats);
    } catch(e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };

  return <section className="calls-console" data-testid="calls-console">
    <div className="calls-head"><div><h2>Calls</h2><p className="muted">Operator call activity linked to passengers and bookings.</p></div>
      <button type="button" disabled={busy} onClick={() => void load()}>Refresh</button></div>
    <div className="banner warn" role="status">Telephony is not connected. “Log call” records a manual interaction; it does not place a real phone call or confirm that a customer was reached.</div>
    <div className="calls-stats">
      {([["All calls",stats.total],["Answered",stats.answered],["Missed",stats.missed],["Average duration (sec)",stats.avgDuration]] as const)
        .map(([name,val])=><div key={name} className="calls-stat"><small>{name}</small><strong>{val}</strong></div>)}
    </div>
    <div className="row calls-filters">
      <label>Search name, number or PNR<input value={q} aria-label="Search calls" onChange={e=>setQ(e.target.value)} /></label>
      <label>Status<select aria-label="Call status filter" value={status} onChange={e=>setStatus(e.target.value as StatusFilter)}>
        <option value="all">All statuses</option>{["answered","missed","busy","not_reachable","logged"].map(s=><option key={s} value={s}>{s}</option>)}
      </select></label>
      <label>Direction<select aria-label="Call direction filter" value={direction} onChange={e=>setDirection(e.target.value)}>
        <option value="all">All directions</option><option value="incoming">Incoming</option><option value="outgoing">Outgoing</option>
      </select></label>
    </div>
    {error && <p role="alert" className="error">{error}</p>}
    {success && <p role="status" className="note">{success}</p>}
    <table><thead><tr><th>Date/time</th><th>Direction</th><th>Passenger</th><th>Phone</th><th>PNR</th><th>Call result</th><th>Duration</th><th>Agent</th><th>Notes</th></tr></thead>
      <tbody>{filtered.map(c=><tr key={c.id}><td>{new Date(c.ts).toLocaleString("en-IN")}</td><td>{c.direction}</td><td>{c.passengerName||"—"}</td>
        <td>{c.phone}</td><td>{c.pnr ? <button type="button" className="link" onClick={()=>onOpenBooking(c.pnr!)}>{c.pnr}</button>:"—"}</td>
        <td>{c.status}</td><td>{c.durationS}s</td><td>{c.agent}</td><td>{c.notes||"—"}</td></tr>)}
        {filtered.length===0&&<tr><td colSpan={9} className="muted">No matching call records.</td></tr>}
      </tbody></table>
    <h3>Record a call interaction</h3>
    <form className="calls-form" onSubmit={e=>{e.preventDefault();void log();}}>
      <label>Phone (10–13 digits)<input aria-label="Call phone" inputMode="numeric" required value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} /></label>
      <label>Passenger name<input aria-label="Call passenger name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} /></label>
      <label>Booking PNR<input aria-label="Call booking PNR" value={form.pnr} onChange={e=>setForm({...form,pnr:e.target.value})} /></label>
      <label>Direction<select aria-label="New call direction" value={form.direction} onChange={e=>setForm({...form,direction:e.target.value})}>
        <option value="outgoing">Outgoing</option><option value="incoming">Incoming</option></select></label>
      <label>Outcome<select aria-label="New call outcome" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>
        {["logged","answered","missed","busy","not_reachable"].map(s=><option key={s} value={s}>{s}</option>)}</select></label>
      <label>Duration in seconds<input aria-label="Call duration" type="number" min="0" max="86400" required value={form.durationS} onChange={e=>setForm({...form,durationS:e.target.value})} /></label>
      <label className="wide">Notes<textarea aria-label="Call notes" maxLength={2000} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} /></label>
      <button type="submit" disabled={busy}>Log call (manual record only)</button>
    </form>
  </section>;
}
