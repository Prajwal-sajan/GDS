import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, getKey, setKey, type Attempt, type OutboxRow, type RedBusStatus, type TripRow } from "./api";

import { DispatchPanel, FaresPanel, FleetPanel, ReconciliationPanel, StaffPanel } from "./Operations";

type Tab = "redbus" | "outbox" | "trips" | "dispatch" | "fleet" | "staff" | "fares" | "recon";
const TABS: [Tab, string][] = [["redbus", "RedBus"], ["outbox", "Outbox"], ["trips", "Trips"], ["dispatch", "Dispatch"], ["fleet", "Fleet"],
  ["staff", "Staff"], ["fares", "Fares"], ["recon", "Reconciliation"]];

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
  const [tab, setTab] = useState<Tab>("redbus");
  if (!key) return <Login onLogin={(k) => { setKey(k); setKeyState(k); }} />;
  return (
    <div className="shell">
      <header>
        <strong>JourneyOS</strong> <span className="muted">Operations</span>
        <nav>
          {TABS.map(([t, label]) => (
            <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{label}</button>
          ))}
        </nav>
        <button className="link" onClick={() => { setKey(""); setKeyState(""); }}>Sign out</button>
      </header>
      <main>
        {tab === "redbus" && <RedBusPanel onUnauthorized={() => { setKey(""); setKeyState(""); }} />}
        {tab === "outbox" && <OutboxPanel />}
        {tab === "trips" && <TripsPanel />}
        {tab === "dispatch" && <DispatchPanel />}
        {tab === "fleet" && <FleetPanel />}
        {tab === "staff" && <StaffPanel />}
        {tab === "fares" && <FaresPanel />}
        {tab === "recon" && <ReconciliationPanel />}
      </main>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (k: string) => void }) {
  const [k, setK] = useState("");
  return (
    <form className="login" onSubmit={(e) => { e.preventDefault(); if (k.trim()) onLogin(k.trim()); }}>
      <h1>JourneyOS Integrations</h1>
      <label>Admin key<input type="password" value={k} onChange={(e) => setK(e.target.value)} autoComplete="off" aria-label="Admin key" /></label>
      <button type="submit">Sign in</button>
      <p className="muted">Interim service-key sign-in. Replaced by JourneyOS IAM when migrated.</p>
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
