import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, type Me, type Staff } from "../../api";
import { Modal, confirmDialog, toast, toastError } from "../../components/ui/feedback";
import { SubNav, StaffIcon } from "./StaffPage";

// React port of legacy GDS → Staff → Attendance / Advances / Reimbursements / Payouts (public/js/fleet.js wrapped by
// staff-parity-v11.js otherPage()). Same DOM (.sp-native-page > .sp-workspace-head + [data-body].sp-native-body) and the
// legacy G.kpis / G.table / G.pills / G.range markup, so the vendored CSS renders identically. All data is PostgreSQL-backed.

const inr = (n?: number | null) => (n == null || isNaN(n) ? "—" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0, minimumFractionDigits: 0 })}`);
const fdate = (s?: string | null) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const istToday = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const BADGE: Record<string, string> = { active: "ok", paid: "ok", approved: "b", pending: "warn", draft: "warn", rejected: "bad", inactive: "bad", recovered: "ok", disbursed: "warn", completed: "" };
const Badge = ({ s }: { s?: string | null }) => <span className={`badge ${BADGE[s ?? ""] ?? ""}`}>{String(s ?? "—").replace(/_/g, " ")}</span>;
const query = () => new URLSearchParams(location.hash.split("?")[1] ?? "");
const OPS = ["owner", "admin", "ops"];

const DESC: Record<string, [string, string, string]> = {
  attendance: ["Attendance", "calendar", "Record attendance, check daily duty and approve payroll inputs"],
  advances: ["Advances", "wallet", "Track advances, loans and recovery"],
  reimbursements: ["Reimbursements", "receipt", "Expense claims and approvals"],
  payouts: ["Payouts", "cash", "Generate, approve and record staff payments"],
};

function Shell({ tab, children }: { tab: string; children: ReactNode }) {
  const [title, icon, desc] = DESC[tab];
  return (
    <div className="sp-native-page">
      <div className="sp-workspace-head"><SubNav tab={tab} />
        <div className="sp-context"><span className="sp-context-icon"><StaffIcon n={icon} s={26} /></span><div><h2>{title}</h2><p>{desc}</p></div></div>
      </div>
      <div data-body="" className="sp-native-body sp-native-content">{children}</div>
    </div>
  );
}

function Kpis({ items }: { items: [string, ReactNode][] }) {
  return <div className={`grid g${Math.min(items.length, 5)}`}>{items.map(([l, v]) => <div key={l} className="kpi"><div className="l">{l}</div><div className="v">{v}</div></div>)}</div>;
}
type Col<T> = { l: string; n?: boolean; f: (r: T) => ReactNode };
function Table<T>({ rows, cols, empty = "No records" }: { rows: T[]; cols: Col<T>[]; empty?: string }) {
  if (!rows.length) return <div className="empty">{empty}</div>;
  return (
    <div className="tw"><table className="t"><thead><tr>{cols.map((c, i) => <th key={i} className={c.n ? "n" : ""}>{c.l}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{cols.map((c, j) => <td key={j} className={c.n ? "n" : ""}>{c.f(r)}</td>)}</tr>)}</tbody></table></div>
  );
}

/** Port of legacy G.prompt: `.grid.g2` form of `label.f` fields; resolves with the values or null. */
type F = { name: string; label: string; type?: "text" | "number" | "date" | "select"; options?: [string, string][]; value?: string | number | null; required?: boolean; full?: boolean };
type PromptState = { title: string; fields: F[]; resolve: (v: Record<string, string> | null) => void };
function usePrompt() {
  const [p, setP] = useState<PromptState>();
  const ask = (title: string, fields: F[]) => new Promise<Record<string, string> | null>((resolve) => setP({ title, fields, resolve }));
  const close = (v: Record<string, string> | null) => { p?.resolve(v); setP(undefined); };
  const el = p && <PromptModal key={p.title} p={p} close={close} />;
  return { ask, el };
}
function PromptModal({ p, close }: { p: PromptState; close: (v: Record<string, string> | null) => void }) {
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(p.fields.map((f) => [f.name, f.value == null ? (f.type === "select" ? f.options?.[0]?.[0] ?? "" : "") : String(f.value)])));
  const ok = () => {
    const miss = p.fields.find((f) => f.required && !v[f.name]);
    if (miss) return toast(`${miss.label} is required`, "bad");
    close(v);
  };
  return (
    <Modal title={p.title} onClose={() => close(null)} foot={<><button type="button" className="btn" data-n onClick={() => close(null)}>Cancel</button><button type="button" className="btn p" data-y onClick={ok}>Save</button></>}>
      <form className="grid g2" data-f onSubmit={(e) => { e.preventDefault(); ok(); }}>
        {p.fields.map((f) => (
          <label key={f.name} className="f" style={f.full ? { gridColumn: "1/-1" } : undefined}>{f.label}
            {f.type === "select"
              ? <select name={f.name} value={v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.value })}>{f.options!.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              : <input name={f.name} type={f.type ?? "text"} value={v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} />}
          </label>
        ))}
      </form>
    </Modal>
  );
}
const num = (s?: string) => (s == null || s === "" ? undefined : Number(s));
const opts = (xs: string[]): [string, string][] => xs.map((x) => [x, x]);

function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T>(); const [error, setError] = useState<string>();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(async () => { try { setData(await fn()); setError(undefined); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }, deps);
  useEffect(() => { void load(); }, [load]);
  return { data, error, load };
}
function State({ tab, error, retry }: { tab: string; error?: string; retry: () => void }) {
  return <Shell tab={tab}>{error ? <div className="sp-empty" role="alert">Unable to load {DESC[tab][0]} · {error}. <a href={`#/fleet/${tab}`} onClick={retry}>Retry</a></div> : <div className="sp-empty">Loading…</div>}</Shell>;
}
const run = (f: () => Promise<unknown>) => () => { f().catch(toastError); };

// ---------------- Attendance ----------------
export function AttendancePage({ me }: { me: Me }) {
  const q = query();
  const from = q.get("from") || addDays(istToday(), -6), to = q.get("to") || istToday();
  const payroll = OPS.includes(me.role);
  const { data: d, error, load } = useLoad(() => api.attendance(from, to), [from, to]);
  const [rf, setRf] = useState(from); const [rt, setRt] = useState(to);
  const prompt = usePrompt();
  if (!d) return <State tab="attendance" error={error} retry={() => void load()} />;
  return (
    <Shell tab="attendance">
      <div className="row between" style={{ marginBottom: 10 }}>
        <div className="row"><input type="date" data-from="" value={rf} onChange={(e) => setRf(e.target.value)} /><span className="muted">to</span><input type="date" data-to="" value={rt} onChange={(e) => setRt(e.target.value)} />
          <button type="button" className="btn sm" data-go="" onClick={() => (location.hash = `#/fleet/attendance?from=${rf}&to=${rt}`)}>Apply</button></div>
        {payroll && <div className="row">
          <button type="button" className="btn sm" data-gen="" onClick={run(async () => { const r = await api.generateAttendance(from, to); toast(`${r.generated} entries generated`, "ok"); await load(); })}>Generate from trips</button>
          <button type="button" className="btn sm" data-add="" onClick={run(async () => {
            const S = await api.staff();
            const v = await prompt.ask("Manual attendance", [{ name: "staffId", label: "Staff", type: "select", options: S.map((s) => [String(s.id), `${s.name} (${s.role})`]) }, { name: "date", label: "Date", type: "date", value: istToday() }, { name: "status", label: "Status", type: "select", options: opts(["present", "absent", "leave"]) }, { name: "amount", label: "Amount", type: "number", value: 0 }]);
            if (v) { await api.createAttendance({ staffId: Number(v.staffId), date: v.date, status: v.status, amount: num(v.amount) }); await load(); }
          })}>+ Manual entry</button>
          <button type="button" className="btn sm p" data-appr="" onClick={run(async () => { const r = await api.approveAttendance({ from, to }); toast(`${r.approved} entries approved`, "ok"); await load(); })}>Approve all drafts</button>
        </div>}
      </div>
      <div className="tw"><table className="t"><thead><tr><th>Staff</th>{d.dates.map((x) => <th key={x}>{x.slice(8)}</th>)}<th className="n">Present</th><th className="n">Amount</th><th>Drafts</th></tr></thead>
        <tbody>{d.staff.length ? d.staff.map((s) => (
          <tr key={s.staff_id}><td><b>{s.name}</b><div className="small muted">{s.role}</div></td>
            {d.dates.map((x) => {
              const c = s.days[x];
              return <td key={x} title={c ? `${c.status} · ${c.state}${c.service ? ` · ${c.service}` : ""} · ₹${c.amount}` : ""}>{c
                ? <span className={`badge ${c.status === "present" ? (c.state === "approved" ? "ok" : "warn") : "bad"}`} data-cell={payroll ? c.id : undefined} style={{ cursor: "pointer" }}
                    onClick={payroll ? run(async () => {
                      const v = await prompt.ask("Edit attendance", [{ name: "status", label: "Status", type: "select", options: opts(["present", "absent", "leave"]), value: c.status }, { name: "amount", label: "Amount", type: "number", value: c.amount }, { name: "state", label: "State", type: "select", options: opts(["draft", "approved"]), value: c.state }]);
                      if (v) { await api.updateAttendance(c.id, { status: v.status, amount: num(v.amount), state: v.state }); await load(); }
                    }) : undefined}>{c.status === "present" ? "P" : c.status === "leave" ? "L" : "A"}</span>
                : <span className="muted">·</span>}</td>;
            })}
            <td className="n">{s.present}</td><td className="n">{inr(s.amount)}</td><td>{s.draft ? <span className="badge warn">{s.draft}</span> : null}</td></tr>
        )) : <tr><td colSpan={d.dates.length + 4} className="empty">No attendance — generate it from trip crew</td></tr>}</tbody></table></div>
      <p className="small muted">P = present · A = absent · L = leave. Amber = draft, green = approved. Click a cell to edit.</p>
      {prompt.el}
    </Shell>
  );
}

// ---------------- Payouts ----------------
export function PayoutsPage({ me }: { me: Me }) {
  const st = query().get("status") || "";
  const { data, error, load } = useLoad(() => Promise.all([api.payoutSummary(), api.payouts(st)]), [st]);
  const prompt = usePrompt();
  const [gen, setGen] = useState(false);
  if (!data) return <State tab="payouts" error={error} retry={() => void load()} />;
  const [sum, { payouts: P }] = data;
  const can = OPS.includes(me.role);
  return (
    <Shell tab="payouts">
      <Kpis items={[["Paid this month", inr(sum.total_paid_this_month)], ["Pending approval", inr(sum.total_pending_approval)], ["Approved, unpaid", inr(sum.total_approved_unpaid)], ["Payouts this month", sum.payouts_count_this_month]]} />
      <div className="row between" style={{ margin: "14px 0 8px" }}>
        <div className="pills">{[["", "All"], ["draft", "Draft"], ["approved", "Approved"], ["paid", "Paid"]].map(([k, l]) => <a key={k} className={k === st ? "on" : ""} data-st={k} onClick={() => (location.hash = `#/fleet/payouts?status=${k}`)}>{l}</a>)}</div>
        <button type="button" className="btn sm p" data-gen="" onClick={() => (can ? setGen(true) : toast("Permission required", "bad"))}>Generate payouts</button>
      </div>
      <Table rows={P} empty="No payouts" cols={[
        { l: "Payout", f: (r) => r.payout_no },
        { l: "Staff", f: (r) => <>{r.staff_name} <span className="small muted">{r.staff_role}</span></> },
        { l: "Period", f: (r) => `${fdate(r.period_start)} – ${fdate(r.period_end)}` },
        { l: "Days", n: true, f: (r) => r.days },
        { l: "Gross", n: true, f: (r) => inr(r.gross) },
        { l: "Adv. recovered", n: true, f: (r) => inr(r.advances_recovered) },
        { l: "Reimb.", n: true, f: (r) => inr(r.reimbursements) },
        { l: "Net", n: true, f: (r) => <b>{inr(r.net)}</b> },
        { l: "Status", f: (r) => <Badge s={r.status} /> },
        { l: "", f: (r) => r.status === "draft" ? <>
            <button type="button" className="btn sm" data-edp={r.id} onClick={run(async () => {
              const v = await prompt.ask("Adjust payout", [{ name: "gross", label: "Gross", type: "number", value: r.gross }, { name: "deductions", label: "Other deductions", type: "number", value: r.deductions }]);
              if (v) { await api.adjustPayout(r.id, { gross: num(v.gross), deductions: num(v.deductions) }); await load(); }
            })}>Adjust</button>{" "}
            <button type="button" className="btn sm p" data-ap={r.id} onClick={run(async () => { await api.approvePayout(r.id); await load(); })}>Approve</button>{" "}
            <button type="button" className="btn sm d" data-rmp={r.id} onClick={run(async () => { if (await confirmDialog("Delete draft payout?", { danger: true })) { await api.deletePayout(r.id); await load(); } })}>✕</button>
          </> : r.status === "approved"
            ? <button type="button" className="btn sm p" data-pay={r.id} onClick={run(async () => {
                const v = await prompt.ask("Record payment", [{ name: "paymentMode", label: "Mode", type: "select", options: opts(["bank", "upi", "cash"]) }, { name: "reference", label: "Reference / UTR" }]);
                if (v) { await api.payPayout(r.id, { paymentMode: v.paymentMode, reference: v.reference || null }); toast("Payout marked paid", "ok"); await load(); }
              })}>Mark paid</button>
            : (r.reference || r.payment_mode || "") },
      ]} />
      {gen && <GenerateModal onClose={() => setGen(false)} onDone={() => { setGen(false); void load(); }} />}
      {prompt.el}
    </Shell>
  );
}

function GenerateModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [from, setFrom] = useState(`${istToday().slice(0, 7)}-01`); const [to, setTo] = useState(istToday());
  const [ded, setDed] = useState(true);
  const [rows, setRows] = useState<PreviewRow[]>(); const [sel, setSel] = useState<Set<number>>(new Set());
  const prev = useCallback(async () => { const r = await api.payoutPreview(from, to); setRows(r.rows); setSel(new Set(r.rows.map((x) => x.staff_id))); }, [from, to]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { prev().catch(toastError); }, []);
  const make = async () => {
    const ids = [...sel];
    if (!ids.length) return toast("Select staff", "bad");
    const r = await api.generatePayouts({ from, to, staffIds: ids, deductAdvances: ded });
    toast(`${r.created} draft payouts created`, "ok"); onDone();
  };
  return (
    <Modal title="Generate payouts" size="lg" onClose={onClose} foot={<button type="button" className="btn p" data-mk="" onClick={run(make)}>Create drafts</button>}>
      <div className="row"><input type="date" data-from="" value={from} onChange={(e) => setFrom(e.target.value)} /><span className="muted">to</span><input type="date" data-to="" value={to} onChange={(e) => setTo(e.target.value)} />
        <button type="button" className="btn sm" data-prev="" onClick={run(prev)}>Preview</button>
        <label className="chk"><input type="checkbox" data-ded="" checked={ded} onChange={(e) => setDed(e.target.checked)} /> Deduct outstanding advances</label></div>
      <div data-pv="" style={{ marginTop: 10 }}>{rows && <Table rows={rows} empty="Nothing to pay — approve attendance first" cols={[
        { l: "", f: (x) => <input type="checkbox" data-sid={x.staff_id} checked={sel.has(x.staff_id)} onChange={(e) => { const n = new Set(sel); e.target.checked ? n.add(x.staff_id) : n.delete(x.staff_id); setSel(n); }} /> },
        { l: "Staff", f: (x) => x.name }, { l: "Role", f: (x) => x.role }, { l: "Days", n: true, f: (x) => x.days },
        { l: "Gross", n: true, f: (x) => inr(x.gross) }, { l: "Advances due", n: true, f: (x) => inr(x.advances_outstanding) },
        { l: "Reimb.", n: true, f: (x) => inr(x.reimbursements) }, { l: "Prev. balance", n: true, f: (x) => inr(x.prev_balance) },
      ]} />}</div>
    </Modal>
  );
}

// ---------------- Advances ----------------
export function AdvancesPage(_: { me: Me }) {
  const { data, error, load } = useLoad(() => api.advances(), []);
  const prompt = usePrompt();
  if (!data) return <State tab="advances" error={error} retry={() => void load()} />;
  const { advances: A, summary } = data;
  return (
    <Shell tab="advances">
      <Kpis items={[["Outstanding", inr(summary.total_outstanding)], ["Disbursed this month", inr(summary.total_disbursed_this_month)], ["Advances", A.length]]} />
      <div className="row between" style={{ margin: "14px 0 8px" }}><b>Advances &amp; loans</b>
        <button type="button" className="btn sm p" data-new="" onClick={run(async () => {
          const S: Staff[] = await api.staff();
          const v = await prompt.ask("New advance", [
            { name: "staffId", label: "Staff", type: "select", options: S.map((s) => [String(s.id), `${s.name} (${s.role})`]) }, { name: "amount", label: "Amount", type: "number", required: true },
            { name: "advanceType", label: "Type", type: "select", options: opts(["salary", "trip", "loan", "emergency"]) }, { name: "paymentMode", label: "Paid via", type: "select", options: opts(["cash", "upi", "bank"]) },
            { name: "recoveryMethod", label: "Recovery", type: "select", options: [["one_time", "One time from next payout"], ["installments", "Installments"]] }, { name: "numInstallments", label: "Installments", type: "number" },
            { name: "dateIssued", label: "Date", type: "date", value: istToday() }, { name: "reason", label: "Reason", full: true }]);
          if (v) {
            await api.createAdvance({ staffId: Number(v.staffId), amount: Number(v.amount), advanceType: v.advanceType, paymentMode: v.paymentMode, recoveryMethod: v.recoveryMethod, numInstallments: num(v.numInstallments), dateIssued: v.dateIssued || undefined, reason: v.reason || undefined });
            toast("Advance recorded", "ok"); await load();
          }
        })}>+ New advance</button></div>
      <Table rows={A} cols={[
        { l: "Date", f: (r) => fdate(r.date_issued) },
        { l: "Staff", f: (r) => <>{r.staff_name} <span className="small muted">{r.staff_role}</span></> },
        { l: "Type", f: (r) => r.advance_type }, { l: "Amount", n: true, f: (r) => inr(r.amount) }, { l: "Recovered", n: true, f: (r) => inr(r.amount_recovered) },
        { l: "Balance", n: true, f: (r) => <b>{inr(r.balance)}</b> }, { l: "Recovery", f: (r) => r.recovery_method }, { l: "Reason", f: (r) => r.reason ?? "" },
        { l: "Status", f: (r) => <Badge s={r.status} /> },
        { l: "", f: (r) => r.status !== "recovered" ? <>
            <button type="button" className="btn sm" data-rec={r.id} onClick={run(async () => {
              const v = await prompt.ask("Record recovery", [{ name: "amount", label: `Amount (balance ${inr(r.balance)})`, type: "number", value: r.balance, required: true }]);
              if (v) { await api.recoverAdvance(r.id, Number(v.amount)); await load(); }
            })}>Recover</button>{" "}
            <button type="button" className="btn sm d" data-rm={r.id} onClick={run(async () => { if (await confirmDialog("Delete advance?", { danger: true })) { await api.deleteAdvance(r.id); await load(); } })}>✕</button>
          </> : "" },
      ]} />
      {prompt.el}
    </Shell>
  );
}

// ---------------- Reimbursements ----------------
export function ReimbursementsPage(_: { me: Me }) {
  const { data, error, load } = useLoad(() => api.reimbursements(), []);
  const prompt = usePrompt();
  if (!data) return <State tab="reimbursements" error={error} retry={() => void load()} />;
  const { reimbursements: R, summary } = data;
  const act = (id: number, a: "approve" | "reject" | "pay") => run(async () => { await api.reimbursementAction(id, a); await load(); });
  return (
    <Shell tab="reimbursements">
      <Kpis items={[["Pending", inr(summary.total_pending)], ["Pending claims", summary.pending_count]]} />
      <div className="row between" style={{ margin: "14px 0 8px" }}><b>Expense claims</b>
        <button type="button" className="btn sm p" data-new="" onClick={run(async () => {
          const S = await api.staff();
          const v = await prompt.ask("New claim", [{ name: "staffId", label: "Staff", type: "select", options: S.map((s) => [String(s.id), s.name]) }, { name: "category", label: "Category", type: "select", options: opts(["Diesel", "Tolls", "Food", "Repairs", "Parking", "Other"]) },
            { name: "amount", label: "Amount", type: "number", required: true }, { name: "date", label: "Date", type: "date", value: istToday() }, { name: "description", label: "Description", full: true }]);
          if (v) { await api.createReimbursement({ staffId: Number(v.staffId), category: v.category, amount: Number(v.amount), date: v.date || undefined, description: v.description }); await load(); }
        })}>+ New claim</button></div>
      <Table rows={R} cols={[
        { l: "Date", f: (r) => fdate(r.date) }, { l: "Staff", f: (r) => r.staff_name ?? "" }, { l: "Category", f: (r) => r.category }, { l: "Description", f: (r) => r.description },
        { l: "Amount", n: true, f: (r) => inr(r.amount) }, { l: "Status", f: (r) => <Badge s={r.status} /> },
        { l: "", f: (r) => r.status === "pending" ? <><button type="button" className="btn sm p" data-act={`${r.id}|approve`} onClick={act(r.id, "approve")}>Approve</button>{" "}<button type="button" className="btn sm d" data-act={`${r.id}|reject`} onClick={act(r.id, "reject")}>Reject</button></>
            : r.status === "approved" ? <button type="button" className="btn sm" data-act={`${r.id}|pay`} onClick={act(r.id, "pay")}>Pay now</button> : "" },
      ]} />
      {prompt.el}
    </Shell>
  );
}

type PreviewRow = { staff_id: number; name: string; role: string; days: number; gross: number; advances_outstanding: number; reimbursements: number; prev_balance: number; net: number };
