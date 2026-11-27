import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api";
import { confirmDialog, toast, toastError } from "../../components/ui/feedback";
import { NiceSelect } from "../../components/ui/NiceSelect";

// Settings → Team & access (`#/settings/team-access/<tab>/<access>/<role>`). Native React port of legacy
// team-access-v26 (users, branches, dialogs), v27 (roles matrix), v28 (test access, groups, rule builder) and v29
// (typed Situation fields). Markup/classes (ta26-*, ta27-*, ta28-*, ta29-*) are kept 1:1 for the vendored CSS.

const API = "/team-access/v26";
const V28 = "/team-access/v28";

/* ---------------- types ---------------- */
interface TUser {
  id: number; name?: string; phone?: string; role: string; status?: string; email?: string; language?: string; branch_id?: number | string | null;
  last_login?: string; login_count?: number; created_at?: string; staff_only?: boolean; agent_category?: string; mode?: string; agent_type?: string;
  master_agent_id?: number | string | null; limit_routes?: boolean; route_ids?: number[]; extra_permissions?: string[]; denied_permissions?: string[];
  corridor_tags?: string[]; commission_pct?: number; credit_limit?: number;
}
interface Branch { id: number; name: string; code?: string; city?: string; city_id?: number | null; phone?: string; address?: string; operations_area?: string; operation_city_ids?: number[]; operation_route_ids?: number[] }
interface Role { key: string; name: string; permissions?: string[]; matrix_v27?: Record<string, string>; scopes?: Record<string, string>; ui_permissions?: Record<string, boolean>; limits?: Record<string, number | null> }
interface MatrixRow { key: string; label: string; code?: string; kind: "scope" | "toggle"; roleImpossible?: string[]; limit?: string | null; choices?: string[] }
interface MatrixSection { title: string; rows: MatrixRow[] }
interface TeamData {
  users: TUser[]; staff?: TUser[]; branches: Branch[]; roles: Role[]; catalog?: Record<string, string[]>; routes: { id: number; name: string }[];
  cities: { id: number; name: string }[]; matrix: MatrixSection[]; role_columns: [string, string][]; role_descriptions: Record<string, string>;
  role_hues?: Record<string, string>; matrix_revision?: number; matrix_limit_fields?: Record<string, { max?: number }>;
  grants: { manage_users?: boolean; manage_roles?: boolean; manage_branches?: boolean };
}
type Kind = "office-staff" | "bus-staff" | "agents";
type Values = Record<string, string>;

/* ---------------- icons ---------------- */
const P: Record<string, ReactNode> = {
  chevronDown: <path d="M6 9l6 6 6-6" />, check: <path d="M5 13l4 4L19 7" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18" /></>,
  settings: <><path d="M12 8.4A3.6 3.6 0 1112 15.6 3.6 3.6 0 0112 8.4z" /><path d="M4.6 12a7.7 7.7 0 01.1-1.2l-2-1.6 2-3.5 2.4.8a8.5 8.5 0 012-1.2l.4-2.5h4l.4 2.5a8.5 8.5 0 012 1.2l2.4-.8 2 3.5-2 1.6c.1.4.1.8.1 1.2s0 .8-.1 1.2l2 1.6-2 3.5-2.4-.8a8.5 8.5 0 01-2 1.2l-.4 2.5h-4l-.4-2.5a8.5 8.5 0 01-2-1.2l-2.4.8-2-3.5 2-1.6c-.1-.4-.1-.8-.1-1.2z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  users: <><path d="M16 19a4 4 0 00-8 0" /><circle cx="12" cy="8" r="4" /><path d="M20 19a4 4 0 00-3-3.87M4 19a4 4 0 013-3.87" /></>,
  bus: <><rect x="4" y="6" width="16" height="10" rx="2" /><path d="M4 12h16M8 16v2M16 16v2M7.5 18a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z" /></>,
  agent: <><path d="M17 7l-5-4-5 4v10l5 4 5-4z" /><path d="M12 8v8M8.5 10h7" /></>,
  building: <path d="M4 20h16M6 20V8l6-4 6 4v12M9 10h1M9 13h1M9 16h1M14 10h1M14 13h1M14 16h1" />,
  key: <path d="M15 7a4 4 0 11-3.9 5H4l-2 2 2 2 2-2h2l2-2h1.1A4 4 0 0115 7z" />,
  eye: <><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z" /><circle cx="12" cy="12" r="3" /></>,
  edit: <><path d="M4 20l4.5-1 9.1-9.1a2 2 0 00-2.8-2.8L5.7 16.2 4 20z" /><path d="M13.5 5.5l3 3" /></>,
  trash: <path d="M4 7h16M9 7V4h6v3M7 7v12a2 2 0 002 2h6a2 2 0 002-2V7M10 11v6M14 11v6" />,
  phone: <path d="M15.8 15.4c-2.2 2.2-6.4-2-8.6-4.2S.8 4.8 3 2.6c.8-.8 2-.8 2.8 0L8.3 5A2 2 0 018.8 7l-1.3 2a11.3 11.3 0 007.2 7.2l2-1.3a2 2 0 012 .5l2.4 2.4c.8.8.8 2 0 2.8-1.2 1.2-3.7 1.5-5.3-.2z" />,
  shield: <path d="M12 3l7 3v5c0 5-3.6 8.3-7 10-3.4-1.7-7-5-7-10V6l7-3z" />,
  activity: <path d="M3 12h4l2-4 3 8 3-6h6" />, clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  more: <><circle cx="6" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18" cy="12" r="1.6" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />, mail: <><path d="M4 6h16v12H4z" /><path d="M4 8l8 6 8-6" /></>,
  calendar: <path d="M7 3v4M17 3v4M4 8h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 10v5" /><circle cx="12" cy="7.5" r=".7" fill="currentColor" stroke="none" /></>,
};
const CUSTOM: Record<string, ReactNode> = { plus: <path d="M12 5v14M5 12h14" />, play: <><circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4z" /></>, chevronRight: <path d="m9 5 7 7-7 7" /> };
function Icon({ k }: { k: string }) {
  if (CUSTOM[k]) return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{CUSTOM[k]}</svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{P[k] ?? P.info}</svg>;
}
const Svg28 = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d={d} /></svg>;
const PLUS28 = "M12 5v14M5 12h14", PLAY28 = "m8 5 12 7-12 7z";

/* ---------------- helpers ---------------- */
const TABS: [string, string, string][] = [["office-staff", "Office staff", "users"], ["bus-staff", "Bus staff", "bus"], ["agents", "Agents", "agent"], ["branches", "Branches", "building"], ["access", "Access", "key"]];
const LANGUAGES = ["English", "Hindi", "Kannada", "Tamil", "Telugu", "Malayalam", "Marathi", "Bengali", "Gujarati", "Punjabi", "Odia", "Assamese", "Urdu"];
const BUS_ROLES = ["driver", "helper", "conductor", "pickup_manager"];
const link = (t: string, extra = "") => `#/settings/team-access/${t}${extra ? "/" + extra : ""}`;
const fmtTime = (x?: string) => { if (!x) return "—"; const d = new Date(x); return Number.isNaN(+d) ? "—" : d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); };
const initials = (x?: string) => (String(x || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w.charAt(0)).join("") || "?").toUpperCase();
const digits10 = (p?: string) => String(p ?? "").replace(/\D/g, "").slice(-10);
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const formValues = (f: HTMLFormElement): Values => Object.fromEntries([...new FormData(f).entries()].map(([k, v]) => [k, String(v)]));

function useTeam(data: TeamData) {
  return useMemo(() => {
    const roleName = (k?: string) => data.roles.find((r) => r.key === k)?.name || k?.replaceAll("_", " ") || "Staff";
    const hue = (k: string) => data.role_hues?.[k] || "#6366f1";
    return { roleName, hue };
  }, [data]);
}
function categories(data: TeamData): Record<Kind, TUser[]> {
  const office = data.users.filter((u) => !["agent", ...BUS_ROLES].includes(u.role));
  const bus = data.users.filter((u) => BUS_ROLES.includes(u.role));
  const extra = (data.staff ?? []).filter((s) => !bus.some((u) => digits10(u.phone) === digits10(s.phone))).map((s) => ({ ...s, staff_only: true }));
  return { "office-staff": office, "bus-staff": [...bus, ...extra], agents: data.users.filter((u) => u.role === "agent") };
}

/* ---------------- form controls ---------------- */
function Field({ name, label, value = "", type = "text", required, placeholder = "", readOnly, maxLength, pattern, className = "" }: { name: string; label: string; value?: string | number; type?: string; required?: boolean; placeholder?: string; readOnly?: boolean; maxLength?: number; pattern?: string; className?: string }) {
  return (
    <label className={`ta26-field ${className}`}><span>{label}{required && <i> *</i>}</span>
      <input name={name} type={type} defaultValue={String(value ?? "")} placeholder={placeholder} required={required} readOnly={readOnly} maxLength={maxLength} pattern={pattern} /></label>
  );
}
/** ta26 select with the legacy nice dropdown; uncontrolled from the parent's point of view. */
function Select({ name, label, options, value, required, onChange }: { name: string; label: string; options: [string, string][]; value: string; required?: boolean; onChange?: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <label className="ta26-field ta26-select ui-dd-hosted"><span>{label}{required && <i> *</i>}</span>
      <NiceSelect data-nice name={name} title={label} value={v} options={options} onChange={(x) => { setV(x); onChange?.(x); }} /></label>
  );
}
function Hidden({ name, value }: { name: string; value: string }) { return <input type="hidden" name={name} value={value} readOnly />; }

/* ---------------- dialog ---------------- */
function TaModal({ title, header, action = "Save", onSave, wide, onClose, editFirst, children }: {
  title: string; header?: ReactNode; action?: string; wide?: boolean; editFirst?: boolean; onClose: () => void;
  onSave?: ((v: Values, form: HTMLFormElement) => Promise<boolean | void>) | null; children: ReactNode;
}) {
  const shade = useRef<HTMLDivElement>(null);
  const [z] = useState(() => 400 + document.querySelectorAll(".ta26-shade").length * 10);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && [...document.querySelectorAll(".ta26-shade")].at(-1) === shade.current) { e.preventDefault(); onClose(); } };
    document.addEventListener("keydown", k);
    shade.current?.querySelector<HTMLElement>("input:not([type=hidden]),select:not(.ui-dd-native),textarea,.ui-dd-btn")?.focus({ preventScroll: true });
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!onSave) return;
    const f = e.currentTarget;
    if (!f.reportValidity()) return;
    setBusy(true);
    try { const ok = await onSave(formValues(f), f); if (ok !== false) onClose(); } catch (ex) { toastError(ex); } finally { setBusy(false); }
  };
  const save = onSave ? <button key="s" type="submit" className="ta26-primary" disabled={busy}><Icon k="check" /> {action}</button> : null;
  const cancel = <button key="c" type="button" className="ta26-cancel" onClick={onClose}>{onSave && !editFirst ? "Cancel" : "Close"}</button>;
  return createPortal(
    <div ref={shade} className="ta26-shade" style={{ zIndex: z }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className={`ta26-dialog ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="ta26-dialog-head">{header ?? <><span className="ta26-head-icon"><Icon k="edit" /></span><h2>{title}</h2></>}
          <button type="button" className="ta26-x" aria-label="Close dialog" onClick={onClose}><Icon k="close" /></button></header>
        <form className="ta26-dialog-form" onSubmit={(e) => void submit(e)}>
          <div className="ta26-dialog-scroll">{children}</div>
          <footer className="ta26-dialog-foot">{editFirst ? <>{save}{cancel}</> : <>{cancel}{save}</>}</footer>
        </form>
      </section>
    </div>, document.body);
}

/* ---------------- users ---------------- */
function RolePreview({ data, role }: { data: TeamData; role: string }) {
  const { roleName } = useTeam(data);
  const p = data.roles.find((x) => x.key === role)?.permissions ?? [];
  return (
    <div className="ta26-role-preview"><div>{data.role_descriptions[role] || roleName(role)}</div>
      <div className="ta26-capabilities">{p.slice(0, 5).map((x) => <small key={x}>{x.replaceAll(".", " ")}</small>)}{p.length > 5 && <span>+{p.length - 5} more</span>}</div></div>
  );
}
function ChoiceCards({ name, items, value, onChange }: { name: string; items: [string, string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <section className="ta26-choice"><h4>{name === "agent_category" ? "Type" : "Mode"}</h4><Hidden name={name} value={value} />
      <div className="ta26-choice-row">{items.map(([k, t, s]) => (
        <button key={k} type="button" className={value === k ? "selected" : ""} onClick={() => onChange(k)}><strong>{t}</strong><small>{s}</small></button>
      ))}</div>
      {name === "mode" && <p className="ta26-help"><b>Online</b> by default — they have a login. The mode determines which default commission applies; set rates in Accounts → Agent Settings.</p>}
    </section>
  );
}
interface RouteGrant { limit_routes: boolean; route_ids: number[]; extra_permissions: string[]; denied_permissions: string[]; corridor_tags: string[] }

function RouteModal({ data, user, grant, onClose, onDone }: { data: TeamData; user: TUser; grant: RouteGrant; onClose: () => void; onDone: (g: RouteGrant) => void }) {
  const [limit, setLimit] = useState(grant.limit_routes);
  const [routes, setRoutes] = useState(() => new Set(grant.route_ids.map(Number)));
  const [extra, setExtra] = useState(() => new Set(grant.extra_permissions));
  const [denied, setDenied] = useState(() => new Set(grant.denied_permissions));
  const codes = Object.values(data.catalog ?? {}).flat();
  const flip = (set: Set<string>, code: string, on: boolean) => { const n = new Set(set); if (on) n.add(code); else n.delete(code); return n; };
  return (
    <TaModal title={user.name || "Permissions & routes"} header={<div><h2>{user.name || "New user"}</h2><p>Permissions & routes</p></div>} wide onClose={onClose}
      onSave={async (v) => {
        const route_ids = data.routes.filter((r) => routes.has(Number(r.id))).map((r) => Number(r.id));
        if (limit && !route_ids.length) throw new Error("Select at least one route to limit access");
        const extra_permissions = codes.filter((c) => extra.has(c)), denied_permissions = codes.filter((c) => denied.has(c));
        const overlap = extra_permissions.find((x) => denied_permissions.includes(x));
        if (overlap) throw new Error("Cannot allow and deny " + overlap);
        const corridor_tags = [...new Set((v.corridor_tags || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean))];
        if (corridor_tags.length > 20 || corridor_tags.some((x) => !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(x)))
          throw new Error("Enter up to 20 corridor tags using letters, numbers, underscores and hyphens");
        onDone({ limit_routes: limit, route_ids: limit ? route_ids : [], extra_permissions, denied_permissions, corridor_tags });
      }}>
      <div className="ta26-subtitle">ROUTES</div>
      <div className="ta26-option-row"><b>Limit to chosen routes</b>
        <div className="ta26-toggle-pair"><Hidden name="limit_routes" value={limit ? "yes" : "no"} />
          <button type="button" className={!limit ? "selected" : ""} onClick={() => setLimit(false)}>No</button>
          <button type="button" className={limit ? "selected" : ""} onClick={() => setLimit(true)}>Yes</button></div></div>
      <p className="ta26-help">Same routes as their branch (or every route) unless limited here.</p>
      <div hidden={!limit}><div className="ta26-route-checks">
        {data.routes.length ? data.routes.map((x) => (
          <label key={x.id} className="ta26-check"><input type="checkbox" checked={routes.has(Number(x.id))} onChange={(e) => { const on = e.currentTarget.checked; setRoutes((s) => { const n = new Set(s); if (on) n.add(Number(x.id)); else n.delete(Number(x.id)); return n; }); }} /> {x.name}</label>
        )) : <p>No routes available. Create routes before applying a restriction.</p>}
      </div></div>
      <label className="ta26-field ta28-user-corridors"><span>Corridor tags (for route-specific seat-block rules)</span>
        <input name="corridor_tags" maxLength={600} defaultValue={grant.corridor_tags.join(", ")} placeholder="e.g. mangaluru, coastal" /></label>
      <p className="ta26-help">Enter route tags separated by commas. Advanced corridor rules require one of these to match a route tag.</p>
      <details className="ta26-advanced-perms"><summary>Individual permission overrides</summary>
        <p>Only use when this person needs a specific exception to the role. Deny takes precedence over Allow.</p>
        <div className="ta26-perm-list">{codes.map((code) => (
          <div key={code} className="ta26-permission-row"><span>{code}</span>
            <label><input type="checkbox" checked={extra.has(code)} onChange={(e) => { const on = e.currentTarget.checked; setExtra((s) => flip(s, code, on)); if (on) setDenied((s) => flip(s, code, false)); }} /> Allow</label>
            <label><input type="checkbox" checked={denied.has(code)} onChange={(e) => { const on = e.currentTarget.checked; setDenied((s) => flip(s, code, on)); if (on) setExtra((s) => flip(s, code, false)); }} /> Deny</label></div>
        ))}</div></details>
      <p className="ta26-signout">They will be signed out to apply this. Route restrictions need enforcement at every applicable domain endpoint before production use.</p>
    </TaModal>
  );
}

function UserEditor({ data, user, kind, onClose, done }: { data: TeamData; user: TUser | null; kind: Kind; onClose: () => void; done: () => Promise<void> }) {
  const existing = !!user && !user.staff_only;
  const agent = kind === "agents";
  const u = useMemo(() => {
    const x: TUser = { ...(user ?? { id: 0, role: "" }) };
    x.role ||= agent ? "agent" : kind === "bus-staff" ? "driver" : "manager";
    return { ...x, name: x.name || "", phone: x.phone || "", language: x.language || "English", agent_category: x.agent_category || "agent", mode: x.mode || "Online", status: x.status || "ACTIVE" };
  }, [user, agent, kind]);
  const [grant, setGrant] = useState<RouteGrant>({ limit_routes: u.limit_routes ?? false, route_ids: u.route_ids ?? [], extra_permissions: u.extra_permissions ?? [], denied_permissions: u.denied_permissions ?? [], corridor_tags: u.corridor_tags ?? [] });
  const roles = data.roles.filter((x) => x.key !== "owner" || (data.grants.manage_users && data.users.some((v) => v.role === "owner")));
  const choice = agent ? roles.filter((x) => x.key === "agent") : kind === "bus-staff" ? roles.filter((x) => BUS_ROLES.includes(x.key)) : roles.filter((x) => !["driver", "helper", "conductor", "agent"].includes(x.key));
  const [role, setRole] = useState(choice.some((x) => x.key === u.role) ? u.role : choice[0]?.key || u.role);
  const [category, setCategory] = useState(u.agent_category);
  const [mode, setMode] = useState(u.mode);
  const offline = agent && mode === "Offline";
  const [status, setStatus] = useState(offline ? "INACTIVE" : u.status);
  const [routeOpen, setRouteOpen] = useState(false);
  const addLabel = kind === "bus-staff" ? "Add bus staff" : agent ? "Add agent" : "Add office staff";
  const pickMode = (m: string) => { setMode(m); if (agent && m === "Offline") setStatus("INACTIVE"); };
  return (
    <>
      <TaModal title={existing ? "Edit User" : addLabel} action={existing ? "Save" : addLabel} onClose={onClose} onSave={async (form) => {
        const payload = {
          ...form, category: kind, ...grant, role, master_agent_id: form.master_agent_id || null, name: form.name.trim() || form.phone,
          phone: form.phone.replace(/\D/g, ""), branch_id: form.branch_id || null, limit_routes: grant.limit_routes, route_ids: grant.route_ids,
        };
        if (existing) await api.admin(`${API}/users/${u.id}`, "PUT", payload); else await api.admin(`${API}/users`, "POST", payload);
        toast(existing ? "User updated; existing sessions signed out" : "User added", "ok");
        await done();
      }}>
        <p className="ta26-intro">{existing ? "" : "Drivers, managers and owners added here also appear under Staff (matched by phone), where bank and pay details can be completed."}</p>
        <Field name="phone" label="Phone Number" value={digits10(u.phone)} required placeholder="e.g., 9876543210" readOnly={existing} pattern="[6-9][0-9]{9}" />
        <Field name="name" label="Name" value={u.name} placeholder="Display name" />
        <Field name="email" label="Email" value={u.email || ""} type="email" placeholder="Optional" />
        <Select name="language" label="Language" options={LANGUAGES.map((x) => [x, x])} value={u.language} />
        <div className="ta26-divider"></div>
        <Select name="role" label="Role" options={choice.map((x) => [x.key, x.name])} value={role} required onChange={setRole} />
        <div><RolePreview data={data} role={role} /></div>
        {agent && <>
          <ChoiceCards name="agent_category" items={[["agent", "Agent", "Books on their own"], ["master_agent", "Master agent", "Has sub-agents who book under them"]]} value={category} onChange={setCategory} />
          <ChoiceCards name="mode" items={[["Online", "Online", "Logs in and books themselves"], ["Offline", "Offline", "Calls the branch; staff book On-Behalf"]]} value={mode} onChange={pickMode} />
          <Select name="agent_type" label="Settlement terms" options={[["postpaid", "Postpaid"], ["prepaid", "Prepaid"]]} value={u.agent_type || "postpaid"} />
          <Select name="master_agent_id" label="Under master agent" value={String(u.master_agent_id || "")}
            options={[["", "No master agent"], ...data.users.filter((a) => a.role === "agent" && a.agent_category === "master_agent" && a.id !== u.id).map((a): [string, string] => [String(a.id), a.name || ""])]} />
        </>}
        <Select name="branch_id" label="Branch" value={String(u.branch_id || "")} options={[["", "Organization-wide"], ...data.branches.map((b): [string, string] => [String(b.id), b.name])]} />
        <button type="button" className="ta26-perm-card" onClick={() => setRouteOpen(true)}>
          <span><b>Permissions & routes</b><small>{grant.limit_routes ? `${grant.route_ids.length} selected routes` : "Same as their role"}</small></span><Icon k="chevronRight" /></button>
        <div className="ta26-active"><div><b>Active</b><small>{offline ? "Sign-in disabled for offline agents" : "User can sign in"}</small></div>
          <Hidden name="status" value={status} />
          <button type="button" className={`ta26-switch ${status === "ACTIVE" ? "on" : ""}`} role="switch" aria-label="Active" aria-checked={status === "ACTIVE"} disabled={offline}
            onClick={() => setStatus((s) => (s === "ACTIVE" ? "INACTIVE" : "ACTIVE"))}></button></div>
      </TaModal>
      {routeOpen && <RouteModal data={data} user={{ ...u, role }} grant={grant} onClose={() => setRouteOpen(false)} onDone={setGrant} />}
    </>
  );
}

function ViewUser({ data, user, kind, onClose, onEdit }: { data: TeamData; user: TUser; kind: Kind; onClose: () => void; onEdit: () => void }) {
  const { roleName, hue } = useTeam(data);
  const color = kind === "agents" ? "#00ac91" : kind === "bus-staff" ? "#ff7900" : hue(user.role);
  const avatar = (large?: boolean) => <span className={`ta26-avatar${large ? " large" : ""}`} style={{ ["--avatar" as string]: color }}>{initials(user.name)}</span>;
  const chip = <span className="ta26-role-chip" style={{ ["--role" as string]: color }}>{roleName(user.role)}</span>;
  const info: [string, string, string][] = [
    ["phone", "PHONE", user.phone ? "+91 " + digits10(user.phone) : "—"], ["activity", "STATUS", user.status === "ACTIVE" ? "● Active" : "○ Inactive"],
    ["mail", "EMAIL", user.email || "—"], ["globe", "LANGUAGE", user.language || "English"], ["clock", "LAST LOGIN", fmtTime(user.last_login)],
    ["calendar", "ADDED", fmtTime(user.created_at)], ["shield", "PERMISSIONS", user.limit_routes ? `${user.route_ids?.length || 0} selected routes` : "Inherited from role"],
  ];
  return (
    <TaModal title="View User" editFirst onClose={onClose} action={user.staff_only ? "Create login" : "Edit"}
      header={<div className="ta26-header-user">{avatar()}<div><h2>{user.name}</h2>{chip}</div></div>}
      onSave={data.grants.manage_users ? async () => { onEdit(); return false; } : null}>
      <div className="ta26-view-hero">{avatar(true)}<div><strong>{user.name}</strong>{chip}</div></div>
      <div className="ta26-info-list">{info.map(([ico, label, value]) => (
        <div key={label}><span className="ta26-info-icon"><Icon k={ico} /></span><div><small>{label}</small><strong className={label === "STATUS" && user.status === "ACTIVE" ? "good" : ""}>{value}</strong></div></div>
      ))}</div>
    </TaModal>
  );
}

function UserTable({ data, rows, kind, query, onView, onEdit, done }: { data: TeamData; rows: TUser[]; kind: Kind; query: string; onView: (u: TUser) => void; onEdit: (u: TUser) => void; done: () => Promise<void> }) {
  const { roleName, hue } = useTeam(data);
  const [agentFor, setAgentFor] = useState<TUser | null>(null);
  const agent = kind === "agents", editable = !!data.grants.manage_users;
  if (!rows.length) return <div className="ta26-empty"><span><Icon k="users" /></span><h3>No {kind.replace("-", " ")} yet</h3><p>Use Add User to add your team.</p></div>;
  const titles = agent ? ["NAME", "PHONE", "TYPE", "MODE", "ACTIVE", "LAST LOGIN", "ACTIONS"] : ["NAME", "PHONE", "ROLE", "ACTIVE", "LAST LOGIN", "ACTIONS"];
  const icons = ["users", "phone", "shield", "globe", "activity", "clock", "more"];
  const del = async (u: TUser) => {
    if (!await confirmDialog(`Remove ${u.name} from active users? Their login will be revoked, and history retained.`, { danger: true, ok: "Remove user" })) return;
    try { await api.admin(`${API}/users/${u.id}`, "DELETE"); toast("User archived and sign-in revoked", "ok"); await done(); } catch (e) { toastError(e); }
  };
  const toggle = async (u: TUser) => {
    const next = u.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    if (next === "INACTIVE" && !await confirmDialog(`Deactivate ${u.name} and sign out their active sessions?`, { danger: true, ok: "Deactivate" })) return;
    try { await api.admin(`${API}/users/${u.id}`, "PUT", { status: next }); toast("User status updated", "ok"); await done(); } catch (e) { toastError(e); }
  };
  const q = query.trim().toLowerCase();
  return (
    <div className="ta26-tablewrap"><table className={`ta26-table ${agent ? "agent" : ""}`}>
      <thead><tr>{titles.map((s, i) => <th key={s}><span className="ta26-th"><Icon k={icons[agent ? i : i >= 3 ? i + 1 : i]} /> {s}</span></th>)}</tr></thead>
      <tbody>{rows.map((u) => {
        const active = u.status === "ACTIVE" || String(u.status).toLowerCase() === "active";
        const color = agent ? "#00aa95" : kind === "bus-staff" ? "#ff7600" : hue(u.role);
        const rowName = `${u.name || ""} ${u.phone || ""}`;
        const phone = u.phone ? "+91 " + digits10(u.phone).replace(/(\d{5})(\d{5})/, "$1 $2") : "—";
        return (
          <tr key={`${u.staff_only ? "s" : "u"}${u.id}`} data-row-name={rowName} hidden={!!q && !rowName.toLowerCase().includes(q)}>
            <td><div className="ta26-identity"><span className="ta26-avatar" style={{ ["--avatar" as string]: color }}>{initials(u.name)}</span>
              <div><strong className={!active ? "inactive" : ""}>{u.name}</strong>
                {agent ? <button type="button" className="ta26-agent-link" onClick={() => setAgentFor(u)}><Icon k="settings" /> Agent settings</button>
                  : u.staff_only ? <small>Staff record · no operator login</small> : null}</div></div></td>
            <td><span className="ta26-phone"><Icon k="phone" /> {phone}</span></td>
            <td><span className="ta26-role-chip" style={{ ["--role" as string]: color }}>{agent ? (u.agent_category === "master_agent" ? "Master agent" : "Agent") : roleName(u.role)}</span></td>
            {agent && <td><span className="ta26-mode">{u.mode || "Online"}</span></td>}
            <td><button type="button" className={`ta26-switch ${active ? "on" : ""}`} role="switch" aria-checked={active} aria-label={`Toggle ${u.name} status`}
              disabled={!(editable && !u.staff_only)} onClick={() => void toggle(u)}></button></td>
            <td className="ta26-last"><Icon k="clock" /> {fmtTime(u.last_login)}{u.login_count ? " · " + Number(u.login_count) : ""}</td>
            <td><div className="ta26-actions">
              <button type="button" aria-label={`View ${u.name}`} onClick={() => onView(u)}><Icon k="eye" /></button>
              <button type="button" aria-label={`Edit ${u.name}`} disabled={!editable} onClick={() => onEdit(u)}><Icon k="edit" /></button>
              <button type="button" className="danger" aria-label={`Delete ${u.name}`} disabled={!editable || u.staff_only} onClick={() => void del(u)}><Icon k="trash" /></button>
            </div></td>
          </tr>
        );
      })}</tbody>
    </table>
      {agentFor && (
        <TaModal title={`Agent settings · ${agentFor.name}`} onClose={() => setAgentFor(null)} onSave={async (f) => {
          await api.admin(`${API}/users/${agentFor.id}`, "PUT", { ...f, commission_pct: Number(f.commission_pct), credit_limit: Number(f.credit_limit) });
          toast("Agent settings saved", "ok"); await done();
        }}>
          <Field name="commission_pct" label="Commission (%)" value={agentFor.commission_pct || 0} type="number" />
          <Field name="credit_limit" label="Credit limit (₹)" value={agentFor.credit_limit || 0} type="number" />
          <Select name="agent_type" label="Settlement terms" options={[["postpaid", "Postpaid"], ["prepaid", "Prepaid"]]} value={agentFor.agent_type || "postpaid"} />
        </TaModal>
      )}
    </div>
  );
}

/* ---------------- branches ---------------- */
const OPS: [string, string][] = [["sales_only", "Sales only"], ["cities", "Cities"], ["routes", "Routes"], ["both", "Both"]];
function BranchEditor({ data, branch, onClose, done }: { data: TeamData; branch: Branch | null; onClose: () => void; done: () => Promise<void> }) {
  const [area, setArea] = useState(branch?.operations_area || "sales_only");
  const [cities, setCities] = useState(() => new Set((branch?.operation_city_ids ?? []).map(Number)));
  const [routes, setRoutes] = useState(() => new Set((branch?.operation_route_ids ?? []).map(Number)));
  const flip = (s: Set<number>, id: number, on: boolean) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; };
  const show = (k: string) => ["both", k].includes(area);
  return (
    <TaModal title={branch ? "Edit branch" : "New branch"} action={branch ? "Save branch" : "Create branch"} wide onClose={onClose} onSave={async (f) => {
      const payload = { ...f, code: f.code.toUpperCase(), city_id: f.city_id || null,
        operation_city_ids: data.cities.filter((c) => cities.has(Number(c.id))).map((c) => Number(c.id)),
        operation_route_ids: data.routes.filter((r) => routes.has(Number(r.id))).map((r) => Number(r.id)) };
      if (branch) await api.admin(`${API}/branches/${branch.id}`, "PUT", payload); else await api.admin(`${API}/branches`, "POST", payload);
      toast(branch ? "Branch updated" : "Branch created", "ok"); await done();
    }}>
      <div className="ta26-grid ta26-code-row">
        <Field name="code" label="Code" value={branch?.code || ""} required placeholder="BLR" maxLength={16} />
        <Field name="name" label="Name" value={branch?.name || ""} required placeholder="Bengaluru office" /></div>
      <div className="ta26-grid">
        <Select name="city_id" label="City" value={String(branch?.city_id || "")} options={[["", "Optional"], ...data.cities.map((c): [string, string] => [String(c.id), c.name])]} />
        <Field name="phone" label="Contact phone" value={branch?.phone || ""} placeholder="Optional" /></div>
      <Field name="address" label="Address" value={branch?.address || ""} placeholder="Optional" />
      <div className="ta26-divider"></div><h4>People</h4>
      <p className="ta26-help">A branch can have your own staff, Service Agents, or both. Add people in Manage Users and pick this branch. A Service Agent's routes are set on him (Edit user → Permissions & routes); the people who work under him are his team.</p>
      <div className="ta26-divider"></div><h4>Operations area</h4><Hidden name="operations_area" value={area} />
      <div className="ta26-segments">{OPS.map(([v, l]) => <button key={v} type="button" className={area === v ? "selected" : ""} onClick={() => setArea(v)}>{l}</button>)}</div>
      <p className="ta26-help">Sales always belong to the branch that sold them. The operations area decides which trips and tickets “Branch” permission covers: a city office runs trips stopping in its cities, a route team runs its routes. It never stops anyone from selling.</p>
      <div className="ta26-operations-fields" hidden={!show("cities")}><h4>Operating cities</h4><div className="ta26-check-grid">
        {data.cities.length ? data.cities.map((c) => <label key={c.id} className="ta26-check"><input type="checkbox" checked={cities.has(Number(c.id))} onChange={(e) => { const on = e.currentTarget.checked; setCities((s) => flip(s, Number(c.id), on)); }} /> {c.name}</label>) : <p>Add cities from Routes first.</p>}
      </div></div>
      <div className="ta26-operations-fields" hidden={!show("routes")}><h4>Operating routes</h4><div className="ta26-check-grid">
        {data.routes.length ? data.routes.map((r) => <label key={r.id} className="ta26-check"><input type="checkbox" checked={routes.has(Number(r.id))} onChange={(e) => { const on = e.currentTarget.checked; setRoutes((s) => flip(s, Number(r.id), on)); }} /> {r.name}</label>) : <p>Add routes first.</p>}
      </div></div>
    </TaModal>
  );
}

function Branches({ data, done }: { data: TeamData; done: () => Promise<void> }) {
  const [dialog, setDialog] = useState<{ kind: "view" | "edit"; branch: Branch | null } | null>(null);
  const can = !!data.grants.manage_branches;
  const people = (b: Branch) => data.users.filter((u) => String(u.branch_id) === String(b.id)).length;
  const del = async (b: Branch) => {
    if (!await confirmDialog(`Delete branch ${b.name}? Users must be moved out first.`, { danger: true, ok: "Delete branch" })) return;
    try { await api.admin(`${API}/branches/${b.id}`, "DELETE"); toast("Branch deleted", "ok"); await done(); } catch (e) { toastError(e); }
  };
  const close = () => setDialog(null);
  return (
    <>
      <div className="ta26-branch-intro"><p>An office or team. Users pinned to a branch can sell any trip; their bookings are accounted under the branch, and branch admins see only their branch's bookings and people.</p>
        <button className="ta26-primary" type="button" disabled={!can} onClick={() => setDialog({ kind: "edit", branch: null })}><Icon k="plus" /> New branch</button></div>
      {!data.branches.length
        ? <section className="ta26-empty branch"><span><Icon k="building" /></span><h3>No branches yet</h3><p>Everyone in this organization currently has org-wide access. Create a branch to start pinning users to an office.</p></section>
        : <div className="ta26-branch-list">{data.branches.map((b) => (
          <article key={b.id} className="ta26-branch-card">
            <div className="ta26-branch-head"><span className="ta26-tab-icon"><Icon k="building" /></span><div><strong>{b.name}</strong><small>{b.code || "—"} · {b.city || "Office"}</small></div></div>
            <p>{b.address || "No address added"}</p>
            <div className="ta26-branch-meta"><span>People: {people(b)}</span><span>Operations: {(b.operations_area || "sales_only").replaceAll("_", " ")}</span></div>
            <div className="ta26-actions">
              <button type="button" onClick={() => setDialog({ kind: "view", branch: b })}><Icon k="eye" /> View</button>
              <button type="button" disabled={!can} onClick={() => setDialog({ kind: "edit", branch: b })}><Icon k="edit" /> Edit</button>
              <button type="button" className="danger" disabled={!can} onClick={() => void del(b)}><Icon k="trash" /> Delete</button></div>
          </article>
        ))}</div>}
      {dialog?.kind === "edit" && <BranchEditor data={data} branch={dialog.branch} onClose={close} done={done} />}
      {dialog?.kind === "view" && dialog.branch && (() => {
        const b = dialog.branch;
        const rows: [string, string, string][] = [["building", "CODE", b.code || "—"], ["users", "PEOPLE", `${people(b)} team members`],
          ["globe", "CITY", data.cities.find((x) => String(x.id) === String(b.city_id))?.name || b.city || "—"], ["phone", "CONTACT", b.phone || "—"],
          ["building", "ADDRESS", b.address || "—"], ["shield", "OPERATIONS AREA", (b.operations_area || "sales_only").replaceAll("_", " ")]];
        return (
          <TaModal title={b.name} action="Edit branch" onClose={close} onSave={can ? async () => { setDialog({ kind: "edit", branch: b }); return false; } : null}>
            <div className="ta26-info-list">{rows.map(([i, l, v]) => <div key={l}><span className="ta26-info-icon"><Icon k={i} /></span><div><small>{l}</small><strong>{v}</strong></div></div>)}</div>
          </TaModal>
        );
      })()}
    </>
  );
}

/* ---------------- roles matrix (v27) ---------------- */
let matrixMode: "matrix" | "single" = "matrix";
let matrixFocus = "viewer";
const LEGACY_LABELS: Record<string, string> = {
  "Book tickets": "Book seats", "View schedules & seat layouts": "View services & seat layouts", "See who is booked on a schedule": "See who is booked on a service",
  "View income & expenses": "View a service's revenue", "Edit timings, coach & delay": "Edit services (timings, coach, bus & driver, delay)",
  "Switch schedules on / off": "Switch services on / off", "Create schedules / import trip sheets": "Create services / import trip sheets",
  "Delete schedules": "Delete services", "Edit general details (name, coach, settings, route map)": "Edit routes, fares, stops & route map",
};
function roleValue(role: Role, row: MatrixRow) {
  if (row.roleImpossible?.includes(role.key)) return "—";
  if (role.matrix_v27 && Object.hasOwn(role.matrix_v27, row.key)) return role.matrix_v27[row.key];
  const name = LEGACY_LABELS[row.label] || row.label;
  const scoped = role.scopes?.[row.label] ?? role.scopes?.[name];
  if (scoped && ["Off", "Own", "Branch", "Company"].includes(scoped)) return scoped;
  const stored = role.ui_permissions?.[row.label] ?? role.ui_permissions?.[name];
  if (stored !== undefined) return stored ? (row.kind === "scope" ? "Company" : "On") : "Off";
  return (role.permissions ?? []).includes(row.code ?? "") ? (row.kind === "scope" ? "Company" : "On") : "Off";
}
function roleChoices(row: MatrixRow, value: string): [string, string][] {
  const list = row.choices || (row.kind === "scope" ? ["Off", "Own", "Branch", "Company"] : ["Off", "On"]);
  return (list.includes(value) ? list : [value, ...list]).map((x) => [x, list.includes(x) ? x : `${x} (legacy)`]);
}
const limitOriginal = (role: Role, key: string) => { const v = role.limits?.[key]; return v === null || v === undefined ? "" : String(v); };

function NewRoleForm({ data, onCancel, onCreated }: { data: TeamData; onCancel: () => void; onCreated: (r: Role) => Promise<void> }) {
  const [name, setName] = useState(""), [from, setFrom] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState<string>();
  const valid = name.trim().length >= 3 && !!from;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (!valid || busy) return; setBusy(true);
    try { const created = await api.admin<Role>(`${API}/roles`, "POST", { name: name.trim(), starts_from: from }); toast("Role created", "ok"); await onCreated(created); }
    catch (ex) { setError(msg(ex)); setBusy(false); }
  };
  return (
    <section className="ta28-newrole"><div className="ta28-caption">NEW ROLE</div>
      <form className="ta28-newrole-box" onSubmit={(e) => void submit(e)}>
        <label className="ta28-newrole-field"><span>Name</span><input name="name" required maxLength={70} placeholder="e.g. City Supervisor" value={name} onChange={(e) => setName(e.currentTarget.value)} /></label>
        <label className="ta28-newrole-field"><span>Starts from</span><select name="starts_from" required aria-label="Starts from" value={from} onChange={(e) => setFrom(e.currentTarget.value)}>
          {[["", "Choose a role"], ...data.roles.filter((x) => !["owner", "admin"].includes(x.key)).map((x) => [x.key, x.name])].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <footer><button type="button" onClick={onCancel}>Cancel</button><button type="submit" className="ta28-blue-btn" disabled={!valid || busy}>Create</button></footer>
      </form>
      <p className="ta28-foot-help">People you give this role are treated as the role it starts from everywhere, with the permissions you choose here.</p>
      <p className="ta28-error" role="alert" hidden={!error}>{error}</p>
    </section>
  );
}

function Matrix({ data, reload }: { data: TeamData; reload: () => Promise<void> }) {
  const [, force] = useState(0);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const manage = !!data.grants.manage_roles;
  const roleMap = new Map(data.roles.map((r) => [r.key, r]));
  const columns: [string, string][] = [...data.role_columns, ...data.roles.filter((r) => !data.role_columns.some(([k]) => k === r.key) && !["owner", "admin"].includes(r.key)).map((r): [string, string] => [r.key, r.name])];
  const single = matrixMode === "single";
  const focus = roleMap.get(matrixFocus) || roleMap.get("viewer") || data.roles[0];
  const shown = single ? [[focus.key, focus.name] as [string, string]] : columns;

  // Dirty tracking against the server values (legacy data-original).
  const originals = useMemo(() => {
    const o: Record<string, string> = {};
    for (const role of data.roles) for (const s of data.matrix) for (const row of s.rows) {
      o[`${role.key}|c|${row.key}`] = roleValue(role, row);
      if (row.limit === "cancel_cutoff_hours") o[`${role.key}|l|cancel_cutoff_hours`] = limitOriginal(role, "cancel_cutoff_hours");
      if (row.limit === "seat_block") { o[`${role.key}|l|block_max_seats`] = limitOriginal(role, "block_max_seats"); o[`${role.key}|l|block_max_hours`] = limitOriginal(role, "block_max_hours"); }
    }
    return o;
  }, [data]);
  const val = (k: string) => edits[k] ?? originals[k] ?? "";
  const dirty = Object.entries(edits).filter(([k, v]) => v !== originals[k]);
  const set = (k: string, v: string) => setEdits((e) => ({ ...e, [k]: v }));
  const switchMode = async (mode: "matrix" | "single", focusKey?: string) => { matrixMode = mode; if (focusKey) matrixFocus = focusKey; force((n) => n + 1); await reload(); };

  const q = query.toLowerCase().trim();
  const rowVisible = (si: number, row: MatrixRow) => !q || row.label.toLowerCase().includes(q) || data.matrix[si].title.toLowerCase().includes(q);

  const save = async () => {
    if (!dirty.length) return;
    const roles = new Map<string, { key: string; matrix: Record<string, string>; limits: Record<string, number | null> }>();
    for (const [k, v] of dirty) {
      const [role, type, key] = k.split("|");
      if (!roles.has(role)) roles.set(role, { key: role, matrix: {}, limits: {} });
      const obj = roles.get(role)!;
      if (type === "c") obj.matrix[key] = v;
      else {
        const max = data.matrix_limit_fields?.[key]?.max || 8760, min = key === "block_max_seats" ? 1 : 0;
        if (v.trim() !== "" && (!/^\d+$/.test(v) || Number(v) > max || Number(v) < min)) {
          toastError(new Error(`Enter a whole number in the permitted range for ${roleMap.get(role)?.name}: ${key}`)); return;
        }
        obj.limits[key] = v === "" ? null : Number(v);
      }
    }
    setSaving(true);
    try {
      const out = await api.admin<{ roles: unknown[]; revoked_sessions: number }>(`${API}/roles/batch`, "PUT", { roles: [...roles.values()], base_revision: data.matrix_revision });
      toast(`Saved permissions for ${out.roles.length} role(s). ${out.revoked_sessions} session(s) signed out.`, "ok");
      await reload();
    } catch (e) { toastError(e); setSaving(false); }
  };

  const limitInput = (role: Role, key: string, label: string, unit: string) => {
    const k = `${role.key}|l|${key}`;
    const max = data.matrix_limit_fields?.[key]?.max || 8760;
    return (
      <label className="ta27-limit"><input type="number" inputMode="numeric" min={key === "block_max_seats" ? 1 : 0} max={max} step={1} value={val(k)} placeholder="no limit"
        aria-label={`${role.name}: ${label}`} disabled={!manage} onChange={(e) => set(k, e.currentTarget.value)} /><span>{unit}</span></label>
    );
  };
  const cell = (role: Role | undefined, row: MatrixRow) => {
    if (!role || row.roleImpossible?.includes(role.key)) return <span className="ta27-unavailable" title="Not possible for this role" aria-label="Not possible for this role">—</span>;
    const k = `${role.key}|c|${row.key}`, v = val(k);
    return (
      <>
        <select aria-label={`${role.name}: ${row.label}`} data-scope={v} className="ta26-scope-select" disabled={!manage} value={v} onChange={(e) => set(k, e.currentTarget.value)}>
          {roleChoices(row, v).map(([x, l]) => <option key={x} value={x}>{l}</option>)}</select>
        {row.limit === "cancel_cutoff_hours" && <div className="ta27-limit-row" hidden={v === "Off"}>{limitInput(role, "cancel_cutoff_hours", "Cancellation cut-off", "h")}</div>}
        {row.limit === "seat_block" && <div className="ta27-limit-stack" hidden={v === "Off"}>{limitInput(role, "block_max_seats", "Seat block maximum", "seats")}{limitInput(role, "block_max_hours", "Seat block duration", "h")}</div>}
      </>
    );
  };

  return (
    <>
      <p className="ta26-help">For one person only, use Edit user → Permissions & routes.</p>
      <h3>What each role can do</h3>
      <p className="ta26-help">Pick a role, tap an area, and choose what they can reach and whether they can make changes. Then press Save.</p>
      <div className="ta26-matrix-toolbar ta27-actions">
        {single ? <button type="button" onClick={() => void switchMode("matrix").catch(toastError)}>‹ All roles</button>
          : <button type="button" onClick={() => void switchMode("single", matrixFocus || "viewer").catch(toastError)}>‹ Back to one role</button>}
        <button type="button" disabled={!manage} onClick={() => setCreating(true)}><Icon k="plus" /> New role</button>
        {single && <label className="ta27-role-picker ui-dd-hosted"><span>Role</span>
          <NiceSelect data-nice title="Choose" value={focus.key} options={data.roles.filter((r) => r.key !== "owner" && r.key !== "admin").map((r): [string, string] => [r.key, r.name])}
            onChange={(v) => void switchMode("single", v).catch(toastError)} /></label>}
      </div>
      {creating && <NewRoleForm data={data} onCancel={() => setCreating(false)} onCreated={async (r) => { setCreating(false); await switchMode("single", r.key); }} />}
      <div className="ta26-matrix-toolbar ta27-filter-bar" hidden={creating}>
        <input type="search" aria-label="Search permissions" placeholder="Search, e.g. cancel, routes, payouts" value={query} onChange={(e) => setQuery(e.currentTarget.value)} />
        <div className="ta26-legend"><span>Off</span><span>Own</span><span>Branch</span><span>Company / On</span><small>· — = not possible for that role</small></div></div>
      <div className={`ta26-matrix-scroll ${single ? "ta27-single" : ""}`} tabIndex={0} aria-label="Role permissions matrix" hidden={creating}>
        <table className="ta26-matrix">
          <thead><tr><th className="what" scope="col">WHAT</th>{shown.map(([key, label]) => <th key={key} scope="col" title={label}>{label}</th>)}</tr></thead>
          <tbody>{data.matrix.map((section, si) => {
            const visible = section.rows.filter((r) => rowVisible(si, r)).length;
            return [
              <tr key={`g${si}`} className="ta26-matrix-section" hidden={!visible}><td colSpan={shown.length + 1}>{section.title}</td></tr>,
              ...section.rows.map((row) => (
                <tr key={row.key} hidden={!rowVisible(si, row)}><th scope="row" className="what">{row.label}</th>
                  {shown.map(([rk]) => <td key={rk} className="ta27-matrix-cell">{cell(roleMap.get(rk), row)}</td>)}</tr>
              )),
            ];
          })}</tbody>
        </table></div>
      <div className="ta26-matrix-foot ta27-matrix-foot" hidden={creating}>
        <button className="ta26-primary" type="button" disabled={!dirty.length || !manage || saving} onClick={() => void save()}>Save changes</button>
        <span>Limits: seat blocks (seats, hours) and cancel cut-off (hours before departure); empty = no limit.</span>
        <span className="ta27-dirty-count" aria-live="polite">{dirty.length ? `${dirty.length} unsaved change${dirty.length === 1 ? "" : "s"}` : ""}</span></div>
      <p className="ta27-scope-note" hidden={creating}>Own / Branch access is enforced on supported booking APIs. Some other operational APIs still require endpoint-specific scope enforcement before production delegation.</p>
    </>
  );
}

/* ---------------- v28/v29 access tabs ---------------- */
const opt = (items: [string, string][]) => items.map(([v, l]) => <option key={v} value={v}>{l}</option>);
const roleOpts = (d: TeamData): [string, string][] => d.roles.filter((x) => !["owner", "admin"].includes(x.key)).map((x) => [x.key, x.name]);
const userOpts = (d: TeamData): [string, string][] => d.users.map((x) => [String(x.id), `${x.name} · ${x.phone}`]);
const Notice = ({ error }: { error?: string }) => <p className="ta28-error" role="alert" hidden={!error}>{error}</p>;
const PRIORITY: Record<string, string[]> = {
  SCHEDULES: ["Edit timings, coach & delay", "Change cities, pickups & drops", "Assign bus", "Edit expenses", "Assign crew (driver, conductor, helper)"],
  ACCOUNTS: ["Sales", "Transactions & receivables", "Add / delete ledger entries", "Reports", "Export / download", "Invoices & statements (view / pay)", "Settlements (view)", "Upload & match settlements", "Agent settings (terms, credit, commission)", "Send payment links / collect"],
};
function actionOptions(matrix: MatrixSection[]): [string, string][] {
  return matrix.flatMap((s) => {
    const pr = PRIORITY[s.title] || [];
    return s.rows.slice().sort((a, b) => { const x = pr.indexOf(a.label), y = pr.indexOf(b.label); if (x >= 0 && y >= 0) return x - y; if (x >= 0) return -1; if (y >= 0) return 1; return 0; }).map((r): [string, string] => [r.key, r.label]);
  });
}

type FieldKind = "mobile" | "text" | "integer" | "list" | "app" | "ip" | "utc" | "hour" | "bool" | "money" | "percent" | "signedPercent" | "seats" | "seatsZero" | "hours" | "days";
const SITUATION: [string, string, FieldKind][] = [
  ["caller_id", "The caller's id (91 + mobile)", "mobile"], ["acting_operator_id", "Operator the caller is acting for", "text"],
  ["caller_branch_id", "The caller's branch id", "integer"], ["caller_role_names", "The caller's role names (multi-valued)", "list"],
  ["calling_app", "Calling app: app | hub | website | gds | partner", "app"], ["client_ip", "Client IP address", "ip"],
  ["request_time_utc", "Request time (ISO 8601, UTC)", "utc"], ["operator_hour", "Hour of day at the operator (0-23)", "hour"],
  ["resource_operator_id", "Operator that owns the resource", "text"], ["booked_by_mobile", "Who booked / is assigned (91 + mobile)", "mobile"],
  ["sold_branch_id", "Branch that sold it (sales boundary)", "integer"], ["route_id", "Route id of the trip", "integer"],
  ["stop_city_ids", "Cities the trip stops in (multi-valued)", "list"], ["inside_branch_operations_area", "Inside the caller's branch operations area (Bool)", "bool"],
  ["on_trip_roster", "Caller is on the trip roster (Bool)", "bool"], ["request_amount_inr", "Money amount of the request (₹)", "money"],
  ["discount_percent", "Discount being given (%)", "percent"], ["fare_change_percent", "Fare change being made (±%)", "signedPercent"],
  ["seat_count", "Seats in the request", "seats"], ["already_blocked_seats", "Seats the caller already holds blocked", "seatsZero"],
  ["block_duration_hours", "Requested block duration (hours)", "hours"], ["days_before_departure", "Days from now to departure", "days"],
  ["hours_before_departure", "Hours from now to departure", "hours"],
];
function SituationControl({ field, value, onChange }: { field: string; value: string; onChange: (v: string) => void }) {
  const def = SITUATION.find((x) => x[0] === field);
  if (!def) return <input placeholder="value" aria-label="Situation value" disabled />;
  const [key, label, kind] = def;
  const common = { name: key, required: true, "data-v29-value": "true", "aria-label": `${label} value`, value, onChange: (e: { currentTarget: { value: string } }) => onChange(e.currentTarget.value) };
  if (kind === "bool" || kind === "app") {
    const items: [string, string][] = kind === "bool" ? [["", "value"], ["true", "True"], ["false", "False"]] : [["", "value"], ...["app", "hub", "website", "gds", "partner"].map((x): [string, string] => [x, x])];
    return <select {...common}>{opt(items)}</select>;
  }
  const numeric = ["integer", "hour", "money", "percent", "signedPercent", "seats", "seatsZero", "hours", "days"].includes(kind);
  if (numeric) {
    const step = ["money", "percent", "signedPercent", "hours", "days"].includes(kind) ? "any" : "1";
    const min = kind === "signedPercent" ? "-100" : kind === "seats" ? "1" : "0";
    const max = kind === "percent" ? "100" : kind === "hour" ? "23" : kind === "seats" || kind === "seatsZero" ? "500" : kind === "hours" ? "8760" : kind === "days" ? "365" : undefined;
    return <input {...common} type="number" placeholder="value" step={step} min={min} max={max} maxLength={80} />;
  }
  if (kind === "mobile") return <input {...common} type="tel" inputMode="tel" placeholder="value" pattern="(?:\+?91)?[6-9][0-9]{9}" title="10-digit mobile, optionally prefixed with 91 or +91" maxLength={80} />;
  const title = kind === "utc" ? "UTC ISO 8601, e.g. 2026-11-23T14:30:00Z" : kind === "list" ? "Comma-separated values" : kind === "ip" ? "IPv4 or IPv6 address" : undefined;
  return <input {...common} placeholder="value" title={title} maxLength={kind === "list" ? 600 : kind === "text" ? 120 : 80} />;
}

interface TestResult { decision: string; action: string; person: { name: string }; role_name: string; selected: string; groups?: string[]; reasons?: string[]; applied_rules?: { name: string }[]; limits?: Record<string, unknown>; note: string }
function TestAccess({ data }: { data: TeamData }) {
  const [phone, setPhone] = useState(""), [action, setAction] = useState("");
  const [openSit, setOpenSit] = useState(false);
  const [rows, setRows] = useState<{ id: number; field: string; value: string }[]>([{ id: 1, field: "", value: "" }]);
  const [sitError, setSitError] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState<string>(), [result, setResult] = useState<TestResult | null>(null);
  const nextId = useRef(2);
  const valid = /^[0-9]{10}$/.test(phone) && !!action;
  const options = useMemo(() => actionOptions(data.matrix), [data.matrix]);
  const changed = () => setResult(null);
  const setRow = (id: number, p: Partial<{ field: string; value: string }>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const pickField = (id: number, field: string) => {
    setSitError("");
    if (field && rows.some((r) => r.id !== id && r.field === field)) { setSitError("Choose a different situation field for each row."); setRow(id, { field: "", value: "" }); return; }
    setRow(id, { field, value: "" });
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (!valid || busy) return; setBusy(true);
    const situation: Record<string, string> = {};
    if (openSit) for (const r of rows) if (r.field && r.value !== "") situation[r.field] = r.value;
    try { setResult(await api.admin<TestResult>(`${V28}/test`, "POST", { phone, action_key: action, situation })); }
    catch (ex) { setError(msg(ex)); } finally { setBusy(false); }
  };
  const tone = result ? (result.decision === "allow" ? "allow" : result.decision === "deny" ? "deny" : "conditional") : "";
  const limits = result ? Object.entries(result.limits ?? {}).map(([k, v]) => `${k}: ${String(v)}`).join(" · ") : "";
  return (
    <div className="ta28-page ta28-test">
      <p className="ta28-intro">Check what a person can or cannot do, and why.</p>
      <div className="ta28-caption">CAN THIS PERSON...?</div>
      <form className="ta28-panel" onSubmit={(e) => void submit(e)} onChange={changed}>
        <label className="ta28-wide-row"><span>Person</span><input name="phone" aria-label="Person mobile" inputMode="numeric" autoComplete="off" maxLength={10} pattern="[0-9]{10}" placeholder="10-digit mobile" required value={phone} onChange={(e) => setPhone(e.currentTarget.value)} /></label>
        <div className="ta28-action-wrap"><select required aria-label="Action to check" value={action} onChange={(e) => setAction(e.currentTarget.value)}>{opt([["", "Add something to check..."], ...options])}</select></div>
        <div className="ta28-situation-toggle"><button type="button" aria-expanded={openSit || undefined} onClick={() => setOpenSit((o) => !o)}><Svg28 d={PLUS28} /> Situation (e.g. route, seats)</button></div>
        <div className="ta28-situation ta29-situation-editor" hidden={!openSit}>
          <div className="ta29-rows">{rows.map((r) => (
            <div key={r.id} className="ta29-row">
              <select aria-label="Situation field" value={r.field} onChange={(e) => pickField(r.id, e.currentTarget.value)}>{opt([["", "Choose..."], ...SITUATION.map(([k, l]): [string, string] => [k, l])])}</select>
              <span className="ta29-value"><SituationControl field={r.field} value={r.value} onChange={(v) => setRow(r.id, { value: v })} /></span>
              <button type="button" className="ta29-remove" aria-label="Remove situation field" hidden={rows.length === 1} onClick={() => { setRows((rs) => rs.filter((x) => x.id !== r.id)); setSitError(""); }}>×</button>
            </div>
          ))}</div>
          <div className="ta29-actions">
            <button type="button" hidden={!rows.some((r) => r.field) || rows.length >= SITUATION.length} onClick={() => setRows((rs) => [...rs, { id: nextId.current++, field: "", value: "" }])}>+ Add another field</button>
            <span role="alert" hidden={!sitError}>{sitError}</span></div>
        </div>
        <footer className="ta28-panel-footer"><button className="ta28-blue-btn" type="submit" disabled={!valid || busy}><Svg28 d={PLAY28} /> Check</button></footer>
      </form>
      <p className="ta28-foot-help">Checks what would happen if this person tried these things now, and which role or rule decides.</p>
      <Notice error={error} />
      <section aria-live="polite">{result && (
        <article className={`ta28-result ta28-${tone}`}>
          <div className="ta28-result-title"><strong>{result.decision.toUpperCase()}</strong><span>{result.action} · {result.person.name}</span></div>
          <p>Role: {result.role_name} · Matrix: {result.selected} · Groups: {(result.groups ?? []).join(", ") || "None"}</p>
          <ul>{(result.reasons ?? []).map((x, i) => <li key={i}>{x}</li>)}</ul>
          {(result.applied_rules ?? []).length > 0 && <div className="ta28-result-rules">Applied rules: {(result.applied_rules ?? []).map((x) => x.name).join(" · ")}</div>}
          {limits && <p>Limits: {limits}</p>}
          <p className="ta28-coverage">{result.note}</p>
        </article>
      )}</section>
    </div>
  );
}

interface Group { id: number; name: string; description?: string; user_ids?: number[] }
function GroupCard({ data, g, onError, reload }: { data: TeamData; g: Group; onError: (e: unknown) => void; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [members, setMembers] = useState(() => new Set((g.user_ids ?? []).map(String)));
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = e.currentTarget; if (!f.reportValidity()) return;
    const v = formValues(f);
    try {
      await api.admin(`${V28}/groups/${g.id}`, "PUT", { name: v.name, description: v.description, user_ids: data.users.filter((u) => members.has(String(u.id))).map((u) => Number(u.id)) });
      toast("Group updated", "ok"); await reload();
    } catch (ex) { onError(ex); }
  };
  const del = async () => {
    if (!await confirmDialog("Delete this group? Rules targeting this group must be removed first.", { danger: true, ok: "Delete" })) return;
    try { await api.admin(`${V28}/groups/${g.id}`, "DELETE"); toast("Group deleted", "ok"); await reload(); } catch (ex) { onError(ex); }
  };
  return (
    <article className="ta28-group-card">
      <div><h3>{g.name}</h3><p>{g.user_ids?.length || 0} members{g.description ? ` · ${g.description}` : ""}</p></div>
      <div className="ta28-card-actions"><button type="button" onClick={() => setEditing((x) => !x)}>Edit members</button><button className="ta28-danger" type="button" onClick={() => void del()}>Delete</button></div>
      {editing && (
        <form className="ta28-group-editor" onSubmit={(e) => void save(e)}>
          <label>Group name<input name="name" required maxLength={90} defaultValue={g.name} /></label>
          <label>Description<input name="description" maxLength={250} defaultValue={g.description || ""} /></label>
          <div className="ta28-caption">MEMBERS</div>
          <div className="ta28-member-grid">{data.users.map((u) => (
            <label key={u.id}><input type="checkbox" value={u.id} checked={members.has(String(u.id))}
              onChange={(e) => { const on = e.currentTarget.checked; setMembers((s) => { const n = new Set(s); if (on) n.add(String(u.id)); else n.delete(String(u.id)); return n; }); }} />{u.name} <small>{u.phone}</small></label>
          ))}</div>
          <div className="ta28-card-actions"><button type="button" onClick={() => setEditing(false)}>Cancel</button><button className="ta28-blue-btn" type="submit">Save group</button></div>
        </form>
      )}
    </article>
  );
}
function Groups({ data, groups, reload }: { data: TeamData; groups: Group[]; reload: () => Promise<void> }) {
  const [name, setName] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState<string>();
  const create = async (e: FormEvent) => {
    e.preventDefault(); if (name.trim().length < 2 || busy) return; setBusy(true);
    try { await api.admin(`${V28}/groups`, "POST", { name: name.trim() }); toast("Group created", "ok"); await reload(); }
    catch (ex) { setError(msg(ex)); setBusy(false); }
  };
  return (
    <div className="ta28-page ta28-groups">
      <p className="ta28-intro">Put people together (e.g. "Night pickup team") and apply rules to the whole group.</p>
      <form className="ta28-group-create" onSubmit={(e) => void create(e)}>
        <input name="name" required maxLength={90} placeholder="New group, e.g. Night-pickup-team" aria-label="New group name" value={name} onChange={(e) => setName(e.currentTarget.value)} />
        <button type="submit" className="ta28-blue-btn" disabled={name.trim().length < 2 || busy}><Svg28 d={PLUS28} /> Create</button></form>
      <Notice error={error} />
      <div className="ta28-group-list">{groups.map((g) => <GroupCard key={g.id} data={data} g={g} onError={(e) => setError(msg(e))} reload={reload} />)}</div>
    </div>
  );
}

interface Rule { id?: number | string; name?: string; subject_type?: string; subject_id?: string | null; action_key?: string; effect?: string; condition?: { kind?: string; hours?: number }; limits?: { max_seats?: number; max_hours?: number }; enabled?: boolean; template_id?: string }
interface Template extends Rule { id: string; name: string }
function RuleEditor({ data, groups, origin, existing, onCancel, onSaved, onError }: { data: TeamData; groups: Group[]; origin: Rule; existing: Rule | null; onCancel: () => void; onSaved: () => Promise<void>; onError: (e: unknown) => void }) {
  const rows = data.matrix.flatMap((x) => x.rows);
  const [f, setF] = useState({
    name: origin.name || "", subject_type: origin.subject_type || "role", subject_id: String(origin.subject_id || ""), action_key: origin.action_key || "",
    effect: origin.effect || "deny", condition_kind: origin.condition?.kind || "always", hours: String(origin.condition?.hours ?? 2),
    max_seats: String(origin.limits?.max_seats ?? 3), max_hours: String(origin.limits?.max_hours ?? 24),
  });
  const up = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus({ preventScroll: true }); }, []);
  const st = f.subject_type;
  const targets: [string, string][] = st === "role" ? roleOpts(data) : st === "group" ? groups.map((g): [string, string] => [String(g.id), g.name]) : st === "person" ? userOpts(data) : [];
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.name.trim() || !f.action_key || (st !== "all" && !f.subject_id)) return;
    const payload = {
      name: f.name.trim(), subject_type: st, subject_id: st === "all" ? null : f.subject_id, action_key: f.action_key, effect: f.effect,
      condition: { kind: f.condition_kind, ...(f.condition_kind === "departure_within_hours" ? { hours: Number(f.hours) } : {}) },
      limits: f.effect === "limit" ? { max_seats: Number(f.max_seats), max_hours: Number(f.max_hours) } : {},
      enabled: existing?.enabled !== false, template_id: origin.id || origin.template_id || "",
    };
    try {
      if (existing) await api.admin(`${V28}/rules/${existing.id}`, "PUT", payload); else await api.admin(`${V28}/rules`, "POST", payload);
      toast("Access rule saved", "ok"); await onSaved();
    } catch (ex) { onError(ex); }
  };
  return (
    <form className="ta28-rule-editor" onSubmit={(e) => void submit(e)}>
      <h3>{existing ? "Edit rule" : "New rule"}</h3>
      <div className="ta28-editor-grid">
        <label>Rule name<input ref={nameRef} name="name" maxLength={120} required placeholder="e.g. Night team seat limit" value={f.name} onChange={(e) => up({ name: e.currentTarget.value })} /></label>
        <label>Apply to<select name="subject_type" value={st} onChange={(e) => up({ subject_type: e.currentTarget.value, subject_id: "" })}>{opt([["role", "Role"], ["group", "Group"], ["person", "One person"], ["all", "Everyone"]])}</select></label>
        <label hidden={st === "all"}>Who<select name="subject_id" value={f.subject_id} onChange={(e) => up({ subject_id: e.currentTarget.value })}>{opt([["", `Choose ${st === "person" ? "a person" : st}`], ...targets])}</select></label>
        <label>What can they do?<select name="action_key" required value={f.action_key} onChange={(e) => up({ action_key: e.currentTarget.value })}>{opt([["", "Choose an action"], ["*", "All changes (read-only)"], ...rows.map((r): [string, string] => [r.key, r.label])])}</select></label>
        <label>Rule<select name="effect" value={f.effect} onChange={(e) => up({ effect: e.currentTarget.value })}>{opt([["deny", "Block"], ["limit", "Limit"]])}</select></label>
        <label>When<select name="condition_kind" value={f.condition_kind} onChange={(e) => up({ condition_kind: e.currentTarget.value })}>
          {opt([["always", "Always"], ["departure_within_hours", "Within hours of departure"], ["corridor_mismatch", "Route does not match person’s corridor tag"], ["write_action", "When changing data"]])}</select></label>
        <label hidden={f.condition_kind !== "departure_within_hours"}>Hours before departure<input name="hours" type="number" min={0} max={8760} step={1} value={f.hours} onChange={(e) => up({ hours: e.currentTarget.value })} /></label>
        <label hidden={f.effect !== "limit"}>Maximum seats<input name="max_seats" type="number" min={1} max={500} value={f.max_seats} onChange={(e) => up({ max_seats: e.currentTarget.value })} /></label>
        <label hidden={f.effect !== "limit"}>Maximum hours<input name="max_hours" type="number" min={1} max={8760} value={f.max_hours} onChange={(e) => up({ max_hours: e.currentTarget.value })} /></label>
      </div>
      <p className="ta28-help">Rules restrict existing permissions; they never give someone access their role does not already allow.</p>
      <div className="ta28-card-actions"><button type="button" onClick={onCancel}>Cancel</button><button type="submit" className="ta28-blue-btn">{existing ? "Save changes" : "Create"}</button></div>
    </form>
  );
}
function Advanced({ data, ruleData, groups, reload }: { data: TeamData; ruleData: { rules: Rule[]; templates: Template[] }; groups: Group[]; reload: () => Promise<void> }) {
  const [editor, setEditor] = useState<{ origin: Rule; existing: Rule | null; n: number } | null>(null);
  const [error, setError] = useState<string>();
  const onError = (e: unknown) => setError(msg(e));
  const rows = data.matrix.flatMap((g) => g.rows);
  const open = (origin: Rule, existing: Rule | null = null) => setEditor((x) => ({ origin, existing, n: (x?.n ?? 0) + 1 }));
  const toggle = async (r: Rule) => { try { await api.admin(`${V28}/rules/${r.id}`, "PUT", { ...r, enabled: r.enabled === false }); toast("Rule updated", "ok"); await reload(); } catch (e) { onError(e); } };
  const del = async (r: Rule) => {
    if (!await confirmDialog("Delete this access rule?", { danger: true, ok: "Delete" })) return;
    try { await api.admin(`${V28}/rules/${r.id}`, "DELETE"); toast("Rule deleted", "ok"); await reload(); } catch (e) { onError(e); }
  };
  return (
    <div className="ta28-page ta28-advanced">
      <p className="ta28-intro">For unusual cases the grid can’t express: write your own rules. Most companies never need this — limits live in the Roles grid.</p>
      <p className="ta28-description">A role says what people can do. A rule adds an exception or a limit on top — for a role, a group or one person. If a rule blocks something, it stays blocked whatever else allows it.</p>
      <div className="ta28-preset-bar"><button type="button" className="ta28-blue-btn" onClick={() => open({})}><Svg28 d={PLUS28} /> New rule</button>
        {ruleData.templates.map((t) => <button key={t.id} type="button" onClick={() => open(t)}>{t.name}</button>)}</div>
      <div>{editor && <RuleEditor key={editor.n} data={data} groups={groups} origin={editor.origin} existing={editor.existing} onCancel={() => setEditor(null)} onSaved={reload} onError={onError} />}</div>
      <div className="ta28-caption">YOUR RULES</div>
      <Notice error={error} />
      <div className="ta28-rule-list">{ruleData.rules.length ? ruleData.rules.map((r) => (
        <article key={r.id} className="ta28-rule"><div><h3>{r.name}</h3>
          <p>{r.effect === "deny" ? "Block" : "Limit"} · {r.action_key === "*" ? "All modifications" : rows.find((x) => x.key === r.action_key)?.label || r.action_key} · {r.subject_type === "all" ? "Everyone" : `${r.subject_type} ${r.subject_id || ""}`}{r.enabled === false ? " · Disabled" : ""}</p></div>
          <div className="ta28-card-actions"><button type="button" onClick={() => open(r, r)}>Edit</button>
            <button type="button" onClick={() => void toggle(r)}>{r.enabled === false ? "Enable" : "Disable"}</button>
            <button className="ta28-danger" type="button" onClick={() => void del(r)}>Delete</button></div>
        </article>
      )) : <div className="ta28-rules-empty">No rules yet. Everyone works by their role until you add one.</div>}</div>
    </div>
  );
}

function AccessV28({ tab }: { tab: "test-access" | "groups" | "advanced" }) {
  const [state, setState] = useState<{ data: TeamData; groups: Group[]; rules?: { rules: Rule[]; templates: Template[] } } | null>(null);
  const [error, setError] = useState<string>();
  const [v, setV] = useState(0);
  const load = useCallback(async () => {
    try {
      const data = await api.admin<TeamData>(API);
      if (tab === "test-access") setState({ data, groups: [] });
      else if (tab === "groups") setState({ data, groups: (await api.admin<{ groups?: Group[] }>(`${V28}/groups`)).groups ?? [] });
      else {
        const [rules, groups] = await Promise.all([api.admin<{ rules: Rule[]; templates: Template[] }>(`${V28}/rules`), api.admin<{ groups?: Group[] }>(`${V28}/groups`)]);
        setState({ data, groups: groups.groups ?? [], rules });
      }
      setV((n) => n + 1);
    } catch (e) { setError(msg(e) || "Unable to load access"); }
  }, [tab]);
  useEffect(() => { setState(null); setError(undefined); void load(); }, [load]);
  if (error) return <p className="ta28-error" role="alert">{error}</p>;
  if (!state) return null;
  if (tab === "test-access") return <TestAccess data={state.data} />;
  if (tab === "groups") return <Groups key={v} data={state.data} groups={state.groups} reload={load} />;
  return <Advanced key={v} data={state.data} ruleData={state.rules!} groups={state.groups} reload={load} />;
}

/* ---------------- page ---------------- */
type Dialog = { kind: "how" } | { kind: "view"; user: TUser } | { kind: "edit"; user: TUser | null } | null;

/** Settings → Team & access (`#/settings/team-access/<tab>/...`). */
export function TeamAccessPage({ parts }: { parts: string[] }) {
  const tab = parts[0] || "office-staff", access = parts[1] || "roles";
  const [data, setData] = useState<TeamData | null>(null);
  const [error, setError] = useState<string>();
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const load = useCallback(async () => {
    try { setData(await api.admin<TeamData>(API)); setError(undefined); setVersion((n) => n + 1); }
    catch (e) { setError(msg(e)); toastError(e); }
  }, []);
  useEffect(() => { setData(null); setQuery(""); setDialog(null); void load(); }, [tab, access, load]);

  if (error) return (
    <div className="stp-root ta26-root"><div className="ta26-empty"><h3>Unable to load Team & access</h3><p>{error}</p>
      <button type="button" onClick={() => { setError(undefined); void load(); }}>Retry</button></div></div>
  );
  if (!data) return <div className="stp-root ta26-root"><div className="ta26-loading">Loading Team & access…</div></div>;

  const lists = categories(data);
  const kind: Kind = tab === "agents" ? "agents" : tab === "bus-staff" ? "bus-staff" : "office-staff";
  const isUsers = ["office-staff", "bus-staff", "agents"].includes(tab);
  const addLabel = tab === "agents" ? "Add agent" : "Add User";
  const close = () => setDialog(null);
  let content: ReactNode;
  if (tab === "branches") content = <Branches data={data} done={load} />;
  else if (tab === "access") {
    const items: [string, string][] = [["roles", "Roles"], ["test-access", "Test access"], ["groups", "Groups"], ["advanced", "Advanced"]];
    content = (
      <>
        <nav className="ta26-access-tabs">{items.map(([k, l]) => <a key={k} href={link("access", `${k}/viewer`)} className={access === k ? "active" : ""}>{l}</a>)}</nav>
        <div className="ta26-access-content">
          {["test-access", "groups", "advanced"].includes(access) ? <AccessV28 tab={access as "test-access" | "groups" | "advanced"} /> : <Matrix key={version} data={data} reload={load} />}
        </div>
      </>
    );
  } else content = <UserTable key={version} data={data} rows={lists[tab as Kind] ?? []} kind={kind} query={query} onView={(u) => setDialog({ kind: "view", user: u })} onEdit={(u) => setDialog({ kind: "edit", user: u })} done={load} />;

  return (
    <div className="stp-root ta26-root">
      <div className="ta26-shell">
        <div className="ta26-page-heading">
          <div className="ta26-page-title"><span className="ta26-page-icon"><Icon k="bus" /></span><strong>Team & access</strong>
            <button type="button" className="ta26-how" onClick={() => setDialog({ kind: "how" })}><Icon k="play" /> How to</button></div>
          <button className="ta26-primary" type="button" disabled={!data.grants.manage_users} onClick={() => setDialog({ kind: "edit", user: null })}><Icon k="users" /> {addLabel}</button>
        </div>
        <section className="ta26-nav">
          {TABS.map(([key, label, ico]) => (
            <a key={key} href={link(key)} className={`ta26-tab ${key === tab ? "active" : ""}`}><span className="ta26-tab-icon"><Icon k={ico} /></span>{label}
              {key in lists && <em>{lists[key as Kind].length}</em>}</a>
          ))}
          {isUsers && <label className="ta26-search"><Icon k="search" /><input type="search" placeholder="Search by name or phone..." aria-label="Search by name or phone" value={query} onChange={(e) => setQuery(e.currentTarget.value)} /></label>}
        </section>
        <section className="ta26-main">{content}</section>
      </div>
      {dialog?.kind === "how" && (
        <TaModal title="How to use Team & access" onClose={close}>
          <p>Office staff, bus staff and agents share an authenticated user directory. Use View, Edit and the Active switch for account administration. Assign branches or routes under Edit User → Permissions & routes.</p>
          <p>Access → Roles controls API role grants; Test access checks effective permissions. Changes revoke existing sign-in sessions.</p>
          <p>Branches assign selling and operational teams. Operations area restrictions and Own/Branch record-level visibility must be enforced by all data endpoints before production.</p>
        </TaModal>
      )}
      {dialog?.kind === "view" && <ViewUser data={data} user={dialog.user} kind={kind} onClose={close}
        onEdit={() => setDialog({ kind: "edit", user: dialog.user.staff_only ? { ...dialog.user, id: 0 } : dialog.user })} />}
      {dialog?.kind === "edit" && <UserEditor data={data} user={dialog.user} kind={kind} onClose={close} done={load} />}
    </div>
  );
}
