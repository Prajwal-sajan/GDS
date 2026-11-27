/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { confirmDialog, toast, toastError } from "../../components/ui/feedback";
import { usePermissions } from "../../auth/permissions";
import { can, fdt, get, hashQuery, post, put, qs } from "./commsApi";

// Chats (`#/chats`) and Calls (`#/calls`): native React port of legacy communications-v14 (cc14-* DOM).
// Messages are saved in the GDS only; no WhatsApp/SMS/PSTN provider is implied.

const ICO: Record<string, string> = {
  plus: "M12 5v14M5 12h14", search: "m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  "eye-off": "M3 3l18 18M10.58 10.59a2 2 0 0 0 2.83 2.83M9.88 5.1A10.9 10.9 0 0 1 12 4c5 0 9.27 3.11 11 8a11.8 11.8 0 0 1-4.05 5.3M6.04 6.05A11.6 11.6 0 0 0 1 12c1.73 4.89 6 8 11 8a11.2 11.2 0 0 0 4.6-.98",
  flag: "M4 22V4m0 1c4-3 7 3 12 0v11c-5 3-8-3-12 0", chat: "M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.6 0-3.1-.4-4.5-1.2L3 20l1.2-5A8.5 8.5 0 1 1 21 11.5Z",
  phone: "M22 16.9v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.7 19.7 0 0 1 2.11 4.1 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.72l.36 2.75a2 2 0 0 1-.57 1.71L7.7 9.4a16 16 0 0 0 6.9 6.9l1.23-1.2a2 2 0 0 1 1.7-.57l2.75.36A2 2 0 0 1 22 16.9Z",
  "phone-in": "m6 6 7 7M6 6v6M6 6h6M20 16.9v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07A19.5 19.5 0 0 1 3.2 12a19.7 19.7 0 0 1-3.08-8 2 2 0 0 1 2-2h3a2 2 0 0 1 2 1.72",
  "phone-out": "m7 12 7-7M8 5h6v6M21 17v3a2 2 0 0 1-2 2A19 19 0 0 1 2 5a2 2 0 0 1 2-2h3",
  chevron: "m6 9 6 6 6-6", x: "M18 6 6 18M6 6l12 12", block: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM4.9 4.9l14.2 14.2",
  send: "m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13", clip: "m21.44 11.05-9.19 9.2a6 6 0 0 1-8.49-8.49l9.9-9.9a4 4 0 0 1 5.66 5.66l-9.9 9.9a2 2 0 0 1-2.83-2.83l9.2-9.19",
  mic: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8",
  grid: "M4 4h3v3H4zM10 4h3v3h-3zM16 4h3v3h-3zM4 10h3v3H4zM10 10h3v3h-3zM16 10h3v3h-3zM4 16h3v3H4zM10 16h3v3h-3zM16 16h3v3h-3z",
  bars: "M4 20v-3m5 3v-6m5 6v-10m5 10V5", play: "m8 5 11 7-11 7V5Z",
  download: "M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3", share: "M12 16V3m-4 4 4-4 4 4M5 13v7h14v-7",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2",
  check: "m4 12 5 5L20 6", "double-check": "m2 12 5 5L17 7m-5 10 5 0 5-5",
  "map-pin": "M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0ZM12 10h.01", more: "M5 12h.01M12 12h.01M19 12h.01",
};
const Icon = ({ name, cls = "" }: { name: string; cls?: string }) => (
  <svg className={`cc14-icon ${cls}`} width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.85} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICO[name] || ICO.more} /></svg>
);
const Btn = ({ cls = "", children, ...p }: { cls?: string; children: ReactNode } & Record<string, any>) => <button type="button" className={`cc14-btn ${cls}`} {...p}>{children}</button>;
function rel(s?: string) { if (!s) return "—"; const ms = Date.now() - new Date(s).getTime(); if (!Number.isFinite(ms)) return "—"; if (ms < 60000) return "Just now"; if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`; if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`; return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }); }
function time(s?: string) { if (!s) return "—"; const d = new Date(s); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }); }
function dur(sec: unknown) { if (sec == null || !Number.isFinite(Number(sec))) return "—"; const n = Math.max(0, Number(sec)); return n < 60 ? `${n}s` : `${Math.floor(n / 60)}m ${n % 60}s`; }

function Overlay({ type, onClose, children }: { type: string; onClose: () => void; children: ReactNode }) {
  return createPortal(<div className={`cc14-overlay cc14-overlay--${type}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>{children}</div>, document.body);
}
function SmallModal({ title, cls = "", onClose, children }: { title: string; cls?: string; onClose: () => void; children: ReactNode }) {
  return (
    <Overlay type="small" onClose={onClose}>
      <div className={`cc14-small-modal ${cls}`}><div className="cc14-small-header"><h2>{title}</h2><button type="button" data-cc14-close onClick={onClose}><Icon name="x" /></button></div>{children}</div>
    </Overlay>
  );
}

/* ---------------- chats ---------------- */
const CSTATE: Record<string, string> = { issue: "Issue", working: "Working", resolved: "Resolved", open: "Open" };
const chatStatuses = new Map<string, string>(); // UI-only follow-up state (legacy), kept for the session
let hideResolvedPref = false;
const StatusPill = ({ v }: { v: string }) => <span className={`cc14-status cc14-status--${v}`}><i></i>{CSTATE[v] || "Issue"} <Icon name="chevron" /></span>;
interface Conversation { conversation_id: string; name?: string; phone?: string; service?: string; seat?: string; ticket?: string; last_message?: string; last_ts?: string; unread?: number; pickup?: string; from?: string; drop?: string; to?: string; booking?: any }

function ChatWindow({ c, onClose, onBlocked }: { c: Conversation; onClose: () => void; onBlocked: () => void }) {
  const [data, setData] = useState<{ booking?: any; messages: any[] } | null>(null);
  const [channel, setChannel] = useState("all");
  const [quick, setQuick] = useState<"pickup" | "drop">("pickup");
  const input = useRef<HTMLTextAreaElement>(null), history = useRef<HTMLDivElement>(null);
  useEffect(() => { get(`/chats/${encodeURIComponent(c.conversation_id)}`).then((d) => setData({ ...d, messages: d.messages || [] })).catch((e) => { toastError(e); onClose(); }); }, [c.conversation_id, onClose]);
  useEffect(() => { if (history.current) history.current.scrollTop = history.current.scrollHeight; }, [data, channel]);
  if (!data) return null;
  const shown = data.messages.filter((v) => channel === "all" || String(v.channel).toLowerCase() === channel);
  const send = async () => {
    const txt = input.current?.value.trim(); if (!txt) return;
    if (!can("chats.send")) return toast("You do not have permission to send messages", "bad");
    const res = await post(`/chats/${encodeURIComponent(c.conversation_id)}`, { text: txt, channel: "whatsapp" });
    setData({ ...data, messages: [...data.messages, res] }); toast("Message saved in GDS; external delivery not connected.");
    if (input.current) input.current.value = ""; setChannel("all");
  };
  const block = async () => {
    if (!can("chats.send")) return toast("Not authorized to block conversations", "bad");
    if (!await confirmDialog(`Change blocked status for ${c.name || "this passenger"}?`, { ok: "Confirm change", danger: true })) return;
    try { const r = await post<{ blocked: boolean }>(`/chats/${encodeURIComponent(c.conversation_id)}/block`, { reason: "operator_request" }); toast(r.blocked ? "Passenger blocked" : "Passenger unblocked", "ok"); onClose(); onBlocked(); } catch (e) { toastError(e); }
  };
  const QUICK = { pickup: ["Are you coming?", "Bus reached Pickup", "Traffic, Delayed by 15 mins", "Bus is On-Time"], drop: ["Are you at the drop point?", "Bus reached Drop", "Bus will reach in 15 mins", "Thank you for travelling"] };
  return (
    <Overlay type="chat" onClose={onClose}>
      <section className="cc14-chat-window" aria-label="Passenger conversation">
        <header className="cc14-chat-head">
          <span className="cc14-whatsapp-mark"><Icon name="chat" /></span>
          <div className="cc14-chat-person"><strong>{c.name || data.booking?.contact?.name || "Passenger"}</strong><span className="cc14-chat-contact">{c.ticket || ""} · {c.seat || ""}</span><small><Icon name="map-pin" /> {c.pickup || "Pickup point unavailable"}</small></div>
          <span className="cc14-chat-connect"><Icon name="chat" /> <Icon name="bars" /></span>
          <div className="cc14-chat-tools">
            <Btn cls="icon-only" data-cc14-flag title="Report issue" aria-label="Report issue" onClick={() => toast("Use the conversation status dropdown for follow-up; provider reporting is not connected.")}><Icon name="flag" /></Btn>
            <Btn cls="icon-only" data-cc14-block title="Block / unblock conversation" aria-label="Block / unblock conversation" onClick={() => void block()}><Icon name="block" /></Btn>
            <Btn cls="icon-only" data-cc14-close title="Close conversation" aria-label="Close conversation" onClick={onClose}><Icon name="x" /></Btn>
          </div>
        </header>
        <div className="cc14-channels">
          {[["all", "All"], ["whatsapp", "WhatsApp"], ["sms", "SMS"], ["email", "Email"], ["calls", "Calls"]].map(([id, v]) => <Btn key={id} cls={`channel ${channel === id ? "selected" : ""}`} data-cc14-channel={id} onClick={() => setChannel(id)}>{id === "whatsapp" ? "☏ " : ""}{v}</Btn>)}
          <div className="cc14-reply-channel">Reply via: <b>WhatsApp</b></div>
        </div>
        <div className="cc14-msg-history" data-cc14-messages ref={history}>
          {shown.length ? shown.map((m, i) => {
            const out = m.direction === "out", ch = String(m.channel || "whatsapp").toLowerCase();
            const confirmed = ["delivered", "read"].includes(String(m.delivery_status || m.status || "").toLowerCase());
            return (
              <div key={i} className={`cc14-bubble-row ${out ? "cc14-bubble-row--out" : ""}`}><div className={`cc14-bubble ${out ? "cc14-bubble--out" : ""}`}>{m.text || ""}
                <div className="cc14-msg-foot">{m.by || (!out && ch === "whatsapp" ? "passenger@whatsapp" : "")} <time>{time(m.ts)}</time>
                  {out && <span className={`cc14-checks ${confirmed ? "confirmed" : "unverified"}`} title={confirmed ? "Provider confirmed delivery state" : "Saved internally; external delivery not confirmed"}><Icon name={confirmed ? "double-check" : "check"} /></span>}</div></div></div>
            );
          }) : <div className="cc14-msg-empty">No messages for this channel.</div>}
        </div>
        <div className="cc14-quick">
          <div className="cc14-quick-title"><button className={quick === "pickup" ? "selected" : ""} data-cc14-quick="pickup" onClick={() => setQuick("pickup")}>Pickup</button><span>|</span><button className={quick === "drop" ? "selected" : ""} data-cc14-quick="drop" onClick={() => setQuick("drop")}>Drop</button><span>Quick chats</span></div>
          <div className="cc14-quick-grid" data-cc14-quick-grid>{QUICK[quick].map((t) => <Btn key={t} cls="quick-answer" data-cc14-reply={t} onClick={() => { if (input.current) { input.current.value = t; input.current.focus(); } }}>{t}</Btn>)}</div>
        </div>
        <div className="cc14-compose">
          <button type="button" data-cc14-attach title="Attach file (provider unavailable)" aria-label="Attach file" onClick={() => toast("Attachment upload is not available in the current messaging API.")}><Icon name="clip" /></button>
          <textarea ref={input} data-cc14-message rows={1} placeholder="Type message..." onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send().catch(toastError); } }} />
          <Btn cls="cc14-whats-btn" data-cc14-composer-channel title="WhatsApp" onClick={() => toast("WhatsApp selected; external delivery is not connected.")}><Icon name="chat" /></Btn>
          <Btn cls="cc14-mic-btn" data-cc14-mic title="Voice recording requires a provider" onClick={() => toast("Voice recording is not connected.")}><Icon name="mic" /></Btn>
          <Btn cls="cc14-send-btn" data-cc14-send title="Save outgoing message" onClick={() => void send().catch(toastError)}><Icon name="send" /></Btn>
        </div>
        <div className="cc14-chat-disclosure">Messages saved in this GDS are not delivered to WhatsApp/SMS without a provider integration.</div>
      </section>
    </Overlay>
  );
}

export function ChatsPage({ id }: { id?: string }) {
  usePermissions();
  const q = hashQuery(), f = q.filter || "all";
  const [all, setAll] = useState<Conversation[] | null>(null);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [hideResolved, setHideResolved] = useState(hideResolvedPref);
  const [reports, setReports] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [open, setOpen] = useState<Conversation | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newQuery, setNewQuery] = useState("");
  const [, bump] = useState(0);
  const load = useCallback(async () => {
    const d = await get<{ conversations?: Conversation[]; unread_total?: number }>(`/chats?${qs({ q: q.q || "" })}`);
    setAll(d.conversations || []); setUnreadTotal(Number(d.unread_total) || 0);
    if (id) { const c = (d.conversations || []).find((x) => x.conversation_id === decodeURIComponent(id)); if (c) setOpen(c); }
  }, [q.q, id]);
  useEffect(() => { void load().catch(toastError); }, [load]);
  useEffect(() => { const off = () => setMenu(null); document.addEventListener("click", off); return () => document.removeEventListener("click", off); }, []);
  if (!all) return null;
  const nav = (p: Record<string, string | undefined>) => { location.hash = `#/chats?${qs(p)}`; };
  const status = (c: Conversation) => chatStatuses.get(c.conversation_id) || (Number(c.unread) > 0 ? "issue" : "resolved");
  const resolved = all.filter((c) => status(c) === "resolved").length;
  const show = all.filter((c) => !((f === "unread" && !Number(c.unread)) || (f === "issue" && status(c) !== "issue") || (f === "working" && status(c) !== "working") || (f === "resolved" && status(c) !== "resolved") || (hideResolved && status(c) === "resolved")));
  const closeChat = () => { setOpen(null); if (id) nav({ q: q.q, filter: f }); };
  return (
    <div>
      <section className="cc14-page cc14-chats" aria-label="Chats">
        <div className="cc14-chats-toolbar">
          <Btn cls="outline-blue" data-cc14-new onClick={() => { setNewQuery(""); setNewOpen(true); }}><Icon name="plus" /> New conversation</Btn>
          <Btn cls="quiet" data-cc14-hide onClick={() => { hideResolvedPref = !hideResolved; setHideResolved(hideResolvedPref); }}><Icon name="eye-off" /> {hideResolved ? "Show" : "Hide"} resolved <span>{resolved}</span></Btn>
          <Btn cls="amber" data-cc14-reports onClick={() => setReports((r) => !r)}><Icon name="flag" /> Reports</Btn>
          <div className="cc14-toolbar-end">
            <label className="cc14-search-min"><Icon name="search" /><input type="search" aria-label="Search conversations" data-cc14-search placeholder="Search name, phone, PNR..." defaultValue={q.q || ""}
              onKeyDown={(e) => { if (e.key === "Enter") nav({ q: e.currentTarget.value, filter: f }); }} onChange={() => undefined} onBlur={(e) => { if (e.currentTarget.value !== (q.q || "")) nav({ q: e.currentTarget.value, filter: f }); }} /></label>
            <select data-cc14-filter aria-label="Filter conversations" value={f} onChange={(e) => nav({ q: q.q, filter: e.currentTarget.value })}>
              {[["all", "All conversations"], ["unread", "Unread"], ["issue", "Issues"], ["working", "Working"], ["resolved", "Resolved"]].map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
          </div>
        </div>
        {reports && (
          <div className="cc14-reports"><strong>Conversation reports</strong>
            <div>{([["All", all.length], ["Unread", unreadTotal], ["Issues", all.filter((c) => status(c) === "issue").length], ["Working", all.filter((c) => status(c) === "working").length], ["Resolved", resolved]] as [string, number][]).map(([k, v]) => <div key={k}><b>{v}</b><span>{k}</span></div>)}</div>
            <small>Counts calculated from visible conversation records; follow-up status is UI-only until a workflow endpoint is connected.</small></div>
        )}
        <div className="cc14-conversation-list">{show.length ? show.map((c) => (
          <article key={c.conversation_id} className="cc14-conversation" data-cc14-cid={c.conversation_id} onClick={() => setOpen(c)}>
            <span className="cc14-seat-avatar">{c.seat || "·"}</span>
            <div className="cc14-convo-main">
              <div className="cc14-convo-name">{c.service || "Service"} · {c.name || "Passenger"} · {c.ticket || "—"} · Seat {c.seat || "—"}</div>
              <div className="cc14-route-detail">{c.pickup || c.from || "Pickup not available"} → {c.drop || c.to || "Drop not available"}</div>
              <div className="cc14-convo-preview">{c.last_message || "No messages yet"}</div>
              <div className="cc14-status-wrap">
                <button type="button" data-cc14-status-btn={c.conversation_id} aria-label="Conversation status" onClick={(e) => { e.stopPropagation(); setMenu((m) => (m === c.conversation_id ? null : c.conversation_id)); }}><StatusPill v={status(c)} /></button>
                <div className="cc14-status-options" data-cc14-status-menu={c.conversation_id} hidden={menu !== c.conversation_id}>
                  {Object.keys(CSTATE).map((v) => <button key={v} type="button" data-cc14-set-status={c.conversation_id} data-value={v} onClick={(e) => { e.stopPropagation(); chatStatuses.set(c.conversation_id, v); setMenu(null); toast("Follow-up status changed in the UI only; not saved to the server."); bump((n) => n + 1); }}><StatusPill v={v} /></button>)}
                </div>
              </div>
            </div>
            <time>{rel(c.last_ts)}</time>{Number(c.unread) > 0 && <span className="cc14-unread">{Number(c.unread)}</span>}
          </article>
        )) : <div className="cc14-empty">No conversations match your filters.</div>}</div>
      </section>
      {newOpen && (
        <SmallModal title="New conversation" onClose={() => setNewOpen(false)}>
          <p>Start from an existing passenger conversation. Creating a new WhatsApp/SMS thread requires a messaging-provider integration.</p>
          <input data-cc14-new-search placeholder="Search by name, ticket or seat" value={newQuery} onChange={(e) => setNewQuery(e.currentTarget.value)} />
          <div className="cc14-new-rows">{all.length ? all.map((c) => {
            const label = `${c.name || "Passenger"} ${c.ticket || c.service || ""}`;
            return <button key={c.conversation_id} type="button" data-cc14-open={c.conversation_id} hidden={!label.toLowerCase().includes(newQuery.toLowerCase())} onClick={() => { setNewOpen(false); setOpen(c); }}><Icon name="chat" /> <b>{c.name || "Passenger"}</b><small>{c.ticket || c.service || ""}</small></button>;
          }) : <p>No existing conversations to open.</p>}</div>
        </SmallModal>
      )}
      {open && <ChatWindow key={open.conversation_id} c={open} onClose={closeChat} onBlocked={() => void load().catch(toastError)} />}
    </div>
  );
}

/* ---------------- calls ---------------- */
interface Leg { type?: string; name?: string; status?: string; duration_s?: number }
interface Call { id: number | string; passenger_name?: string; phone?: string; pnr?: string; seat?: string; service?: string; route?: string; direction?: string; status?: string; ts?: string; duration_s?: number; legs?: Leg[]; provider?: string; recording_url?: string | null; recordingUrl?: string; notes?: string }
const statusText = (s?: string) => ({ answered: "Answered", missed: "No answer", busy: "Busy", not_reachable: "Not reachable", logged: "Logged", skipped: "Skipped" } as Record<string, string>)[String(s || "").toLowerCase()] || String(s || "Logged");
const LegBadge = ({ t }: { t?: string }) => { const x = String(t || "").toLowerCase(); return <span className={`cc14-leg cc14-leg--${x === "pstn" ? "pstn" : x === "app" ? "app" : "manual"}`}>{t || "MANUAL"}</span>; };

async function logCall(phone: string, name = "", pnr = "") {
  if (!can("calls.make")) return toast("Not authorized to log calls", "bad");
  await post("/calls", { phone, name, pnr, direction: "outgoing", kind: "manual", status: "logged" });
  toast("Call logged", "ok");
}

export function CallsPage() {
  usePermissions();
  const f = hashQuery(), q = (f.q || "").trim(), active = f.filter || "all";
  const [all, setAll] = useState<Call[] | null>(null);
  const [details, setDetails] = useState<Call | null>(null);
  const [dial, setDial] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const search = useRef<HTMLInputElement>(null), notes = useRef<HTMLTextAreaElement>(null), dialInput = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => setAll((await get<{ calls?: Call[] }>(`/calls?${qs({ q })}`)).calls || []), [q]);
  useEffect(() => { void load().catch(toastError); }, [load]);
  if (!all) return null;
  const go = (filter: string) => { location.hash = `#/calls?${qs({ q: search.current?.value, filter })}`; };
  const matches = all.filter((c) => active === "all" || (active === "incoming" && c.direction === "incoming") || (active === "outgoing" && c.direction === "outgoing") || (active === "missed" && c.status === "missed"));
  const counts: Record<string, number> = { incoming: all.filter((c) => c.direction === "incoming").length, outgoing: all.filter((c) => c.direction === "outgoing").length, missed: all.filter((c) => c.status === "missed").length };
  const recording = (c: Call, action: "play" | "download" | "share") => {
    const u = c.recording_url || c.recordingUrl; if (!u) return toast("No recording was returned by the telephony provider.");
    try {
      const url = new URL(String(u), location.origin); if (url.protocol !== "https:" && url.protocol !== "http:") throw Error("Unsupported recording URL");
      if (action === "play") setPlaying(url.href);
      else if (action === "download") { const a = document.createElement("a"); a.href = url.href; a.download = "call-recording"; a.rel = "noopener"; a.click(); }
      else if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url.href).then(() => toast("Recording link copied")).catch(toastError);
      else toast("Clipboard is not available.");
    } catch (e) { toastError(e); }
  };
  return (
    <div>
      <section className="cc14-page cc14-calls" aria-label="Calls">
        <div className="cc14-call-header">
          <label className="cc14-call-search"><Icon name="search" /><input ref={search} type="search" data-cc14-call-search placeholder="Search calls" defaultValue={q} aria-label="Search calls"
            onKeyDown={(e) => { if (e.key === "Enter") go(active); }} onBlur={(e) => { if (e.currentTarget.value.trim() !== q) go(active); }} /></label>
          <Btn cls="dialpad" data-cc14-dial aria-label="Open dial pad" onClick={() => setDial(true)}><Icon name="grid" /></Btn>
          <span className="cc14-signal" title="Calling provider not connected"><Icon name="bars" /></span>
        </div>
        <div className="cc14-recent">
          <div className="cc14-recent-title">Recent calls <div className="cc14-call-filters">
            {[["missed", "Missed"], ["outgoing", "Outgoing"], ["incoming", "Incoming"]].map(([x, t]) => <button key={x} type="button" data-cc14-call-filter={x} className={`cc14-filter-pill ${x} ${active === x ? "on" : ""}`} onClick={() => go(x)}>{t} <span>{counts[x]}</span></button>)}
            {active !== "all" && <Btn cls="reset" data-cc14-call-filter="all" onClick={() => go("all")}>All</Btn>}
          </div></div>
          <div className="cc14-call-list">{matches.length ? matches.map((c) => {
            const inc = c.direction === "incoming", miss = String(c.status).toLowerCase() === "missed", rec = String(c.recording_url || c.recordingUrl || "");
            const isProvider = !!(c.provider || rec), header = [c.service, c.passenger_name || "Unknown", c.pnr, c.seat].filter(Boolean).join(" · ");
            const legs = Array.isArray(c.legs) ? c.legs : [];
            return (
              <article key={c.id} className="cc14-call-row">
                <div className={`cc14-call-direction ${inc ? "incoming" : "outgoing"} ${miss ? "missed" : ""}`}><Icon name={inc ? "phone-in" : "phone-out"} /></div>
                <div className="cc14-call-name"><strong>{header || "Unknown"}</strong><small>{c.route || "Journey information not available"}</small></div>
                <div className="cc14-call-when"><span>{time(c.ts)}</span>{Number(c.duration_s) > 0 && <b><Icon name="clock" />{dur(c.duration_s)}</b>}</div>
                <div className="cc14-call-route"><LegBadge t={legs[0]?.type || (isProvider ? "PSTN" : "MANUAL")} /><span>{c.passenger_name || c.phone || "Passenger"}</span><span className="cc14-flow-arrow">→</span>{legs[0] && <LegBadge t={legs[0].type} />}<span>{legs[0]?.name || "—"}</span></div>
                <div className="cc14-call-legs">{legs.length ? legs.map((l, i) => {
                  const ok = /answer/i.test(l.status || "");
                  return <div key={i} className="cc14-leg-row"><span className={`cc14-leg-success ${ok ? "ok" : "fail"}`}>{ok ? "✓" : "—"}</span><span className="cc14-leg-person">{l.name || "Contact"}</span><LegBadge t={l.type || "APP"} /><span className="cc14-leg-sec">{dur(l.duration_s)}</span><span className={`cc14-leg-outcome ${ok ? "ok" : /busy|no answer/i.test(l.status || "") ? "bad" : "muted"}`}>{l.status || "Unknown"}</span></div>;
                }) : <div className="cc14-legs-none"><span className="cc14-leg cc14-leg--manual">MANUAL</span> No provider routing legs</div>}</div>
                <div className="cc14-call-controls"><span className={`cc14-call-result ${miss ? "red" : "green"}`}>{statusText(c.status)}</span>
                  <Btn cls="call-control play" data-cc14-record={c.id} disabled={!rec} title={rec ? undefined : "No call recording is available"} aria-label="Play call recording" onClick={() => recording(c, "play")}><Icon name="play" /></Btn>
                  <span className="cc14-duration">{dur(c.duration_s)}</span>
                  <Btn cls="call-control download" data-cc14-download={c.id} disabled={!rec} title={rec ? undefined : "No recording to download"} aria-label="Download call recording" onClick={() => recording(c, "download")}><Icon name="download" /></Btn>
                  <Btn cls="call-control share" data-cc14-share={c.id} disabled={!rec} title={rec ? undefined : "No recording to share"} aria-label="Share call recording" onClick={() => recording(c, "share")}><Icon name="share" /></Btn>
                  <Btn cls="call-control more" data-cc14-details={c.id} aria-label="Call details" onClick={() => setDetails(c)}><Icon name="more" /></Btn></div>
              </article>
            );
          }) : <div className="cc14-empty">No calls for the selected search or filter.</div>}</div>
        </div>
        <div className="cc14-call-note">Calls are shown from operator records. PSTN/APP routing, playback and downloadable recordings require a connected telephony provider; no cloud call is initiated by this page.</div>
      </section>
      {playing && <SmallModal title="Call recording" onClose={() => setPlaying(null)}><audio controls src={playing} style={{ width: "100%" }}></audio></SmallModal>}
      {details && (
        <SmallModal title="Call details" onClose={() => setDetails(null)}>
          <div className="cc14-call-detail-grid"><span>Passenger</span><b>{details.passenger_name || "Unknown"}</b><span>Time</span><b>{details.ts ? fdt(details.ts) : "—"}</b><span>Direction</span><b>{details.direction}</b><span>Outcome</span><b>{statusText(details.status)}</b><span>Duration</span><b>{dur(details.duration_s)}</b><span>PNR</span><b>{details.pnr || "—"}</b></div>
          <label className="cc14-detail-note">Notes<textarea ref={notes} data-cc14-notes defaultValue={details.notes || ""} /></label>
          <div className="cc14-detail-actions">{can("calls.make") && <>
            <Btn cls="blue" data-cc14-save-notes onClick={async () => { try { await put(`/calls/${encodeURIComponent(String(details.id))}`, { notes: notes.current?.value ?? "" }); toast("Notes saved", "ok"); setDetails(null); await load(); } catch (e) { toastError(e); } }}>Save notes</Btn>
            <Btn cls="outline" data-cc14-callback onClick={async () => { const d = details; setDetails(null); try { await logCall(d.phone || "", d.passenger_name || "", d.pnr || ""); await load(); } catch (e) { toastError(e); } }}>Log follow-up call</Btn></>}</div>
        </SmallModal>
      )}
      {dial && (
        <SmallModal title="Dial" cls="cc14-dial-modal" onClose={() => setDial(false)}>
          <div className="cc14-dial-warning">Manual call logging only — no PSTN/VoIP provider connected.</div>
          <input ref={dialInput} type="tel" data-cc14-dial-input inputMode="tel" placeholder="Enter a 10-digit phone number" maxLength={14} aria-label="Phone number" />
          <div className="cc14-numpad">{"123456789*0#".split("").map((x) => <Btn key={x} cls="number" data-cc14-num={x} onClick={() => { if (dialInput.current) { dialInput.current.value += x; dialInput.current.focus(); } }}>{x}</Btn>)}</div>
          <Btn cls="green wide" data-cc14-log onClick={async () => {
            const v = (dialInput.current?.value ?? "").replace(/\D/g, "");
            if (!/^\d{10}$/.test(v)) return toast("Enter a valid 10-digit phone number", "bad");
            setDial(false);
            try { await logCall(v); await load(); } catch (e) { toastError(e); }
          }}><Icon name="phone" /> Log phone call</Btn>
        </SmallModal>
      )}
    </div>
  );
}
