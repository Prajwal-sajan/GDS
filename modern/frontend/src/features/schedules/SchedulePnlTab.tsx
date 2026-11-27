import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api";
import { can, usePermissions } from "../../auth/permissions";
import { confirmDialog, toast, toastError } from "../../components/ui/feedback";

// Schedule overlay → P&L tab (legacy schedule-pnl-v18 behaviour and sxp-* markup), as a typed React component.
// GET /schedules/{id}/pnl, PUT /schedules/{id}/pnl-expenses with optimistic versioning.

type Kind = "fixed" | "running";
interface PnlItem { id?: number; edit_key?: string; key?: string; label?: string; type: Kind; per_day?: number; original?: number; source?: string; manual?: boolean }
interface Pnl {
  schedule_id: number; expense_version?: number; service?: string; service_name?: string; route?: string; date: string; vehicle?: string | null; coach?: string | null;
  crew?: { role?: string; name?: string; phone?: string }[]; status?: string; seats?: number; capacity?: number; commission?: number; net_sales?: number;
  cancellation_charges?: number; gst?: number; by_channel?: { channel: string; seats?: number; net: number }[]; expense_breakdown?: { items: PnlItem[] };
}
interface Row { key: string; id?: number; label: string; type: Kind; amount: string; defaultAmount: number; source: string }

const SOURCES = ["", "Cash", "Bank", "Office", "Driver", "Helper", "Agent", "Other"];
const PATHS: Record<string, string> = {
  bus: "M4 17V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11M4 13h16M7 17v3m10-3v3", cost: "M3 5h18v15H3zM3 9h18M16 15h3",
  fuel: "M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M4 11h11M15 7h3l3 4v7", pin: "M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Zm-8 2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  calendar: "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z", user: "M20 21a8 8 0 0 0-16 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.5 3a2 2 0 0 1-.6 1.7L7.3 10a16 16 0 0 0 6.7 6.7l1.6-1.7a2 2 0 0 1 1.7-.6l3 .5a2 2 0 0 1 1.7 2Z",
  shield: "M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z", doc: "M6 2h8l5 5v15H6zM14 2v6h5M9 13h7M9 17h7", staff: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m13-15a4 4 0 0 1 0 8",
  toll: "M3 12h18m-7-7 7 7-7 7", wheel: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  percent: "M5 19 19 5M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z", trend: "M3 17l6-6 4 4 8-9m-5 0h5v5",
  print: "M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 15h12v6H6z", plus: "M12 5v14M5 12h14", chevron: "m6 9 6 6 6-6",
  x: "M18 6 6 18M6 6l12 12", receipt: "M4 3h16v18l-4-2-4 2-4-2-4 2Z M8 9h8M8 13h8",
};
const Ic = ({ k, size = 19 }: { k: string; size?: number }) => (
  <svg className="sxp-ic" width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" fill="none" aria-hidden="true"><path d={PATHS[k] ?? PATHS.doc} /></svg>
);
const fmt = (x: number | undefined) => "₹" + Number(x || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const niceDate = (v: string) => { const d = new Date(v + "T12:00:00"); return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); };
const iconFor = (x: string) => /insurance/i.test(x) ? "shield" : /permit|clean/i.test(x) ? "doc" : /salary|driver|helper/i.test(x) ? "staff" : /toll/i.test(x) ? "toll"
  : /tyre/i.test(x) ? "wheel" : /commission/i.test(x) ? "percent" : /diesel|fuel/i.test(x) ? "fuel" : "cost";

function rowsFrom(p: Pnl): Row[] {
  return (p.expense_breakdown?.items ?? []).map((x) => x.manual
    ? { key: `manual:${x.id}`, id: x.id, label: x.label || "Other", type: x.type, amount: String(x.per_day ?? 0), defaultAmount: Number(x.per_day ?? 0), source: x.source || "" }
    : { key: x.edit_key ?? x.key ?? x.label ?? "", label: x.label || x.key || "Other", type: x.type, amount: String(x.per_day ?? 0), defaultAmount: Number(x.original ?? x.per_day ?? 0), source: x.source || "" });
}
const sameRows = (a: Row[], b: Row[]) => a.length === b.length && a.every((r, i) => r.key === b[i].key && Number(r.amount) === Number(b[i].amount) && r.source === b[i].source && r.label === b[i].label && r.type === b[i].type);
const invalidRow = (r: Row) => r.amount === "" || !Number.isFinite(Number(r.amount)) || Number(r.amount) < 0 || Number(r.amount) > 100000000 || (r.id !== undefined && !r.label.trim());

/** Set by the active tab; the overlay awaits it before switching tabs or closing (unsaved-changes guard). */
export type LeaveGuard = MutableRefObject<(() => Promise<boolean>) | null>;

export function PnlTab({ sid, footer, guard, onClose }: { sid: number; footer: HTMLElement | null; guard: LeaveGuard; onClose: () => void }) {
  const ready = usePermissions();
  const allowed = can("schedules.financial");
  const [p, setP] = useState<Pnl>();
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const seq = useRef(0);

  useEffect(() => {
    if (!ready || !allowed) return;
    let live = true;
    api.admin<Pnl>(`/schedules/${sid}/pnl`).then((r) => { if (live) { setP(r); setRows(rowsFrom(r)); } })
      .catch((e) => { if (live) { setError(e instanceof Error ? e.message : String(e)); toastError(e); } });
    return () => { live = false; };
  }, [sid, ready, allowed]);

  const base = useMemo(() => (p ? rowsFrom(p) : []), [p]);
  const dirty = !!p && !sameRows(rows, base);
  const invalid = rows.some(invalidRow);
  const writable = allowed && p?.status === "active";

  useEffect(() => {
    guard.current = async () => !dirty || (await confirmDialog("Discard unsaved P&L expenses?", { ok: "Discard", danger: true }));
    return () => { guard.current = null; };
  }, [dirty, guard]);

  if (ready && !allowed) return <div className="sx-empty">Financial reporting permission required</div>;
  if (error) return <div className="sx-empty">{error}</div>;
  if (!p) return <div className="sx-loading">Loading P&amp;L…</div>;

  const sum = (t: Kind) => rows.filter((r) => r.type === t).reduce((n, r) => n + (Number(r.amount) || 0), 0);
  const fixed = sum("fixed"), running = sum("running") + Number(p.commission || 0), expense = fixed + running;
  const income = Number(p.net_sales || 0) + Number(p.cancellation_charges || 0), profit = income - expense, margin = income ? (profit / income) * 100 : 0;
  const noOverrides = !rows.some((r) => r.id !== undefined) && rows.every((r) => Number(r.amount) === r.defaultAmount);

  const patch = (key: string, x: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...x } : r)));
  // New manual rows carry id 0 (persisted as null) so they are distinguished from route rows (id undefined).
  const add = (type: Kind) => { if (!writable) return; const key = `new:${++seq.current}`; setRows((rs) => [...rs, { key, id: 0, label: "New expense", type, amount: "0", defaultAmount: 0, source: "" }]); setOpen(key); };
  const remove = (r: Row) => { if (!writable) return; if (r.id !== undefined) setRows((rs) => rs.filter((x) => x.key !== r.key)); else patch(r.key, { amount: "0" }); setOpen(null); };
  const restore = (r: Row) => { if (!writable) return; patch(r.key, { amount: String(r.defaultAmount), source: "" }); setOpen(null); };

  const save = async () => {
    if (!dirty || invalid || saving || !writable) return;
    setSaving(true);
    try {
      const route = rows.filter((r) => r.id === undefined);
      const res = await api.admin<Pnl>(`/schedules/${sid}/pnl-expenses`, "PUT", {
        expected_version: p.expense_version || 0,
        overrides: Object.fromEntries(route.map((r) => [r.key, Number(r.amount)])),
        sources: Object.fromEntries(route.filter((r) => r.source).map((r) => [r.key, r.source])),
        manual: rows.filter((r) => r.id !== undefined).map((r) => ({ id: r.id || null, label: r.label, type: r.type, amount: Number(r.amount), source: r.source })),
      });
      setP(res); setRows(rowsFrom(res)); setOpen(null);
      toast("Expenses saved; P&L recalculated", "ok");
    } catch (e) { toastError(e); } finally { setSaving(false); }
  };

  const item = (r: Row) => {
    const isOpen = open === r.key, manual = r.id !== undefined;
    return (
      <div key={r.key} className={`sxp-item${isOpen ? " expanded" : ""}`} data-sxp-item={r.key}>
        <div className="sxp-row">
          <span className={`sxp-row-icon ${r.type}`}><Ic k={iconFor(r.label)} size={21} /></span>
          <button type="button" className="sxp-name" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.key)}><span>{r.label}</span><Ic k="chevron" size={17} /></button>
          <label className="sxp-amount"><b>₹</b><input type="number" min={0} max={100000000} step=".01" value={r.amount} aria-label={`${r.label} amount`} disabled={!writable}
            onChange={(e) => patch(r.key, { amount: e.currentTarget.value })} /></label>
          <span className="sxp-from"><select aria-label={`Funding source for ${r.label}`} value={r.source} disabled={!writable} onChange={(e) => patch(r.key, { source: e.currentTarget.value })}>
            {SOURCES.map((s) => <option key={s} value={s}>{s || "From"}</option>)}</select></span>
        </div>
        {isOpen && <div className="sxp-detail">
          {manual ? <>
            <label>Expense name<input maxLength={80} value={r.label} placeholder="Expense name" autoFocus disabled={!writable} onChange={(e) => patch(r.key, { label: e.currentTarget.value })} /></label>
            <label>Category<select value={r.type} disabled={!writable} onChange={(e) => patch(r.key, { type: e.currentTarget.value as Kind })}><option value="fixed">Fixed</option><option value="running">Running</option></select></label>
          </> : <span>Route default: {fmt(r.defaultAmount)} · override applies only to this trip</span>}
          <div className="sxp-row-menu">
            {!manual && <button type="button" onClick={() => restore(r)}>Restore default</button>}
            <button type="button" onClick={() => remove(r)}>{manual ? "Delete expense" : "Set amount to ₹0"}</button>
          </div>
        </div>}
      </div>
    );
  };
  const group = (type: Kind, title: string, icon: string, total: number, extra?: ReactNode) => (
    <section className={`sxp-expense-group ${type}`}>
      <header><div><i><Ic k={icon} size={23} /></i><b>{title}</b></div><strong>{fmt(total)}</strong></header>
      <div className="sxp-items">{rows.filter((r) => r.type === type).map(item)}{extra}</div>
      <button className="sxp-add" type="button" disabled={!writable} onClick={() => add(type)}><Ic k="plus" /> Add</button>
    </section>
  );
  const help = invalid ? "Correct expense values and descriptions before saving" : dirty ? "Unsaved changes • this schedule only" : "All expenses saved • route unchanged";

  return (
    <>
      <div className="sxp-v18" data-sxp-writable={writable}>
        <div className="sxp-banner">
          <div className="sxp-banner-title"><strong><i><Ic k="bus" size={24} /></i> TRIP P&amp;L</strong>
            <div><span className="sxp-route-status">● {noOverrides ? "Route defaults" : "Trip overrides"}</span><button type="button" onClick={() => window.print()}><Ic k="print" /> Print</button></div></div>
          <div className="sxp-chips">
            <div className="sxp-chip"><i className="blue">#</i><small>SERVICE</small><b>{p.service}</b><span>· {p.service_name ?? ""}</span></div>
            <div className="sxp-chip"><i className="green"><Ic k="pin" size={17} /></i><small>ROUTE</small><b>{p.route}</b></div>
            <div className="sxp-chip"><i className="orange"><Ic k="calendar" size={16} /></i><small>DOJ</small><b>{niceDate(p.date)}</b></div>
            <div className="sxp-chip"><i className="cyan"><Ic k="bus" size={18} /></i><small>BUS</small><b>{p.vehicle || "Unassigned"}</b><span>· {p.coach ?? ""}</span></div>
          </div>
          <div className="sxp-staff-list">{p.crew?.length ? p.crew.map((c, i) => (
            <div key={i} className="sxp-staff"><i><Ic k={/helper/i.test(c.role || "") ? "staff" : "user"} /></i><div><small>{c.role || "Staff"}</small><b>{c.name || "Unassigned"}</b></div>
              {c.phone && <a href={`tel:${String(c.phone).replace(/[^0-9+]/g, "")}`}><Ic k="phone" size={15} /> {c.phone}</a>}</div>
          )) : <span>Vehicle crew not yet assigned</span>}</div>
        </div>
        <div className="sxp-body-grid">
          <section className="sxp-cost-pane">
            <div className="sxp-expense-columns">
              {group("fixed", "Fixed Expenses", "cost", fixed)}
              {group("running", "Running Expenses", "fuel", running,
                <div className="sxp-row sxp-auto-row"><span className="sxp-row-icon running"><Ic k="percent" size={20} /></span><div className="sxp-name">Commissions <small>Auto</small></div>
                  <label className="sxp-amount"><b>₹</b><input readOnly value={p.commission || 0} aria-label="Booking commissions" /></label><span className="sxp-from">Auto</span></div>)}
            </div>
            <div className="sxp-cost-footer">
              <div><span><i className="fixed"></i>Subtotal — Fixed</span><b>{fmt(fixed)}</b></div>
              <div><span><i className="running"></i>Subtotal — Running</span><b>{fmt(running)}</b></div>
              <div className="sxp-cost-total"><span><Ic k="receipt" size={21} /> TOTAL EXPENSES</span><b>{fmt(expense)}</b></div>
            </div>
          </section>
          <aside className="sxp-revenue">
            <header><strong><i><Ic k="trend" size={20} /></i> INCOME</strong><span>{Number(p.seats || 0)} seats</span></header>
            <div className="sxp-income-lines">
              {p.by_channel?.length ? p.by_channel.map((x) => <div key={x.channel} className="sxp-income-row"><span>{x.channel}</span><span>{Number(x.seats || 0)}</span><b>{fmt(x.net)}</b></div>)
                : <p>No confirmed sales for this schedule</p>}
              {!!p.cancellation_charges && <div className="sxp-income-row"><span>Cancellation charges</span><span>—</span><b>{fmt(p.cancellation_charges)}</b></div>}
            </div>
            <div className="sxp-income-total"><b>TOTAL INCOME</b><strong>{fmt(income)}</strong></div>
            <section className={`sxp-profit${profit < 0 ? " loss" : ""}`}>
              <div><strong><Ic k="trend" size={20} /> NET PROFIT</strong><span>{`${margin >= 0 ? "+" : ""}${Math.round(margin)}%`}</span></div><h2>{fmt(profit)}</h2>
              <div className="sxp-profit-labels"><span>Income</span><span>Expenses</span></div>
              <div className="sxp-track"><i style={{ width: `${income ? Math.max(0, Math.min(100, (expense / income) * 100)) : 0}%` }}></i></div>
              <div className="sxp-profit-nums"><span>{fmt(income)}</span><span>{fmt(expense)}</span></div>
            </section>
            <div className="sxp-revenue-details">
              <div><span>GST on bookings (informational)</span><b>{fmt(p.gst)}</b></div>
              <div><span>Commissions included in expenses</span><b>{fmt(p.commission)}</b></div>
              <div><span>Occupancy</span><b>{Number(p.seats || 0)}/{Number(p.capacity || 0)}</b></div>
            </div>
          </aside>
        </div>
        {!writable && <p className="sxp-readonly">Expenses are read-only for this account or disabled schedule.</p>}
      </div>
      {footer && createPortal(<>
        <span className="sxp-help">{help}</span>
        <div className="sxp-buttons">
          <button className="sxp-close" type="button" onClick={onClose}><Ic k="x" /> Close</button>
          <button className="sxp-save" type="button" disabled={!dirty || invalid || saving || !writable} onClick={() => void save()}>Save Expenses</button>
          <span className="sxp-caution">!</span>
        </div>
      </>, footer)}
    </>
  );
}
