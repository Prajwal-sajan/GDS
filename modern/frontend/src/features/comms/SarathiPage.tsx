import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { toastError } from "../../components/ui/feedback";
import { fdt, get, post } from "./commsApi";

// Sarathi (`#/sarathi`): native React port of legacy sarathi-parity-v12 (sa-* DOM). Real conversations via /sarathi/*.

const P: Record<string, ReactNode> = {
  spark: <path d="m12 3 1.9 6.1L20 11l-6.1 1.9L12 19l-1.9-6.1L4 11l6.1-1.9ZM20 18l.7 1.3L22 20l-1.3.7L20 22l-.7-1.3L18 20l1.3-.7Z" />,
  send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
  bus: <><rect x="4" y="4" width="16" height="15" rx="3" /><path d="M4 11h16M8 19v2M16 19v2M8 15h.01M16 15h.01" /></>,
  chart: <><path d="M4 20V9M9 20V4M14 20v-8M19 20V7" /><path d="M3 20h18" /></>,
  users: <><circle cx="9" cy="8" r="4" /><path d="M1 21v-2a7 7 0 0 1 14 0v2M17 5a4 4 0 0 1 0 8M19 21v-2a6 6 0 0 0-3-5" /></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
};
const Svg = ({ k, n = 23 }: { k: string; n?: number }) => (
  <svg width={n} height={n} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{P[k] ?? P.spark}</svg>
);
const PROMPTS = [
  { id: "fleet", title: "Today's fleet", detail: "Which services are running late today?", question: "Which services are running late today?", icon: "bus", tone: "blue" },
  { id: "revenue", title: "Earnings & bookings", detail: "What was yesterday’s revenue and how many seats were sold?", question: "What was yesterday's revenue and how many seats were sold?", icon: "chart", tone: "green" },
  { id: "passengers", title: "Passenger insights", detail: "How many passengers travelled this week?", question: "How many passengers travelled this week?", icon: "users", tone: "purple" },
  { id: "staff", title: "Staff & licences", detail: "Which driving licences are expiring soon?", question: "Which driving licences are expiring soon?", icon: "shield", tone: "orange" },
];
type Row = Record<string, unknown>;
interface Msg { role: string; text?: string; table?: Row[]; ts?: string }
interface Conv { id: number | string; title?: string; created_at?: string; messages?: Msg[] }
const when = (s?: string) => (s ? fdt(s) : "");

function DataTable({ rows }: { rows: Row[] }) {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return (
    <div className="tw"><table className="t"><thead><tr>{cols.map((c) => <th key={c}>{c.replaceAll("_", " ")}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c}>{r[c] == null ? "" : String(r[c])}</td>)}</tr>)}</tbody></table></div>
  );
}

export function SarathiPage() {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [cid, setCid] = useState<number | string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [ready, setReady] = useState(false);
  const main = useRef<HTMLDivElement>(null), field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([get<Conv[]>("/sarathi/conversations"), get("/sarathi/suggestions")])
      .then(([c]) => setConvs(Array.isArray(c) ? c : []))
      .catch((e: Error) => setLoadError(e.message || "Conversation service unavailable"))
      .finally(() => setReady(true));
  }, []);
  useEffect(() => { if (main.current && messages.length) main.current.scrollTop = main.current.scrollHeight; }, [messages, busy]);

  const request = async (q: string) => {
    const question = q.trim(); if (!question || busy) return;
    const now = new Date().toISOString();
    let msgs = [...messages, { role: "user", text: question, ts: now }];
    setMessages(msgs); setBusy(true);
    // Delay/late questions are not covered by the rule-based Sarathi API; do not misstate sales as live lateness.
    if (/\blate\b|\bdelay(?:ed|s)?\b|\brunning late\b/i.test(question)) {
      setMessages([...msgs, { role: "assistant", text: "Live delay and on-road lateness are not available from the connected Sarathi endpoint yet. The GDS can answer historical service performance, revenue, occupancy, passenger totals and upcoming licence expiries.", ts: new Date().toISOString() }]);
      setBusy(false); return;
    }
    try {
      const r = await post<{ conversation_id: number; answer?: { text: string; table?: Row[] } }>("/sarathi/ask", { question, conversation_id: cid });
      setCid(r.conversation_id);
      msgs = [...msgs, { role: "assistant", ...(r.answer || { text: "No response" }), ts: new Date().toISOString() }];
      setConvs((cs) => cs.some((c) => String(c.id) === String(r.conversation_id))
        ? cs.map((c) => (String(c.id) === String(r.conversation_id) ? { ...c, messages: msgs } : c))
        : [{ id: r.conversation_id, title: question.slice(0, 65), created_at: now, messages: msgs }, ...cs]);
    } catch (e) {
      msgs = [...msgs, { role: "assistant", text: `Unable to fetch a GDS answer: ${(e as Error).message || "Service unavailable"}`, ts: new Date().toISOString() }];
    } finally { setMessages(msgs); setBusy(false); }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); const q = field.current?.value ?? ""; if (field.current) field.current.value = ""; void request(q).catch(toastError); };
  if (!ready) return null;

  return (
    <div>
      <div className="sa-root">
        <aside className="sa-sidebar">
          <button className="sa-new-chat" data-sa-action="new" onClick={() => { setCid(null); setMessages([]); field.current?.focus(); }}><Svg k="spark" n={22} /> New chat</button>
          <p className="sa-recents-title">RECENT</p>
          <div className="sa-recent-list">{convs.length ? convs.map((c) => (
            <button key={c.id} className={`sa-recent ${String(cid) === String(c.id) ? "on" : ""}`} data-sa-conv={c.id} onClick={() => { setCid(c.id); setMessages(Array.isArray(c.messages) ? c.messages.slice() : []); }}>
              <span className="sa-recent-icon"><Svg k="spark" n={18} /></span><span><b>{c.title || "Conversation"}</b><small>{when(c.created_at)}</small></span></button>
          )) : <div className="sa-no-conversations">No conversations yet</div>}</div>
        </aside>
        <section className="sa-chat">
          <header className="sa-header"><span className="sa-spark"><Svg k="spark" n={34} /></span><div><div className="sa-heading"><b>Sarathi</b><span>AI</span></div><small><i></i> Your fleet, revenue &amp; staff copilot</small></div></header>
          <div className="sa-main" data-sa-main ref={main}>
            {loadError && <p className="sa-error">{loadError}</p>}
            {messages.length ? (
              <div className="sa-thread">
                {messages.map((m, i) => (
                  <div key={i} className={`sa-message ${m.role === "user" ? "user" : "assistant"}`}><span className="sa-message-who">{m.role === "user" ? "You" : "Sarathi"}</span>
                    <div className="sa-message-text">{m.text || ""}</div>
                    {Array.isArray(m.table) && m.table.length > 0 && <div className="sa-data-table"><DataTable rows={m.table.slice(0, 50)} /></div>}
                    <span className="sa-message-time">{when(m.ts)}</span></div>
                ))}
                {busy && <div className="sa-typing">Sarathi is checking GDS data…</div>}
              </div>
            ) : (
              <div className="sa-welcome"><h2>Hi, I'm <span>Sarathi</span></h2><p>Ask me anything about your fleet, earnings, passengers or staff. Pick a starting point below.</p>
                <div className="sa-prompts">{PROMPTS.map((q, i) => (
                  <button key={q.id} className={`sa-prompt ${i === 0 ? "featured" : ""}`} data-sa-prompt={q.id} onClick={() => void request(q.question).catch(toastError)}>
                    <span className={`sa-prompt-icon ${q.tone}`}><Svg k={q.icon} n={24} /></span><span className="sa-prompt-copy"><b>{q.title}</b><small>{q.detail}</small></span>
                    {i === 0 && <span className="sa-arrow"><Svg k="chevron" n={19} /></span>}</button>
                ))}</div></div>
            )}
          </div>
          <footer className="sa-footer">
            <form data-sa-form className="sa-form" onSubmit={submit}><input ref={field} data-sa-question aria-label="Ask Sarathi anything" placeholder="Ask Sarathi anything…" autoComplete="off" />
              <button type="submit" aria-label="Send message" data-sa-send disabled={busy}><Svg k="send" n={23} /></button></form>
            <small>Sarathi can make mistakes — verify important numbers.</small>
          </footer>
        </section>
      </div>
    </div>
  );
}
