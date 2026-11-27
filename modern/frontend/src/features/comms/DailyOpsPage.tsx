/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { CalendarPop } from "../../components/ui/NiceDate";
import { Modal, promptDialog, toast, toastError } from "../../components/ui/feedback";
import { usePermissions } from "../../auth/permissions";
import { addDays, can, fdate, get, inr, post, put, today } from "./commsApi";

// Daily Ops (`#/dailyops`): Daily report + OTA Ratings. Native React port of legacy dailyops-parity-v12 + ota-ratings-v44
// with the same ds-* DOM. Values are only from GDS APIs; unconnected sources render "—" (no fabricated OTA metrics).

const P: Record<string, ReactNode> = {
  clipboard: <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4.5h6M9 8h6M9 12h6M9 16h4" /></>,
  star: <path d="m12 2 3.05 6.18 6.82.99-4.94 4.81 1.17 6.8L12 17.57l-6.1 3.21 1.16-6.8-4.93-4.8 6.82-.99z" />,
  refresh: <><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></>,
  thumbDown: <><path d="M17 14V2" /><path d="M9 18.1 10 14H4.2a2 2 0 0 1-1.9-2.5l2.3-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.8a2 2 0 0 0-1.8 1.1L12 22a3.1 3.1 0 0 1-3-3.9z" /></>,
  msgWarn: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M12 7v4M12 14h.01" /></>,
  chevDown: <path d="m6 9 6 6 6-6" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" /></>,
  close: <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6m0-6-6 6" /></>,
  chat: <><rect x="3" y="4" width="18" height="14" rx="3" /><path d="m7 18-1 3 5-3" /></>,
  bell: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />,
  send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
  phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.34 1.91.66 2.81a2 2 0 0 1-.45 2.11L8.05 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.32 1.85.54 2.81.66A2 2 0 0 1 22 16.92z" />,
  bus: <><rect x="4" y="3" width="16" height="15" rx="3" /><path d="M4 10h16M7 18v3M17 18v3M8 14h.01M16 14h.01" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  gauge: <><path d="M5 18a9 9 0 1 1 14 0" /><path d="m12 13 5-4" /><circle cx="12" cy="13" r="1" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  pin: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  settings: <><path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.8l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.8v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></>,
  search: <><circle cx="10.5" cy="10.5" r="7" /><path d="m16 16 5 5" /></>,
  flag: <path d="M5 22V4M5 4c6-4 8 4 15 0v12c-7 4-9-4-15 0" />,
  info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>,
  arrow: <path d="m9 18 6-6-6-6" />,
};
const Svg = ({ k, n = 20 }: { k: string; n?: number }) => (
  <svg className="ds-svg" width={n} height={n} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{P[k] ?? P.info}</svg>
);
const Btn = ({ action, cls = "", onClick, children }: { action: string; cls?: string; onClick: () => void; children: ReactNode }) => (
  <button type="button" className={`ds-btn ${cls}`} data-ds-action={action} onClick={onClick}>{children}</button>
);
const Kpi = ({ icon, value, label, color, extra }: { icon: string; value: ReactNode; label: string; color: string; extra?: string }) => (
  <div className={`ds-kpi ${color}`}><span className="ds-kpi-icon"><Svg k={icon} n={22} /></span><div className="ds-kpi-text"><b>{value}</b><small>{label}</small>{extra && <em>{extra}</em>}</div></div>
);
const Chip = ({ color = "", children }: { color?: string; children: ReactNode }) => <span className={`ds-chip ${color}`}>{children}</span>;
const Empty = ({ msg }: { msg: string }) => <div className="ds-empty"><Svg k="info" n={25} /> <span>{msg}</span></div>;
const N = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const F = (s?: string | null) => (s ? fdate(String(s).slice(0, 10)) : "—");
const fmt = (s: unknown) => (s == null ? "—" : N(s).toLocaleString("en-IN"));
const niceDate = (s: string) => (s ? `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}` : "");
const fromTime = (s?: string) => (s && /^\d\d:\d\d/.test(s) ? s.slice(0, 5) : "—");
const inRange = (date: string | undefined, from: string, to: string) => Boolean(date && String(date).slice(0, 10) >= from && String(date).slice(0, 10) <= to);
const average = (a: any[]) => (a.length ? (a.reduce((n, x) => n + N(x.rating), 0) / a.length).toFixed(2) : "—");
const counts = (a: any[]) => [1, 2, 3, 4, 5].map((i) => a.filter((x) => N(x.rating) === i).length);

function Table({ heads, cls = "", children }: { heads: [string, string?][]; cls?: string; children: ReactNode }) {
  return (
    <div className="ds-scroll-table"><table className={`ds-table ${cls}`}>
      <thead><tr>{heads.map(([t, ico], i) => <th key={i}>{ico && <span className="ds-th-icon"><Svg k={ico} n={17} /></span>}{t}</th>)}</tr></thead>
      <tbody>{children}</tbody></table></div>
  );
}
function DateBtn({ k, value, onPick }: { k: string; value: string; onPick: (v: string) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const d = value ? new Date(`${value}T00:00:00`) : null;
  const t = d && !isNaN(+d) ? (["from", "to"].includes(k) ? niceDate(value) : d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })) : "Select date";
  return (
    <span className="ds-date-field ds-calbtn-wrap">
      <button ref={ref} type="button" className="ds-calbtn" data-ds-cal={k} aria-label="Choose date" aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
        <span className="ds-calbtn-ic"><Svg k="calendar" n={15} /></span><span>{t}</span><Svg k="chevDown" n={13} /></button>
      <input type="hidden" data-ds-change={k} value={value} readOnly />
      {open && ref.current && <CalendarPop anchor={ref.current} value={value} onClose={() => setOpen(false)} onPick={onPick} />}
    </span>
  );
}

/* ---------------- OTA provider settings (ota-ratings-v44) ---------------- */
const OTA_NAMES: Record<string, string> = { redbus: "RedBus", abhibus: "AbhiBus" };
type Providers = Record<string, { username?: string; password_saved?: boolean; live_connector_available?: boolean; last_fetched_at?: string }>;
function OtaPanel({ provider: initial, providers, canConfigure, canEdit, onCancel, onSaved }: { provider: string; providers: Providers | null; canConfigure: boolean; canEdit: boolean; onCancel: () => void; onSaved: (p: string, s: any) => void }) {
  const [provider, setProvider] = useState(initial);
  const info = providers?.[provider] ?? {};
  const abi = provider === "abhibus";
  const ability = canConfigure && canEdit;
  const user = useRef<HTMLInputElement>(null), pass = useRef<HTMLInputElement>(null);
  useEffect(() => { setProvider(initial); }, [initial]);
  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    try {
      if (!canConfigure) throw new Error("OTA settings are unavailable");
      const result = await put<{ settings: any }>(`/ota-ratings/settings/${provider}`, { username: user.current?.value ?? "", password: pass.current?.value ?? "" });
      if (pass.current) pass.current.value = "";
      onSaved(provider, result.settings);
      toast("Account settings saved. OTA live sync is not yet connected.", "ok");
    } catch (ex) { toastError(ex); }
  };
  return (
    <section className="ds-ota-settings-panel" aria-label="OTA Ratings settings">
      <div className="ds-ota-provider-tabs" role="group" aria-label="Configure OTA provider">
        {["redbus", "abhibus"].map((p) => <button key={p} type="button" data-ds-action={`ota-settings-provider:${p}`} className={provider === p ? "on" : ""} aria-pressed={provider === p} onClick={() => setProvider(p)}>{OTA_NAMES[p]}</button>)}
      </div>
      <h3 className="ds-ota-settings-title">{abi ? "AbhiBus (EDGE) login" : "RedBus operator login"}</h3>
      <p className="ds-ota-settings-description">{abi ? "Your login at edge.abhibus.com. Used to fetch your ratings from AbhiBus. Refresh fetches the latest; it also fetches every 3 hours." : "Set the operator account used for permitted RedBus ratings access. Live syncing requires an approved RedBus connector."}</p>
      <form data-ds-ota-form autoComplete="off" onSubmit={(e) => void save(e)} key={provider}>
        <div className="ds-ota-settings-grid">
          <label className="ds-ota-settings-field"><span>{abi ? "EDGE username" : "RedBus username"}</span>
            <input ref={user} data-ds-ota-username name="username" type="text" maxLength={256} spellCheck={false} defaultValue={info.username || ""} disabled={!ability} autoComplete="off" /></label>
          <label className="ds-ota-settings-field"><span>{abi ? "EDGE password" : "RedBus password"}</span>
            <input ref={pass} data-ds-ota-password name="password" type="password" maxLength={1024} placeholder={info.password_saved ? "Saved. Leave blank to keep it" : "Enter password"} disabled={!ability} autoComplete="new-password" /></label>
        </div>
        <p className="ds-ota-settings-privacy">{abi ? "SaveTrip uses this login only to READ your ratings and reviews; nothing is replied to, rated or sent on AbhiBus. The password is never shown again." : "Credentials are stored for read-only ratings access. No reply, rating or message is posted to RedBus. The password is never shown again."}</p>
        <div className="ds-ota-settings-actions"><button type="button" className="ds-ota-save" data-ds-action="ota-save" disabled={!ability} onClick={() => void save()}>Save</button>
          <button type="button" data-ds-action="ota-cancel" onClick={onCancel}>Cancel</button></div>
        <p className="ds-ota-settings-hint" role="status">{ability ? "Credentials are encrypted on the server when a credential key is configured. Live OTA imports and 3-hour polling are inactive until the provider connector is authorized and implemented." : "Account settings can only be changed by users with Settings Modify permission."}</p>
      </form>
    </section>
  );
}

/* ---------------- page ---------------- */
type View = "overview" | "action" | "all" | "unrated" | "rank";
interface Data { d: any; calls: any; chats: any; ratings: any[]; providers: Providers | null; canConfigure: boolean }
const safe = (u: string) => get(u).catch(() => null);

async function loadDaily(date: string): Promise<Data> {
  const [d, calls, chats, ratings, trips] = await Promise.all([safe(`/daily-ops?date=${encodeURIComponent(date)}`), safe("/calls"), safe("/chats"), safe("/ratings"), safe(`/trips?date=${encodeURIComponent(date)}`)]);
  let providers: Providers | null = null, canConfigure = false;
  try { providers = (await get<{ providers?: Providers }>("/ota-ratings/settings")).providers || {}; canConfigure = true; } catch { /* not permitted */ }
  if (d && Array.isArray(d.fleet?.trips)) {
    const tripMap = new Map<string, any>((trips?.trips || []).map((t: any) => [String(t.id), t]));
    for (const row of d.fleet.trips) {
      const t = tripMap.get(String(row.schedule_id)); if (!t) continue;
      row.checkins = t.counts?.checked_in ?? null;
      row.chat_count = t.unread_chats ?? null;
      row.performance = t.delay_minutes != null && Number(t.delay_minutes) !== 0 ? `${Number(t.delay_minutes) > 0 ? "+" : ""}${t.delay_minutes} min` : null;
      row.call_count = calls?.calls?.filter((c: any) => String(c.schedule_id) === String(row.schedule_id) && String(c.ts || "").slice(0, 10) === date).length ?? null;
    }
    const details = await Promise.all(d.fleet.trips.slice(0, 12).map((r: any) => safe(`/trips/${encodeURIComponent(r.schedule_id)}`)));
    details.forEach((detail: any, i: number) => {
      const row = d.fleet.trips[i], pax = detail?.passengers;
      if (!Array.isArray(pax)) return;
      const active = pax.filter((p: any) => !["cancelled", "released", "hold"].includes(p.status));
      row.pnr_count = new Set(active.map((p: any) => p.pnr)).size;
      row.checkins = active.filter((p: any) => p.status === "checked_in").length;
    });
  }
  return { d, calls, chats, ratings: Array.isArray(ratings?.rows) ? ratings.rows : [], providers, canConfigure };
}

export function DailyOpsPage() {
  usePermissions();
  const [page, setPage] = useState<"report" | "ratings">("report");
  const [view, setView] = useState<View>("overview");
  const [ratingMode, setRatingMode] = useState("service");
  const [date, setDate] = useState(today);
  const [range, setRange] = useState(7);
  const [from, setFrom] = useState(() => addDays(today(), -6));
  const [to, setTo] = useState(today);
  const [service, setService] = useState("all");
  const [search, setSearch] = useState("");
  const [stars, setStars] = useState(0);
  const [follow, setFollow] = useState("All");
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [provider, setProvider] = useState("abhibus");
  const [otaOpen, setOtaOpen] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [status, setStatus] = useState("");
  const [detail, setDetail] = useState<any>(null);
  const [, bump] = useState(0);
  const busy = useRef(false);

  const refresh = useCallback(async (d: string) => {
    if (busy.current) return; busy.current = true; setStatus("Refreshing…");
    try { setData(await loadDaily(d)); } finally { busy.current = false; setStatus(""); }
  }, []);
  useEffect(() => { void refresh(date).catch(toastError); }, [date, refresh]);
  if (!data) return null;

  const access = (p: string) => can(p);
  const ratings = data.ratings;
  const otaMatches = (r: any) => String(r?.ota || "").toLowerCase().replace(/[^a-z]/g, "") === provider;
  const followOf = (r: any) => r?.follow_up || (() => { try { return JSON.parse(localStorage.getItem(`dailyops-v12:${r.id}`) || "{}"); } catch { return {}; } })();
  const writeFollow = async (id: string, v: { status?: string; note?: string }) => {
    localStorage.setItem(`dailyops-v12:${id}`, JSON.stringify(v));
    const r = ratings.find((x) => String(x.id) === String(id)); if (r) r.follow_up = { ...(r.follow_up || {}), ...v };
    await put(`/ratings/${encodeURIComponent(id)}/follow-up`, v); bump((n) => n + 1);
  };
  const doRefresh = async () => { await refresh(date); if (page === "ratings") { try { await post(`/ota-ratings/refresh/${provider}`, {}); } catch (e) { toast((e as Error).message || "Live OTA refresh is not connected", "warn"); } } };
  const textMatch = (x: any) => !search || `${x.passenger_name} ${x.pnr} ${x.phone} ${x.review} ${x.ota}`.toLowerCase().includes(search.toLowerCase());
  const filtered = (useDate = true) => ratings.filter((x) => otaMatches(x) && (!useDate || inRange(x.travel_at || x.rated_at, from, to)) && (service === "all" || String(x.schedule_id || x.service || "") === service) && textMatch(x) && (!stars || N(x.rating) === stars));
  const nav = (
    <div className="ds-subnav">{([["report", "Daily report", "clipboard"], ["ratings", "Ratings", "star"]] as const).map(([k, name, ico]) => (
      <button key={k} className={`ds-subnav-btn ${page === k ? "on" : ""}`} data-ds-action={`page:${k}`} onClick={() => { setPage(k); setSearch(""); setStars(0); }}><span className="ds-subnav-icon"><Svg k={ico} n={22} /></span>{name}</button>
    ))}</div>
  );
  const refreshBtn = (n = 20) => <Btn action="refresh" cls="primary" onClick={() => void doRefresh().catch(toastError)}><Svg k="refresh" n={n} /> Refresh</Btn>;

  /* ----- report ----- */
  const report = () => {
    const head = (
      <div className="ds-report-head"><div className="ds-title"><span className="ds-title-icon"><Svg k="clipboard" n={26} /></span><div><h2>Daily Operations Report</h2><small>Per-service operational metrics</small></div></div>
        <div className="ds-report-controls"><DateBtn k="date" value={date} onPick={setDate} />{refreshBtn()}</div></div>
    );
    if (!data.d) return <div className="ds-report">{head}<Empty msg="Daily operations data unavailable. Check your permissions or API connection." /></div>;
    const fleet: any[] = data.d.fleet?.trips || [], summary = data.d.fleet?.summary || {};
    const calls = (data.calls?.calls || []).filter((x: any) => String(x.ts || "").slice(0, 10) === date);
    const ch = (data.chats?.conversations || []).filter((x: any) => String(x.last_ts || "").slice(0, 10) === date);
    const missed = data.calls ? calls.filter((x: any) => x.direction === "incoming").length : null;
    const outgoing = data.calls ? calls.filter((x: any) => x.direction !== "incoming").length : null;
    const active = fleet.filter((x) => x.status === "active").length, cancelled = fleet.filter((x) => x.status === "cancelled").length;
    const totalPNR = fleet.every((x) => x.pnr_count != null) ? fleet.reduce((a, x) => a + N(x.pnr_count), 0) : null;
    const knownCheckins = fleet.every((x) => x.checkins != null) ? fleet.reduce((a, x) => a + N(x.checkins), 0) : null;
    const knownChats = fleet.every((x) => x.chat_count != null) ? fleet.reduce((a, x) => a + N(x.chat_count), 0) : null;
    const heads: [string, string][] = [["SERVICE", "bus"], ["DEPARTURE", "clock"], ["VEHICLE", "bus"], ["PERFORMANCE", "gauge"], ["OPERATED", "check"], ["STAFF", "users"], ["PASSENGERS", "users"], ["TRACKING", "send"], ["LIVE ALERTS", "bell"], ["CHECK-INS", "check"], ["CHATS", "chat"], ["CALLS", "phone"], ["PICKUP", "pin"], ["DROP", "flag"]];
    return (
      <div className="ds-report">{head}
        <div className="ds-kpi-grid">
          <Kpi icon="calendar" value={`${fmt(active)} / ${fmt(fleet.length)}`} label="SCHEDULES / OPERATED" color="green" />
          <Kpi icon="close" value={fmt(cancelled)} label="CANCELLED" color="red" />
          <Kpi icon="users" value={`${fmt(summary.seats)} / ${fmt(totalPNR)}`} label="PASSENGERS / PNR" color="blue" />
          <Kpi icon="send" value="— / —" label="TRACKING" color="indigo" />
          <Kpi icon="bell" value="— / —" label="LIVE ALERTS" color="purple" />
          <Kpi icon="check" value={`${knownCheckins == null ? "—" : fmt(knownCheckins)} / —`} label="CHECK-INS" color="green" />
          <Kpi icon="chat" value={knownChats == null ? (data.chats ? fmt(ch.length) : "—") : fmt(knownChats)} label="CHATS" color="orange" />
          <Kpi icon="phone" value={data.calls ? `${fmt(missed)} ${fmt(outgoing)}` : "— / —"} label="CALLS (IN / OUT)" color="purple" />
        </div>
        <div className="ds-table-container"><Table heads={heads} cls="ds-report-table">
          {fleet.length ? fleet.map((r, i) => (
            <tr key={i}>
              <td><button className="ds-service" data-ds-action={`service:${r.schedule_id}`} onClick={() => setDetail(r)}><Svg k="bus" n={16} /> {r.service || r.name || "Service"}</button><small className="ds-cell-note">{r.route || r.name || ""}</small></td>
              <td className="ds-departure">{fromTime(r.departure_time)}</td>
              <td className="ds-vehicle">{r.vehicle || "—"}</td>
              <td className="ds-muted">{r.performance == null ? "—" : r.performance}</td>
              <td>{r.status === "active" ? <Chip color="ok"><Svg k="check" n={15} /> Yes</Chip> : <Chip color={r.status === "cancelled" ? "bad" : "warn"}>{r.status || "Unknown"}</Chip>}</td>
              <td className="ds-staff-cell">{(r.crew || []).length ? r.crew.map((x: any, j: number) => <div key={j} className="ds-crew"><span>{x.role || "Crew"}:</span> {x.name || "Unassigned"}</div>) : <span className="ds-muted">—</span>}</td>
              <td className="ds-num"><button className="ds-number-link" data-ds-action={`service:${r.schedule_id}`} onClick={() => setDetail(r)}>{fmt(r.seats)}</button><small className="ds-cell-note">{r.pnr_count == null ? "PNR not linked" : `${fmt(r.pnr_count)} PNR`}</small></td>
              <td className="ds-num">{r.tracking_count == null ? <span className="ds-muted">—</span> : fmt(r.tracking_count)}<small className="ds-cell-note">{r.tracking_viewers == null ? "" : "viewers " + fmt(r.tracking_viewers)}</small></td>
              <td className="ds-num muted-count">{r.live_alerts == null ? "—" : fmt(r.live_alerts)}</td>
              <td className="ds-num">{r.checkins == null ? "—" : fmt(r.checkins)}</td>
              <td className="ds-num">{r.chat_count == null ? "—" : fmt(r.chat_count)}</td>
              <td className="ds-num">{r.call_count == null ? "—" : fmt(r.call_count)}</td>
              <td className="ds-muted">{r.pickup_performance || "—"}</td>
              <td className="ds-muted">{r.drop_performance || "—"}</td>
            </tr>
          )) : <tr><td colSpan={14}><Empty msg="No scheduled services for this date." /></td></tr>}
        </Table></div>
        <p className="ds-data-note"><Svg k="info" n={16} /> Report figures are loaded from the connected GDS. Tracking viewers, live alerts and pickup/drop performance appear as — until their sources are connected; check-ins and PNRs use the Trip API when authorized.</p>
      </div>
    );
  };

  /* ----- ratings ----- */
  const groupBy = (mode: string, items: any[]) => {
    const map = new Map<string, any[]>();
    for (const x of items) { const key = mode === "bus" ? String(x.vehicle_registration || x.vehicle || "Vehicle unlinked") : mode === "driver" ? String(x.driver_name || "Driver unlinked") : String(x.service || x.service_number || x.schedule_id || "Service unlinked"); if (!map.has(key)) map.set(key, []); map.get(key)!.push(x); }
    return [...map.entries()];
  };
  const low14Of = () => ratings.filter((x) => otaMatches(x) && N(x.rating) <= 2 && String(x.rated_at || "").slice(0, 10) >= addDays(today(), -13));
  const ratingsHeader = () => {
    const all = ratings.filter(otaMatches), f = filtered(), low14 = low14Of();
    const services = [...new Map<string, string>(all.filter((x) => x.schedule_id || x.service).map((x) => [String(x.schedule_id || x.service), String(x.service || x.service_number || x.schedule_id)])).entries()];
    const info = data.providers?.[provider];
    const source = info && info.live_connector_available && info.last_fetched_at ? `Updated from ${OTA_NAMES[provider]} · ${info.last_fetched_at}` : `GDS rating records · ${OTA_NAMES[provider]} live feed not connected`;
    const pickRange = (k: "from" | "to", v: string) => { if (k === "from") setFrom(v); else setTo(v); setRange(0); };
    return (
      <>
        <div className="ds-ratings-head"><div className="ds-title"><span className="ds-title-icon"><Svg k="star" n={27} /></span><div><h2>OTA Ratings</h2><small>{source}</small></div></div>
          <div className="ds-head-actions">
            <div className="ds-ota-switch" role="group" aria-label="OTA ratings provider">{["redbus", "abhibus"].map((p) => <button key={p} type="button" data-ds-action={`ota-provider:${p}`} className={provider === p ? "on" : ""} aria-pressed={provider === p} onClick={() => { setProvider(p); setService("all"); setSearch(""); }}>{OTA_NAMES[p]}</button>)}</div>
            <Btn action="settings" cls="primary" onClick={() => setOtaOpen((o) => !o)}><Svg k="settings" n={19} /> Settings</Btn>{refreshBtn(19)}</div></div>
        {otaOpen && <OtaPanel provider={provider} providers={data.providers} canConfigure={data.canConfigure} canEdit={access("settings.modify")} onCancel={() => setOtaOpen(false)}
          onSaved={(p, s) => { setData({ ...data, providers: { ...data.providers, [p]: s } }); setOtaOpen(false); }} />}
        <div className="ds-filter-panel">
          <label><small>Service</small><select data-ds-change="service" value={service} onChange={(e) => setService(e.currentTarget.value)}><option value="all">All services</option>{services.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label><small>{view === "rank" ? "Rank from" : "From"}</small><DateBtn k="from" value={from} onPick={(v) => pickRange("from", v)} /></label>
          <label><small>{view === "rank" ? "Rank to" : "To"}</small><DateBtn k="to" value={to} onPick={(v) => pickRange("to", v)} /></label>
          <div className="ds-range-buttons">{[7, 30, 90, 180].map((d) => <Btn key={d} action={`range:${d}`} cls={range === d ? "on" : ""} onClick={() => { setRange(d); setTo(today()); setFrom(addDays(today(), 1 - d)); }}>{d} days</Btn>)}</div>
        </div>
        <div className="ds-rating-tabs">{([["overview", "Overview"], ["action", null], ["all", "All ratings"], ["unrated", "Not rated"]] as [View, string | null][]).map(([k, n]) => (
          <Btn key={k} action={`tab:${k}`} cls={view === k ? "on" : ""} onClick={() => { setView(k); setSearch(""); setStars(0); }}>{n ?? <>Needs action <i className="ds-red-dot">{fmt(low14.length)}</i></>}</Btn>
        ))}</div>
        <div className="ds-rating-kpis">
          <Kpi icon="star" value={average(all)} label={`${provider.toUpperCase()} RATING`} color="green" extra="From connected GDS records" />
          <Kpi icon="users" value="—" label="RATED" color="blue" extra="Requires total OTA passengers" />
          <Kpi icon="thumbDown" value={fmt(low14.length)} label="1–2★ IN 14 DAYS" color="red" extra="Review and follow up" />
          <Kpi icon="msgWarn" value={average(f)} label="AVERAGE IN THESE DATES" color="purple" extra={`${fmt(f.length)} ratings`} />
        </div>
      </>
    );
  };
  const overview = () => {
    const d = filtered(), grouped = groupBy(ratingMode, d);
    const byDriver = groupBy("driver", d.filter((x) => x.driver_name));
    const toggle = (key: string) => setOpened((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
    return (
      <>
        <section className="ds-section"><header><h3>Service Ratings</h3><p>OTA all-time score next to ratings for the chosen dates. Click a service to expand its linked review records.</p></header>
          <div className="ds-mode-row"><Btn action="mode:service" cls={ratingMode === "service" ? "on" : ""} onClick={() => setRatingMode("service")}>By service</Btn><Btn action="mode:bus" cls={ratingMode === "bus" ? "on" : ""} onClick={() => setRatingMode("bus")}>By bus</Btn><small>Click a row to see what is under it.</small></div>
          <Table cls="ds-rating-table" heads={[[ratingMode === "service" ? "Service / bus" : "Bus / service"], ["Source"], ["RedBus score · all trips"], ["Ratings · all time"], ["7 days"], ["5★ ratings needed"], ["Ratings"], ["Average"], ["1★"], ["2★"], ["3★"], ["4★"], ["5★"]]}>
            {grouped.length ? grouped.map(([key, arr]) => [
              <tr key={key} className="ds-clickable-row" data-ds-action={`expand:${key}`} onClick={() => toggle(key)}>
                <td><span className="ds-row-chevron"><Svg k="arrow" n={15} /></span><b>{key}</b><small className="ds-cell-note">{arr[0]?.ota || "OTA"}</small></td><td>{arr[0]?.ota || "—"}</td>
                <td className="ds-num">—</td><td className="ds-num">—</td><td className="ds-num">—</td><td className="ds-muted">—</td><td className="ds-num">{fmt(arr.length)}</td><td className="ds-num">{average(arr)}</td>
                {counts(arr).map((n, i) => <td key={i} className="ds-num ds-muted">{fmt(n)}</td>)}</tr>,
              opened.has(key) && <tr key={key + ":x"}><td colSpan={13} className="ds-nested-cell"><div className="ds-nested-title">Ratings for {key}</div>
                {arr.map((x, i) => <div key={i}>{x.passenger_name || "Passenger"} · {x.pnr || ""} · {"★".repeat(Math.min(5, N(x.rating)))} <span className="ds-muted">{F(x.rated_at)}</span></div>)}</td></tr>,
            ]) : <tr><td colSpan={13}>No linked reviews in this range.</td></tr>}
          </Table>
          <p className="ds-section-note">RedBus all-time scores and ranking changes require an authorized provider feed. The star counts and date-range averages above are from existing GDS review records; all-time provider values are not inferred.</p></section>
        <section className="ds-section"><header><h3>Ratings by driver</h3></header>
          <Table cls="ds-rating-table" heads={[["Driver"], ["Ratings"], ["Average"], ["1★"], ["2★"], ["3★"], ["4★"], ["5★"]]}>
            {byDriver.length ? byDriver.map(([key, arr]) => <tr key={key}><td>{key}</td><td>{fmt(arr.length)}</td><td>{average(arr)}</td>{counts(arr).map((n, i) => <td key={i} className="ds-num ds-muted">{fmt(n)}</td>)}</tr>)
              : <tr><td colSpan={8}><Empty msg="The current ratings API does not link each rating to a driver. Connect an authorized trip-to-crew history feed to enable this table." /></td></tr>}
          </Table></section>
      </>
    );
  };
  const reply = async (x: any) => {
    if (!access("dailyops.ratings_reply")) return toast("You do not have permission to save replies", "bad");
    const v = await promptDialog("Save GDS operator reply", [{ name: "reply", label: "Reply text", type: "textarea", full: true, required: true, value: x.operator_reply || "" }], { ok: "Save reply" });
    if (v) { await post(`/ratings/${encodeURIComponent(x.id)}/reply`, v); toast("Reply saved in GDS (not sent to OTA)", "ok"); await refresh(date); }
  };
  const ReviewRow = ({ x }: { x: any }) => {
    const saved = followOf(x), s = N(x.rating), pill = s <= 2 ? "bad" : s >= 4 ? "ok" : "warn";
    const [st, setSt] = useState(saved.status || "Open"), [note, setNote] = useState(saved.note || "");
    return (
      <article className="ds-review" data-ds-review={x.id}>
        <div className="ds-review-top"><div><span className={`ds-review-star ${pill}`}>★ {s}</span> <b>{x.service || x.service_number || "Trip"} · {x.ota || "OTA"}</b>{x.challenge_status && <> <Chip color="lightblue">{x.challenge_status}</Chip></>}<small>{F(x.rated_at)} · {x.travel_at || ""} · {x.pnr || "No PNR"}</small></div>
          <div className="ds-review-person"><b>{x.passenger_name || "Passenger"}</b><small>{x.phone || ""}</small></div></div>
        {x.review && <p className="ds-review-text">“{x.review}”</p>}
        {x.operator_reply && <p className="ds-operator-reply">Your reply: {x.operator_reply}</p>}
        <div className="ds-review-meta">{x.vehicle_registration || ""} {x.driver_name || ""}</div>
        {view === "action" && (
          <div className="ds-review-controls">
            <select aria-label="Follow-up status" data-ds-follow={x.id} value={st} onChange={(e) => { const v = e.currentTarget.value; setSt(v); writeFollow(x.id, { status: v }).then(() => toast("Follow-up status saved", "ok")).catch(toastError); }}>
              {["Open", "Called", "Working", "Resolved"].map((o) => <option key={o}>{o}</option>)}</select>
            <textarea rows={1} data-ds-comment={x.id} placeholder="What did the passenger say?" value={note} onChange={(e) => setNote(e.currentTarget.value)} />
            <Btn action={`comment:${x.id}`} cls="comment" onClick={() => void writeFollow(x.id, { status: st || "Open", note }).then(() => toast("Follow-up note saved", "ok")).catch(toastError)}><Svg k="chat" n={16} /> Add comment</Btn>
          </div>
        )}
        {!x.operator_reply && access("dailyops.ratings_reply") && <div className="ds-reply-action"><Btn action={`reply:${x.id}`} cls="link" onClick={() => void reply(x).catch(toastError)}>Save operator reply in GDS</Btn></div>}
      </article>
    );
  };
  const list = () => {
    const low = view === "action";
    const rows = (low ? low14Of() : filtered()).filter((x) => (service === "all" || String(x.schedule_id || x.service || "") === service) && textMatch(x) && (!stars || N(x.rating) === stars) && (!low || follow === "All" || (followOf(x).status || "Open") === follow));
    return (
      <section className="ds-section ds-review-list">
        <header className="ds-reviews-head"><div><h3>{low ? "1–2★ ratings last 14 days" : "All ratings"}</h3><p>{low ? "Always the last 14 days, whatever dates are picked" : `${F(from)} – ${F(to)}`}</p></div>
          <label className="ds-search"><Svg k="search" /><input data-ds-input="search" value={search} placeholder="PNR, name, phone, review" onChange={(e) => setSearch(e.currentTarget.value)} /></label></header>
        {low && <div className="ds-helptext">Call the passenger, then reply on the OTA portal — or challenge the rating there if it is unfair.</div>}
        <div className="ds-review-filter">
          {low ? <><span>Follow-up</span>{["All", "Open", "Called", "Working", "Resolved"].map((s) => <Btn key={s} action={`follow:${s}`} cls={follow === s ? "on" : ""} onClick={() => setFollow(s)}>{s}</Btn>)}</>
            : [5, 4, 3, 2, 1].map((s) => <Btn key={s} action={`stars:${s}`} cls={stars === s ? "on" : ""} onClick={() => setStars(s)}>{s} ★</Btn>)}
          {stars ? <Btn action="stars:0" cls="muted" onClick={() => setStars(0)}>Clear</Btn> : null}
        </div>
        {rows.length ? rows.map((x) => <ReviewRow key={x.id} x={x} />) : <Empty msg="No ratings match the selected filters." />}
      </section>
    );
  };
  const unrated = (
    <section className="ds-section"><header><h3>Not rated</h3><p>Passengers with no OTA rating during the selected dates.</p></header>
      <Empty msg="The GDS review API only returns submitted ratings. To list non-respondents accurately, connect OTA invitation records with complete bookings and consent status." /></section>
  );

  return (
    <div>
      <div className="ds-root">{nav}
        {page === "report" ? report() : <div className="ds-ratings">{ratingsHeader()}{view === "overview" ? overview() : view === "unrated" ? unrated : list()}</div>}
        <span className="ds-live-note" role="status" aria-live="polite">{status}</span>
      </div>
      {detail && (
        <Modal portal size="lg" title={`${detail.service} · ${date}`} onClose={() => setDetail(null)}>
          <div className="ds-detail">
            <p><b>Route:</b> {detail.route || detail.name || "—"}</p>
            <p><b>Departure:</b> {detail.departure_time} · <b>Vehicle:</b> {detail.vehicle || "—"}</p>
            <p><b>Staff:</b></p><div>{(detail.crew || []).length ? detail.crew.map((x: any, i: number) => <div key={i}>{x.role}: {x.name || "Unassigned"}</div>) : "—"}</div>
            <p><b>Passengers:</b> {fmt(detail.seats)} · <b>Capacity:</b> {fmt(detail.capacity)} · <b>Occupancy:</b> {detail.occupancy_pct == null ? "—" : `${N(detail.occupancy_pct).toFixed(1)}%`}</p>
            <p><b>Net sales:</b> {inr(detail.net_sales)}</p>
            <p className="ds-muted">This detail is from the existing Daily Ops API.</p>
            <button className="ds-btn primary" data-ds-trip onClick={() => { const sid = detail.schedule_id; setDetail(null); location.hash = `#/trips?date=${encodeURIComponent(date)}&sid=${encodeURIComponent(sid)}`; }}>Open trip workspace</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
