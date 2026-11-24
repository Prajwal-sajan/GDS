import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type Me, type Staff } from "../../api";
import { confirmDialog, toast, toastError } from "../../components/ui/feedback";
import { NiceSelect } from "../../components/ui/NiceSelect";

// React port of legacy GDS → Staff (public/js/staff-parity-v11.js: staffPage(), listHeader(), staffRow(), openEditor()).
// Same DOM + class names so the vendored staff-parity-v11.css renders identically.
// Fields the .NET backend does not persist (address, emergency contact, Aadhaar, PAN, employment type, bank, retention,
// overtime, bonus/deduction rules, ledger, documents) are shown disabled with an explanation — never faked.
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
};
const I = ({ n, s = 20 }: { n: string; s?: number }) => (
  <svg className="sp-icon" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: P[n] ?? P.user }} />
);
const ROLES: [string, string][] = [["driver", "Driver"], ["helper", "Helper / Attendant"], ["conductor", "Conductor"], ["cleaner", "Cleaner"], ["pickup_driver", "Pickup Driver"], ["manager", "Manager"], ["office", "Office Staff"]];
const NAV: [string, string, string][] = [["staff", "Staff", "users"], ["attendance", "Attendance", "calendar"], ["advances", "Advances", "wallet"], ["reimbursements", "Reimbursements", "receipt"], ["payouts", "Payouts", "cash"]];
const TABS: [string, string, string][] = [["personal", "Personal Info", "user"], ["payables", "Payables", "wallet"], ["bank", "Bank Details", "bank"], ["ledger", "Ledger", "book"], ["docs", "Documents", "file"]];
const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const NP = "Not stored by the modern backend yet (see UI_MIGRATION_GAPS.md)";
const OPS = ["owner", "admin", "ops"];
const cleanRole = (x: string) => ROLES.find((r) => r[0] === x)?.[1] ?? String(x || "Staff").replace(/_/g, " ");
const fdate = (s?: string | null) => (s ? new Date(`${s.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");

export function SubNav({ tab }: { tab: string }) {
  return <nav className="sp-subnav" aria-label="Staff sections">{NAV.map(([id, label, ic]) => <a key={id} className={`sp-subpill ${tab === id ? "active" : ""}`} href={`#/fleet/${id}`}><I n={ic} /> {label}</a>)}</nav>;
}

type Field = { name: keyof Staff | string; label: string; icon: string; type?: string; options?: [string, string][]; required?: boolean; wide?: boolean; placeholder?: string; np?: boolean; max?: number };
function FieldView({ f, value, editing, set }: { f: Field; value: unknown; editing: boolean; set: (v: string) => void }) {
  const v = value == null ? "" : String(value);
  const dis = !editing || f.np;
  const common = { name: f.name, disabled: dis, title: f.np ? NP : undefined, onChange: (e: { target: { value: string } }) => set(e.target.value) };
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
    if (Number(d.salaryAmount) < 0) return toast("Rates cannot be negative", "bad");
    try {
      await api.saveStaff({ ...d, email: d.email ?? "", bloodGroup: d.bloodGroup ?? "", joiningDate: d.joiningDate || null, licenseNumber: d.licenseNumber || null, licenseExpiry: d.licenseExpiry || null }, record?.id);
      toast(record ? "Staff changes saved" : "Staff added", "ok"); onClose(); onSaved();
    } catch (e) { toastError(e); }
  };
  const F = (f: Field) => <FieldView key={String(f.name)} f={f} value={(d as Record<string, unknown>)[String(f.name)]} editing={editing} set={set(String(f.name))} />;
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
              {F({ name: "address", label: "Address", icon: "pin", wide: true, placeholder: "Street address, city, state", np: true })}
              {F({ name: "bloodGroup", label: "Blood Group", icon: "drop", type: "select", options: [["", "Select blood group"], ...BLOOD.map((x) => [x, x] as [string, string])] })}
              {F({ name: "emergencyName", label: "Emergency Contact Name", icon: "user", placeholder: "Contact name", np: true })}
              {F({ name: "emergencyPhone", label: "Emergency Contact Phone", icon: "phone", placeholder: "10-digit phone", np: true })}
              {F({ name: "aadhaar", label: "ID / Aadhar Number", icon: "finger", placeholder: "12-digit Aadhaar number", np: true })}
              {F({ name: "pan", label: "PAN Number", icon: "id", placeholder: "e.g. ABCDE1234F", np: true })}
              {F({ name: "joiningDate", label: "Date of Joining", icon: "calendar", type: "date" })}
              {F({ name: "employmentType", label: "Employment Type", icon: "users", type: "select", options: [["", "Select type"], ["Full-time", "Full-time"], ["Part-time", "Part-time"], ["Contract", "Contract"]], np: true })}
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
              {F({ name: "retention", label: "Retention per day (₹)", icon: "wallet", type: "number", np: true })}
            </div><small className="sp-note">The current payroll engine interprets Daily Wages as a per-trip rate, not a guaranteed per-day rate.</small></Card>
            <p className="sp-note">Overtime, bonus and deduction policies: {NP}.</p>
          </>}
          {["bank", "ledger", "docs"].includes(tab) && <div className="sp-empty" data-not-persisted>{TABS.find((t) => t[0] === tab)?.[1]}: {NP}.</div>}
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
