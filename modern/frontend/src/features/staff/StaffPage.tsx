import { useCallback, useEffect, useMemo, useState } from "react";
import { svgNodes } from "../../components/ui/SvgMarkup";
import { api, authHeaders, type Me, type Staff, type StaffLedger } from "../../api";
import { confirmDialog, promptDialog, toast, toastError } from "../../components/ui/feedback";
import { NiceSelect } from "../../components/ui/NiceSelect";

// React port of legacy GDS → Staff (public/js/staff-parity-v11.js: staffPage(), listHeader(), staffRow(), openEditor()).
// Same DOM + class names so the vendored staff-parity-v11.css renders identically.
// Profile fields (address, emergency contact, Aadhaar, PAN, employment type, bank, retention, overtime, bonus/deduction rules) persist in
// staff.profile_json; Ledger reads /payroll/staff/:id/ledger and Documents use /staff/:id/documents.
const P: Record<string, string> = {
  user: '<circle cx="12" cy="7" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
  userPlus: '<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0m3-10v8m-4-4h8"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-8a4 4 0 0 1 0 8"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  wallet: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 9h18m-6 5h3"/>',
  file: '<path d="M6 2h9l5 5v15H6zM15 2v6h5M9 12h8m-8 4h8"/>',
  cash: '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M5 9h.01M19 15h.01"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  eye: '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
  pencil: '<path d="m14 5 5 5M3 21l5-1 12-12a3 3 0 0 0-5-5L3 15l0 6Z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  phone: '<path d="M5 3 9 6l-2 4a17 17 0 0 0 7 7l4-2 3 4-2 2C10 23 1 14 3 5Z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 7 9-7"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  id: '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M5 16a4 4 0 0 1 8 0m3-5h3m-3 4h3"/>',
  shield: '<path d="M12 2 21 6v6c0 5-4 8-9 10-5-2-9-5-9-10V6l9-4Z"/>',
  bank: '<path d="m2 9 10-6 10 6H2ZM4 21h16M6 9v10m5-10v10m6-10v10"/>',
  book: '<path d="M12 6C9 3 5 3 2 4v16c4-1 7-1 10 2 3-3 6-3 10-2V4c-3-1-7-1-10 2Zm0 0v16"/>',
  close: '<path d="M5 5 19 19M19 5 5 19"/>',
  check: '<path d="m4 12 5 5 15-14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
  drop: '<path d="M12 2s-7 8-7 13a7 7 0 1 0 14 0c0-5-7-13-7-13Z"/>',
  finger: '<path d="M12 11V5a2 2 0 0 1 4 0v8m-4-5V4a2 2 0 0 0-4 0v9m4-2a2 2 0 0 0-4 0v3m8-2a2 2 0 0 1 4 0v4c0 4-3 6-8 6-3 0-5-3-7-6a2 2 0 0 1 3-2"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M9 9c0-2 6-2 6 0s-6 2-6 4 6 2 6 0M12 6v12"/>',
  clipboard: '<rect x="5" y="5" width="14" height="17" rx="2"/><path d="M9 3h6v4H9zM9 12h6m-6 4h6"/>',
  receipt: '<path d="M4 3h16v18l-4-2-4 2-4-2-4 2V3Zm4 5h8m-8 4h8"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1M10 21v-3h4v3"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v9H5v-9M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  trendingDown: '<path d="m22 17-8.5-8.5-5 5L2 7m14 10h6v-6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 21V9m-5 5 5-5 5 5M4 3h16"/>',
};
const I = ({ n, s = 20 }: { n: string; s?: number }) => (
  <svg className="sp-icon" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{svgNodes(P[n] ?? P.user)}</svg>
);
export const StaffIcon = I;
const ROLES: [string, string][] = [["driver", "Driver"], ["helper", "Helper / Attendant"], ["conductor", "Conductor"], ["cleaner", "Cleaner"], ["pickup_driver", "Pickup Driver"], ["manager", "Manager"], ["office", "Office Staff"]];
const NAV: [string, string, string][] = [["staff", "Staff", "users"], ["attendance", "Attendance", "calendar"], ["advances", "Advances", "wallet"], ["reimbursements", "Reimbursements", "receipt"], ["payouts", "Payouts", "cash"]];
const TABS: [string, string, string][] = [["personal", "Personal Info", "user"], ["payables", "Payables", "wallet"], ["bank", "Bank Details", "bank"], ["ledger", "Ledger", "book"], ["docs", "Documents", "file"]];
const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const DOC_TYPES: [string, string, string, string][] = [["AADHAAR", "Aadhaar Card", "finger", "orange"], ["LICENSE", "Driving License", "id", "cyan"], ["PAN", "PAN Card", "file", "blue"], ["BANK_CHEQUE", "Bank Cheque", "bank", "green"]];
type Rule = { name: string; amount: number; frequency: string };
type Profile = { address?: string; aadhaar?: string; pan?: string; employment_type?: string; retention_per_day?: number; overtime_rate?: number;
  emergency_contact?: { name?: string; phone?: string }; bank?: Record<string, string>; payroll_bonus_rules?: Rule[]; payroll_deduction_rules?: Rule[] };
type StaffDoc = { id: number; document_type: string; file_name: string | null; has_file: boolean; expiry_date: string | null };
const parseProfile = (s?: string | null): Profile => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };
const OPS = ["owner", "admin", "ops"];
const cleanRole = (x: string) => ROLES.find((r) => r[0] === x)?.[1] ?? String(x || "Staff").replace(/_/g, " ");
const fdate = (s?: string | null) => (s ? new Date(`${s.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");

export function SubNav({ tab }: { tab: string }) {
  return <nav className="sp-subnav" aria-label="Staff sections">{NAV.map(([id, label, ic]) => <a key={id} className={`sp-subpill ${tab === id ? "active" : ""}`} href={`#/fleet/${id}`}><I n={ic} /> {label}</a>)}</nav>;
}

type Field = { name: keyof Staff | string; label: string; icon: string; type?: string; options?: [string, string][]; required?: boolean; wide?: boolean; placeholder?: string; max?: number };
function FieldView({ f, value, editing, set }: { f: Field; value: unknown; editing: boolean; set: (v: string) => void }) {
  const v = value == null ? "" : String(value);
  const dis = !editing;
  const common = { name: f.name, disabled: dis, onChange: (e: { target: { value: string } }) => set(e.target.value) };
  return (
    <label className={`sp-field ${f.wide ? "wide" : ""}`}>
      <span>{f.label} {f.required && <b className="sp-req">*</b>}</span>
      <span className="sp-input"><I n={f.icon} />
        {f.type === "select"
          ? <select {...common} value={v} required={f.required}>{(f.options ?? []).map(([o, t]) => <option key={o} value={o}>{t}</option>)}</select>
          : <input {...common} type={f.type ?? "text"} value={v} placeholder={f.placeholder ?? ""} required={f.required} maxLength={f.max} autoComplete="off" />}
      </span>
    </label>
  );
}
const Card = ({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) => (
  <section className="sp-form-card"><header><span className="sp-card-icon"><I n={icon} s={24} /></span><h3>{title}</h3></header><div className="sp-card-main">{children}</div></section>
);

function Editor({ record, editing: startEdit, canModify, onClose, onSaved }: { record: Staff | null; editing: boolean; canModify: boolean; onClose: () => void; onSaved: () => void }) {
  const [editing, setEditing] = useState(startEdit);
  const [tab, setTab] = useState("personal");
  const [d, setD] = useState<Partial<Staff>>(record ? { ...record } : { name: "", phone: "", role: "driver", status: "active", salaryType: "per_trip", salaryAmount: 0 });
  const set = (k: string) => (v: string) => setD((o) => ({ ...o, [k]: ["salaryAmount", "bataPerTrip"].includes(k) ? (v === "" ? 0 : Number(v)) : v }));
  const [p, setP] = useState<Profile>(() => parseProfile(record?.profileJson));
  const setPath = (path: string) => (v: string) => setP((o) => {
    const [a, b] = path.split("."); const num = ["retention_per_day", "overtime_rate"].includes(a);
    return b ? { ...o, [a]: { ...((o as Record<string, Record<string, string>>)[a] ?? {}), [b]: v } } : { ...o, [a]: num ? (v === "" ? 0 : Number(v)) : v };
  });
  const getPath = (path: string) => { const [a, b] = path.split("."); const x = (p as Record<string, unknown>)[a]; return b ? (x as Record<string, unknown> | undefined)?.[b] : x; };
  const [ledger, setLedger] = useState<StaffLedger | null>(null);
  const [docs, setDocs] = useState<StaffDoc[]>();
  const loadDocs = useCallback(async () => { if (record) setDocs((await api.admin<{ documents: StaffDoc[] }>(`/staff/${record.id}/documents`)).documents); }, [record]);
  useEffect(() => {
    if (!record) return;
    if (tab === "ledger" && !ledger) api.staffLedger(record.id).then((l) => setLedger(l as StaffLedger)).catch((e) => { setLedger({ entries: [], total_credits: 0, total_debits: 0, balance: 0 }); toastError(e); });
    if (tab === "docs" && !docs) loadDocs().catch(toastError);
  }, [tab, record, ledger, docs, loadDocs]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k); const old = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", k); document.body.style.overflow = old; };
  }, [onClose]);
  const title = record ? (editing ? "Edit Staff" : "View Staff") : "Add Staff";
  const save = async () => {
    if (!canModify) return toast("No permission to save staff", "bad");
    if (!String(d.name ?? "").trim()) return toast("Full Name is required", "bad");
    if (!/^\d{10}$/.test(String(d.phone ?? ""))) return toast("Phone Number must contain 10 digits", "bad");
    if (Number(d.salaryAmount) < 0 || Number(p.overtime_rate) < 0) return toast("Rates cannot be negative", "bad");
    if (p.aadhaar && !/^\d{12}$/.test(p.aadhaar)) return toast("Aadhaar must have 12 digits", "bad");
    if (p.pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(p.pan.toUpperCase())) return toast("Invalid PAN format", "bad");
    if (p.bank?.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(p.bank.ifsc)) return toast("Invalid IFSC code", "bad");
    if (p.bank?.account_number && !/^\d{9,18}$/.test(p.bank.account_number)) return toast("Bank account number must be 9–18 digits", "bad");
    try {
      await api.saveStaff({ ...d, email: d.email ?? "", bloodGroup: d.bloodGroup ?? "", joiningDate: d.joiningDate || null, licenseNumber: d.licenseNumber || null, licenseExpiry: d.licenseExpiry || null,
        profile: { ...p, pan: (p.pan ?? "").toUpperCase() } } as Partial<Staff>, record?.id);
      toast(record ? "Staff changes saved" : "Staff added", "ok"); onClose(); onSaved();
    } catch (e) { toastError(e); }
  };
  const F = (f: Field) => <FieldView key={String(f.name)} f={f} value={(d as Record<string, unknown>)[String(f.name)]} editing={editing} set={set(String(f.name))} />;
  const PF = (f: Field) => <FieldView key={String(f.name)} f={f} value={getPath(String(f.name))} editing={editing} set={setPath(String(f.name))} />;
  const addRule = async (kind: "bonus" | "deduction") => {
    const v = await promptDialog(`Add ${kind}`, [{ name: "name", label: "Name / reason", required: true }, { name: "amount", label: "Amount ₹", type: "number", required: true },
      { name: "frequency", label: "When applied", type: "select", options: ["Every trip", "Monthly", "One-time"] }]);
    if (!v) return;
    const key = kind === "bonus" ? "payroll_bonus_rules" : "payroll_deduction_rules";
    setP((o) => ({ ...o, [key]: [...(o[key] ?? []), { name: String(v.name), amount: Number(v.amount), frequency: String(v.frequency || "Every trip") }] }));
  };
  const ruleCard = (title: string, ic: string, kind: "bonus" | "deduction") => {
    const key = kind === "bonus" ? "payroll_bonus_rules" : "payroll_deduction_rules", a = p[key] ?? [], lbl = kind === "bonus" ? "Bonus" : "Deduction";
    return (
      <section className="sp-form-card"><header><span className="sp-card-icon"><I n={ic} s={24} /></span><h3>{title}</h3>
        {editing && <button type="button" className={`sp-btn ${kind === "bonus" ? "softgreen" : "softred"}`} data-rule-add={kind} onClick={() => void addRule(kind)}><I n="plus" s={19} /> Add {lbl}</button>}</header>
        <div className="sp-card-main">{a.length ? a.map((r, i) => (
          <div key={i} className="sp-rule"><span><b>{r.name}</b><small>{r.amount ? inr(r.amount) : "—"} {r.frequency ? `· ${r.frequency}` : ""}</small></span>
            {editing && <button type="button" className="sp-btn text" data-rule-remove={`${kind}:${i}`} onClick={() => setP((o) => ({ ...o, [key]: (o[key] ?? []).filter((_, j) => j !== i) }))}><I n="trash" s={18} /></button>}</div>))
          : <button type="button" className="sp-add-rule" data-rule-add={kind} disabled={!editing} onClick={() => void addRule(kind)}><I n="plus" s={20} /> Add {lbl}</button>}</div></section>
    );
  };
  const upload = (type: string) => {
    if (!record) return toast("Save staff first, then upload documents", "bad");
    const input = document.createElement("input"); input.type = "file"; input.accept = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      if (file.size > 10 * 1024 * 1024) return toast("Maximum file size is 10 MB", "bad");
      if (!/^(application\/pdf|image\/(jpeg|png|webp))$/.test(file.type)) return toast("Only PDF/JPG/PNG/WEBP files are allowed", "bad");
      try {
        const fileData = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(file); });
        await api.admin(`/staff/${record.id}/documents`, "POST", { documentType: type, fileName: file.name, fileData });
        await loadDocs(); toast("Document uploaded", "ok");
      } catch (e) { toastError(e); }
    };
    input.click();
  };
  const download = async (doc: StaffDoc) => {
    try {
      const r = await fetch(`/api/admin/staff/${record!.id}/documents/${doc.id}/file`, { headers: authHeaders() });
      if (!r.ok) throw new Error("Unable to open document");
      const url = URL.createObjectURL(await r.blob()); const a = document.createElement("a"); a.href = url; a.download = doc.file_name || "document"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { toastError(e); }
  };
  const paytype = d.salaryType === "monthly" ? "monthly" : "per_trip";
  return (
    <div className="sp-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="sp-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <header className="sp-dialog-head"><div className="sp-dialog-icon"><I n="userPlus" s={30} /></div><div><h2>{title}</h2><small>{d.name || "New staff member"}</small></div>
          <button type="button" data-modal-close className="sp-close" title="Close" onClick={onClose}><I n="close" s={24} /></button></header>
        <nav className="sp-modal-tabs">{TABS.map(([id, label, ic]) => <button key={id} type="button" className={tab === id ? "active" : ""} data-modal-tab={id} onClick={() => setTab(id)}><I n={ic} s={21} /> {label}</button>)}</nav>
        <div className="sp-dialog-scroll">
          {tab === "personal" && <>
            <Card title="Basic Information" icon="user"><div className="sp-fields">
              {F({ name: "role", label: "Role", icon: "users", type: "select", options: ROLES, required: true })}
              {F({ name: "name", label: "Full Name", icon: "user", required: true, placeholder: "Full name" })}
              {F({ name: "phone", label: "Phone Number", icon: "phone", required: true, max: 10, placeholder: "10-digit mobile number" })}
              {F({ name: "email", label: "Email", icon: "mail", type: "email", placeholder: "email@example.com" })}
              {PF({ name: "address", label: "Address", icon: "pin", wide: true, placeholder: "Street address, city, state" })}
              {F({ name: "bloodGroup", label: "Blood Group", icon: "drop", type: "select", options: [["", "Select blood group"], ...BLOOD.map((x) => [x, x] as [string, string])] })}
              {PF({ name: "emergency_contact.name", label: "Emergency Contact Name", icon: "user", placeholder: "Contact name" })}
              {PF({ name: "emergency_contact.phone", label: "Emergency Contact Phone", icon: "phone", placeholder: "10-digit phone", max: 10 })}
              {PF({ name: "aadhaar", label: "ID / Aadhar Number", icon: "finger", placeholder: "12-digit Aadhaar number", max: 12 })}
              {PF({ name: "pan", label: "PAN Number", icon: "id", placeholder: "e.g. ABCDE1234F", max: 10 })}
              {F({ name: "joiningDate", label: "Date of Joining", icon: "calendar", type: "date" })}
              {PF({ name: "employment_type", label: "Employment Type", icon: "users", type: "select", options: [["", "Select type"], ["Full-time", "Full-time"], ["Part-time", "Part-time"], ["Contract", "Contract"]] })}
            </div></Card>
            <Card title="License Information" icon="shield"><div className="sp-fields">
              {F({ name: "licenseNumber", label: "License Number", icon: "id", placeholder: "Driving license number" })}
              {F({ name: "licenseExpiry", label: "License Expiry", icon: "calendar", type: "date" })}
            </div></Card>
          </>}
          {tab === "payables" && <>
            <div className="sp-pay-label">Pay Type</div>
            <div className="sp-pay-cards">
              {([["per_trip", "coin", "Daily Wages"], ["monthly", "cash", "Monthly Salary"]] as const).map(([k, ic, t]) => (
                <button key={k} type="button" data-pay-type={k} className={paytype === k ? "chosen" : ""} disabled={!editing} onClick={() => setD((o) => ({ ...o, salaryType: k }))}><span className="sp-pay-icon"><I n={ic} s={26} /></span>{t}</button>
              ))}
            </div>
            <Card title={paytype === "monthly" ? "Monthly Salary" : "Daily Wages"} icon="wallet"><div className="sp-fields">
              {F({ name: "salaryAmount", label: paytype === "monthly" ? "Monthly salary (₹)" : "Rate per trip / duty (₹)", icon: "cash", type: "number" })}
              {F({ name: "bataPerTrip", label: "Bata per trip (₹)", icon: "coin", type: "number" })}
              {PF({ name: "retention_per_day", label: "Retention per day (₹)", icon: "wallet", type: "number" })}
            </div><small className="sp-note">The current payroll engine interprets Daily Wages as a per-trip rate, not a guaranteed per-day rate.</small></Card>
            <Card title="Overtime" icon="clock"><div className="sp-fields">
              <FieldView f={{ name: "overtime_rate", label: "Overtime Rate (per hour)", icon: "coin", type: "number", placeholder: "₹ 100" }} value={p.overtime_rate ?? 100} editing={editing} set={setPath("overtime_rate")} />
            </div></Card>
            {ruleCard("Bonuses", "gift", "bonus")}
            {ruleCard("Deductions", "trendingDown", "deduction")}
            <p className="sp-note">Bonus, deduction and overtime policies are saved with staff settings but are not applied automatically to payroll calculations by the current backend.</p>
          </>}
          {tab === "bank" && <div className="sp-form-card sp-bank-fields"><div className="sp-card-main"><div className="sp-fields">
            {PF({ name: "bank.account_name", label: "Account Holder Name", icon: "user", placeholder: "Name as per bank account" })}
            {PF({ name: "bank.bank_name", label: "Bank Name", icon: "building", placeholder: "e.g. State Bank of India" })}
            {PF({ name: "bank.branch", label: "Branch", icon: "pin", placeholder: "e.g. MG Road, Bangalore" })}
            {PF({ name: "bank.account_number", label: "Account Number", icon: "hash", placeholder: "9-18 digit account number" })}
            {PF({ name: "bank.ifsc", label: "IFSC Code", icon: "bank", placeholder: "e.g. SBIN0001234" })}
            {PF({ name: "bank.upi", label: "UPI ID", icon: "at", placeholder: "e.g. name@ybl" })}
          </div></div></div>}
          {tab === "ledger" && (!record ? <div className="sp-empty">No payroll ledger entries found.</div> : !ledger ? <div className="sp-empty">Loading staff ledger…</div> : (
            <div className="sp-ledger">
              <div className="sp-kpis">{([["Earned", ledger.total_credits, "wallet", "green"], ["Paid / advanced", ledger.total_debits, "cash", "orange"], ["Balance", ledger.balance, "book", "blue"]] as const).map(([l, v, ic, tone]) => (
                <div key={l} className={`sp-kpi ${tone}`}><div className="sp-kpi-icon"><I n={ic} s={23} /></div><div><strong>{inr(v)}</strong><small>{l}</small></div></div>))}</div>
              <div className="sp-table-shell"><table className="sp-ledger-table"><thead><tr>{["DATE", "TYPE", "NOTE", "CREDIT", "DEBIT", "BALANCE"].map((x) => <th key={x}>{x}</th>)}</tr></thead>
                <tbody>{ledger.entries.length ? ledger.entries.slice().reverse().map((r, i) => (
                  <tr key={i}><td>{fdate(r.date)}</td><td>{r.kind}</td><td>{r.note}</td><td className="sp-green">{r.credit ? inr(r.credit) : "—"}</td><td className="sp-red">{r.debit ? inr(r.debit) : "—"}</td><td><b>{inr(r.balance)}</b></td></tr>))
                  : <tr><td colSpan={6} className="sp-empty">No payroll ledger entries found.</td></tr>}</tbody></table></div>
            </div>))}
          {tab === "docs" && <>
            <p className="sp-doc-hint">PDF, JPG, PNG or WEBP, up to 10 MB each. Uploads are saved immediately.</p>
            <div className="sp-document-list">{DOC_TYPES.map(([key, label, ic, color]) => {
              const m = (docs ?? []).filter((x) => x.document_type.toUpperCase() === key).at(-1);
              return (
                <div key={key} className="sp-document"><span className={`sp-document-icon ${color}`}><I n={ic} s={25} /></span>
                  <span className="sp-doc-name"><strong>{label}</strong><small>{m ? `${m.file_name || "Record saved"} · ${m.expiry_date ? fdate(m.expiry_date) : "No expiry"}` : "Not uploaded"}</small></span>
                  <div className="sp-doc-actions">
                    {m?.has_file && <button type="button" className="sp-btn outline" data-doc-download={m.id} onClick={() => void download(m)}><I n="download" s={18} /> View</button>}
                    {editing && <button type="button" className="sp-btn outline" data-doc-upload={key} onClick={() => upload(key)}><I n="upload" s={18} /> {m ? "Replace" : "Upload"}</button>}
                  </div></div>
              );
            })}</div>
            {!record && <p className="sp-note">Save this staff record before uploading documents.</p>}
          </>}
        </div>
        <footer className="sp-modal-footer">
          <button type="button" className="sp-btn text" data-modal-close onClick={onClose}><I n="close" s={18} /> Cancel</button>
          {editing
            ? <button type="button" className="sp-btn primary" data-modal-save onClick={() => void save()}><I n="check" /> Save Changes</button>
            : <button type="button" className="sp-btn primary" data-modal-edit disabled={!canModify} onClick={() => setEditing(true)}><I n="pencil" /> Edit Staff</button>}
        </footer>
      </section>
    </div>
  );
}

export function StaffPage({ me }: { me: Me }) {
  const canModify = OPS.includes(me.role);
  const [list, setList] = useState<Staff[]>();
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState(""); const [role, setRole] = useState(""); const [status, setStatus] = useState("all"); const [asc, setAsc] = useState(true);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [editor, setEditor] = useState<{ r: Staff | null; edit: boolean }>();
  const load = useCallback(async () => { try { setList(await api.staff()); setError(undefined); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }, []);
  useEffect(() => { void load(); }, [load]);
  const rows = useMemo(() => (list ?? []).filter((s) => {
    const t = `${s.name} ${s.phone} ${s.email ?? ""}`.toLowerCase();
    return (!query || t.includes(query.toLowerCase())) && (!role || s.role === role) && (status === "all" || (s.status || "active") === status);
  }).sort((a, b) => a.name.localeCompare(b.name) * (asc ? 1 : -1) || a.id - b.id), [list, query, role, status, asc]);
  const setStat = async (ids: number[], st: string) => {
    for (const id of ids) { const s = list!.find((x) => x.id === id)!; await api.saveStaff({ ...s, status: st }, id); }
  };
  const bulk = async (st: string) => {
    if (!canModify) return toast("Permission required", "bad");
    const ids = [...sel];
    if (!(await confirmDialog(`${st === "inactive" ? "Deactivate" : "Activate"} ${ids.length} staff members?`))) return;
    try { await setStat(ids, st); setSel(new Set()); await load(); } catch (e) { toastError(e); }
  };
  if (error) return <main className="sp-root sp-list-page"><div className="sp-empty" role="alert">Unable to load Staff · {error}. <a href="#/fleet/staff" onClick={() => void load()}>Retry</a></div></main>;
  if (!list) return <main className="sp-root sp-list-page"><div className="sp-empty">Loading…</div></main>;
  const allSel = rows.length > 0 && rows.every((s) => sel.has(s.id));
  return (
    <main className="sp-root sp-list-page">
      <div className="sp-staff-top"><SubNav tab="staff" />{canModify && <button type="button" className="sp-btn primary" data-add-staff onClick={() => setEditor({ r: null, edit: true })}><I n="plus" /> Add Staff</button>}</div>
      <div className="sp-filter-bar">
        <label className="sp-search"><I n="search" /><input data-search-staff placeholder="Search by name, phone, email..." value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        <label className="sp-filter ui-dd-hosted"><NiceSelect name="role" data-role-filter value={role} onChange={setRole} options={[["", "All Role"], ...ROLES]} /></label>
        <label className="sp-filter ui-dd-hosted"><NiceSelect name="status" data-status-filter value={status} onChange={setStatus} options={[["all", "All Status"], ["active", "Active"], ["inactive", "Inactive"]]} /></label>
        <span className="sp-result-count" data-staff-count>{rows.length} Staff</span>
      </div>
      <div className="sp-bulk" data-bulk hidden={!sel.size}><span data-bulk-count>{sel.size} selected</span>
        <button type="button" className="sp-btn outline" data-bulk-act="active" onClick={() => void bulk("active")}>Activate selected</button>
        <button type="button" className="sp-btn danger" data-bulk-act="inactive" onClick={() => void bulk("inactive")}>Deactivate selected</button></div>
      <div className="sp-table-shell"><table className="sp-staff-table">
        <thead><tr>
          <th><input type="checkbox" data-all-select aria-label="Select visible staff" checked={allSel} onChange={(e) => { const n = new Set(sel); rows.forEach((s) => (e.target.checked ? n.add(s.id) : n.delete(s.id))); setSel(n); }} /></th>
          <th><I n="user" s={19} /> NAME <button data-sort-name className="sp-sort" aria-label="Sort names" onClick={() => setAsc(!asc)}>↑</button></th>
          <th><I n="clipboard" s={19} /> ROLE</th><th><I n="phone" s={19} /> PHONE</th><th><I n="drop" s={19} /> BLOOD<br />GROUP</th>
          <th><I n="calendar" s={19} /> JOINING<br />DATE</th><th><I n="checkCircle" s={19} /> STATUS</th><th>ACTIONS</th>
        </tr></thead>
        <tbody data-staff-rows>
          {rows.length ? rows.map((s) => {
            const active = (s.status || "active").toLowerCase() === "active", helper = /helper|conductor|cleaner/.test(s.role || "");
            const initial = (s.name || "?").trim().split(/\s+/).map((x) => x[0] || "").slice(0, 2).join("").toUpperCase();
            const toggleOne = async () => {
              if (!canModify) return toast("Permission required", "bad");
              try { await setStat([s.id], active ? "inactive" : "active"); await load(); } catch (e) { toastError(e); }
            };
            return (
              <tr key={s.id} data-staff-id={s.id} className={active ? "" : "inactive"}>
                <td><input type="checkbox" data-select={s.id} aria-label={`Select ${s.name}`} checked={sel.has(s.id)} onChange={(e) => { const n = new Set(sel); e.target.checked ? n.add(s.id) : n.delete(s.id); setSel(n); }} /></td>
                <td><div className="sp-person"><span className={`sp-avatar ${helper ? "helper" : ""}`}>{initial}</span><strong>{s.name}</strong></div></td>
                <td><span className={`sp-role ${helper ? "helper" : ""}`}><i></i>{cleanRole(s.role)}</span></td>
                <td>{s.phone || "—"}</td>
                <td className="sp-muted">{s.bloodGroup || "—"}</td>
                <td className="sp-muted">{s.joiningDate ? fdate(s.joiningDate) : "—"}</td>
                <td><button type="button" className={`sp-status ${active ? "on" : ""}`} data-switch={s.id} role="switch" aria-checked={active} aria-label={`${active ? "Deactivate" : "Activate"} ${s.name}`} onClick={() => void toggleOne()}><i></i></button><span className="sp-status-label">{active ? "Active" : "Inactive"}</span></td>
                <td><div className="sp-row-actions">
                  <button type="button" className="sp-action view" data-action="view" title={`View ${s.name}`} aria-label={`View ${s.name}`} onClick={() => setEditor({ r: s, edit: false })}><I n="eye" s={21} /></button>
                  {canModify && <button type="button" className="sp-action edit" data-action="edit" title={`Edit ${s.name}`} aria-label={`Edit ${s.name}`} onClick={() => setEditor({ r: s, edit: true })}><I n="pencil" s={21} /></button>}
                  {canModify && <button type="button" className="sp-action delete" data-action="delete" title={`Deactivate ${s.name}`} aria-label={`Deactivate ${s.name}`} onClick={async () => {
                    if (await confirmDialog(`Deactivate ${s.name}? Their historical duties and payments will remain.`, { danger: true })) { try { await setStat([s.id], "inactive"); await load(); } catch (e) { toastError(e); } }
                  }}><I n="trash" s={21} /></button>}
                </div></td>
              </tr>
            );
          }) : <tr><td colSpan={8} className="sp-empty">No staff match these filters.</td></tr>}
        </tbody>
      </table></div>
      {editor && <Editor record={editor.r} editing={editor.edit} canModify={canModify} onClose={() => setEditor(undefined)} onSaved={() => void load()} />}
    </main>
  );
}
