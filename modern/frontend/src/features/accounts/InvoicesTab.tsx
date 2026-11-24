/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api } from "../../api";
import { toast, toastError } from "../../components/ui/feedback";
import { NiceSelect } from "../../components/ui/NiceSelect";

// React port of legacy Accounts → Invoices (public/js/invoices-v24.js, data from server/api/platform-billing-v25.js).
// Same DOM / classes (inv24-*, inv25-*) so the vendored invoices-v24.css applies unchanged. Read-only: the platform issues
// documents; operators can view them, reconcile a month and record a payment UTR (pending verification) only.
const money = (x: unknown) => (x === null || x === undefined ? "—" : "₹" + Number(x).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const titleMonth = (m: string) => { const d = new Date(`${m}-01T12:00:00`); return Number.isNaN(d.getTime()) ? m : d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }).toUpperCase(); };
const ICONS: Record<string, string> = {
  wallet: "M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0-3 3v13a2 2 0 0 0 2 2h16V7Zm0 5h-6a2 2 0 0 0 0 4h6",
  refresh: "M20 11a8 8 0 0 0-14-5L3 9m0-6v6h6m-5 4a8 8 0 0 0 14 5l3-3m0 6v-6h-6",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  download: "M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4",
  file: "M6 2h9l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm8 0v6h6M9 12h6m-6 4h6",
  archive: "M3 4h18v4H3zm2 4h14v13H5zm5 4h4",
  close: "M18 6 6 18M6 6l12 12",
  pay: "M2 8h20M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
};
const Ico = ({ k, n = 20 }: { k: string; n?: number }) => (
  <svg width={n} height={n} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[k]} /></svg>
);
const Btn = ({ action, cls = "", children, ...rest }: { action: string; cls?: string; children: ReactNode; [k: string]: unknown }) => (
  <button type="button" className={`inv24-button ${cls}`} data-inv24={action} {...rest}>{children}</button>
);

const COLS: Record<string, [string[], string[]]> = {
  metroSummary: [["Payable to (Metro Rail Operator)", "City", "Billing basis", "PNRs", "Passengers", "Metro fares"], ["provider", "city", "billing_basis", "pnrs", "passengers", "metro_fares"]],
  cloudSummary: [["Service", "Calls", "Charge (₹)", "GST at 18% (₹)", "Total (₹)"], ["label", "calls", "charge", "gst", "total"]],
  aiSummary: [["Service", "Calls", "Charge (₹)", "GST at 18% (₹)", "Total (₹)"], ["label", "calls", "charge", "gst", "total"]],
  platformSummary: [["Summary", "Website", "Paytm", "Offline Sales", "Total"], ["label", "website", "paytm", "offline_sales", "total"]],
  tax: [["Description", "Rate", "Qty", "Taxable", "Total"], ["description", "rate", "qty", "taxable", "total"]],
  metro: [["Date", "PNR", "Service", "Metro", "Passenger Station", "Exchange Point", "Pax", "Fare/Pax", "Fare"], ["date", "pnr", "service", "metro", "passenger_station", "exchange_point", "pax", "fare_per_pax", "fare"]],
  cloud: [["Date", "Time", "From", "To", "Duration", "Charge"], ["date", "time", "from", "to", "duration", "charge"]],
  ai: [["Date", "Time", "From", "To", "Duration", "Charge"], ["date", "time", "from", "to", "duration", "charge"]],
  chat: [["Messages", "Count", "Rate / message", "Amount"], ["label", "count", "rate", "amount"]],
  platform: [["Travel date", "Booked on", "Channel", "PNR", "Status", "Sales", "Offer", "Net fare", "Commission", "GST on comm.", "Canc. charge"], ["travel_date", "booked_on", "channel", "pnr", "status", "sales", "offer", "net_fare", "commission", "gst_on_commission", "cancellation_charge"]],
  operator: [["Date", "Type", "Particulars", "Deducted / Paid", "Collected", "Balance", "Reference"], ["date", "type", "particulars", "deducted", "collected", "balance", "reference"]],
};
function DataTable({ type, rows }: { type: string; rows?: any[] }) {
  if (!rows?.length) return <p className="inv24-no-rows">No source-backed line items have been imported.</p>;
  const [heads, keys] = COLS[type] ?? [Object.keys(rows[0]), Object.keys(rows[0])];
  return <div className="inv24-table-scroll"><table className="inv24-table"><thead><tr>{heads.map((h) => <th key={h}>{h}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i}>{keys.map((k) => <td key={k}>{String(r[k] ?? "—")}</td>)}</tr>)}</tbody></table></div>;
}
const Details = ({ obj, money: m }: { obj: Record<string, unknown>; money?: boolean }) => <>{Object.entries(obj).map(([k, v]) => <div key={k} className="inv24-balance-detail"><span>{k.replaceAll("_", " ")}</span><strong>{m ? money(v) : String(v)}</strong></div>)}</>;
function PreviewSummary({ doc, s }: { doc: any; s: any }) {
  const out: [string, ReactNode][] = [];
  if (doc.type === "tax") {
    if (s.invoice_meta) out.push(["Invoice metadata", <Details obj={s.invoice_meta} />]);
    if (s.billing_address) out.push(["Billing address", <p>{s.billing_address}</p>]);
    if (s.shipping_address) out.push(["Shipping address", <p>{s.shipping_address}</p>]);
    if (s.line_items?.length) out.push(["Invoice line items", <DataTable type="tax" rows={s.line_items} />]);
    if (s.bank) out.push(["Bank details", <Details obj={s.bank} />]);
    if (s.totals) out.push(["Tax summary", <Details obj={s.totals} money />]);
  } else if (doc.type === "metro") {
    if (s.summary_rows?.length) out.push(["Metro operators", <DataTable type="metroSummary" rows={s.summary_rows} />]);
    out.push(["Ticket-level detail", <DataTable type="metro" rows={s.lines} />]);
  } else if (doc.type === "operator") {
    if (s.summary_rows?.length) out.push(["Statement summary", <>{s.summary_rows.map((r: any, i: number) => <div key={i} className="inv24-balance-detail"><span>{r.label}</span><strong>{money(r.amount)}</strong></div>)}</>]);
    out.push(["Running statement ledger", <DataTable type="operator" rows={s.ledger} />]);
    if (s.provisional_ledger?.length) out.push(["Provisional entries — not posted or settled", <DataTable type="operator" rows={s.provisional_ledger} />]);
  } else if (doc.type === "chat") out.push(["Message charges", <DataTable type="chat" rows={s.summary_rows} />]);
  else if (doc.type === "platform") {
    if (s.channel_summary?.length) out.push(["Website / Paytm / Offline", <DataTable type="platformSummary" rows={s.channel_summary} />]);
    out.push(["Booking and cancellation lines", <DataTable type="platform" rows={s.lines} />]);
  } else {
    if (s.summary_rows?.length) out.push(["Call billing summary", <DataTable type={doc.type + "Summary"} rows={s.summary_rows} />]);
    out.push(["Call details", <DataTable type={doc.type} rows={s.lines} />]);
  }
  if (s.notes?.length) out.push(["Notes", <ol>{s.notes.map((x: string, i: number) => <li key={i}>{x}</li>)}</ol>]);
  return <>{out.map(([h, b]) => <section key={h} className="inv24-preview-section"><h3>{h}</h3>{b}</section>)}</>;
}

type Dlg = { title: string; wide?: boolean; body: ReactNode } | null;
const P = "/accounts/invoices";

export function InvoicesTab() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [type, setType] = useState("all");
  const [year, setYear] = useState("all");
  const [dlg, setDlg] = useState<Dlg>(null);
  const load = useCallback(() => api.admin<any>(P).then(setData), []);
  useEffect(() => { load().catch((e) => { setError(e instanceof Error ? e.message : String(e)); toastError(e); }); }, [load]);
  useEffect(() => {
    if (!dlg) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setDlg(null); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [dlg]);
  if (error) return <div className="inv24-access">{error}</div>;
  if (!data) return <div className="ac10-loading">Loading Accounts…</div>;

  const bal = data.balance ?? {};
  const docs: any[] = (data.documents ?? []).filter((x: any) => (type === "all" || x.type === type) && (year === "all" || x.period_month?.startsWith(year)));
  const grouped: Record<string, any[]> = {};
  for (const x of docs) (grouped[x.period_month] ??= []).push(x);
  const currentKey: string | null = bal.statement_key ?? null;
  const heading = bal.closing_balance === null || bal.closing_balance === undefined ? "No statement balance" : bal.closing_balance < 0 ? "Payable by operator" : "Payable to operator";
  const run = (fn: () => Promise<void>) => () => { fn().catch(toastError); };

  const showDoc = async (key: string) => {
    const d = await api.admin<any>(`${P}/documents/${encodeURIComponent(key)}`), doc = d.document;
    // no original PDF store in this version → always the structured summary (legacy has_pdf=false path)
    setDlg({ title: `${doc.label} · ${doc.name}`, wide: true, body: <div className="inv24-document-summary">
      <div className="inv24-summary-grid">
        <div><small>Reference</small><b>{doc.name}</b></div><div><small>Statement month</small><b>{titleMonth(doc.period_month)}</b></div>
        <div><small>Document date</small><b>{doc.document_date}</b></div><div><small>Recorded amount</small><b>{money(doc.amount)}</b></div>
      </div>
      {d.snapshot ? <PreviewSummary doc={doc} s={d.snapshot} /> : <p className="inv24-unavailable">This is a catalogue entry only. A provider-issued PDF or verified source statement has not been imported. No replacement invoice has been fabricated.</p>}
      <p className="inv24-unavailable">PDF not available. Contact our platform billing team; operators cannot create or replace issued financial documents.</p>
    </div> });
  };
  const reconcile = async (month: string) => {
    const d = await api.admin<any>(`${P}/reconcile/${encodeURIComponent(month)}`);
    const status = (x: string) => x === "match" ? "Verified" : x === "mismatch" ? "Mismatch" : x === "missing" ? "Insufficient evidence" : "Informational";
    setDlg({ title: "Statement reconciliation · " + titleMonth(month), wide: true, body: <>
      <p className="inv24-document-hint">Source evidence checks: {d.summary.matched} match · {d.summary.mismatched} mismatches · {d.summary.insufficient_evidence} require source records.</p>
      <div className="inv24-table-scroll"><table className="inv24-table inv24-recon-table">
        <thead><tr><th>Validation</th><th>Source A</th><th>Source B</th><th>Difference</th><th>Status</th></tr></thead>
        <tbody>{d.checks.map((x: any, i: number) => <tr key={i}><td><b>{x.label}</b><small>{x.explanation || ""}</small></td>
          <td>{x.left === null ? "—" : money(x.left)}</td><td>{x.right === null ? "—" : money(x.right)}</td><td>{x.difference === null ? "—" : money(x.difference)}</td>
          <td><span className={`inv24-audit-status ${x.status}`}>{status(x.status)}</span></td></tr>)}</tbody></table></div>
      <p className="inv24-document-hint">Original PDFs are preserved as-is. Automatic reconciliation requires typed source records; it will not infer an amount from an uploaded PDF alone.</p>
    </> });
  };
  const pdf = async (key: string) => {
    const doc = (data.documents ?? []).find((d: any) => d.key === key);
    if (!doc) throw Error("Document not found");
    if (!doc.has_pdf) return showDoc(key);
  };
  const bundle = async (month: string) => { await api.admin(`${P}/bundle/${encodeURIComponent(month)}`); };
  const pay = () => {
    if (!(bal.payable_by_operator > 0)) {
      setDlg({ title: "No payment due", body: <p className="inv24-unavailable">There is no verified amount payable by the operator on the current statement. A positive signed statement balance is payable to the operator, not a bill to pay.</p> });
      return;
    }
    const submit = (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.currentTarget));
      api.admin(`${P}/payments`, "POST", body).then(async () => { setDlg(null); await load(); toast("Payment UTR pending verification", "ok"); }).catch(toastError);
    };
    setDlg({ title: "Payment reference", body: <form data-inv24-pay="" className="inv24-form" onSubmit={submit}>
      <p>Payable by operator: <strong>{money(bal.payable_by_operator)}</strong></p>
      <label>Amount (₹)<input name="amount" required type="number" min=".01" max={bal.payable_by_operator} step=".01" defaultValue={bal.payable_by_operator} /></label>
      <label>Bank UTR/reference<input name="reference" required minLength={5} maxLength={120} /></label>
      <p>Records the payment reference as <strong>pending verification</strong>. This does not initiate a transfer or reduce the signed statement balance.</p>
      <button type="submit" className="inv24-button primary">Submit reference</button></form> });
  };
  const current = (op: "view" | "pdf") => async () => { if (!currentKey) throw Error("No operator statement is available"); if (op === "view") await showDoc(currentKey); else await pdf(currentKey); };

  return (
    <div className="inv24-root">
      <div className="inv24-outstanding">
        <div className="inv24-wallet"><Ico k="wallet" n={28} /></div>
        <div className="inv24-outstanding-main"><div className="inv24-eyebrow">OUTSTANDING BALANCE</div>
          <h2>{money(bal.payable_by_operator)}</h2>
          <p>As per Operator Statement <span>{bal.statement || "—"}</span>
            {bal.statement_key && <>{" "}<Btn action="current-view" cls="inline-link" onClick={run(current("view"))}>View</Btn></>}</p>
          <small>{heading}{bal.closing_balance !== null && bal.closing_balance !== undefined ? " · Signed statement balance " + money(bal.closing_balance) : ""}
            {bal.pending_payments ? " · " + bal.pending_payments + " payment reference(s) awaiting verification" : ""}</small></div>
        <div className="inv24-outstanding-actions">
          <Btn action="refresh" cls="outline" onClick={run(load)}><Ico k="refresh" /> Refresh</Btn>
          <Btn action="pay" cls="primary" onClick={pay}><Ico k="pay" /> Pay</Btn>
        </div>
      </div>
      <div className="inv24-toolbar">
        <label className="ac10-select inv25-filter inv25-type ui-dd-hosted"><NiceSelect name="inv24-type" value={type} onChange={setType} title="Filter invoice type"
          options={[["all", "All types"], ...(data.types ?? []).map((x: any) => [x.id, x.label] as [string, string])]} /></label>
        <label className="ac10-select inv25-filter inv25-year ui-dd-hosted"><NiceSelect name="inv24-year" value={year} onChange={setYear} title="Filter invoice year"
          options={[["all", "All years"], ...(data.years ?? []).map((y: string) => [y, y] as [string, string])]} /></label>
        <div className="inv24-spacer" />
        <div className="inv24-current"><Ico k="file" n={19} /> Current statement </div>
        <Btn action="current-view" cls="quiet" disabled={!currentKey} onClick={run(current("view"))}><Ico k="eye" n={18} /> View</Btn>
        <Btn action="current-pdf" cls="textlink" disabled={!currentKey} onClick={run(current("pdf"))}><Ico k="download" n={18} /> PDF</Btn>
      </div>
      <p className="inv24-status-text">Issued by our platform · Available for viewing and download · No document creation required</p>
      <div className="inv24-month-list">{Object.keys(grouped).length ? Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0])).map(([month, items]) => (
        <section key={month} className="inv24-month"><header><span>{titleMonth(month)}</span><div className="inv24-month-tools">
          <Btn action="reconcile" cls="subtle" data-month={month} onClick={run(() => reconcile(month))}>Reconcile</Btn>
          <Btn action="all" cls="textlink" data-month={month} onClick={run(() => bundle(month))}><Ico k="archive" n={16} /> Download all</Btn>
        </div></header>
          {items.map((doc) => <div key={doc.key} className="inv24-row"><strong>{doc.label}{doc.is_reference && <> <small className="inv24-reference">Reference only</small></>}</strong><span className="inv24-code">{doc.name || "—"}</span>
            <div className="inv24-row-actions">
              <Btn action="view" cls="quiet" data-key={doc.key} onClick={run(() => showDoc(doc.key))}><Ico k="eye" n={17} /> View</Btn>
              <Btn action="pdf" cls="textlink" data-key={doc.key} onClick={run(() => pdf(doc.key))}><Ico k="download" n={18} /> PDF</Btn>
            </div></div>)}
        </section>)) : <div className="inv24-empty">No invoices or statements for these filters.</div>}</div>
      <p className="inv24-footnote">Invoices and monthly statements are issued automatically by our platform based on verified billing records. This page is read-only; contact platform billing support for corrections.</p>
      <div className="inv24-overlay-container" data-inv24-overlays="">
        {dlg && <>
          <div className="inv24-scrim" data-inv24="close" onClick={() => setDlg(null)} />
          <section role="dialog" aria-modal="true" aria-label={dlg.title} className={`inv24-dialog ${dlg.wide ? "wide" : ""}`} tabIndex={-1} ref={(e) => e?.focus()}>
            <header><h2>{dlg.title}</h2><Btn action="close" cls="icon" onClick={() => setDlg(null)}><Ico k="close" n={21} /></Btn></header>
            <div className="inv24-dialog-body">{dlg.body}</div>
          </section>
        </>}
      </div>
    </div>
  );
}
