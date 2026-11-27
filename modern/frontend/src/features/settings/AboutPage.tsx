import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "../../api";
import { can, usePermissions } from "../../auth/permissions";

// Settings → About (legacy about-v32 layout, ab32-* classes). Data: GET /about/build.

interface BuildInfo {
  product?: string; description?: string; version: string; short_commit?: string | null; commit_url?: string | null; built_at?: string | null;
  committed_at?: string | null; environment?: string | null; build_id?: string | null; features?: string[];
}
type Tone = "info" | "ok" | "warn" | "error";
interface BeforeInstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }

const SHAPES: Record<string, ReactNode> = {
  bus: <><rect x="3" y="8" width="18" height="11" rx="2" /><path d="M4 14h16M6 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2M10 5v8M7 19v2m10-2v2" /><circle cx="8" cy="19" r="1.5" /><circle cx="16" cy="19" r="1.5" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v5m10-5v5M3 11h18m-13 4h2m4 0h2m-8 3h2" /></>,
  file: <path d="M8 3h7l5 5v13H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM14 3v6h6M9 13h6m-6 4h6" />,
  chat: <><rect x="3" y="4" width="18" height="14" rx="4" /><path d="m8 18-1 3 6-3m-7-7h1m4 0h1m4 0h1" /></>,
  ticket: <path d="M4 5h16v5a2 2 0 0 0 0 4v5H4v-5a2 2 0 0 0 0-4V5zM12 6v12" strokeDasharray="4 2" />,
  layers: <path d="m12 2 9 5-9 5-9-5 9-5zm-9 10 9 5 9-5M3 17l9 5 9-5" />, hash: <path d="M8 3 5 21M17 3 14 21M3 9h18M2 16h18" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>, commit: <><circle cx="12" cy="12" r="3" /><path d="M2 12h7m6 0h7" /></>,
  external: <path d="M14 4h6v6M20 4l-9 9M20 13v7H4V4h7" />, refresh: <><path d="M21 7v6h-6M3 17v-6h6" /><path d="M20 13A8 8 0 0 0 5 7l-2 4m18 2-2 4a8 8 0 0 1-14 0" /></>,
  download: <path d="M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5" />, check: <path d="m4 12 5 5L20 6" />,
};
const Icon = ({ k }: { k: string }) => <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.85} strokeLinecap="round" strokeLinejoin="round">{SHAPES[k] ?? SHAPES.layers}</svg>;
const Badge = ({ k, kind = "blue" }: { k: string; kind?: string }) => <span className={`ab32-icon ab32-${kind}`}><Icon k={k} /></span>;
const FEATURES: Record<string, [string, string, string]> = {
  "GDS Schedules": ["calendar", "#/gds/schedules", "schedules.view"], Tripsheets: ["file", "#/trips", "trips.view"],
  "Passenger Chats": ["chat", "#/chats", "chats.view"], Bookings: ["ticket", "#/gds/schedules", "bookings.create"],
};
const displayTime = (v?: string | null) => (!v || Number.isNaN(Date.parse(v)) ? "Not available"
  : new Date(v).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }));
const standalone = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

// The install prompt fires once per page load, possibly before this screen mounts: capture it at module level.
let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
const installListeners = new Set<() => void>();
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as BeforeInstallPromptEvent; installListeners.forEach((f) => f()); });
window.addEventListener("appinstalled", () => { installedNow = true; deferred = null; installListeners.forEach((f) => f()); });
let servedBuild: string | null | undefined; // build served when this tab loaded (legacy __GDS_SERVED_BUILD__)

function Row({ label, value, k, link }: { label: string; value: string; k: string; link?: string | null }) {
  return (
    <div className="ab32-row"><span className={`ab32-row-symbol ab32-symbol-${k}`}><Icon k={k} /></span><span className="ab32-row-label">{label}</span>
      {link ? <a className="ab32-row-commit" target="_blank" rel="noopener noreferrer" href={link}>{value || "Not available"}<Icon k="external" /></a>
        : <span className="ab32-value">{value || "Not available"}</span>}</div>
  );
}
function Panel({ k, name, subtitle, trailing, children }: { k: string; name: string; subtitle: string; trailing?: ReactNode; children: ReactNode }) {
  return (
    <section className="ab32-panel"><header className="ab32-panel-header"><Badge k={k} /><div className="ab32-panel-heading"><h2>{name}</h2><p>{subtitle}</p></div>{trailing}</header>
      <div className="ab32-panel-body">{children}</div></section>
  );
}
const Status = ({ s, install }: { s?: { text: string; tone: Tone }; install?: boolean }) => (
  <p className="ab32-inline-status" {...(install ? { "data-ab32-install-status": "" } : { "data-ab32-status": "" })} role="status" aria-live="polite" hidden={!s} data-tone={s?.tone}>{s?.text}</p>
);

export function AboutPage() {
  usePermissions();
  const [info, setInfo] = useState<BuildInfo>();
  const [error, setError] = useState<string>();
  const [check, setCheck] = useState<{ busy: boolean; label: string; reload: boolean }>({ busy: false, label: "Check for updates", reload: false });
  const [status, setStatus] = useState<{ text: string; tone: Tone }>();
  const [installStatus, setInstallStatus] = useState<{ text: string; tone: Tone }>();
  const [, bump] = useState(0);

  const load = useCallback(async () => {
    setError(undefined); setInfo(undefined);
    try { const r = await api.admin<BuildInfo>("/about/build"); if (servedBuild === undefined) servedBuild = r.build_id || null; setInfo(r); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const f = () => { bump((n) => n + 1); if (installedNow) setInstallStatus({ text: "App installed successfully.", tone: "ok" }); };
    installListeners.add(f); return () => { installListeners.delete(f); };
  }, []);

  const checkUpdates = async () => {
    if (check.reload) { location.reload(); return; }
    setCheck({ busy: true, label: "Checking…", reload: false });
    try {
      const latest = (await api.admin<BuildInfo>("/about/build")).build_id || null;
      if (servedBuild && latest && servedBuild !== latest) { setStatus({ text: "A newer version is available on this server. Reload to use it.", tone: "ok" }); setCheck({ busy: false, label: "Reload to update", reload: true }); }
      else if (!servedBuild || !latest) { setStatus({ text: "Version comparison unavailable: this deployment does not expose a build identifier.", tone: "warn" }); setCheck({ busy: false, label: "Check for updates", reload: false }); }
      else { setStatus({ text: "You're running the latest version deployed on this server.", tone: "ok" }); setCheck({ busy: false, label: "Check for updates", reload: false }); }
    } catch (e) {
      setStatus({ text: "Unable to check for updates: " + (e instanceof Error ? e.message : "Connection error"), tone: "error" });
      setCheck({ busy: false, label: "Try again", reload: false });
    }
  };
  const install = async () => {
    if (installedNow || standalone()) { setInstallStatus({ text: "This app is already running as an installed application.", tone: "ok" }); return; }
    if (deferred) {
      const prompt = deferred; deferred = null; bump((n) => n + 1);
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        setInstallStatus(choice?.outcome === "accepted" ? { text: "Installation accepted. Follow your browser to finish installing.", tone: "ok" }
          : { text: "Installation was dismissed. You can install it later from your browser menu.", tone: "info" });
      } catch (e) { setInstallStatus({ text: "The install prompt could not be opened: " + (e instanceof Error ? e.message : "browser restriction"), tone: "error" }); }
      return;
    }
    if (/iPad|iPhone|iPod/i.test(navigator.userAgent || "")) setInstallStatus({ text: "On iPhone or iPad, use Share → Add to Home Screen.", tone: "info" });
    else if (!window.isSecureContext) setInstallStatus({ text: "Installing requires HTTPS or localhost. Open this GDS securely, then use your browser’s Install app option.", tone: "warn" });
    else setInstallStatus({ text: "Use your browser menu → Install app (or Add to Home Screen). Your browser has not offered a direct install prompt.", tone: "info" });
  };

  if (error) return <div className="ab32-route"><div className="ab32-error" role="alert">Unable to load About: {error}<button type="button" onClick={() => void load()}>Retry</button></div></div>;
  if (!info) return <div className="ab32-route"><div className="ab32-loading" role="status">Loading app details…</div></div>;

  const date = info.built_at || info.committed_at;
  const env = info.environment || "LOCAL";
  const isInstalled = installedNow || standalone();
  return (
    <div className="ab32-route">
      <div className="ab32-page" data-ab32-page="">
        <main className="ab32-container">
          <section className="ab32-hero">
            <div className="ab32-hero-top"><Badge k="bus" kind="hero" /><div><h1>{info.product || "JourneyOS Operator"}</h1>
              <a className="ab32-domain" href="/" target="_blank" rel="noopener noreferrer"><Icon k="globe" />{location.host || "Local installation"}</a></div></div>
            <p className="ab32-description">{info.description || "Manage your bus operations from one place."}</p>
            <div className="ab32-features">{(info.features ?? Object.keys(FEATURES)).map((name) => {
              const [k, href, perm] = FEATURES[name] ?? ["layers", "#/gds/schedules", "schedules.view"];
              const body = <><span className="ab32-feature-icon"><Icon k={k} /></span>{name}</>;
              return can(perm) ? <a key={name} className="ab32-feature" href={href}>{body}</a> : <span key={name} className="ab32-feature" aria-label={name}>{body}</span>;
            })}</div>
          </section>
          <Panel k="layers" name="Build & Version" subtitle="What you're running right now" trailing={<span className={`ab32-env ${env === "UAT" ? "uat" : ""}`}><i></i>{env}</span>}>
            <Row label="VERSION" value={info.version + (info.short_commit ? "+" + info.short_commit : "")} k="hash" />
            <Row label={info.built_at ? "BUILT" : date ? "COMMITTED" : "BUILT"} value={displayTime(date)} k="clock" />
            <Row label="COMMIT" value={info.short_commit || "Unavailable"} k="commit" link={info.commit_url} />
            <button className="ab32-action" type="button" disabled={check.busy} onClick={() => void checkUpdates()}><Icon k="refresh" /><span>{check.label}</span></button>
            <Status s={status} />
          </Panel>
          <Panel k="download" name="Install app" subtitle="Add JourneyOS to your home screen">
            <button className="ab32-action" type="button" disabled={isInstalled} onClick={() => void install()}>{isInstalled ? <><Icon k="check" /> Installed</> : <><Icon k="download" /> Install app</>}</button>
            <Status s={installStatus} install />
          </Panel>
          <footer className="ab32-footer">Made for bus operators · © JourneyOS</footer>
        </main>
      </div>
    </div>
  );
}
