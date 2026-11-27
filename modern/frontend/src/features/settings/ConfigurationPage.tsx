import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api";
import { can, usePermissions } from "../../auth/permissions";
import { confirmDialog, toast, toastError } from "../../components/ui/feedback";

// Settings → Configuration (`#/settings/configuration/<section>`). Native React port of legacy configuration-v30.js +
// configuration-v31.js. DOM and class names (cfg30-* / cfg31-*) are kept 1:1 so the vendored stylesheets apply.
// Data: GET /settings/config-v30, PUT /settings/config-v30/{section}. Provider delivery is never simulated.

const API = "/settings/config-v30";
type Dict = Record<string, unknown>;
interface Dial { id: number; code: string; kind?: string; phone?: string; label?: string; is_active?: boolean }
interface Subscription {
  id?: number; event_types?: string[] | string; channel?: string; endpoint?: string; display_name?: string; enabled?: boolean;
  contacts?: { phone: string; name: string }[]; only_sources?: boolean; booking_sources?: string[]; quiet_hours?: boolean;
}
interface User { id: number; name?: string; phone?: string }
interface CfgData { sections: Record<string, Dict>; dials?: Dial[]; subscriptions?: Subscription[]; users?: User[] }
interface CityContact { city: string; phones: string[] }

const str = (v: unknown) => (v == null ? "" : String(v));
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const saveSection = (section: string, values: Dict) => api.admin<{ value: Dict }>(`${API}/${section}`, "PUT", values);

/* ---------------- static reference data ---------------- */
const SECTION_ICONS: Record<string, string> = {
  business: "building-2", website: "globe", communications: "headset", notifications: "bell", pricing: "indian-rupee", office: "store",
  vehicle: "bus", expenses: "fuel", seats: "palette", monitoring: "target", whatsapp: "message-square", bot: "bot",
};
const MENU: [string, string][] = [
  ["business", "Business Info"], ["website", "Website"], ["communications", "Communications"], ["notifications", "Notifications"],
  ["pricing", "Pricing"], ["office", "Office Booking"], ["vehicle", "Vehicle Alerts"], ["expenses", "Expenses"],
  ["seats", "Seat legends"], ["monitoring", "Post-Trip Monitoring"], ["whatsapp", "WhatsApp Alerts"], ["bot", "AI Bot"],
];
const EXTRA_ROUTES: Record<string, string> = {
  pricing: "#/settings/loyalty-program/miles", office: "#/settings/configuration/office", vehicle: "#/settings/configuration/vehicle",
  expenses: "#/settings/configuration/expenses", seats: "#/settings/configuration/seats", monitoring: "#/settings/configuration/monitoring",
  whatsapp: "#/settings/whatsapp", bot: "#/settings/configuration/bot",
};
const EVENTS = ["New booking", "Booking changed", "Cancellation", "Trip delayed / cancelled", "Unpaid hold expired", "Payment received",
  "Check-in reminder", "Live Journey", "Pre-boarding / tracking link", "Rating request", "Bus approaching"];
const SOURCES = ["Website", "app", "Branch", "Agent", "GDS", "Partner"];
const EVENT_ALIASES: Record<string, string> = {
  "booking.created": "New booking", "booking.cancelled": "Cancellation", "booking.modified": "Booking changed", "hold.expired": "Unpaid hold expired",
  "passenger.pre_boarding": "Pre-boarding / tracking link", "trip.delayed": "Trip delayed / cancelled", "trip.started": "Live Journey",
  "vehicle.approaching": "Bus approaching", "passenger.rating_request": "Rating request",
};
const eventLabel = (x: string) => EVENT_ALIASES[x] || x;

const GLYPHS: Record<string, ReactNode> = {
  "building-2": <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1M10 21v-4h4v4" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c-6 5-6 13 0 18M12 3c6 5 6 13 0 18" /></>,
  headset: <><path d="M3 14v-2a9 9 0 0 1 18 0v2" /><rect x="2" y="12" width="5" height="8" rx="2" /><rect x="17" y="12" width="5" height="8" rx="2" /><path d="M19 21h-6" /></>,
  bell: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 10h18c0-2-3-3-3-10M10 22h4" />,
  "indian-rupee": <path d="M5 4h14M5 9h14M7 4c10 0 10 8 0 8l9 8" />,
  store: <path d="M4 9V5h16v4l2 3v2h-4v7H6v-7H2v-2l2-3zM9 21v-7h6v7" />,
  bus: <><rect x="4" y="3" width="16" height="16" rx="3" /><path d="M4 11h16M7 19v3m10-3v3M8 15h1m6 0h1" /></>,
  fuel: <path d="M4 3h11v18H4zM7 7h5M15 11h3l3 3v5a2 2 0 0 1-4 0v-3" />,
  palette: <><circle cx="12" cy="12" r="9" /><circle cx="7" cy="10" r="1" /><circle cx="11" cy="7" r="1" /><circle cx="16" cy="9" r="1" /><path d="M12 20c-1-4 7-5 7-8" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  "message-square": <path d="M4 4h16v13H8l-4 4z" />,
  bot: <><rect x="4" y="7" width="16" height="13" rx="3" /><path d="M12 7V3M9 13h1m4 0h1M9 17h6" /></>,
  save: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M7 3v7h10V3M8 21v-7h8v7" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  phone: <path d="M7 3h4l2 6-3 2c1 2 3 4 5 5l2-3 4 2v5c-9 4-20-7-18-17z" />,
  map: <><path d="m12 21 7-9a8 8 0 1 0-14 0l7 9z" /><circle cx="12" cy="10" r="2" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 7 9-7" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
  hash: <path d="M5 9h14M4 15h14M10 3 7 21M17 3l-3 18" />,
  file: <path d="M5 2h10l5 5v15H5zM15 2v5h5M8 12h9M8 16h9" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>,
  tag: <><path d="M3 5h8l10 10-6 6L3 9z" /><circle cx="7" cy="8" r="1" /></>,
  send: <path d="m22 2-7 20-4-9-9-4 20-7zM11 13 22 2" />,
  edit: <path d="m3 17 12-12 4 4L7 21H3zM13 7l4 4" />,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6" />,
  plus: <path d="M12 4v16M4 12h16" />,
  down: <path d="m6 9 6 6 6-6" />,
  close: <path d="M5 5l14 14M19 5 5 19" />,
};
const Glyph = ({ name }: { name: string }) => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {GLYPHS[name] ?? <circle cx="12" cy="12" r="9" />}
  </svg>
);
const Icon30 = ({ name }: { name: string }) => <span className="cfg30-icon"><Glyph name={SECTION_ICONS[name] || name} /></span>;

const SYMBOLS: Record<string, ReactNode> = {
  pricing: <path d="M5 4h14M5 9h14M7 4c11 0 11 8 0 8l9 8" />,
  office: <path d="M4 10h16l-2 4H6l-2-4zM5 10l2-6h10l2 6M6 14v7h12v-7M10 21v-5h4v5" />,
  vehicle: <><rect x="4" y="3" width="16" height="17" rx="3" /><path d="M4 12h16M7 20v2m10-2v2M8 16h2m4 0h2" /></>,
  expenses: <path d="M4 3h11v18H4zM7 7h5M15 10l3 2 2 0 1 2v5a2 2 0 0 1-4 0v-5" />,
  seats: <><path d="M12 3a9 9 0 1 0 3 17c3-2 0-4 0-5s5-2 6-5c1-4-4-7-9-7z" /><circle cx="7.5" cy="11" r=".8" /><circle cx="11" cy="7" r=".8" /><circle cx="17" cy="9" r=".8" /></>,
  monitoring: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="2" /><path d="m12 12 8-8" /></>,
  whatsapp: <path d="M4 4h16v14H9l-5 4V4z" />,
  bot: <><rect x="4" y="8" width="16" height="12" rx="2" /><path d="M12 8V4M9 4h6M8 14h1m6 0h1M9 18h6" /></>,
  gauge: <><path d="M5 17a9 9 0 1 1 14 0M12 15l4-6" /><circle cx="12" cy="17" r="1" /></>,
  signal: <path d="M4 15q8-9 16 0M7 18q5-5 10 0M12 21v0M4 4l16 16" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l4 2" /></>,
  fuel: <><rect x="5" y="3" width="10" height="18" rx="1" /><path d="M8 7h4M15 10l4 2v6a2 2 0 0 0 4 0v-5l-4-4" /></>,
  bell: <path d="M6 9a6 6 0 1 1 12 0v7l3 3H3l3-3V9M10 22h4" />,
  map: <><path d="m12 21 7-10a8 8 0 1 0-14 0l7 10z" /><circle cx="12" cy="10" r="2" /></>,
  bolt: <path d="m13 2-9 12h7l-1 8 10-12h-8z" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>,
  shine: <path d="m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z" />,
  metro: <><rect x="5" y="3" width="14" height="17" rx="3" /><path d="M5 13h14M9 20l-3 2m9-2 3 2M9 9h1m4 0h1" /></>,
};
const Svg31 = ({ name }: { name: string }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">{SYMBOLS[name] ?? SYMBOLS.shine}</svg>
);
const Badge31 = ({ name, color }: { name: string; color?: string }) => <span className={`cfg30-icon cfg31-icon cfg31-${color || name}`}><Svg31 name={name} /></span>;

/* ---------------- form context ---------------- */
type Kind = "text" | "number" | "bool" | "raw";
interface FormCtx { vals: Dict; base: Dict; set: (k: string, v: unknown) => void; reg: (k: string, kind: Kind) => void; ro: boolean }
const Ctx = createContext<FormCtx>(null!);
const useForm = () => useContext(Ctx);
function useField(k: string, kind: Kind) { const f = useForm(); f.reg(k, kind); return f; }

/* ---------------- cfg30 building blocks ---------------- */
function TextField({ k, label, icon = "file", placeholder = "", readOnly, title, autoComplete }: { k: string; label: string; icon?: string; placeholder?: string; readOnly?: boolean; title?: string; autoComplete?: string }) {
  const f = useForm();
  if (!readOnly) f.reg(k, "text");
  return (
    <label className="cfg30-field"><span className="cfg30-label">{label}</span>
      <span className="cfg30-input-wrap">{icon && <Icon30 name={icon} />}
        <input type="text" name={k} value={str(f.vals[k])} placeholder={placeholder} readOnly={readOnly} title={title} autoComplete={autoComplete} disabled={f.ro}
          onChange={(e) => f.set(k, e.currentTarget.value)} /></span></label>
  );
}
function NumberField({ k, label, unit, max, help }: { k: string; label: string; unit: string; max: number; help?: string }) {
  const f = useField(k, "number");
  return (
    <label className="cfg30-field"><span className="cfg30-label">{label}</span>
      <span className="cfg30-input-wrap cfg30-number-wrap"><input type="number" min={0} max={max} step={1} name={k} value={str(f.vals[k])} disabled={f.ro} onChange={(e) => f.set(k, e.currentTarget.value)} />
        <span className="cfg30-unit">{unit}</span></span>
      {help && <small className="cfg30-help">{help}</small>}</label>
  );
}
function SwitchRow({ k, title, desc }: { k: string; title: string; desc: string }) {
  const f = useField(k, "bool");
  return (
    <label className="cfg30-switch-row"><span><strong>{title}</strong><small>{desc}</small></span>
      <input type="checkbox" name={k} checked={!!f.vals[k]} disabled={f.ro} onChange={(e) => f.set(k, e.currentTarget.checked)} /><span className="cfg30-switch-ui"></span></label>
  );
}
function SectionCard({ title, icon, description, children }: { title: string; icon: string; description?: string; children: ReactNode }) {
  return (
    <section className="cfg30-card"><div className="cfg30-card-heading"><Icon30 name={icon} /><div><h3>{title}</h3>{description && <p>{description}</p>}</div></div>{children}</section>
  );
}
const Grid30 = ({ children, cols }: { children: ReactNode; cols?: 3 }) => <div className={cols === 3 ? "cfg30-grid cfg31-grid3" : "cfg30-grid"}>{children}</div>;
const BlockTitle = ({ title, icon }: { title: string; icon: string }) => (
  <section className="cfg30-block-title"><Icon30 name={icon} /><div><h2>{title}</h2><p>Configuration</p></div></section>
);
function FieldArea({ k, title, help }: { k: string; title: string; help?: string }) {
  const f = useField(k, "text");
  return (
    <label className="cfg30-field cfg30-span"><span className="cfg30-label">{title}{help && <> <small>{help}</small></>}</span>
      <textarea name={k} rows={4} value={str(f.vals[k])} disabled={f.ro} onChange={(e) => f.set(k, e.currentTarget.value)} /></label>
  );
}
/** Phone chips that persist immediately (legacy cfg30 pills). */
function Pills({ values, onChange }: { values: string[]; onChange: (next: string[]) => Promise<void> }) {
  const { ro } = useForm();
  const [entry, setEntry] = useState("");
  const run = async (next: string[]) => { try { await onChange(next); } catch (e) { toastError(e); } };
  return (
    <div className="cfg30-tags">
      {values.map((v) => <span key={v} className="cfg30-chip">{v} <button type="button" aria-label={`Remove ${v}`} disabled={ro} onClick={() => void run(values.filter((x) => x !== v))}>×</button></span>)}
      <input type="tel" placeholder="Add number and press Enter" aria-label="Add number" value={entry} disabled={ro} onChange={(e) => setEntry(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const v = entry.trim(); if (!v) return;
          setEntry(""); void run([...new Set([...values, v])]);
        }} />
    </div>
  );
}
function RadioCard({ value, label, help }: { value: string; label: string; help: string }) {
  const f = useField("ring_order", "text");
  const on = f.vals.ring_order === value;
  return (
    <label className={`cfg30-choice ${on ? "chosen" : ""}`}><input type="radio" name="ring_order" value={value} checked={on} disabled={f.ro} onChange={() => f.set("ring_order", value)} />
      <strong>{label}</strong><small>{help}</small></label>
  );
}
function DeliveryLog({ variant }: { variant: "card" | "inline" }) {
  const { ro } = useForm();
  const [open, setOpen] = useState(false);
  const [pnr, setPnr] = useState("");
  const [result, setResult] = useState<ReactNode>(null);
  const lookup = async () => {
    try {
      const r = await api.admin<{ note?: string; rows?: { at: string; event: string; channel: string; status: string }[] }>(`${API}/delivery-log/${encodeURIComponent(pnr.trim())}`);
      setResult(<><p>{r.note}</p>{(r.rows ?? []).map((x, i) => <p key={i}>{x.at} · {x.event} · {x.channel} · {x.status}</p>)}</>);
    } catch (e) { setResult(msg(e)); }
  };
  const body = (
    <>
      <button className="cfg30-link" type="button" aria-expanded={open || undefined} disabled={ro} onClick={() => setOpen((o) => !o)}>⌄ Delivery log — look up a PNR</button>
      <div hidden={!open}><div className="cfg30-lookup"><input placeholder="PNR" aria-label="PNR" value={pnr} disabled={ro} onChange={(e) => setPnr(e.currentTarget.value)} />
        <button className={`cfg30-btn ${variant === "card" ? "solid" : "gradient"}`} type="button" disabled={ro} onClick={() => void lookup()}><Glyph name="search" /> Look up</button></div>
        <div aria-live="polite">{result}</div></div>
    </>
  );
  return variant === "card" ? <section className="cfg30-card">{body}</section> : body;
}

/* ---------------- dialogs ---------------- */
function CfgModal({ title, button = "Save", onClose, onSubmit, children }: { title: string; button?: string; onClose: () => void; onSubmit: () => Promise<void>; children: ReactNode }) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!e.currentTarget.reportValidity()) return;
    setBusy(true); setError(undefined);
    try { await onSubmit(); onClose(); } catch (ex) { setError(msg(ex)); setBusy(false); }
  };
  return createPortal(
    <div className="cfg30-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cfg30-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <header><h3>{title}</h3><button type="button" aria-label="Close" onClick={onClose}><Glyph name="close" /></button></header>
        <form className="cfg30-dialog-form" onSubmit={(e) => void submit(e)}>
          <div className="cfg30-dialog-body">{children}<p className="cfg30-error" role="alert" hidden={!error}>{error}</p></div>
          <footer><button type="button" onClick={onClose}>Cancel</button><button className="cfg30-btn gradient" type="submit" disabled={busy}>{button}</button></footer>
        </form>
      </div>
    </div>, document.body);
}
function DialogInput({ label, value, onChange, type = "text", required, pattern, placeholder, autoFocus }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; pattern?: string; placeholder?: string; autoFocus?: boolean }) {
  return <label className="cfg30-dialog-label">{label}<input value={value} type={type} required={required} pattern={pattern} placeholder={placeholder} autoFocus={autoFocus} onChange={(e) => onChange(e.currentTarget.value)} /></label>;
}
function DialogSelect({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return <label className="cfg30-dialog-label">{label}<select value={value} onChange={(e) => onChange(e.currentTarget.value)}>{options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>;
}

function DialModal({ entry, onClose, done }: { entry: Dial | null; onClose: () => void; done: () => Promise<void> }) {
  const [d, setD] = useState({ code: entry?.code ?? "", kind: entry?.kind ?? "number", phone: entry?.phone ?? "", label: entry?.label ?? "", is_active: entry?.is_active !== false });
  const up = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));
  return (
    <CfgModal title={entry ? "Edit speed dial" : "Add code"} onClose={onClose} onSubmit={async () => {
      if (entry) await api.admin(`${API}/dials/${entry.id}`, "PUT", d); else await api.admin(`${API}/dials`, "POST", d);
      toast("Speed dial saved", "ok"); await done();
    }}>
      <DialogInput label="Code (1–99)" value={d.code} pattern="[0-9]{1,2}" required onChange={(code) => up({ code })} />
      <DialogSelect label="Calls" value={d.kind} options={[["number", "Phone number"], ["staff", "Staff"], ["branch", "Branch"]]} onChange={(kind) => up({ kind })} />
      <DialogInput label="Phone number" type="tel" value={d.phone} required onChange={(phone) => up({ phone })} />
      <DialogInput label="Label" value={d.label} onChange={(label) => up({ label })} />
      <label><input type="checkbox" checked={d.is_active} onChange={(e) => up({ is_active: e.currentTarget.checked })} /> Active</label>
    </CfgModal>
  );
}

function GroupModal({ group, data, onClose, done }: { group: "crew" | "office"; data: CfgData; onClose: () => void; done: () => Promise<void> }) {
  const field = group === "crew" ? "crew_extra" : "office_extra";
  const existing = list(data.sections.communications?.[field]);
  const [keep, setKeep] = useState(() => new Set(existing));
  const [person, setPerson] = useState("");
  return (
    <CfgModal title={group === "crew" ? "Crew of the trip" : "Office team"} button="Save group" onClose={onClose} onSubmit={async () => {
      const v = person.trim();
      await saveSection("communications", { [field]: [...new Set([...existing.filter((x) => keep.has(x)), ...(v ? [v] : [])])] });
      toast("Group contacts updated", "ok"); await done();
    }}>
      <p className="cfg30-description">Additional contacts beyond the automatically determined staff. Uncheck existing numbers to remove them.</p>
      <div className="cfg30-group-list">
        {existing.map((x) => (
          <label key={x} className="cfg30-check"><input type="checkbox" checked={keep.has(x)} onChange={(e) => {
            const on = e.currentTarget.checked;
            setKeep((s) => { const n = new Set(s); if (on) n.add(x); else n.delete(x); return n; });
          }} /> {x}</label>
        ))}
        {!existing.length && <p>No additional contacts yet.</p>}
      </div>
      <DialogInput label="Add a person by mobile number" type="tel" value={person} placeholder="Mobile number (optional)" onChange={setPerson} />
    </CfgModal>
  );
}

function CityModal({ cities, onClose, done }: { cities: CityContact[]; onClose: () => void; done: () => Promise<void> }) {
  const [city, setCity] = useState(""), [phone, setPhone] = useState("");
  return (
    <CfgModal title="Add City" button="Add City" onClose={onClose} onSubmit={async () => {
      await saveSection("communications", { city_contacts: [...cities, { city, phones: [phone] }] }); await done();
    }}>
      <DialogInput label="City name" value={city} required onChange={setCity} />
      <DialogInput label="Phone number" type="tel" value={phone} required onChange={setPhone} />
    </CfgModal>
  );
}

function SubscriptionModal({ entry, users, onClose, done }: { entry: Subscription | null; users: User[]; onClose: () => void; done: () => Promise<void> }) {
  const s: Subscription = entry ?? { event_types: ["New booking"], channel: "whatsapp", endpoint: "phone", contacts: [], only_sources: false, booking_sources: [], quiet_hours: false };
  const [events, setEvents] = useState(() => new Set(list(s.event_types).map(eventLabel)));
  const [protocol, setProtocol] = useState(s.channel || "whatsapp");
  const [endpoint, setEndpoint] = useState(s.endpoint || "phone");
  const [contacts, setContacts] = useState(() => (s.contacts?.length ? s.contacts.map((c) => ({ ...c })) : [{ phone: "", name: "" }]));
  const [onlySources, setOnlySources] = useState(!!s.only_sources);
  const [sources, setSources] = useState(() => new Set(s.booking_sources ?? []));
  const [quiet, setQuiet] = useState(!!s.quiet_hours);
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const hits = q.length < 2 ? [] : users.filter((u) => (u.name || "").toLowerCase().includes(q) || String(u.phone || "").includes(q)).slice(0, 8);
  const isPhone = endpoint === "phone";
  const toggle = <T,>(set: (f: (s: Set<T>) => Set<T>) => void, v: T, on: boolean) => set((p) => { const n = new Set(p); if (on) n.add(v); else n.delete(v); return n; });
  const setContact = (i: number, p: Partial<{ phone: string; name: string }>) => setContacts((cs) => cs.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const pick = (u: User) => {
    setContacts((cs) => {
      const i = cs.findIndex((c) => !c.phone.trim());
      const row = { phone: u.phone || "", name: u.name || "" };
      return i < 0 ? [...cs, row] : cs.map((c, j) => (j === i ? row : c));
    });
    setSearch("");
  };
  return (
    <CfgModal title={entry ? "Edit subscription" : "Create subscription"} button={entry ? "Save subscription" : "Create subscription"} onClose={onClose} onSubmit={async () => {
      const checked = EVENTS.filter((e) => events.has(e));
      if (!checked.length) throw Error("Select at least one event");
      const body = {
        event_types: checked, protocol, endpoint,
        contacts: isPhone ? contacts.map((c) => ({ phone: c.phone.trim(), name: c.name.trim() })).filter((c) => c.phone) : [],
        only_sources: onlySources, booking_sources: SOURCES.filter((x) => sources.has(x)), quiet_hours: quiet, enabled: s.enabled !== false,
      };
      if (entry) await api.admin(`${API}/subscriptions/${entry.id}`, "PUT", body); else await api.admin(`${API}/subscriptions`, "POST", body);
      toast(entry ? "Subscription updated" : "Subscription created", "ok"); await done();
    }}>
      <div className="cfg30-dialog-label">Event</div>
      <div className="cfg30-event-chips">{EVENTS.map((ev) => (
        <label key={ev} className={events.has(ev) ? "active" : ""}><input type="checkbox" value={ev} checked={events.has(ev)} onChange={(e) => toggle(setEvents, ev, e.currentTarget.checked)} />{ev}</label>
      ))}</div>
      <DialogSelect label="Protocol" value={protocol} options={[["whatsapp", "WhatsApp"], ["push", "App push"]]} onChange={setProtocol} />
      <DialogSelect label="Endpoint" value={endpoint} options={[["phone", "Phone number"], ["booking_passenger", "Passenger of the booking"], ["crew", "Crew of the trip"], ["office", "Office team"]]} onChange={setEndpoint} />
      <div hidden={!isPhone}>
        <label className="cfg30-dialog-label">Find one of your users by name or phone<input placeholder="Find one of your users by name or phone" autoComplete="off" value={search} onChange={(e) => setSearch(e.currentTarget.value)} /></label>
        <div className="cfg30-user-hits" hidden={!hits.length}>{hits.map((u) => <button key={u.id} type="button" onClick={() => pick(u)}>{u.name} · {u.phone}</button>)}</div>
        <div>{contacts.map((c, i) => (
          <div key={i} className="cfg30-contact-row">
            <DialogInput label="" type="tel" value={c.phone} required={isPhone && i === 0} placeholder="Mobile number *" onChange={(phone) => setContact(i, { phone })} />
            <DialogInput label="" value={c.name} placeholder="Name (optional)" onChange={(name) => setContact(i, { name })} />
            <button type="button" aria-label="Remove contact" onClick={() => setContacts((cs) => (cs.length === 1 ? [{ phone: "", name: "" }] : cs.filter((_, j) => j !== i)))}>×</button>
          </div>
        ))}</div>
        <button className="cfg30-link" type="button" onClick={() => setContacts((cs) => [...cs, { phone: "", name: "" }])}>+ Add another contact</button>
      </div>
      <div className="cfg30-dialog-label">Booking source</div>
      <label className="cfg30-switch-row"><span><strong>Only some booking sources</strong><small>Off — sent for bookings from every source</small></span>
        <input type="checkbox" checked={onlySources} onChange={(e) => setOnlySources(e.currentTarget.checked)} /><span className="cfg30-switch-ui"></span></label>
      <div hidden={!onlySources}>{SOURCES.map((v) => (
        <label key={v} className="cfg30-check"><input type="checkbox" value={v} checked={sources.has(v)} onChange={(e) => toggle(setSources, v, e.currentTarget.checked)} />{v}</label>
      ))}</div>
      <details className="cfg30-filter"><summary>Filter — optional</summary>
        <label className="cfg30-switch-row"><span><strong>Quiet hours</strong><small>Hold messages overnight, send in the morning</small></span>
          <input type="checkbox" checked={quiet} onChange={(e) => setQuiet(e.currentTarget.checked)} /><span className="cfg30-switch-ui"></span></label>
      </details>
    </CfgModal>
  );
}

/* ---------------- cfg30 pages ---------------- */
type Dialog = { kind: "dial"; entry: Dial | null } | { kind: "group"; group: "crew" | "office" } | { kind: "city" } | { kind: "sub"; entry: Subscription | null } | null;
interface PageProps { data: CfgData; reload: () => Promise<void>; openDialog: (d: Dialog) => void }

function BusinessPage() {
  return (
    <>
      <BlockTitle title="Business Info" icon="business" />
      <SectionCard title="General Information" icon="business"><Grid30>
        <TextField k="operator_name" label="OPERATOR NAME" icon="business" />
        <TextField k="support_email" label="SUPPORT EMAIL" icon="mail" />
      </Grid30></SectionCard>
      <SectionCard title="GST Details" icon="file">
        <SwitchRow k="gst_receivable" title="GST Receivable" desc="Enable if operator collects GST" />
        <Grid30><TextField k="gst_number" label="GST NUMBER" icon="hash" /><TextField k="gst_registration_name" label="GST REGISTRATION NAME" icon="file" /></Grid30>
      </SectionCard>
    </>
  );
}

function WebsitePage() {
  return (
    <>
      <BlockTitle title="Website" icon="website" />
      <SectionCard title="Brand" icon="tag"><Grid30><TextField k="tagline" label="TAGLINE" icon="tag" /><TextField k="company_legal_name" label="COMPANY LEGAL NAME" icon="business" /></Grid30></SectionCard>
      <SectionCard title="Address" icon="map"><Grid30><FieldArea k="address_lines" title="ADDRESS LINES" help="One line per row — appears on the public website footer." /></Grid30></SectionCard>
      <SectionCard title="Contact" icon="phone"><Grid30>
        <TextField k="email" label="EMAIL" icon="mail" /><TextField k="helpline" label="HELPLINE" icon="phone" />
        <TextField k="whatsapp_number" label="WHATSAPP NUMBER" icon="whatsapp" /><TextField k="business_hours" label="BUSINESS HOURS" icon="clock" />
      </Grid30></SectionCard>
      <SectionCard title="Passenger booking links" icon="website">
        <Grid30><TextField k="booking_search_url" label="BOOKING SEARCH URL (HTTPS)" icon="website" placeholder="https://novembertravels.com/bus/search/" autoComplete="url" /></Grid30>
        <p className="cfg30-description">Used by Schedules → Manage → Bookings → Seat Layout → Share. The GDS appends fromCity, toCity and journeyDate using this route’s city IDs. Configure the actual operator booking website and confirm it uses the same city IDs; the link opens route/date search, not a guaranteed single-bus deep link.</p>
      </SectionCard>
      <SectionCard title="Footer" icon="file"><Grid30><TextField k="copyright_line" label="COPYRIGHT LINE" icon="file" /></Grid30></SectionCard>
      <SectionCard title="Policy Details" icon="file">
        <p className="cfg30-description">Operator-specific values used in Terms of Carriage, Refund, and Privacy pages. Empty fields are omitted from the policy.</p>
        <Grid30>
          <NumberField k="boarding_window_minutes" label="BOARDING WINDOW (MINUTES BEFORE DEPARTURE)" unit="MIN" max={1440} />
          <NumberField k="refund_processing_days" label="REFUND PROCESSING (WORKING DAYS)" unit="DAYS" max={365} />
          <NumberField k="carry_on_kg" label="CARRY-ON BAGGAGE LIMIT (KG)" unit="KG" max={250} />
          <NumberField k="check_in_kg" label="CHECK-IN BAGGAGE LIMIT (KG)" unit="KG" max={250} />
          <NumberField k="baggage_liability_inr" label="BAGGAGE LIABILITY CAP (₹)" unit="₹" max={10000000} />
          <NumberField k="child_free_age" label="CHILD FREE TRAVEL AGE LIMIT (YEARS)" unit="YRS" max={21} />
          <NumberField k="unaccompanied_minor_age" label="UNACCOMPANIED MINOR AGE LIMIT (YEARS)" unit="YRS" max={21} />
          <TextField k="jurisdiction_city" label="JURISDICTION CITY" icon="map" />
          <TextField k="jurisdiction_state" label="JURISDICTION STATE" icon="map" />
        </Grid30>
      </SectionCard>
      <SectionCard title="Grievance Officer" icon="user" description="Designated under the IT Rules / DPDP Act. Shown on the Privacy Policy page."><Grid30>
        <TextField k="grievance_officer_name" label="OFFICER NAME" icon="user" placeholder="e.g. Kavya K" />
        <TextField k="grievance_designation" label="DESIGNATION" icon="tag" placeholder="e.g. Proprietor, Director, Manager" />
      </Grid30></SectionCard>
    </>
  );
}

const CALL_HELP = ["*5 code # — Add the driver (or number) to the call — 3-way", "*6 code # — Transfer to the driver — you drop once they answer",
  "*5 # — This passenger's own bus driver", "*5 4521 # — The bus whose number ends in 4521",
  "Two beeps — more than one bus is running on that route; enter the last 4 digits", "Long tone — code not found"];

function CityRow({ row, i, cities, persist }: { row: CityContact; i: number; cities: CityContact[]; persist: (c: CityContact[]) => Promise<void> }) {
  const { ro } = useForm();
  const [name, setName] = useState(row.city);
  const commit = async () => {
    if (name === row.city) return;
    try { await persist(cities.map((c, j) => (j === i ? { ...c, city: name } : c))); } catch (e) { toastError(e); }
  };
  const remove = async () => {
    if (!await confirmDialog("Remove this city?", { danger: true, ok: "Remove" })) return;
    try { await persist(cities.filter((_, j) => j !== i)); } catch (e) { toastError(e); }
  };
  return (
    <div className="cfg30-city">
      <div><span className="cfg30-input-wrap"><Icon30 name="map" /><input value={name} aria-label="City name" disabled={ro} onChange={(e) => setName(e.currentTarget.value)} onBlur={() => void commit()} /></span>
        <button type="button" aria-label="Remove city" disabled={ro} onClick={() => void remove()}><Glyph name="trash" /></button></div>
      <div><Pills values={row.phones} onChange={(phones) => persist(cities.map((c, j) => (j === i ? { ...c, phones } : c)))} /></div>
    </div>
  );
}

function GroupCard({ title, text, includes, extra, group, openDialog }: { title: string; text: string; includes: string; extra: string[]; group: "crew" | "office"; openDialog: (d: Dialog) => void }) {
  const { ro } = useForm();
  return (
    <div className="cfg30-group"><div><b>{title}</b><button type="button" disabled={ro} onClick={() => openDialog({ kind: "group", group })}>Change</button></div>
      <p>{text}</p><p><b>Includes:</b> {includes}</p>
      <div className="cfg30-split-head">Added by you <button type="button" disabled={ro} onClick={() => openDialog({ kind: "group", group })}>+ Add a person</button></div>
      <small>{extra.join(", ") || "Nobody yet."}</small></div>
  );
}

function CommunicationsPage({ data, reload, openDialog }: PageProps) {
  const { ro } = useForm();
  const v = data.sections.communications ?? {};
  const cities = (Array.isArray(v.city_contacts) ? v.city_contacts : []) as CityContact[];
  const persist = async (values: Dict) => { await saveSection("communications", values); await reload(); };
  const delDial = async (d: Dial) => {
    if (!await confirmDialog("Delete this speed dial?", { danger: true, ok: "Delete" })) return;
    try { await api.admin(`${API}/dials/${d.id}`, "DELETE"); await reload(); } catch (e) { toastError(e); }
  };
  return (
    <>
      <BlockTitle title="Communications" icon="communications" />
      <SectionCard title="Call Routing" icon="communications">
        <SwitchRow k="cloud_calling" title="Cloud Calling" desc="Enable cloud-based calling for this operator" />
        <SwitchRow k="passenger_masking" title="Passenger Number Masking" desc="Mask phone numbers in calls to protect passenger and driver privacy" />
        <SwitchRow k="direct_to_vehicle" title="Direct to Vehicle" desc="Route incoming passenger calls to vehicle phone instead of driver personal number" />
        <SwitchRow k="call_individual_drivers" title="Call Individual Drivers" desc="Ring the driver's own mobile from the pickup chart. Turn this off to ring only the bus phone and your office numbers" />
      </SectionCard>
      <SectionCard title="Numbers passengers get on tickets and messages" icon="phone">
        <p className="cfg30-description">Printed on tickets, sent in WhatsApp messages and read out by the assistant.</p>
        <Grid30>
          <TextField k="savetrip_line" label="SAVETRIP LINE" icon="phone" placeholder="Managed calling line" readOnly title="Provider-managed number; cannot edit here" />
          <TextField k="whatsapp_sender" label="WHATSAPP SENDER" icon="whatsapp" placeholder="Managed sender" readOnly title="Provider-managed sender; cannot edit here" />
          <TextField k="support_number" label="SUPPORT NUMBER" icon="phone" />
          <div className="cfg30-field"><span className="cfg30-label">PUBLISHED OFFICE NUMBERS</span>
            <Pills values={list(v.published_office_numbers)} onChange={(x) => persist({ published_office_numbers: x })} /></div>
        </Grid30>
      </SectionCard>
      <SectionCard title="Numbers we dial" icon="communications"><Grid30>
        <div className="cfg30-field"><span className="cfg30-label">ESCALATION CONTACTS</span>
          <Pills values={list(v.escalation_contacts)} onChange={(x) => persist({ escalation_contacts: x })} /></div>
        <div className="cfg30-field"><span className="cfg30-label">RING ORDER</span>
          <RadioCard value="share" label="Share the load" help="Each call starts with a different contact, so nobody fields every call." />
          <RadioCard value="sequential" label="In this order" help="The first contact always rings first; the next only if they miss it." /></div>
      </Grid30></SectionCard>
      <SectionCard title="Cloud calling" icon="communications">
        <p className="cfg30-description">Speed dials: *5 / *6 + code # on a live call — settings save, but actual telephony requires a connected provider.</p>
        <div className="cfg30-split-head"><strong>Speed dials</strong><button type="button" className="cfg30-btn solid" disabled={ro} onClick={() => openDialog({ kind: "dial", entry: null })}><Glyph name="plus" /> Add code</button></div>
        <SwitchRow k="speed_dial_during_calls" title="Speed dial during calls" desc="Staff on a call press *5 or *6 with a code to pull in a driver or number" />
        <SwitchRow k="dial_bus_last4" title="Dial a bus by its last 4 digits" desc="A 4-digit code reaches the driver of the bus whose number ends in these digits" />
        <div className="cfg30-table-scroll"><table className="cfg30-table"><thead><tr><th>CODE</th><th>CALLS</th><th>LABEL</th><th>ACTIVE</th><th></th></tr></thead><tbody>
          {(data.dials ?? []).map((d) => (
            <tr key={d.id}><td><b>{d.code}</b></td><td>PHONE {d.phone || ""}</td><td>{d.label || ""}</td><td>{d.is_active ? "Yes" : "No"}</td>
              <td><button type="button" aria-label="Edit code" disabled={ro} onClick={() => openDialog({ kind: "dial", entry: d })}><Glyph name="edit" /></button>
                <button type="button" aria-label="Delete code" disabled={ro} onClick={() => void delDial(d)}><Glyph name="trash" /></button></td></tr>
          ))}
        </tbody></table></div>
        <div className="cfg30-instructions"><strong>How to use on a call</strong>{CALL_HELP.map((x) => <p key={x}>{x}</p>)}</div>
      </SectionCard>
      <SectionCard title="City-Specific Contacts" icon="map">
        <div className="cfg30-split-head"><small>Ring after the trip’s driver and bus phone, for the booking’s origin and destination city.</small>
          <button type="button" className="cfg30-btn outline" disabled={ro} onClick={() => openDialog({ kind: "city" })}><Glyph name="plus" /> Add City</button></div>
        <div>{cities.map((row, i) => <CityRow key={`${i}:${row.city}`} row={row} i={i} cities={cities} persist={(c) => persist({ city_contacts: c })} />)}</div>
      </SectionCard>
      <SectionCard title="Who is in each group" icon="user"><Grid30>
        <GroupCard group="crew" title="Crew of the trip" text="The people working on that particular bus. Worked out for each booking from the trip sheet."
          includes="driver, conductor, helper, attendant, cleaner and pickup-van drivers." extra={list(v.crew_extra)} openDialog={openDialog} />
        <GroupCard group="office" title="Office team" text="Your back-office people. The same list for every bus."
          includes="org owner, administrator, admin, manager, pickup manager, trip manager, supervisor." extra={list(v.office_extra)} openDialog={openDialog} />
      </Grid30></SectionCard>
      <DeliveryLog variant="card" />
    </>
  );
}

function SubRow({ s, builtin, reload, openDialog }: { s: Subscription; builtin?: boolean; reload: () => Promise<void>; openDialog: (d: Dialog) => void }) {
  const { ro } = useForm();
  const [on, setOn] = useState(!!s.enabled);
  const name = Array.isArray(s.event_types) ? s.event_types.map(eventLabel).join(", ") : eventLabel(str(s.event_types));
  const endpoint = s.endpoint === "booking_passenger" ? "Passenger of the booking" : s.endpoint === "crew" ? "Crew of the trip" : s.endpoint === "office" ? "Office team" : s.display_name || "Phone number";
  const toggle = async (checked: boolean) => {
    setOn(checked);
    try {
      if (builtin) await saveSection("notifications", { [s.endpoint === "crew" ? "builtin_crew_push" : "builtin_office_push"]: checked });
      else await api.admin(`${API}/subscriptions/${s.id}`, "PUT", { enabled: checked });
      await reload();
    } catch (e) { toastError(e); setOn(!checked); }
  };
  const del = async () => {
    if (!await confirmDialog("Delete this subscription?", { danger: true, ok: "Delete" })) return;
    try { await api.admin(`${API}/subscriptions/${s.id}`, "DELETE"); await reload(); } catch (e) { toastError(e); }
  };
  const test = async () => { try { await api.admin(`${API}/subscriptions/${s.id}/test`, "POST", {}); } catch (e) { toastError(e); } };
  return (
    <tr>
      <td>{builtin ? "—" : <span className="cfg30-id">#{s.id}</span>}</td>
      <td>{name}</td><td>{s.channel === "whatsapp" ? "WhatsApp" : "App push"}</td>
      <td>{endpoint}{builtin && <small>built-in</small>}</td>
      <td>{s.only_sources ? (s.booking_sources ?? []).join(", ") : builtin ? "only while the bus is running" : "all booking sources"}</td>
      <td><label className="cfg30-mini-switch"><input type="checkbox" checked={on} disabled={ro} onChange={(e) => void toggle(e.currentTarget.checked)} /><span></span></label></td>
      <td className="cfg30-actions">
        {!builtin && <button type="button" title="Send test" disabled={ro} onClick={() => void test()}><Glyph name="send" /></button>}
        <button type="button" title="Edit" disabled={ro} onClick={() => openDialog(builtin ? { kind: "group", group: s.endpoint as "crew" | "office" } : { kind: "sub", entry: s })}><Glyph name="edit" /></button>
        {!builtin && <button type="button" title="Delete" disabled={ro} onClick={() => void del()}><Glyph name="trash" /></button>}
      </td>
    </tr>
  );
}

function TimeRow({ k, title, help, children, label }: { k: string; title: string; help: string; children?: ReactNode; label?: string }) {
  const f = useField(k, "number");
  return (
    <div className="cfg30-time-row"><div><b>{title}</b><small>{help}</small>{children}</div>
      <input name={k} type="number" min={0} max={43200} value={str(f.vals[k])} aria-label={label} disabled={f.ro} onChange={(e) => f.set(k, e.currentTarget.value)} /></div>
  );
}

function NotificationsPage({ data, reload, openDialog }: PageProps) {
  const f = useForm();
  f.reg("pre_boarding_based_on", "text");
  const v = data.sections.notifications ?? {};
  const builtins: Subscription[] = [
    { endpoint: "crew", event_types: ["New booking"], channel: "push", enabled: !!v.builtin_crew_push },
    { endpoint: "office", event_types: ["New booking"], channel: "push", enabled: !!v.builtin_office_push },
  ];
  return (
    <>
      <BlockTitle title="Notifications" icon="notifications" />
      <SectionCard title="Notification Timing Windows" icon="notifications">
        <p className="cfg30-description">Configure when each notification is sent. Start = minutes before the reference time chosen below.</p>
        <SwitchRow k="bus_live_status" title="Bus Live Status for passengers" desc="Passengers can turn on live bus updates on their phone when they check in. No app needed." />
        <div className="cfg30-timing"><NumberField k="boarding_point_cutoff" label="BOARDING POINT CHANGE CUTOFF" unit="MIN" max={1440}
          help="Passengers can change their own boarding or dropping point from the ticket link until this many minutes before boarding." /></div>
        <TimeRow k="pre_boarding_minutes" title="Pre-Boarding" help="Sent before the boarding point time (open until 1 h after boarding)" label="Pre-boarding minutes">
          <label className="cfg30-inline-select">Based on <select name="pre_boarding_based_on" value={str(f.vals.pre_boarding_based_on)} disabled={f.ro} onChange={(e) => f.set("pre_boarding_based_on", e.currentTarget.value)}>
            <option value="boarding_point">Boarding point</option><option value="departure">Trip departure</option></select></label>
        </TimeRow>
        <TimeRow k="checkin_reminder_minutes" title="Check-in Reminder" help="Reminder sent before the boarding point time." />
        <TimeRow k="rating_request_minutes" title="Rating Request" help="Feedback request sent after the trip, based on the drop time." />
      </SectionCard>
      <SectionCard title="Subscriptions" icon="send">
        <div className="cfg30-split-head"><span>Who is told about booking events, on which channel.</span>
          <button type="button" className="cfg30-btn gradient" disabled={f.ro} onClick={() => openDialog({ kind: "sub", entry: null })}><Glyph name="plus" /> Create subscription</button></div>
        <div className="cfg30-table-scroll"><table className="cfg30-table cfg30-sub-table"><thead><tr>
          {["ID", "EVENT", "PROTOCOL", "ENDPOINT", "FILTER", "STATUS", ""].map((h) => <th key={h}>{h}</th>)}
        </tr></thead><tbody>
          {(data.subscriptions ?? []).map((s) => <SubRow key={s.id} s={s} reload={reload} openDialog={openDialog} />)}
          {builtins.map((s) => <SubRow key={s.endpoint} s={s} builtin reload={reload} openDialog={openDialog} />)}
        </tbody></table></div>
        <p className="cfg30-description">Want these events sent to your own system (ERP, CRM)? A verified outbound integration is required.</p>
        <h4>WHO IS IN EACH GROUP</h4>
        <Grid30>
          <div className="cfg30-group"><b>Crew of the trip</b><p>The people working on that particular bus. Worked out for each booking from the trip sheet.</p>
            <button type="button" disabled={f.ro} onClick={() => openDialog({ kind: "group", group: "crew" })}>Change</button></div>
          <div className="cfg30-group"><b>Office team</b><p>Your back-office people. The same list for every bus.</p>
            <button type="button" disabled={f.ro} onClick={() => openDialog({ kind: "group", group: "office" })}>Change</button></div>
        </Grid30>
        <DeliveryLog variant="inline" />
      </SectionCard>
    </>
  );
}

function UnshownPage({ section }: { section: string }) {
  return (
    <>
      <BlockTitle title={MENU.find((x) => x[0] === section)?.[1] || "Configuration"} icon={section} />
      <SectionCard title="Configuration" icon="file">
        <p className="cfg30-description">This section is in the reference navigation but its controls are not shown in the supplied screenshots. Existing corresponding GDS modules remain available.</p>
        <a className="cfg30-btn outline" href={EXTRA_ROUTES[section] || "#/settings"}>Open related module</a>
      </SectionCard>
    </>
  );
}

/* ---------------- cfg31 building blocks ---------------- */
const TITLES31: Record<string, string> = { pricing: "Pricing", office: "Office Booking", vehicle: "Vehicle Alerts", expenses: "Expenses", seats: "Seat legends", monitoring: "Post-Trip Monitoring", whatsapp: "WhatsApp Alerts", bot: "AI Bot" };
const Heading31 = ({ section }: { section: string }) => (
  <section className="cfg30-block-title cfg31-heading"><Badge31 name={section} color={section} /><div><h2>{TITLES31[section]}</h2><p>Configuration</p></div></section>
);
function Card31({ title, ico, sub, theme, children }: { title: string; ico: string; sub?: string; theme?: string; children: ReactNode }) {
  return (
    <section className="cfg30-card cfg31-card"><div className="cfg30-card-heading"><Badge31 name={ico} color={theme || ico} /><div><h3>{title}</h3>{sub && <p>{sub}</p>}</div></div>{children}</section>
  );
}
function Input31({ k, label, ico, placeholder = "" }: { k: string; label: string; ico?: string; placeholder?: string }) {
  const f = useField(k, "text");
  return (
    <label className="cfg30-field"><span className="cfg30-label">{label}</span>
      <span className="cfg30-input-wrap"><Badge31 name={ico || "user"} /><input type="text" name={k} value={str(f.vals[k])} placeholder={placeholder} disabled={f.ro} onChange={(e) => f.set(k, e.currentTarget.value)} /></span></label>
  );
}
const ONE_DECIMAL = ["fuel_max_odometer_km", "idling_max_odometer_km", "move_distance_km", "response_delay_seconds"];
function Num31({ k, label, unit, max, precision, help }: { k: string; label: string; unit?: string; max: number; precision?: boolean; help?: string }) {
  const f = useField(k, "number");
  const raw = f.vals[k];
  const shown = typeof raw === "number" && precision && Number.isInteger(raw) && ONE_DECIMAL.includes(k) ? raw.toFixed(1) : str(raw);
  return (
    <label className="cfg30-field"><span className="cfg30-label">{label}</span>
      <span className="cfg30-input-wrap cfg30-number-wrap">
        <input name={k} type="number" min={0} max={max} step={precision ? "any" : "1"} value={shown} placeholder={f.base[k] == null ? "99.28" : undefined} disabled={f.ro} onChange={(e) => f.set(k, e.currentTarget.value)} />
        <span className="cfg30-unit">{unit || ""}</span></span>
      {help && <small className="cfg30-help">{help}</small>}</label>
  );
}
function Select31({ k, label, choices, value, onChange, selectRef }: { k: string; label: string; choices: [string, string][]; value?: string; onChange?: (v: string) => void; selectRef?: Ref<HTMLSelectElement> }) {
  const f = useField(k, onChange ? "raw" : "text");
  const withIcon = k === "respond_to_user_types";
  return (
    <label className="cfg30-field"><span className="cfg31-select-title">{label}</span>
      <span className={`cfg31-select-wrap ${withIcon ? "cfg31-select-with-icon" : ""}`}>{withIcon && <Badge31 name="user" />}
        <select ref={selectRef} name={k} aria-label={label} value={value ?? str(f.vals[k])} disabled={f.ro} onChange={(e) => (onChange ? onChange(e.currentTarget.value) : f.set(k, e.currentTarget.value))}>
          {choices.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></span></label>
  );
}
const Note31 = ({ text }: { text: string }) => <p className="cfg31-provider-note"><Svg31 name="bell" /> {text}</p>;
/** Locally edited chip list saved with the section (legacy cfg31 chips). */
function Chips31({ k, kind = "phone" }: { k: string; kind?: "phone" | "keyword" }) {
  const f = useField(k, "raw");
  const items = list(f.vals[k]);
  const [entry, setEntry] = useState("");
  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" && e.key !== ",") return;
    e.preventDefault();
    const inp = e.currentTarget;
    let value = entry.trim();
    value = kind === "phone" ? value.replace(/[\s()+-]/g, "") : value.toLowerCase();
    if (!value) return;
    if (kind === "phone" && !/^[0-9]{10,15}$/.test(value)) { inp.setCustomValidity("Enter a mobile number with 10 to 15 digits."); inp.reportValidity(); return; }
    if (kind !== "phone" && value.length > 90) { inp.setCustomValidity("Keyword must be 90 characters or less."); inp.reportValidity(); return; }
    inp.setCustomValidity("");
    if (items.some((x) => x.toLowerCase() === value.toLowerCase())) { setEntry(""); return; }
    if (items.length >= 40) { inp.setCustomValidity("Maximum 40 entries."); inp.reportValidity(); return; }
    f.set(k, [...items, value]); setEntry("");
  };
  const noun = kind === "phone" ? "number" : "keyword";
  return (
    <div className="cfg31-chipwrap" data-kind={kind} role="group" aria-label={k.replace(/_/g, " ")}>
      {items.map((t) => <span key={t} className="cfg31-chip">{t} <button type="button" aria-label={`Remove ${t}`} disabled={f.ro} onClick={() => f.set(k, items.filter((x) => x !== t))}>×</button></span>)}
      <input type={kind === "phone" ? "tel" : "text"} placeholder={`Add ${noun} and press Enter`} aria-label={`Add ${noun}`} value={entry} disabled={f.ro}
        onChange={(e) => { e.currentTarget.setCustomValidity(""); setEntry(e.currentTarget.value); }} onKeyDown={onKey} />
    </div>
  );
}

/* ---------------- cfg31 pages ---------------- */
function PricingPage() {
  return (
    <>
      <Heading31 section="pricing" />
      <Card31 title="Dynamic Pricing" ico="pricing" theme="pricing" sub="AI fare recommendations from live market data, shown on the schedule Fares tab.">
        <SwitchRow k="dynamic_pricing_enabled" title="Dynamic Pricing" desc="Show AI benchmark and recommended fares while editing a schedule's fares." />
        <SwitchRow k="sarathi_ai_assistant_enabled" title="Sarathi AI assistant" desc="Let staff ask questions about this operator’s buses in plain language. Enabling requires the assistant service; you can turn it off here." />
        <div className="cfg31-inset"><Num31 k="manual_pair_fare_hold_hours" label="MANUAL PAIR FARE HOLD" unit="H" max={720} precision />
          <p className="cfg31-help">On auto-priced trips, a fare you set for a single boarding → dropping pair is kept for this many hours after you save it. After that the pair follows the main fare again (main fare × weightage, inside your Min/Max). Trips without auto pricing keep pair fares until you change them. Default 3. Use 0 to always follow the main fare.</p></div>
      </Card31>
      <Note31 text="Pricing and Sarathi switches save preferences only. No model promotion, fare publication or third-party AI activation is performed." />
    </>
  );
}
const HOLD: [string, string][] = [["until_departure", "Until departure"], ["5", "5 minutes"], ["10", "10 minutes"], ["15", "15 minutes"], ["20", "20 minutes"],
  ["30", "30 minutes"], ["45", "45 minutes"], ["60", "1 hour"], ["90", "1 hour 30 minutes"], ["120", "2 hours"], ["180", "3 hours"], ["240", "4 hours"],
  ["360", "6 hours"], ["720", "12 hours"], ["1440", "24 hours"]];
const holdRank = (x: string) => (x === "until_departure" ? Infinity : Number(x));
function OfficePage() {
  const f = useForm();
  const def = useRef<HTMLSelectElement>(null);
  const d = str(f.vals.default_hold), m = str(f.vals.max_hold);
  useEffect(() => { def.current?.setCustomValidity(holdRank(d) > holdRank(m) ? "Default hold cannot exceed maximum hold." : ""); }, [d, m]);
  return (
    <>
      <Heading31 section="office" />
      <Card31 title="Office Booking" ico="office" theme="office" sub="Rules for bookings made at your counters and by your staff in this app.">
        <div className="cfg31-inset"><h4>Seat hold for QR / payment link</h4>
          <Grid30><Select31 k="default_hold" label="DEFAULT HOLD" choices={HOLD} selectRef={def} /><Select31 k="max_hold" label="MAXIMUM HOLD" choices={HOLD} /></Grid30>
          <p className="cfg31-help">The booking screen starts with the default. Staff can change it for a booking, up to the maximum, and can extend a hold only up to the maximum from now. Unpaid seats go back on sale when the hold ends. A hold never runs past departure.</p></div>
      </Card31>
    </>
  );
}
function VehiclePage() {
  return (
    <>
      <Heading31 section="vehicle" />
      <Card31 title="Vehicle Alerts" ico="vehicle" theme="vehicle"><SwitchRow k="enabled" title="Enable Vehicle Alerts" desc="Receive alerts for vehicle anomalies" /></Card31>
      <Card31 title="Fuel Theft Detection" ico="fuel" theme="vehicle"><Grid30>
        <Num31 k="fuel_drop_threshold_liters" label="FUEL DROP THRESHOLD (LITERS)" unit="L" max={10000} precision />
        <Num31 k="fuel_window_minutes" label="WINDOW (MINUTES)" unit="MIN" max={10080} />
        <Num31 k="fuel_max_odometer_km" label="MAX ODOMETER (KM)" unit="KM" max={10000} precision />
        <Num31 k="fuel_max_engine_hours" label="MAX ENGINE HOURS" unit="HRS" max={240} precision />
      </Grid30></Card31>
      <Card31 title="Overspeeding" ico="gauge" theme="vehicle"><Grid30>
        <Num31 k="overspeed_speed_limit_kmh" label="SPEED LIMIT (KM/H)" unit="KM/H" max={250} precision />
        <Num31 k="overspeed_consecutive_readings" label="CONSECUTIVE READINGS" unit="" max={100} />
      </Grid30></Card31>
      <Card31 title="Excessive Idling" ico="fuel" theme="vehicle"><Grid30>
        <Num31 k="idling_duration_minutes" label="DURATION (MINUTES)" unit="MIN" max={1440} />
        <Num31 k="idling_max_odometer_km" label="MAX ODOMETER (KM)" unit="KM" max={1000} precision />
      </Grid30></Card31>
      <Card31 title="Device Offline" ico="signal" theme="vehicle"><Grid30><Num31 k="offline_threshold_minutes" label="OFFLINE THRESHOLD (MINUTES)" unit="MIN" max={10080} /></Grid30></Card31>
      <Card31 title="Alert Recipients" ico="whatsapp" theme="vehicle"><label className="cfg30-field"><span className="cfg30-label">WHATSAPP NUMBERS</span><Chips31 k="alert_recipients" /></label></Card31>
      <Note31 text="An authorized GPS/telematics provider and WhatsApp delivery channel must be connected before vehicle alerts can actually run." />
    </>
  );
}
function ExpensesPage() {
  return (
    <>
      <Heading31 section="expenses" />
      <Card31 title="Expenses" ico="expenses" theme="expenses" sub="Inputs used to work out each trip’s actual expenses.">
        <div className="cfg31-expense"><Num31 k="diesel_cost_per_litre" label="DIESEL COST PER LITRE" unit="₹/L" max={100000} precision />
          <p className="cfg31-help">When a trip completes, its Diesel expense = fuel consumed (from telematics) × this price. Leave empty to keep the route’s Diesel amount.</p></div>
      </Card31>
      <Note31 text="Diesel rate is operator-specific; the reference rate ₹99.28/L is shown as a placeholder, not copied as a live rate." />
    </>
  );
}
const RING: [string, string][] = [["branch", "Branch"], ["mine", "Mine"], ["my_branch", "My branch"], ["agent", "Agent"], ["online_otas", "Online (OTAs)"], ["website", "Website"], ["other", "Other"]];
const SEX: [string, string][] = [["male", "Male"], ["female", "Female"], ["not_given", "Not given"]];
function SeatsPage() {
  const f = useForm();
  f.reg("colors", "raw"); f.reg("ring_channels", "raw");
  const colors = (f.vals.colors ?? {}) as Record<string, string>;
  const ring = list(f.vals.ring_channels);
  const css = (c: string) => ({ ["--legend-color" as string]: c });
  return (
    <>
      <Heading31 section="seats" />
      <Card31 title="Seat legends" ico="seats" theme="seats" sub="Choose what the colours of booked seats show on the Book and Manage seat layouts.">
        <p className="cfg31-help">Using the default: seats filled by gender, ring on Branch and Agent tickets.</p>
        <div className="cfg31-legend-head"><strong>Fill seats by</strong>
          <Select31 k="fill_seats_by" label="Fill seats by" choices={[["gender", "Gender"], ["booking_channel", "Booking channel"], ["none", "None"]]} />
          <span>Male / Female passenger</span></div>
        <div className={`cfg31-legend-swatches ${f.vals.fill_seats_by === "none" ? "cfg31-ghost" : ""}`}>{SEX.map(([key, label]) => (
          <label key={key} className="cfg31-seat-color"><span className="cfg31-color-input" style={css(colors[key] || "#ffffff")}>
            <input type="color" value={colors[key] || "#ffffff"} aria-label={`${label} colour`} disabled={f.ro} onChange={(e) => f.set("colors", { ...colors, [key]: e.currentTarget.value })} /></span>
            <span>{label}</span></label>
        ))}</div>
        <div className="cfg31-horizontal-divider"></div>
        <div className="cfg31-legend-head"><strong>Outer ring by</strong>
          <Select31 k="outer_ring_by" label="Outer ring by" choices={[["booking_channel", "Booking channel"], ["none", "None"]]} />
          <span>Tick a value to ring its seats.</span></div>
        <div className={`cfg31-ring-grid ${f.vals.outer_ring_by === "none" ? "cfg31-ghost" : ""}`}>{RING.map(([key, label]) => (
          <label key={key} className="cfg31-ring-option"><input type="checkbox" checked={ring.includes(key)} disabled={f.ro}
            onChange={(e) => f.set("ring_channels", e.currentTarget.checked ? [...ring, key] : ring.filter((x) => x !== key))} />
            <span className="cfg31-ring-tile" style={css(colors[key] || "#a7adc0")}></span><span>{label}</span></label>
        ))}</div>
        <div className="cfg31-color-tip">Click a colour square to adjust the legend colour.</div>
        <p className="cfg31-seat-footer">Blocked, no-show and selected seats keep their own colours. Passenger view and Copy image always use the default colours.</p>
      </Card31>
    </>
  );
}
function MonitoringPage() {
  return (
    <>
      <Heading31 section="monitoring" />
      <Card31 title="Post-Trip Monitoring" ico="monitoring" theme="monitoring"><SwitchRow k="enabled" title="Enable Post-Trip Monitoring" desc="Monitor vehicles after trips end" /></Card31>
      <Card31 title="Monitoring Thresholds" ico="clock" theme="monitoring"><Grid30 cols={3}>
        <Num31 k="monitor_window_hours" label="MONITOR WINDOW (HOURS)" unit="HRS" max={720} precision />
        <Num31 k="baseline_ttl_hours" label="BASELINE TTL (HOURS)" unit="HRS" max={8760} precision />
        <Num31 k="alert_cooldown_minutes" label="ALERT COOLDOWN (MINUTES)" unit="MIN" max={10080} />
        <Num31 k="move_distance_km" label="MOVE DISTANCE (KM)" unit="KM" max={10000} precision />
        <Num31 k="geofence_radius_meters" label="GEOFENCE RADIUS (METERS)" unit="M" max={100000} precision />
        <Num31 k="move_speed_kmh" label="MOVE SPEED (KM/H)" unit="KM/H" max={250} precision />
        <Num31 k="engine_on_minutes" label="ENGINE ON (MINUTES)" unit="MIN" max={10080} />
        <Num31 k="engine_idle_speed_kmh" label="ENGINE IDLE SPEED (KM/H)" unit="KM/H" max={100} precision />
        <Num31 k="fuel_drop_liters" label="FUEL DROP (LITERS)" unit="L" max={10000} precision />
        <Num31 k="fuel_drop_percent" label="FUEL DROP (%)" unit="%" max={100} precision />
      </Grid30></Card31>
      <Note31 text="Monitoring thresholds are stored, but real alerts require verified GPS/fuel telemetry and an enabled monitoring worker." />
    </>
  );
}
function WhatsAppAlertsPage() {
  return (
    <>
      <Heading31 section="whatsapp" />
      <Card31 title="WhatsApp Operational Alerts" ico="whatsapp" theme="whatsapp">
        <SwitchRow k="enabled" title="Enable WhatsApp Alerts" desc="Send operational alerts via WhatsApp" />
        <label className="cfg30-field"><span className="cfg30-label">RECIPIENTS</span><Chips31 k="recipients" /></label>
      </Card31>
      <Note31 text="This screen cannot send alerts until an authorized WhatsApp Business integration is connected." />
    </>
  );
}
function BotPage() {
  const f = useForm();
  f.reg("metro_ticket_instructions", "text");
  const types = list(f.vals.respond_to_user_types);
  return (
    <>
      <Heading31 section="bot" />
      <Card31 title="AI Bot" ico="bot" theme="bot"><SwitchRow k="enabled" title="Enable AI Bot" desc="Automatically respond to passenger messages" /></Card31>
      <Card31 title="Response Behavior" ico="shine" theme="bot"><Grid30>
        <Select31 k="respond_to_user_types" label="RESPOND TO USER TYPES" value={types[0] ?? "passenger"} onChange={(x) => f.set("respond_to_user_types", [x])}
          choices={[["passenger", "passenger"], ["driver", "driver"], ["agent", "agent"], ["staff", "staff"], ["all", "all"]]} />
        <Num31 k="max_responses_per_passenger" label="MAX RESPONSES PER PASSENGER" unit="" max={1000} />
        <Num31 k="response_delay_seconds" label="RESPONSE DELAY (SECONDS)" unit="SEC" max={120} precision />
        <label className="cfg30-field"><span className="cfg30-label">ESCALATION KEYWORDS</span><Chips31 k="escalation_keywords" kind="keyword" /></label>
      </Grid30></Card31>
      <Card31 title="Metro Integration" ico="metro" theme="bot">
        <SwitchRow k="free_metro_ticket_enabled" title="Free Metro Ticket" desc="Enable free metro ticket for passengers" />
        <div className="cfg31-metro-fields">
          <Input31 k="metro_exchange_point" label="METRO EXCHANGE POINT" ico="map" placeholder="e.g. Metro station" />
          <label className="cfg30-field"><span className="cfg30-label">METRO TICKET INSTRUCTIONS</span>
            <textarea name="metro_ticket_instructions" rows={3} placeholder="Enter the approved passenger instructions" value={str(f.vals.metro_ticket_instructions)} disabled={f.ro}
              onChange={(e) => f.set("metro_ticket_instructions", e.currentTarget.value)} /></label>
        </div>
      </Card31>
      <Note31 text="AI responses and free metro tickets require separate operational integration and a valid metro agreement. Saving these preferences does not issue a ticket." />
    </>
  );
}

const STANDARD: Record<string, (p: PageProps) => ReactNode> = {
  business: BusinessPage, website: WebsitePage, communications: CommunicationsPage, notifications: NotificationsPage,
};
const PAGES31: Record<string, () => ReactNode> = {
  pricing: PricingPage, office: OfficePage, vehicle: VehiclePage, expenses: ExpensesPage, seats: SeatsPage,
  monitoring: MonitoringPage, whatsapp: WhatsAppAlertsPage, bot: BotPage,
};

/* ---------------- section editor ---------------- */
function SectionEditor({ section, data, setData, reload }: { section: string; data: CfgData; setData: (d: CfgData) => void; reload: () => Promise<void> }) {
  usePermissions();
  const ro = !can("settings.modify");
  const base = data.sections[section] ?? {};
  const [vals, setVals] = useState<Dict>(() => ({ ...base }));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const fields = useRef(new Map<string, Kind>());
  const mainRef = useRef<HTMLElement>(null);

  const set = useCallback((k: string, v: unknown) => { setVals((x) => ({ ...x, [k]: v })); setDirty(true); }, []);
  const reg = useCallback((k: string, kind: Kind) => { fields.current.set(k, kind); }, []);
  const ctx: FormCtx = { vals, base, set, reg, ro };

  const payload = (): Dict => {
    const out: Dict = {};
    fields.current.forEach((kind, k) => {
      const v = vals[k];
      if (kind === "bool") out[k] = !!v;
      else if (kind === "number") out[k] = str(v) === "" ? 0 : Number(v);
      else if (kind === "text") out[k] = str(v);
      else out[k] = v;
    });
    if (section === "expenses") out.diesel_cost_per_litre = str(vals.diesel_cost_per_litre).trim() !== "" ? Number(vals.diesel_cost_per_litre) : null;
    if (section === "seats") {
      const colors = (vals.colors ?? {}) as Record<string, string>;
      out.colors = Object.fromEntries(SEX.map(([k]) => [k, colors[k] || "#ffffff"]));
      if (out.outer_ring_by === "none") out.ring_channels = [];
    }
    return out;
  };
  const save = async () => {
    if (!STANDARD[section] && !PAGES31[section]) { toast("Unknown configuration section", "bad"); return; }
    const invalid = mainRef.current?.querySelector<HTMLInputElement>("input:invalid,select:invalid,textarea:invalid");
    if (invalid) { invalid.reportValidity(); invalid.focus(); return; }
    setSaving(true);
    try {
      const r = await saveSection(section, payload());
      setData({ ...data, sections: { ...data.sections, [section]: r.value } });
      setDirty(false); toast("Configuration saved", "ok");
    } catch (e) { toastError(e); } finally { setSaving(false); }
  };

  const props: PageProps = { data, reload, openDialog: setDialog };
  const Std = STANDARD[section], Page31 = PAGES31[section];
  const content = Std ? <Std {...props} /> : Page31 ? <Page31 /> : <UnshownPage section={section} />;
  const close = () => setDialog(null);
  const cities = (Array.isArray(data.sections.communications?.city_contacts) ? data.sections.communications.city_contacts : []) as CityContact[];

  return (
    <Ctx.Provider value={ctx}>
      <div className="cfg30-root">
        <header className="cfg30-header"><Icon30 name="save" /><h1>Configuration</h1>
          <button type="button" className={`cfg30-btn gradient${dirty ? " changed" : ""}`} disabled={ro || saving} onClick={() => void save()}><Glyph name="save" /> Save</button></header>
        <div className="cfg30-layout">
          <aside className="cfg30-sidebar" aria-label="Configuration sections">
            {MENU.map(([key, title]) => <a key={key} className={key === section ? "active" : ""} href={`#/settings/configuration/${key}`}><Icon30 name={key} />{title}</a>)}
          </aside>
          <main ref={mainRef} className="cfg30-main">{content}</main>
        </div>
      </div>
      {dialog?.kind === "dial" && <DialModal entry={dialog.entry} onClose={close} done={reload} />}
      {dialog?.kind === "group" && <GroupModal group={dialog.group} data={data} onClose={close} done={reload} />}
      {dialog?.kind === "city" && <CityModal cities={cities} onClose={close} done={reload} />}
      {dialog?.kind === "sub" && <SubscriptionModal entry={dialog.entry} users={data.users ?? []} onClose={close} done={reload} />}
    </Ctx.Provider>
  );
}

const ALIAS: Record<string, string> = { "business-info": "business", business_info: "business", calling: "communications" };

/** Settings → Configuration (`#/settings/configuration/<section>`). */
export function ConfigurationPage({ section }: { section?: string }) {
  const key = (section && ALIAS[section]) || section || "business";
  const [data, setData] = useState<CfgData>();
  const [error, setError] = useState<string>();
  const [version, setVersion] = useState(0);
  const load = useCallback(async () => {
    try { setData(await api.admin<CfgData>(API)); setError(undefined); setVersion((n) => n + 1); }
    catch (e) { setError(msg(e)); toastError(e); }
  }, []);
  useEffect(() => { setData(undefined); void load(); }, [key, load]);
  if (error) return <div><div className="cfg30-error">{error}</div></div>;
  if (!data) return <div><div className="empty">Loading…</div></div>;
  // Re-mount the editor after each server reload so unsaved edits are discarded exactly like the legacy re-render.
  return <div><SectionEditor key={`${key}:${version}`} section={key} data={data} setData={setData} reload={load} /></div>;
}
