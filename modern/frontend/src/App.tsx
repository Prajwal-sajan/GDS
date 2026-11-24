import { useCallback, useEffect, useRef, useState } from "react";
import { activate, api, ApiError, getKey, login, logout, setKey, type Attempt, type Me, type OutboxRow, type RedBusStatus, type TripRow } from "./api";

import { FleetPanel, ReconciliationPanel, StaffPanel } from "./Operations";
import { CommsPanel, CrmPanel, LedgerPanel, ReportsPanel, SarathiPanel, UsersPanel } from "./Business";

import { AppShell } from "./layouts/AppShell";
import { FeedbackHost } from "./components/ui/feedback";
import { SchedulesPage } from "./features/schedules/SchedulesPage";
import { RoutesPage } from "./features/routes/RoutesPage";
import { RouteEditorPage } from "./features/routes/RouteEditorPage";
import { useHashRoute } from "./navigation/useHashRoute";
import type { Role } from "./navigation/nav";

function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true); setError(undefined);
    try { const d = await fn(); if (mine === seq.current) setData(d); } catch (e) { if (mine === seq.current) setError(e instanceof Error ? e.message : String(e)); } finally { if (mine === seq.current) setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { void reload(); }, [reload]);
  return { data, error, loading, reload };
}

const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

export default function App() {
  const [key, setKeyState] = useState(getKey());
  const [me, setMe] = useState<Me>();
  const [meError, setMeError] = useState<string>();
  const [meTry, setMeTry] = useState(0);
  const { seg } = useHashRoute();
  const signOut = useCallback(() => { void logout(); setKey(""); setKeyState(""); setMe(undefined); setMeError(undefined); window.location.hash = ""; }, []);
  useEffect(() => {
    if (!key) return;
    setMeError(undefined);
    let stale = false;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 10_000);
    Promise.race([api.me(), new Promise<never>((_, rej) => ctl.signal.addEventListener("abort", () => rej(new Error("Server did not respond within 10s (is the API on :5080 running?)"))))])
      .then((m) => { if (!stale) setMe(m); })
      .catch((e) => {
        if (stale) return;
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) { signOut(); return; }
        setMeError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => clearTimeout(timer));
    return () => { stale = true; clearTimeout(timer); ctl.abort(); };
  }, [key, signOut, meTry]);
  if (!key) return <div className="interim"><Login onLogin={(k) => { setKey(k); setKeyState(k); }} /></div>;
  if (meError) return (
    <div className="interim"><div className="login"><h2>Cannot reach JourneyOS</h2><p className="err">{meError}</p>
      <button onClick={() => setMeTry((n) => n + 1)}>Retry</button> <button onClick={signOut}>Sign out</button></div></div>
  );
  if (!me) return <p>Loading…</p>;
  const view = resolveView(seg, me, signOut);
  if (view.redirect) { window.location.replace(`#${view.redirect.replace(/^#/, "")}`); return null; }
  return <><AppShell me={me} seg={seg} onSignOut={signOut}>{view.el}</AppShell><FeedbackHost /></>;
}

/**
 * Legacy URL → screen. Screens marked `interim` are the pre-parity modern panels: functional against the .NET API but NOT yet
 * the legacy layout (tracked per route in docs/modernization/ui-parity-status.json). Routes with no React screen render an
 * explicit "not yet migrated" state — never a fake page.
 */
function resolveView(seg: string[], me: Me, signOut: () => void): { el?: JSX.Element; redirect?: string } {
  const r = me.role as Role;
  const allowed = (roles: Role[]) => roles.includes(r);
  const OPS_R: Role[] = ["owner", "admin", "ops"];
  const ACC_R: Role[] = ["owner", "admin", "accounts"];
  const ALL_R: Role[] = ["owner", "admin", "ops", "accounts", "viewer"];
  const path = seg.join("/");
  if (!path) return { redirect: r === "agent" ? "#/accounts" : "#/trips" };
  // Interim in-page links (NOT the legacy Accounts/Settings tab strips, which are not migrated yet).
  const strip = (label: string, items: [string, string, Role[]][]) => (
    <nav className="row" aria-label={label}>
      {items.filter(([, , roles]) => allowed(roles)).map(([href, text]) => <a key={href} href={href} aria-current={`#/${path}` === href ? "page" : undefined}>{text}</a>)}
    </nav>
  );
  const acct = strip("Accounts sections", [["#/accounts", "Reports", ALL_R], ["#/accounts/transactions", "Ledger", [...ACC_R, "agent"]], ["#/accounts/reconciliation", "Reconciliation", ACC_R]]);
  const integ = strip("Integration sections", [["#/settings/integrations", "RedBus", ALL_R], ["#/settings/integrations/outbox", "Outbox", ALL_R]]);
  const table: [RegExp, Role[], () => JSX.Element, true?][] = [
    [/^trips$/, ALL_R, () => <TripsPanel />],
    [/^gds(\/schedules)?$/, ALL_R, () => <SchedulesPage me={me} />, true],
    [/^gds\/routes$/, ALL_R, () => <RoutesPage me={me} />, true],
    [/^gds\/routes\/\d+$/, ALL_R, () => <RouteEditorPage key={path} me={me} id={Number(seg[2])} />, true],
    [/^crm(\/.*)?$/, ALL_R, () => <CrmPanel me={me} />],
    [/^fleet(\/vehicles)?$/, OPS_R, () => <FleetPanel />],
    [/^fleet\/staff$/, OPS_R, () => <StaffPanel />],
    [/^accounts\/reconciliation$/, ACC_R, () => <>{acct}<ReconciliationPanel /></>],
    [/^accounts\/transactions$/, [...ACC_R, "agent"], () => <>{acct}<LedgerPanel me={me} /></>],
    [/^accounts$/, [...ALL_R, "agent"], () => <>{acct}{r === "agent" ? <LedgerPanel me={me} /> : <ReportsPanel me={me} />}</>],
    [/^accounts\/(analytics|reports(\/.*)?)$/, ALL_R, () => <>{acct}<ReportsPanel me={me} /></>],
    [/^dailyops$/, ALL_R, () => <ReportsPanel me={me} />],
    [/^sarathi$/, ALL_R, () => <SarathiPanel />],
    [/^(chats|calls)(\/.*)?$/, OPS_R, () => <CommsPanel />],
    [/^settings(\/team-access(\/.*)?)?$/, ["owner", "admin"], () => <UsersPanel me={me} />],
    [/^settings\/integrations$/, ALL_R, () => <>{integ}<RedBusPanel onUnauthorized={signOut} /></>],
    [/^settings\/integrations\/outbox$/, ALL_R, () => <>{integ}<OutboxPanel /></>],
  ];
  const hit = table.find(([re]) => re.test(path));
  if (!hit) return { el: <NotMigrated path={path} /> };
  if (!allowed(hit[1])) return { el: <div className="empty" role="alert">You don’t have access to this screen. Ask your administrator.</div> };
  return { el: hit[3] ? hit[2]() : <div className="interim" data-interim={path}>{hit[2]()}</div> };
}

function NotMigrated({ path }: { path: string }) {
  return (
    <div className="empty" role="status" data-testid="not-migrated">
      <b>#/{path}</b> has not been migrated to the React app yet. The legacy screen remains the reference; see docs/modernization/UI_MIGRATION_GAPS.md.
    </div>
  );
}

function Login({ onLogin }: { onLogin: (k: string) => void }) {
  const [mode, setMode] = useState<"user" | "invite" | "key">("user");
  const [f, setF] = useState({ tenant: "demo", phone: "", password: "", key: "", code: "", confirm: "" });
  const [error, setError] = useState<string>();
  const submit = async () => {
    setError(undefined);
    if (mode === "key") { if (f.key.trim()) onLogin(f.key.trim()); return; }
    try {
      if (mode === "invite") {
        if (f.password !== f.confirm) throw new Error("Passwords do not match");
        onLogin((await activate(f.tenant, f.phone, f.code, f.password)).token);
      } else onLogin((await login(f.tenant, f.phone, f.password)).token);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <form className="login" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <h1>JourneyOS</h1>
      <div className="row">
        <button type="button" className={mode === "user" ? "active" : "link"} onClick={() => setMode("user")}>User sign-in</button>
        <button type="button" className={mode === "invite" ? "active" : "link"} onClick={() => setMode("invite")}>Activate with invite code</button>
        <button type="button" className={mode === "key" ? "active" : "link"} onClick={() => setMode("key")}>Service key</button>
      </div>
      {mode !== "key" ? <>
        <label>Operator code<input value={f.tenant} onChange={(e) => setF({ ...f, tenant: e.target.value })} aria-label="Operator code" /></label>
        <label>Phone<input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="numeric" aria-label="Phone" required /></label>
        {mode === "invite" && <label>Invite code<input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} autoComplete="one-time-code" aria-label="Invite code" required /></label>}
        <label>{mode === "invite" ? "New password (min 10)" : "Password"}<input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} aria-label="Password" required minLength={mode === "invite" ? 10 : undefined} autoComplete={mode === "invite" ? "new-password" : "current-password"} /></label>
        {mode === "invite" && <label>Confirm password<input type="password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} aria-label="Confirm password" required autoComplete="new-password" /></label>}
        {mode === "invite" && <p className="muted">Your administrator gives you a one-time code (valid 72 h). You choose your own password.</p>}
      </> : <>
        <label>Admin key<input type="password" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} autoComplete="off" aria-label="Admin key" /></label>
        <p className="muted">Service keys are for automation and break-glass access.</p>
      </>}
      <button type="submit">{mode === "invite" ? "Activate & sign in" : "Sign in"}</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}

function Badge({ s }: { s: string }) { return <span className={`badge b-${s.toLowerCase()}`}>{s}</span>; }

function RedBusPanel({ onUnauthorized }: { onUnauthorized: () => void }) {
  const { data, error, loading, reload } = useLoad<RedBusStatus>(api.status, []);
  const [form, setForm] = useState({ operatorCode: "", callbackUrl: "", outboundEnabled: false });
  const [msg, setMsg] = useState<string>();
  const [range, setRange] = useState({ from: today(), to: today() });

  useEffect(() => { if (data) setForm((f) => ({ ...f, operatorCode: data.operatorCode ?? "", outboundEnabled: data.outboundEnabled })); }, [data]);
  useEffect(() => { if (error?.includes("401") || error === "HTTP 401") onUnauthorized(); }, [error, onUnauthorized]);

  if (loading && !data) return <p>Loading…</p>;
  if (error) return <p className="error" role="alert">{error}</p>;
  if (!data) return null;

  const act = async (f: () => Promise<string>) => {
    setMsg(undefined);
    try { setMsg(await f()); await reload(); } catch (e) { setMsg(e instanceof ApiError ? `Error ${e.status}: ${e.message}` : String(e)); }
  };

  return (
    <section>
      <div className="banner" data-testid="verification">{data.verification}</div>
      <div className="cards">
        <Card label="Provider" value={data.configured ? data.operatorCode ?? "—" : "Not configured"} />
        <Card label="Outbound callbacks" value={data.outboundEnabled ? "Enabled" : "Disabled"} testId="outbound" />
        <Card label="Callback host" value={data.callbackHost ?? "—"} />
        <Card label="Last acknowledged sync" value={data.lastSuccessfulSyncAt ? new Date(data.lastSuccessfulSyncAt).toLocaleString() : "Never"} />
        <Card label="Published inventories" value={String(data.publishedInventories)} />
        <Card label="Cache" value={data.redisConnected ? "Redis connected" : "Degraded (PostgreSQL only)"} />
      </div>

      <h2>Outbox</h2>
      <table><thead><tr><th>Status</th><th>Count</th></tr></thead>
        <tbody>{data.outbox.map((o) => <tr key={o.status}><td><Badge s={o.status} /></td><td>{o.count}</td></tr>)}
          {data.outbox.length === 0 && <tr><td colSpan={2} className="muted">No messages</td></tr>}</tbody></table>

      <h2>RedBus bookings</h2>
      <table><thead><tr><th>Status</th><th>Count</th></tr></thead>
        <tbody>{data.bookings.map((b) => <tr key={b.status}><td>{b.status}</td><td>{b.count}</td></tr>)}
          {data.bookings.length === 0 && <tr><td colSpan={2} className="muted">No RedBus bookings</td></tr>}</tbody></table>

      <h2>Configuration</h2>
      <form className="grid" onSubmit={(e) => { e.preventDefault(); void act(async () => { const r = await api.saveConfig(form.operatorCode, form.callbackUrl, form.outboundEnabled); return `Saved. Outbound ${r.outboundEnabled ? "enabled" : "disabled"}.`; }); }}>
        <label>Operator code<input value={form.operatorCode} onChange={(e) => setForm({ ...form, operatorCode: e.target.value })} required /></label>
        <label>Callback URL (HTTPS, re-enter to change)<input type="url" value={form.callbackUrl} placeholder={data.callbackHost ? `https://${data.callbackHost}/…` : "https://"} onChange={(e) => setForm({ ...form, callbackUrl: e.target.value })} /></label>
        <label className="check"><input type="checkbox" checked={form.outboundEnabled} onChange={(e) => setForm({ ...form, outboundEnabled: e.target.checked })} /> Enable outbound callbacks (only after RedBus approval)</label>
        <button type="submit">Save configuration</button>
      </form>

      <h2>Resync</h2>
      <form className="row" onSubmit={(e) => { e.preventDefault(); void act(async () => { const r = await api.resync(range.from, range.to); return `Queued ${r.searchEvents} SEARCH events and ${r.sourceDestinations} source–destination pairs.`; }); }}>
        <label>From<input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
        <label>To<input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
        <button type="submit">Queue resync</button>
      </form>
      {msg && <p className="note" role="status">{msg}</p>}
    </section>
  );
}

function Card({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return <div className="card"><div className="muted">{label}</div><div className="value" data-testid={testId}>{value}</div></div>;
}

function OutboxPanel() {
  const [status, setStatus] = useState("");
  const { data, error, reload } = useLoad<OutboxRow[]>(() => api.outbox(status || undefined), [status]);
  const [open, setOpen] = useState<number>();
  const [attempts, setAttempts] = useState<Attempt[]>();
  const [msg, setMsg] = useState<string>();

  const show = async (id: number) => { setOpen(id); setAttempts(undefined); setAttempts(await api.attempts(id)); };
  const retry = async (row: OutboxRow) => {
    if (row.status === "Blocked" && !confirm("This message is BLOCKED because delivery was ambiguous. Retry only after RedBus confirms it was NOT processed. Retry now?")) return;
    try { await api.retry(row.id); setMsg(`Message ${row.id} re-queued.`); await reload(); } catch (e) { setMsg(String(e instanceof Error ? e.message : e)); }
  };

  return (
    <section>
      <div className="row">
        <label>Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
            <option value="">All</option>
            {["Pending", "Delivering", "Acknowledged", "Failed", "Blocked", "Superseded"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <button onClick={() => void reload()}>Refresh</button>
      </div>
      {msg && <p className="note" role="status">{msg}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <table>
        <thead><tr><th>#</th><th>Action</th><th>Status</th><th>Attempts</th><th>Last HTTP</th><th>Last error</th><th>Created</th><th /></tr></thead>
        <tbody>
          {data?.map((m) => (
            <tr key={m.id}>
              <td>{m.id}</td><td>{m.actionType}</td><td><Badge s={m.status} /></td><td>{m.attempts}</td><td>{m.lastHttpStatus ?? "—"}</td>
              <td className="wrap">{m.lastError ?? ""}</td><td>{new Date(m.createdAt).toLocaleString()}</td>
              <td>
                <button className="link" onClick={() => void show(m.id)}>Details</button>
                {(m.status === "Failed" || m.status === "Blocked") && <button className="link" onClick={() => void retry(m)}>Retry</button>}
              </td>
            </tr>
          ))}
          {data?.length === 0 && <tr><td colSpan={8} className="muted">No messages</td></tr>}
        </tbody>
      </table>
      {open !== undefined && (
        <div className="drawer" role="dialog" aria-label="Message details">
          <button className="link close" onClick={() => setOpen(undefined)}>Close</button>
          <h3>Message {open}</h3>
          <pre>{JSON.stringify(JSON.parse(data?.find((d) => d.id === open)?.payloadJson ?? "{}"), null, 2)}</pre>
          <h3>Attempts</h3>
          {!attempts ? <p>Loading…</p> : attempts.length === 0 ? <p className="muted">Not attempted (provider disabled or not yet due).</p> : (
            <table><thead><tr><th>At</th><th>HTTP</th><th>Ack</th><th>Error / body</th></tr></thead>
              <tbody>{attempts.map((a) => <tr key={a.id}><td>{new Date(a.at).toLocaleString()}</td><td>{a.httpStatus ?? "—"}</td><td>{a.acknowledged ? "yes" : "no"}</td><td className="wrap">{a.error ?? a.responseBody}</td></tr>)}</tbody></table>
          )}
        </div>
      )}
    </section>
  );
}

function TripsPanel() {
  const [date, setDate] = useState(today());
  const { data, error, reload } = useLoad<TripRow[]>(() => api.trips(date), [date]);
  const [msg, setMsg] = useState<string>();
  const cancel = async (t: TripRow) => {
    if (!confirm(`Cancel service ${t.service} on ${t.travelDate}? All ${t.booked} booked seats will be cancelled with full refund and RedBus will be notified.`)) return;
    try { const r = await api.cancelTrip(t.id); setMsg(`Service cancelled; ${r.cancelledBookings} bookings refunded.`); await reload(); }
    catch (e) { setMsg(String(e instanceof Error ? e.message : e)); }
  };
  return (
    <section>
      <div className="row"><label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Travel date" /></label></div>
      {msg && <p className="note" role="status">{msg}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <table>
        <thead><tr><th>Service</th><th>Route</th><th>Departure</th><th>Status</th><th>Booked</th><th>Held</th><th>Blocked</th><th /></tr></thead>
        <tbody>
          {data?.map((t) => (
            <tr key={t.id}>
              <td>{t.service}</td><td>{t.name}</td><td>{t.departure}</td><td>{t.status}{!t.bookable && t.status === "active" ? " (closed)" : ""}</td>
              <td>{t.booked}</td><td>{t.held}</td><td>{t.blocked}</td>
              <td>{t.status === "active" && <button className="link danger" onClick={() => void cancel(t)}>Cancel service</button>}</td>
            </tr>
          ))}
          {data?.length === 0 && <tr><td colSpan={8} className="muted">No services on this date</td></tr>}
        </tbody>
      </table>
    </section>
  );
}
