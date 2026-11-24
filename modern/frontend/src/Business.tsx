import { useState } from "react";
import { api, type CustomerDetail, type CustomerHit, type Ledger, type Me, type UserRow } from "./api";
import { err, today, useAsync } from "./Operations";

const inr = (n: number | null | undefined) => (n == null ? "—" : `₹${Math.round(n).toLocaleString("en-IN")}`);

type Basis = { actual: number; mixed: number; estimate: number; none: number; trips: number };
function ExpenseBasis({ total }: { total: { expense: number; expenseActual: number; expenseEstimated: number; expenseBasis: Basis } }) {
  const b = total.expenseBasis;
  const pct = total.expense > 0 ? Math.round((100 * total.expenseEstimated) / total.expense) : 0;
  return <span>Expense {inr(total.expenseActual)} recorded + {inr(total.expenseEstimated)} route-template estimate ({pct}% estimated). Trips: {b.actual} actual · {b.mixed} mixed · {b.estimate} estimate · {b.none} no template{b.none > 0 ? " (profit overstated for these)" : ""}.</span>;
}
const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

function Table({ rows, empty = "No rows" }: { rows: Record<string, unknown>[]; empty?: string }) {
  if (!rows.length) return <p className="muted">{empty}</p>;
  const cols = Object.keys(rows[0]).filter((c) => typeof rows[0][c] !== "object" || rows[0][c] === null);
  return (
    <table><thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c}>{r[c] == null ? "—" : String(r[c])}</td>)}</tr>)}</tbody></table>
  );
}

// ---------------------------------------------------------------- CRM
export function CrmPanel({ me }: { me: Me }) {
  const [mode, setMode] = useState("phone");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CustomerHit[]>();
  const [detail, setDetail] = useState<CustomerDetail>();
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string>();
  const canDetail = ["owner", "admin", "ops"].includes(me.role);

  const search = async () => {
    setMsg(undefined); setDetail(undefined);
    try { setHits((await api.passengerSearch(mode, q)).customers); } catch (e) { setMsg(err(e)); setHits(undefined); }
  };
  const open = async (phone: string) => { try { setDetail(await api.customer(phone)); } catch (e) { setMsg(err(e)); } };

  return (
    <section>
      <div className="banner">Exact search by phone (last 7+ digits), email or PNR. Customers are never listed without a query. Phone numbers are masked for read-only roles.</div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <label>Search by<select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Search mode">
          <option value="phone">Phone</option><option value="email">Email</option><option value="pnr">PNR</option></select></label>
        <label>Query<input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search query" /></label>
        <button type="submit">Search</button>
      </form>
      {msg && <p className="error" role="alert">{msg}</p>}
      {hits && hits.length === 0 && <p className="muted">No passenger found.</p>}
      {hits?.map((c) => (
        <div className="card wide" key={c.phone} data-testid="customer-hit">
          <strong>{c.name || "—"}</strong> · {c.phone} · <span className="badge">{c.tier}</span> {c.miles} miles
          <div className="muted">{c.totalTrips} trips · {c.cancelled} cancelled ({c.cancellationPct}%) · {c.upcoming} upcoming · spend {inr(c.spend)} · last travel {c.lastTravel ?? "—"}</div>
          <table><thead><tr><th>PNR</th><th>Date</th><th>Service</th><th>From → To</th><th>Seats</th><th>Status</th><th>Channel</th><th>Amount</th></tr></thead>
            <tbody>{c.bookings.map((b) => <tr key={b.pnr}><td>{b.pnr}</td><td>{b.travelDate}</td><td>{b.service}</td><td>{b.from} → {b.to}</td>
              <td>{b.passengers.map((p) => p.seatCode).join(", ")}</td><td>{b.status}</td><td>{b.channel}</td><td>{inr(b.amount)}</td></tr>)}</tbody></table>
          {canDetail && c.phoneKey && <button className="link" onClick={() => void open(c.phoneKey!)}>Open customer</button>}
        </div>
      ))}
      {detail && (
        <div className="drawer" role="dialog" aria-label="Customer">
          <button className="link close" onClick={() => setDetail(undefined)}>Close</button>
          <h3>{detail.name} · {detail.phone}</h3>
          <p>{detail.loyalty.tier} · {detail.loyalty.miles} miles · {detail.bookings.length} bookings</p>
          <h4>Notes</h4>
          <ul>{detail.notes.map((n) => <li key={n.id}>{n.text} <span className="muted">— {n.by}, {new Date(n.at).toLocaleString()}</span></li>)}</ul>
          <form className="row" onSubmit={(e) => { e.preventDefault(); void api.addNote(detail.phone, note).then(() => { setNote(""); return open(detail.phone); }).catch((x) => setMsg(err(x))); }}>
            <input value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" required maxLength={2000} /><button type="submit">Add note</button>
          </form>
          <h4>Calls</h4><Table rows={detail.calls.map((c) => ({ ts: new Date(c.ts).toLocaleString(), direction: c.direction, status: c.status, seconds: c.durationS, agent: c.agent }))} />
          <h4>Ratings</h4><Table rows={detail.ratings.map((r) => ({ ota: r.ota, rating: r.rating, review: r.review, reply: r.operatorReply }))} />
        </div>
      )}
    </section>
  );
}

export function CommsPanel() {
  const chats = useAsync(() => api.chats(), []);
  const calls = useAsync(() => api.calls(), []);
  const ratings = useAsync(() => api.ratings(), []);
  const [open, setOpen] = useState<string>();
  const thread = useAsync(() => (open ? api.chat(open) : Promise.resolve(undefined)), [open]);
  const [text, setText] = useState("");
  const [call, setCall] = useState({ phone: "", status: "answered", durationS: 0, notes: "" });
  const [msg, setMsg] = useState<string>();
  const run = async (f: () => Promise<string>) => { setMsg(undefined); try { setMsg(await f()); } catch (e) { setMsg(err(e)); } };

  return (
    <section>
      <div className="banner">No messaging or telephony provider is connected. Replies and calls are recorded for the team; nothing is sent to passengers or OTAs.</div>
      {msg && <p className="note" role="status">{msg}</p>}
      <h2>Chats {chats.data ? `(${chats.data.unreadTotal} unread)` : ""}</h2>
      <table><thead><tr><th>Passenger</th><th>Phone</th><th>Service</th><th>Last message</th><th>Unread</th><th /></tr></thead>
        <tbody>{chats.data?.conversations.slice(0, 30).map((c) => <tr key={c.conversationId} className={open === c.conversationId ? "selected" : ""}>
          <td>{c.name}</td><td>{c.phone}</td><td>{c.service}</td><td className="wrap">{c.lastMessage}</td><td>{c.unread}{c.blocked ? " · blocked" : ""}</td>
          <td><button className="link" onClick={() => setOpen(c.conversationId)}>Open</button></td></tr>)}</tbody></table>
      {open && thread.data && (
        <div className="card wide">
          {thread.data.messages.map((m) => <p key={m.id} className={m.direction === "out" ? "out" : ""}><strong>{m.direction === "out" ? m.by : "Passenger"}:</strong> {m.text}
            {m.direction === "out" && <span className="muted"> ({m.deliveryStatus})</span>}</p>)}
          <form className="row" onSubmit={(e) => { e.preventDefault(); void run(async () => { const r = await api.sendChat(open, text); setText(""); await thread.reload(); await chats.reload(); return r.notice; }); }}>
            <input value={text} onChange={(e) => setText(e.target.value)} aria-label="Reply" required /><button type="submit">Record reply</button>
          </form>
        </div>
      )}
      <h2>Calls {calls.data && <span className="muted">{calls.data.stats.total} · {calls.data.stats.answered} answered · {calls.data.stats.missed} missed</span>}</h2>
      <form className="row" onSubmit={(e) => { e.preventDefault(); void run(async () => { const r = await api.logCall(call); await calls.reload(); return r.notice; }); }}>
        <label>Phone<input value={call.phone} onChange={(e) => setCall({ ...call, phone: e.target.value })} required aria-label="Call phone" /></label>
        <label>Status<select value={call.status} onChange={(e) => setCall({ ...call, status: e.target.value })}>{["answered", "missed", "busy", "not_reachable", "logged"].map((s) => <option key={s}>{s}</option>)}</select></label>
        <label>Seconds<input type="number" min={0} value={call.durationS} onChange={(e) => setCall({ ...call, durationS: Number(e.target.value) })} /></label>
        <label>Notes<input value={call.notes} onChange={(e) => setCall({ ...call, notes: e.target.value })} /></label>
        <button type="submit">Log call</button>
      </form>
      <Table rows={(calls.data?.calls ?? []).slice(0, 25).map((c) => ({ ts: new Date(c.ts).toLocaleString(), direction: c.direction, phone: c.phone, passenger: c.passengerName, status: c.status, seconds: c.durationS, agent: c.agent }))} />
      <h2>OTA ratings {ratings.data && <span className="muted">avg {ratings.data.avg} · distribution {ratings.data.distribution.join(" / ")}</span>}</h2>
      <table><thead><tr><th>OTA</th><th>Passenger</th><th>Rating</th><th>Review</th><th>Reply</th><th /></tr></thead>
        <tbody>{ratings.data?.rows.slice(0, 30).map((r) => <tr key={r.id}><td>{r.ota}</td><td>{r.passengerName}</td><td>{"★".repeat(r.rating)}</td><td className="wrap">{r.review}</td><td className="wrap">{r.operatorReply ?? "—"}</td>
          <td>{!r.operatorReply && <button className="link" onClick={() => { const t = prompt("Reply"); if (t) void run(async () => { const x = await api.reply(r.id, t); await ratings.reload(); return x.notice; }); }}>Reply</button>}</td></tr>)}</tbody></table>
    </section>
  );
}

// ---------------------------------------------------------------- Reports
const REPORTS: [string, string][] = [["analytics", "Analytics"], ["daily-ops", "Daily ops"], ["trip-pnl", "Trip P&L"], ["cancellations", "Cancellations"], ["no-shows", "No-shows"], ["frequent-travellers", "Frequent travellers"]];

export function ReportsPanel({ me }: { me: Me }) {
  const [name, setName] = useState("analytics");
  const [range, setRange] = useState({ from: addDays(today(), -6), to: today() });
  const qs = name === "daily-ops" ? `date=${range.to}` : `from=${range.from}&to=${range.to}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = useAsync<any>(() => api.report(name, qs).then((data) => ({ name, data })), [name, qs]);
  const [msg, setMsg] = useState<string>();
  // Only render data belonging to the selected report; a previous report's payload has a different shape.
  const d = r.data?.name === name ? r.data.data : undefined;
  return (
    <section>
      <div className="row">
        <label>Report<select value={name} onChange={(e) => setName(e.target.value)} aria-label="Report">{REPORTS.filter(([k]) => k !== "daily-ops" || ["owner", "admin", "ops"].includes(me.role)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        {name !== "daily-ops" && <label>From<input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} aria-label="From" /></label>}
        <label>{name === "daily-ops" ? "Date" : "To"}<input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} aria-label="To" /></label>
      </div>
      {r.error && <p className="error" role="alert">{r.error}</p>}
      {msg && <p className="note" role="status">{msg}</p>}
      {d && name === "analytics" && <>
        <div className="cards">
          {[["Seats", d.totals.seats], ["Net sales", inr(d.totals.netSales)], ["ASP", inr(d.totals.asp)], ["Occupancy", `${d.totals.occupancyPct}%`], ["Cancellations", d.totals.cancelledPnrs],
            ["Refunds", inr(d.totals.refunds)], ["Expense", inr(d.totals.expense)], ["Profit", inr(d.totals.profit)]].map(([l, v]) => <div className="card" key={l}><div className="muted">{l}</div><div className="value" data-testid={`kpi-${l}`}>{v}</div></div>)}
        </div>
        <p className="muted" data-testid="expense-basis"><ExpenseBasis total={d.totals} /> {d.notes.join(" ")}</p>
        <h3>By day</h3><Table rows={d.rows} />
        <h3>Channels</h3><Table rows={d.channels} />
        <h3>Services</h3><Table rows={d.services} />
      </>}
      {d && name === "daily-ops" && <>
        <div className="cards">
          {[["Trips", d.fleet.summary.trips], ["Running", d.fleet.summary.running], ["Without bus", d.fleet.summary.withoutBus], ["Seats sold", d.fleet.summary.seats],
            ["Booked today", d.earnings.bookings], ["Issued value", inr(d.earnings.amount)], ["Ratings (14d)", d.ratings.average ?? "—"]].map(([l, v]) => <div className="card" key={l}><div className="muted">{l}</div><div className="value">{v}</div></div>)}
        </div>
        <h3>Fleet</h3><Table rows={d.fleet.trips} />
        <h3>Next 7 days</h3><Table rows={d.earnings.next7} />
        <h3>No-shows yesterday</h3><Table rows={d.passengers.noShowsYesterday} empty="None" />
        <h3>Compliance (≤30 days)</h3><Table rows={d.compliance.vehicleDocuments} empty="Nothing expiring" /><Table rows={d.compliance.licences} empty="No licences expiring" />
        <h3>Low ratings</h3><Table rows={d.ratings.low} empty="None" />
      </>}
      {d && name === "trip-pnl" && <>
        <p>{d.summary.trips} trips · net {inr(d.summary.netSales)} · expense {inr(d.summary.expense)} · profit {inr(d.summary.profit)}</p>
        <p className="muted" data-testid="expense-basis"><ExpenseBasis total={d.summary} /></p>
        <table><thead><tr><th>Date</th><th>Service</th><th>Seats</th><th>Occ.</th><th>Net</th><th>Expense</th><th>Basis</th><th>Profit</th><th /></tr></thead>
          <tbody>{d.rows.map((x: { tripId: number; date: string; service: string; seats: number; occupancyPct: number; netSales: number; expense: number; expenseEstimated: number; profit: number; running: boolean; expenseBasis: string }) =>
            <tr key={x.tripId}><td>{x.date}</td><td>{x.service}{x.running ? "" : " (off)"}</td><td>{x.seats}</td><td>{x.occupancyPct}%</td><td>{inr(x.netSales)}</td>
              <td>{x.expenseBasis === "none" ? <span className="muted">no template</span> : inr(x.expense)}</td>
              <td><span className={`badge b-${x.expenseBasis}`} title={x.expenseEstimated ? `${inr(x.expenseEstimated)} estimated` : "all recorded"}>{x.expenseBasis}</span></td><td>{inr(x.profit)}</td>
              <td>{["owner", "admin", "ops"].includes(me.role) && x.running && <button className="link" onClick={() => {
                const cat = prompt("Actual expense category — use the template name to replace its estimate (e.g. Diesel, Tolls, Driver Bata)"); const amt = Number(prompt("Amount (₹)"));
                if (cat && amt >= 0) void api.addExpense(x.tripId, cat, amt, "").then(() => { setMsg("Expense recorded."); return r.reload(); }).catch((e) => setMsg(err(e)));
              }}>Add expense</button>}</td></tr>)}</tbody></table>
      </>}
      {d && ["cancellations", "no-shows"].includes(name) && <><p>{JSON.stringify(d.summary)}</p><Table rows={d.rows} /></>}
      {d && name === "frequent-travellers" && <><p>{d.summary.customers} customers · {d.summary.repeatCustomers} repeat ({d.summary.repeatPct}%)</p><Table rows={d.rows} /></>}
    </section>
  );
}

// ---------------------------------------------------------------- Accounts ledger
function LedgerView({ l, onVoid }: { l: Ledger; onVoid?: (id: number) => void }) {
  return (<>
    <div className="cards">
      <div className="card"><div className="muted">Debits</div><div className="value">{inr(l.totalDebits)}</div></div>
      <div className="card"><div className="muted">Credits</div><div className="value">{inr(l.totalCredits)}</div></div>
      <div className="card"><div className="muted">Balance (owed to operator)</div><div className="value" data-testid="ledger-balance">{inr(l.balance)}</div></div>
    </div>
    <table><thead><tr><th>Date</th><th>Kind</th><th>Reference</th><th>Debit</th><th>Credit</th><th>Balance</th><th>Note</th><th /></tr></thead>
      <tbody>{l.entries.map((e, i) => <tr key={i}><td>{e.date}</td><td>{e.kind}</td><td>{e.ref}</td><td>{e.debit ? inr(e.debit) : ""}</td><td>{e.credit ? inr(e.credit) : ""}</td>
        <td>{inr(e.balance)}</td><td className="wrap">{e.note}</td><td>{e.id && onVoid && <button className="link danger" onClick={() => onVoid(e.id!)}>Void</button>}</td></tr>)}
        {l.entries.length === 0 && <tr><td colSpan={8} className="muted">No entries</td></tr>}</tbody></table>
  </>);
}

export function LedgerPanel({ me }: { me: Me }) {
  const isAgent = me.role === "agent";
  const ch = useAsync(() => (isAgent ? Promise.resolve(undefined) : api.channels()), [isAgent]);
  const [key, setKey] = useState("");
  const l = useAsync(() => (isAgent ? api.myLedger() : key ? api.ledger(key) : Promise.resolve(undefined)), [key, isAgent]);
  const [form, setForm] = useState({ type: "credit", amount: "", note: "" });
  const [msg, setMsg] = useState<string>();
  const options = ch.data ? [...ch.data.agents.map((a) => [a.channelKey, `Agent · ${a.name}${a.commissionPct ? ` (${a.commissionPct}%)` : ""}`]), ...ch.data.otas.map((o) => [o.channelKey, `OTA · ${o.name}`]),
    ...ch.data.branches.map((b) => [b.channelKey, `Branch · ${b.name}`])] : [];
  return (
    <section>
      {!isAgent && <div className="row"><label>Channel<select value={key} onChange={(e) => setKey(e.target.value)} aria-label="Channel">
        <option value="">Select…</option>{options.map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></label></div>}
      {isAgent && <h2>My ledger</h2>}
      {(l.error || ch.error) && <p className="error" role="alert">{l.error ?? ch.error}</p>}
      {msg && <p className="note" role="status">{msg}</p>}
      {l.data && <LedgerView l={l.data} onVoid={isAgent ? undefined : (id) => { if (confirm("Void this entry? It stays in the audit trail.")) void api.voidLedger(id).then(() => l.reload()).catch((e) => setMsg(err(e))); }} />}
      {!isAgent && key && <form className="row" onSubmit={(e) => { e.preventDefault(); void api.addLedger({ channelKey: key, type: form.type, amount: Number(form.amount), note: form.note })
        .then(() => { setForm({ ...form, amount: "", note: "" }); setMsg("Entry posted."); return l.reload(); }).catch((x) => setMsg(err(x))); }}>
        <label>Type<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="credit">credit (received)</option><option value="debit">debit</option></select></label>
        <label>Amount<input type="number" min={0.01} step={0.01} required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} aria-label="Amount" /></label>
        <label>Reference / UTR<input required value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} aria-label="Reference" /></label>
        <button type="submit">Post entry</button>
      </form>}
    </section>
  );
}

// ---------------------------------------------------------------- Sarathi
export function SarathiPanel() {
  const sugg = useAsync(api.suggestions, []);
  const [cid, setCid] = useState<number>();
  const [q, setQ] = useState("");
  const [log, setLog] = useState<{ q: string; text: string; table: Record<string, unknown>[] }[]>([]);
  const [msg, setMsg] = useState<string>();
  const ask = async (question: string) => {
    setMsg(undefined);
    try { const r = await api.ask(question, cid); setCid(r.conversationId); setLog((l) => [...l, { q: question, text: r.answer.text, table: r.answer.table }]); setQ(""); }
    catch (e) { setMsg(err(e)); }
  };
  return (
    <section>
      <div className="banner">Sarathi is a rule-based analyst: it answers from the same report queries as the Reports tab (not an AI model).</div>
      <div className="row">{sugg.data?.map((s) => <button key={s} className="chip" onClick={() => void ask(s)}>{s}</button>)}</div>
      {log.map((m, i) => <div key={i} className="card wide"><p><strong>You:</strong> {m.q}</p><p data-testid="sarathi-answer"><strong>Sarathi:</strong> {m.text}</p><Table rows={m.table.slice(0, 15)} empty="" /></div>)}
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (q.trim()) void ask(q.trim()); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Ask Sarathi" placeholder="Ask about passengers, revenue, occupancy…" maxLength={500} />
        <button type="submit">Ask</button>
        {cid && <button type="button" className="link" onClick={() => { setCid(undefined); setLog([]); }}>New conversation</button>}
      </form>
      {msg && <p className="error" role="alert">{msg}</p>}
    </section>
  );
}

// ---------------------------------------------------------------- Users (IAM)
export function UsersPanel({ me }: { me: Me }) {
  const users = useAsync<UserRow[]>(api.users, []);
  const audit = useAsync(api.audit, []);
  const [form, setForm] = useState({ phone: "", name: "", role: "ops", commissionPct: "" });
  const [msg, setMsg] = useState<string>();
  const [invite, setInvite] = useState<{ name: string; code: string; expiresAt: string }>();
  const roles = me.role === "owner" ? ["owner", "admin", "accounts", "ops", "viewer", "agent"] : ["admin", "accounts", "ops", "viewer", "agent"];
  const act = (f: () => Promise<unknown>, ok: string) => void f().then(() => { setMsg(ok); return users.reload(); }).catch((e) => setMsg(err(e)));
  return (
    <section>
      <h2>Users & Access</h2>
      <div className="banner">Legacy users signed in with SMS OTP, which needs a provider that is not connected. Click <strong>Issue invite</strong>, give the one-time code to the user in person or by phone (valid 72 h); they choose their own password under “Activate with invite code”.</div>
      {invite && <div className="card wide" role="status" data-testid="invite-code">Invite for <strong>{invite.name}</strong>: <code>{invite.code}</code> · expires {new Date(invite.expiresAt).toLocaleString()} · shown once
        <button className="link" onClick={() => setInvite(undefined)}>Dismiss</button></div>}
      {msg && <p className="note" role="status">{msg}</p>}
      <form className="row" onSubmit={(e) => { e.preventDefault(); act(() => api.saveUser({ phone: form.phone, name: form.name, role: form.role, status: "ACTIVE", commissionPct: form.commissionPct ? Number(form.commissionPct) : null }), "User created."); }}>
        <label>Phone<input required pattern="\d{10}" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} aria-label="User phone" /></label>
        <label>Name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="User name" /></label>
        <label>Role<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} aria-label="User role">{roles.map((r) => <option key={r}>{r}</option>)}</select></label>
        {form.role === "agent" && <label>Commission %<input type="number" min={0} max={100} value={form.commissionPct} onChange={(e) => setForm({ ...form, commissionPct: e.target.value })} /></label>}
        <button type="submit">Add user</button>
      </form>
      {users.error && <p className="error" role="alert">{users.error}</p>}
      <table><thead><tr><th>Name</th><th>Phone</th><th>Role</th><th>Legacy role</th><th>Status</th><th>Password</th><th>Last login</th><th /></tr></thead>
        <tbody>{users.data?.map((u) => <tr key={u.id}><td>{u.name}</td><td>{u.phone}</td><td>{u.role}</td><td>{u.legacyRole ?? "—"}</td><td>{u.status}{u.locked ? " · locked" : ""}</td>
          <td>{u.hasPassword ? "active" : u.invitePendingUntil ? <span className="muted">invite pending</span> : <span className="muted">not activated</span>}</td><td>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "—"}</td>
          <td>
            {u.status === "ACTIVE" && <button className="link" onClick={() => void api.invite(u.id).then((r) => { setInvite({ name: u.name, code: r.code, expiresAt: r.expiresAt }); setMsg(undefined); return users.reload(); }).catch((e) => setMsg(err(e)))}>{u.hasPassword ? "Reset via invite" : "Issue invite"}</button>}
            <button className="link" onClick={() => { const p = prompt("New password (min 10 characters)"); if (p) act(() => api.setPassword(u.id, p), "Password set; existing sessions revoked."); }}>Set password</button>
            <button className="link danger" onClick={() => act(() => api.saveUser({ ...u, status: u.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }, u.id), "Status updated.")}>{u.status === "ACTIVE" ? "Deactivate" : "Activate"}</button>
          </td></tr>)}</tbody></table>
      <h2>Audit trail</h2>
      <Table rows={(audit.data ?? []).slice(0, 50).map((a) => ({ at: new Date(a.at).toLocaleString(), actor: a.actor, action: a.action, entity: `${a.entity} ${a.entityId}` }))} />
    </section>
  );
}
