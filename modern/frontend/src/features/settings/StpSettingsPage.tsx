import { useCallback, useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api, logout, setKey } from "../../api";
import { usePermissions, can } from "../../auth/permissions";
import { confirmDialog, toast, toastError } from "../../components/ui/feedback";

// Settings → Branding / Change Password / My devices. Native React port of legacy settings-complete.js
// stp screens; markup and class names kept 1:1 so the stp-* stylesheet applies unchanged.

const ICONS: Record<string, ReactNode> = {
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18" /></>,
  phone: <path d="M15.8 15.4c-2.2 2.2-6.4-2-8.6-4.2S.8 4.8 3 2.6c.8-.8 2-.8 2.8 0L8.3 5A2 2 0 018.8 7l-1.3 2a11.3 11.3 0 007.2 7.2l2-1.3a2 2 0 012 .5l2.4 2.4c.8.8.8 2 0 2.8-1.2 1.2-3.7 1.5-5.3-.2z" />,
  shield: <path d="M12 3l7 3v5c0 5-3.6 8.3-7 10-3.4-1.7-7-5-7-10V6l7-3z" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  mail: <><path d="M4 6h16v12H4z" /><path d="M4 8l8 6 8-6" /></>,
  preview: <><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z" /><circle cx="12" cy="12" r="3" /></>,
  reset: <><path d="M4 4v6h6" /><path d="M20 20v-6h-6" /><path d="M6.5 9A7 7 0 0118 6M17.5 15A7 7 0 016 18" /></>,
  save: <><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v6h8V4M9 20v-6h6v6" /></>,
  badge: <><path d="M9 12l2 2 4-4" /><path d="M12 2l2 2.3 3-.5.5 3L20 9l-2 2 2 2-1.5 2.2.5 3-3-.5L12 22l-2.5-2.3-3 .5.5-3L4 13l2-2-2-2 1.5-2.2-.5-3 3 .5L12 2z" /></>,
  droplet: <path d="M12 3s5 5.5 5 9a5 5 0 01-10 0c0-3.5 5-9 5-9z" />,
  desktop: <><path d="M4 5h16v10H4z" /><path d="M9 19h6M12 15v4" /></>,
  image: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 13l2.5-3 3.5 4 2-2 2 3" /><circle cx="9" cy="9" r="1.2" /></>,
  upload: <><path d="M12 16V6" /><path d="M8 10l4-4 4 4" /><path d="M5 19h14" /></>,
  mobile: <><rect x="8" y="3" width="8" height="18" rx="2" /><path d="M11 18h2" /></>,
  hash: <path d="M9 3L7 21M17 3l-2 18M4 9h16M3 15h16" />,
  brush: <><path d="M13 4l7 7-5 5-7-7z" /><path d="M6 18c-2 0-3 1-3 3 2 0 4-1 4-3 0-1-1-2-1-2s-1 1-1 2z" /></>,
  settings: <><path d="M12 8.4A3.6 3.6 0 1112 15.6 3.6 3.6 0 0112 8.4z" /><path d="M4.6 12a7.7 7.7 0 01.1-1.2l-2-1.6 2-3.5 2.4.8a8.5 8.5 0 012-1.2l.4-2.5h4l.4 2.5a8.5 8.5 0 012 1.2l2.4-.8 2 3.5-2 1.6c.1.4.1.8.1 1.2s0 .8-.1 1.2l2 1.6-2 3.5-2.4-.8a8.5 8.5 0 01-2 1.2l-.4 2.5h-4l-.4-2.5a8.5 8.5 0 01-2-1.2l-2.4.8-2-3.5 2-1.6c-.1-.4-.1-.8-.1-1.2z" /></>,
  bus: <><rect x="4" y="6" width="16" height="10" rx="2" /><path d="M4 12h16M8 16v2M16 16v2M7.5 18a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z" /></>,
  spark: <><path d="M12 2l1.4 4.6L18 8l-4.6 1.4L12 14l-1.4-4.6L6 8l4.6-1.4L12 2z" /><path d="M5 14l.7 2.3L8 17l-2.3.7L5 20l-.7-2.3L2 17l2.3-.7L5 14zm14 1l.5 1.7 1.7.5-1.7.5-.5 1.8-.5-1.8-1.7-.5 1.7-.5.5-1.7z" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 118 0v3" /></>,
  phoneDevice: <><rect x="8" y="3" width="8" height="18" rx="2" /><circle cx="12" cy="17" r="1" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 10v5" /><circle cx="12" cy="7.5" r=".7" fill="currentColor" stroke="none" /></>,
};
const Icon = ({ name }: { name: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name] ?? ICONS.info}</svg>
);
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");
const HEX = /^#[a-f\d]{6}$/i;

function Title({ text, symbol = "bus" }: { text: string; symbol?: string }) {
  return <header className="stp-page-title"><div className="stp-page-title-main"><div className="stp-hero-icon"><Icon name={symbol} /></div><h1>{text}</h1></div></header>;
}
function Card({ heading, icon = "settings", children }: { heading: string; icon?: string; children: ReactNode }) {
  return (
    <section className="stp-brand-card">
      <header className="stp-card-head"><div className="stp-hero-icon" style={{ width: 54, height: 54 }}><Icon name={icon} /></div><h3>{heading}</h3></header>
      {children}
    </section>
  );
}
const Note = ({ text }: { text: string }) => <p className="stp-note-text">{text}</p>;

function StpModal({ title, subtitle, wide, onClose, children }: { title: string; subtitle?: string; wide?: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return createPortal(
    <div className="stp-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`stp-modal ${wide ? "stp-modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="stp-modal-head"><div><h3 style={{ margin: 0, fontSize: 23 }}>{title}</h3>{subtitle && <p className="stp-muted" style={{ margin: "8px 0 0" }}>{subtitle}</p>}</div>
          <button className="stp-modal-close" type="button" aria-label="Close" onClick={onClose}><Icon name="close" /></button></div>
        <div className="stp-modal-body stp-work-modal-body">{children}</div>
        <footer className="stp-modal-foot"><button type="button" className="stp-btn" onClick={onClose}>Close</button></footer>
      </div>
    </div>, document.body);
}

/** legacy screen(): stp-root wrapper with loading + retry panel. */
function useStpLoad<T>(path: string) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    try { setData(await api.admin<T>(path)); setError(undefined); } catch (e) { setError(e instanceof Error ? e.message : String(e)); toastError(e); }
  }, [path]);
  useEffect(() => { void load(); }, [load]);
  return { data, error, reload: load };
}
function StpState({ error, retry }: { error?: string; retry: () => void }) {
  if (!error) return <div className="stp-shell"><div className="stp-empty-panel"><h3>Loading settings…</h3></div></div>;
  return (
    <div className="stp-shell"><Title text="Settings" />
      <div className="stp-empty-panel"><div className="stp-big-ico"><Icon name="info" /></div><h3>Unable to load settings</h3><p>{error}</p></div>
      <button className="stp-btn" type="button" onClick={retry}>Retry</button></div>
  );
}
async function signOutEverywhere() { await logout(); setKey(""); localStorage.removeItem("viewAs"); location.hash = ""; location.reload(); }

/* ---------------- Branding ---------------- */
interface Operator { app_name?: string; operator_name?: string; tagline?: string; helpline_number?: string; support_email?: string; brand_hex?: string; font_family?: string; logo_url?: string }
interface BrandingSettings { color_scheme?: string; pwa_name?: string; pwa_short_name?: string; assets?: Record<string, string | undefined> }
interface BrandingData { operator?: Operator; branding?: BrandingSettings }
interface BrandForm { app_name: string; tagline: string; helpline_number: string; support_email: string; brand_hex: string; font_family: string; color_scheme: string; pwa_name: string; pwa_short_name: string }
type Scheme = "Light" | "Dark" | "System";
const SCHEMES: Scheme[] = ["Light", "Dark", "System"];
const FONTS = ["Poppins", "Inter", "Manrope", "Roboto", "System"];
const UPLOADS: { key: string; label: string; empty?: string; note?: string }[] = [
  { key: "mobile_logo", label: "Mobile logo", note: "Best size 352 × 96 px (shows up to 176 × 48)" },
  { key: "desktop_logo", label: "Desktop logo", empty: "No desktop logo", note: "Best size 576 × 112 px (shows up to 288 × 56). Empty → mobile logo is used" },
  { key: "dark_logo", label: "Logo (dark)", empty: "No logo (dark)" },
  { key: "favicon", label: "Favicon", empty: "No favicon" },
  { key: "signin_background", label: "Signin background", empty: "No signin background" },
];
const palette = (color?: string) => [String(color || "#2563EB").toUpperCase(), "#5686F1", "#7E9EF4", "#A7BDF9", "#C3D3FC"];
const initialForm = (d: BrandingData): BrandForm => {
  const o = d.operator ?? {}, b = d.branding ?? {};
  return { app_name: o.app_name || "", tagline: o.tagline || "", helpline_number: o.helpline_number || "", support_email: o.support_email || "", brand_hex: o.brand_hex || "#2563EB", font_family: o.font_family || "Poppins", color_scheme: b.color_scheme || "Light", pwa_name: b.pwa_name || o.app_name || "", pwa_short_name: b.pwa_short_name || "" };
};

function BrandPreview({ data, form }: { data: BrandingData; form: BrandForm }) {
  const o = data.operator ?? {}, src = data.branding?.assets?.mobile_logo || o.logo_url;
  // Legacy kept the last valid palette while the hex field is mid-edit.
  const [hex, setHex] = useState(form.brand_hex);
  useEffect(() => { if (HEX.test(form.brand_hex)) setHex(form.brand_hex); }, [form.brand_hex]);
  return (
    <div className="stp-brand-hero">
      <div className="stp-brand-left">
        <div className="stp-brand-logo">{src ? <img src={src} alt="Brand logo" /> : <div className="stp-brand-logo-mark"><span>GDS</span> Operator</div>}</div>
        <div className="stp-brand-text"><h2 data-preview-name="">{form.app_name}</h2><p data-preview-tagline="">{form.tagline}</p>
          <div className="stp-brand-chip-row">
            <span className="stp-brand-chip"><Icon name="phone" /><span data-preview-phone="">{form.helpline_number || "—"}</span></span>
            <span className="stp-brand-chip"><Icon name="mail" /><span data-preview-email="">{form.support_email || "—"}</span></span>
          </div></div>
      </div>
      <div className="stp-palette-preview" data-palette-preview="">{palette(hex).map((x, i) => <span key={i} className="sw" style={{ background: x }}></span>)}</div>
    </div>
  );
}
function BrandField({ title, name, value, icon, options, onChange }: { title: string; name: keyof BrandForm; value: string; icon: string; options?: string[]; onChange: (k: keyof BrandForm, v: string) => void }) {
  return (
    <label className="stp-field-wrap"><span className="stp-label">{title}</span>
      <span className="stp-field"><span className="ico"><Icon name={icon} /></span>
        {options
          ? <select data-brand={name} value={value} onChange={(e) => onChange(name, e.currentTarget.value)}>{options.map((x) => <option key={x}>{x}</option>)}</select>
          : <input data-brand={name} value={value} onChange={(e) => onChange(name, e.currentTarget.value)} />}
      </span></label>
  );
}

function BrandingScreen({ data, reload }: { data: BrandingData; reload: () => Promise<void> }) {
  usePermissions();
  const [form, setForm] = useState(() => initialForm(data));
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm(initialForm(data)), [data]);
  const set = (k: keyof BrandForm, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const assets = data.branding?.assets ?? {};
  const swatch = HEX.test(form.brand_hex) ? form.brand_hex : undefined;

  const save = async () => {
    if (!HEX.test(form.brand_hex)) return toast("Brand color must be #RRGGBB", "bad");
    if (form.support_email && !/^\S+@\S+\.\S+$/.test(form.support_email)) return toast("Enter a valid support email", "bad");
    setSaving(true);
    try {
      await api.admin("/settings/branding", "PUT", form);
      localStorage.setItem("stp_brand_scheme", form.color_scheme);
      document.documentElement.style.setProperty("--brand", form.brand_hex);
      document.querySelector("meta[name=theme-color]")?.setAttribute("content", form.brand_hex);
      toast("Branding saved", "ok"); await reload();
    } catch (e) { toastError(e); } finally { setSaving(false); }
  };
  const reset = async () => {
    if (!await confirmDialog("Reset brand fields to the original operator values shown when this screen was opened?", { ok: "Reset" })) return;
    const o = data.operator ?? {}, b = data.branding ?? {};
    setForm({ ...initialForm(data), pwa_name: b.pwa_name || "", font_family: o.font_family || "Poppins" });
    toast("Unsaved changes discarded", "");
  };
  const upload = async (key: string, e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget, file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return toast("Select a PNG, JPEG or WebP image", "bad");
    if (file.size > 1024 * 1024) return toast("Image must be under 1 MB", "bad");
    try {
      const uri = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
      await api.admin(`/settings/branding/assets/${key}`, "POST", { data_url: uri });
      toast("Asset saved", "ok"); await reload();
    } catch (err) { toastError(err); }
  };
  const remove = async (key: string) => {
    if (!await confirmDialog("Remove the uploaded asset?", { danger: true, ok: "Remove" })) return;
    try { await api.admin(`/settings/branding/assets/${key}`, "DELETE"); toast("Asset removed", "ok"); await reload(); } catch (e) { toastError(e); }
  };

  return (
    <div className="stp-shell stp-brand-shell">
      <Title text="Branding" symbol="brush" />
      <div className="stp-brand-toolbar stp-brand-page-actions">
        <button className="stp-btn" type="button" onClick={() => setPreview(true)}><Icon name="preview" /> Preview</button>
        <button className="stp-btn" type="button" onClick={() => void reset()}><Icon name="reset" /> Reset</button>
        <button className="stp-btn primary" type="button" disabled={!can("settings.modify") || saving} onClick={() => void save()}><Icon name="save" /> Save</button>
      </div>
      <div className="stp-brand-preview" data-scheme={form.color_scheme}><BrandPreview data={data} form={form} /></div>

      <Card heading="Identity" icon="badge"><div className="stp-form-grid">
        <BrandField title="App name" name="app_name" value={form.app_name} icon="badge" onChange={set} />
        <BrandField title="Tagline" name="tagline" value={form.tagline} icon="spark" onChange={set} />
        <BrandField title="Helpline" name="helpline_number" value={form.helpline_number} icon="phone" onChange={set} />
        <BrandField title="Support email" name="support_email" value={form.support_email} icon="mail" onChange={set} />
      </div></Card>

      <Card heading="Colors & Typography" icon="settings"><div className="stp-color-panel">
        <div>
          <div className="stp-field-wrap"><label>Brand color</label>
            <div className="stp-color-well"><div className="stp-color-box" data-brand-color-box="" style={swatch ? { background: swatch } : undefined}></div>
              <div className="stp-color-input"><span className="ico"><Icon name="droplet" /></span><input data-brand="brand_hex" value={form.brand_hex} aria-label="Brand color" onChange={(e) => set("brand_hex", e.currentTarget.value)} /></div></div>
            <div className="stp-color-strip">{palette(data.operator?.brand_hex || "#2563EB").map((x, i) => (
              <button key={i} type="button" title={`Choose ${x}`} onClick={() => set("brand_hex", x)}><span className="sw long" style={{ background: x }}></span></button>
            ))}</div></div>
          <div className="stp-field-wrap" style={{ marginTop: 22 }}><label>Color scheme</label>
            <div className="stp-scheme-row">{SCHEMES.map((v) => (
              <button key={v} type="button" className={`stp-scheme ${form.color_scheme === v ? "active" : ""}`} data-scheme={v} onClick={() => set("color_scheme", v)}>
                <Icon name={v === "Light" ? "spark" : v === "Dark" ? "globe" : "desktop"} /> {v}</button>
            ))}</div></div>
        </div>
        <div><BrandField title="Font family" name="font_family" value={form.font_family} icon="badge" options={FONTS} onChange={set} /></div>
      </div></Card>

      <Card heading="Logo & Assets" icon="image">
        <div className="stp-assets-grid">{UPLOADS.map((u) => {
          const src = assets[u.key];
          return (
            <div key={u.key} className="stp-upload-card" data-asset={u.key}><label>{u.label}</label>
              <div className="stp-upload-box">
                <div className="stp-asset-preview">{src ? <img src={src} alt={u.label} /> : <><div className="stp-upload-placeholder"><Icon name="image" /></div><b>{u.empty || "No image"}</b></>}</div>
                <button className="stp-upload-action" type="button" onClick={(e) => (e.currentTarget.nextElementSibling as HTMLInputElement | null)?.click()}><Icon name="upload" /> Upload</button>
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void upload(u.key, e)} />
                {src && <button className="stp-asset-remove" type="button" onClick={() => void remove(u.key)}>Remove</button>}
              </div>
              {u.note && <div className="stp-help-text">{u.note}</div>}
            </div>
          );
        })}</div>
        <div className="stp-note-line">Logos: use PNG, JPEG or WebP under 1 MB. SVG upload is disabled until server-side sanitization is available. Tap the logo in the header to return home.</div>
      </Card>

      <Card heading="PWA Advanced" icon="mobile">
        <div className="stp-form-grid">
          <BrandField title="PWA name" name="pwa_name" value={form.pwa_name} icon="mobile" onChange={set} />
          <BrandField title="PWA short name" name="pwa_short_name" value={form.pwa_short_name} icon="hash" onChange={set} />
        </div>
        <p className="stp-muted">App name, color and icon are served by the live manifest. Installed apps may need to be restarted or reinstalled to refresh branding; offline support requires a separate service-worker rollout.</p>
      </Card>

      {preview && (
        <StpModal title="Brand preview" subtitle="This preview does not change live settings" wide onClose={() => setPreview(false)}>
          <div className="stp-preview-modal"><BrandPreview data={data} form={form} /></div>
        </StpModal>
      )}
    </div>
  );
}

/* ---------------- Change Password (OTP sign-in; informational as legacy) ---------------- */
function PasswordScreen() {
  const signOut = async () => { if (await confirmDialog("Sign out of this account?", { ok: "Sign out" })) await signOutEverywhere(); };
  return (
    <div className="stp-shell">
      <Title text="Change Password" symbol="lock" />
      <Note text="This GDS signs in using one-time passwords (OTP), not a reusable account password." />
      <Card heading="Account security" icon="shield">
        <p className="stp-muted">Password change is not available because no password credential is stored for this account. Your sign-in is protected by a phone OTP; request a new OTP when signing in.</p>
        <div className="stp-savebar">
          <a className="stp-btn primary" href="#/settings/my-devices"><Icon name="phoneDevice" /> Manage signed-in devices</a>
          <button type="button" className="stp-btn" onClick={() => void signOut()}>Sign out</button>
        </div>
      </Card>
    </div>
  );
}

/* ---------------- My devices ---------------- */
interface Session { id: number | string; user_agent?: string; current?: boolean; created_at?: string; last_seen?: string }
interface SessionsData { sessions: Session[]; has_legacy_session?: boolean }
function DevicesScreen({ data, reload }: { data: SessionsData; reload: () => Promise<void> }) {
  const revoke = async (s: Session) => {
    if (!await confirmDialog("Sign out this device?", { danger: true, ok: "Sign out" })) return;
    try {
      const r = await api.admin<{ current?: boolean }>(`/auth/sessions/${s.id}`, "DELETE");
      if (r?.current) await signOutEverywhere(); else { toast("Device signed out", "ok"); await reload(); }
    } catch (e) { toastError(e); }
  };
  return (
    <div className="stp-shell">
      <Title text="My devices" symbol="phoneDevice" />
      <Note text="Active sign-in sessions for your account. Sign out devices you do not recognize." />
      <Card heading="Signed-in devices" icon="phoneDevice">
        <div className="stp-simple-list">
          {data.sessions.length ? data.sessions.map((s) => (
            <div key={s.id} className="stp-simple-row">
              <div><b>{s.user_agent || "Unknown browser"}{s.current ? " · This device" : ""}</b><small>Signed in: {fmtDate(s.created_at)} · Last seen: {fmtDate(s.last_seen)}</small></div>
              <button className={`stp-btn ${s.current ? "" : "stp-danger"}`} type="button" onClick={() => void revoke(s)}>{s.current ? "Sign out here" : "Sign out device"}</button>
            </div>
          )) : <p>No tracked sessions. Sign in again to register this device.</p>}
          {data.has_legacy_session && <p className="stp-muted">This is a legacy session; sign out and in again to enable device management.</p>}
        </div>
      </Card>
    </div>
  );
}

function BrandingPage() {
  const { data, error, reload } = useStpLoad<BrandingData>("/settings/branding");
  return data ? <BrandingScreen data={data} reload={reload} /> : <StpState error={error} retry={() => void reload()} />;
}
function DevicesPage() {
  const { data, error, reload } = useStpLoad<SessionsData>("/auth/sessions");
  return data ? <DevicesScreen data={data} reload={reload} /> : <StpState error={error} retry={() => void reload()} />;
}

const screens = { branding: BrandingPage, "change-password": PasswordScreen, "my-devices": DevicesPage } as const;

/** Settings → Branding / Change Password / My devices (legacy settings-complete stp screens). */
export function StpSettingsPage({ screen }: { screen: keyof typeof screens }) {
  const Screen = screens[screen];
  return <div className="stp-root"><Screen key={screen} /></div>;
}
