/* eslint-disable @typescript-eslint/no-explicit-any */
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api, authHeaders } from "../../api";
import { confirmDialog, Modal, toast, toastError } from "../../components/ui/feedback";
import { fdate, inr } from "./AccountsPage";

// Native React port of legacy Accounts → OTA Invoice Verifier (public/js/ota-reconciliation-v43.js). The legacy screen
// rendered into the accounts page root ([data-ac10-page] + .ota43-root); this component renders the same element tree
// as JSX children of that root so the vendored ota-reconciliation-v43.css applies unchanged.
// Data: /api/admin/reconciliation/v43/invoices.
const val = (n: any) => (n === null || n === undefined || n === "" ? "—" : inr(Number(n), 2));
const int = (n: any) => Number(n || 0).toLocaleString("en-IN");
const fmt = (d: any) => (d ? fdate(d) : "—");
const count = (d: any) => Number(d || 0);
const amount = (n: any, sign?: boolean) => (n == null ? "—" : (sign && n > 0 ? "+" : "") + inr(Number(n), 2));
const ICO: Record<string, string> = {
  back: "M15 18l-6-6 6-6", upload: "M12 16V3m-5 5 5-5 5 5M3 15v5h18v-5",
  document: "M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6m-6 4h6m-6 4h4",
  arrow: "M9 18l6-6-6-6", chevron: "m6 9 6 6 6-6", eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  trash: "M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7m4-7v7", search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16m6-2 4 4",
  download: "M12 3v13m-5-5 5 5 5-5M5 19v2h14v-2", check: "M4 12l5 5L20 6", close: "M5 5l14 14M19 5 5 19",
  warning: "M12 3 2 21h20L12 3zM12 9v5m0 4h.01", chart: "M3 18v-6m6 6V8m6 10V4m6 14V9",
  cards: "M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z",
  table: "M3 4h18v16H3zM3 10h18M3 15h18M9 4v16",
  refresh: "M4 8V3m0 5h5m11 8v5m0-5h-5M5 12a7 7 0 0 1 12-5m2 5a7 7 0 0 1-12 5",
  filter: "M4 6h16M7 12h10m-7 6h4", shield: "M12 2l8 4v6c0 6-4 9-8 10-4-1-8-4-8-10V6zM8 12l3 3 5-6",
  info: "M12 11v6m0-10h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20",
  receipt: "M5 2h14v20l-3-2-4 2-4-2-3 2V2zM9 7h6M9 12h6M9 17h4",
  adjust: "M4 14l6-6 4 4 6-7m-6 0h6v6",
};
const Icon = ({ n, size = 18 }: { n: string; size?: number }) =>
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICO[n] || ICO.info} /></svg>;

type Act = (op: string, data?: { line?: string; id?: string; filter?: string; issue?: string }) => void;
const Btn = ({ op, kind, act, data, disabled, children }: { op: string; kind?: string; act: Act; data?: { line?: string; id?: string }; disabled?: boolean; children: ReactNode }) =>
  <button type="button" className={"ota43-btn " + (kind || "")} data-ota43={op} data-line={data?.line} data-id={data?.id} disabled={disabled || undefined} onClick={() => act(op, data)}>{children}</button>;

const route = (id?: any) => "#/accounts/reconciliation" + (id ? "/" + encodeURIComponent(id) : "");
const q = (p?: string) => "/reconciliation/v43/invoices" + (p || "");
const statusName = (s: string) => ({ matched: "Matched", mismatched: "Mismatched", needs_review: "Needs review", unmatched_ota: "Missing in GDS", unmatched_gds: "Missing in OTA" } as Record<string, string>)[s] || s || "—";
const Badge = ({ s }: { s: string }) => <span className={"ota43-tag " + (s ?? "")}>{statusName(s)}</span>;
const NoteWarn = ({ d }: { d: any }) => (d.parse_warnings?.length
  ? <div className="ota43-warning"><Icon n="warning" /><span><strong>Import warnings</strong><small>{d.parse_warnings.map(String).join(" · ")}</small></span></div> : null);

const ENTRIES = [
  ["Booking revenue (a)", "bookings", "+"], ["Pax cancellations (b)", "pax_cancel", "−"],
  ["Retention credit (c)", "cancellation_credit", "+"], ["Operator cancellations (d)", "operator_cancel", "−"],
  ["Exceptional refund (e)", "exception_refund", "−"], ["Operator offers (h)", "operator_offers", "−"],
  ["TCS deductions (l)", "tcs", "−"], ["TDS 194-O (m)", "tds", "−"]];
const ITEMS = [
  ["a", "Bookings", "bookings", "+"], ["b", "Passenger cancellations", "pax_cancel", "−"], ["c", "Cancellation retention", "cancellation_credit", "+"],
  ["d", "Bus cancellations", "operator_cancel", "−"], ["e", "Exceptional refund", "exception_refund", "−"], ["f", "Dynamic pricing", "dynamic_pricing", "−"],
  ["g", "Advertisements deduction", "ads", "−"], ["h", "Operator offers", "operator_offers", "−"], ["i", "Partner commission", "partner_commission", "−"],
  ["j", "YourBus charge", "yourbus", "−"], ["k", "GDS commission incl. GST", "gds_commission", "−"], ["l", "TCS deductions", "tcs", "−"],
  ["m", "TDS 194-O", "tds", "−"], ["n", "Reschedule charges", "reschedule", "+"], ["o", "Reschedule excess fare", "reschedule_excess", "+"],
  ["p", "Differential GST", "differential_gst", "+"], ["q", "Open ticket offers", "open_ticket_offers", "−"], ["r", "Generic add-on", "generic_addon", "+"],
  ["s", "Rise Program", "rise", "−"], ["t", "SRP", "srp", "−"], ["u", "Sponsored listing", "sponsored", "−"], ["v", "Nova", "nova", "−"], ["w", "Bus operator rewards", "bo_rewards", "−"]];

function Pricing({ d }: { d: any }) {
  const s = d.summary || {}, v = (x: string) => val(s[x]);
  return <div className="ota43-breakdown">
    <div className="ota43-breakdown-head"><p>INVOICE BREAKDOWN</p><h2>How RedBus arrived at <strong>{v("invoice_amount")}</strong></h2><span>Every rupee traced from statement revenue to bank payout · {int(d.statement_lines)} ticket events</span>{d.summary_delta === 0 ? <span className="ota43-tag matched">PDF TOTAL AGREES</span> : <Badge s="needs_review" />}</div>
    <div className="ota43-revenue"><div><span className="ota43-label good">● REVENUE EARNED</span><p>Fare collected and settlement amount before deductions</p></div><div className="ota43-large"><Icon n="receipt" size={24} /><div><b>Bookings (a)</b><br /><small>{int(d.by_section?.sold)} statement rows</small></div></div><strong>{v("bookings")}</strong></div>
    <div className="ota43-adjust"><div><span className="ota43-label orange">● CANCELLATION ADJUSTMENTS</span><p>Refunds, retention credits and bus cancellations</p></div><div>{ENTRIES.slice(1, 5).map((x) => <div key={x[1]} className="ota43-finrow"><span>{x[0]}</span><b className={x[2] === "+" ? "green" : "red"}>{x[2] + " " + v(x[1])}</b></div>)}</div></div>
    <div className="ota43-adjust"><div><span className="ota43-label blue">● OTHER DEDUCTIONS</span><p>Offers, TCS and TDS from the invoice summary</p></div><div>{ENTRIES.slice(5).map((x) => <div key={x[1]} className="ota43-finrow"><span>{x[0]}</span><b>{x[2] + " " + v(x[1])}</b></div>)}</div></div>
    <details className="ota43-formula-details"><summary>Full invoice calculation · all 23 categories (a–w)</summary>
      <div className="ota43-scroll"><table><thead><tr><th>Code</th><th>Category</th><th>Sign</th><th>PDF total</th></tr></thead><tbody>
        {ITEMS.map((x) => <tr key={x[0]}><td>{x[0]}</td><td>{x[1]}</td><td>{x[3]}</td><td>{v(x[2])}</td></tr>)}
        <tr className="total"><td>Z</td><td>Stated invoice amount</td><td>=</td><td>{v("invoice_amount")}</td></tr></tbody></table></div></details>
    <div className="ota43-payout"><div><span>● NET PAYOUT</span><p>As stated on the redBus payment advice</p></div><strong>{v("invoice_amount")}</strong><div><Icon n="check" size={30} /></div></div>
  </div>;
}

function SummaryTable({ d }: { d: any }) {
  const stats = d.section_stats || {}, detail = d.summary_details || {};
  const cats = [["Travelled", "Confirmed bookings", "sold", "bookings"], ["Pax cancellations", "Passenger initiated", "pax_cancelled", "pax_cancel"], ["Operator cancellations", "Bus did not run", "bus_cancelled", "operator_cancel"]];
  const redbusGross = cats.reduce((n, c) => n + Number(detail[c[3]]?.gross || 0), 0);
  const gdsGross = cats.reduce((n, c) => n + Number(stats[c[2]]?.gds_expected_fare || 0), 0);
  const valid = cats.some((c) => stats[c[2]]?.gds_count > 0);
  const fareDelta = cats.reduce((n, c) => n + Number(stats[c[2]]?.fare_diff || 0), 0);
  return <section className="ota43-summary"><header><h3>Reconciliation summary</h3><small>Fares incl. GST, then payout after commission · GDS vs RedBus · {int(d.statement_lines)} ticket rows</small></header>
    <div className="ota43-scroll"><table><thead><tr><th>CATEGORY</th><th>COUNT</th><th>GDS EXPECTED</th><th>REDBUS PAID</th><th>FARE DIFF</th><th>PAYOUT DIFF</th></tr></thead><tbody>
      {cats.map(([name, sub, section, category]) => {
        const x = stats[section] || {}, invoiceGross = detail[category]?.gross ?? x.invoice_gross, comparable = x.gds_count > 0;
        return <tr key={section}><td><b>{name}</b><small>{sub}</small></td><td>{int(x.count)}</td>
          <td>{val(comparable ? x.gds_expected_fare : null)}{comparable ? <small>{int(x.gds_count)} GDS comparable</small> : <small>No GDS evidence</small>}</td>
          <td>{val(invoiceGross)}</td>
          <td className={count(x.fare_diff) < 0 ? "red" : "blue"}>{amount(comparable ? x.fare_diff : null, true)}</td>
          <td className={count(x.payout_diff) < 0 ? "red" : "blue"}>{amount(comparable ? x.payout_diff : null, true)}</td></tr>;
      })}
      <tr className="total"><td>Total<small>Across all three categories</small></td><td>{int(d.statement_lines)}</td>
        <td>{val(valid ? gdsGross : null)}{valid && <small>Comparable GDS rows only</small>}</td>
        <td>{val(redbusGross)}</td><td>{amount(valid ? fareDelta : null, true)}</td><td>{amount(valid ? d.totals?.discrepancy_total : null, true)}</td></tr></tbody></table></div>
    <footer><Icon n="adjust" /><strong>Source-backed comparison</strong><span>Only bookings found in this GDS are compared. Unverified amounts and unallocated invoice deductions remain separate; differences are not invented.</span></footer></section>;
}

const labelFlag = (flag: string) => ({ missing_in_gds: "In OTA, not in GDS", missing_in_ota: "In GDS, not on invoice", status: "Status differs", doj: "Journey date differs", fare: "Fare differs", offer: "Offer differs", commission: "Commission differs", commission_tax: "Commission tax differs", cancellation_charge: "Cancellation charge differs", payout: "Payout differs" } as Record<string, string>)[flag] || flag;
const FlagChips = ({ row }: { row: any }) => (row.differences?.length
  ? <>{row.differences.map((f: string, i: number) => <span key={i} className="ota43-flag">{labelFlag(f)}</span>)}</>
  : <span className="ota43-matchcheck"><Icon n="check" /> No numeric difference detected</span>);

function TableRows({ lines, act }: { lines: any[]; act: Act }) {
  return <div className="ota43-wide"><table className="ota43-compare"><thead>
    <tr className="band"><th colSpan={2}></th><th colSpan={7} className="ourband"><span className="ota43-logo">S</span> As Per GDS</th><th colSpan={8} className="otaband"><span className="ota43-logo red">R</span> As Per RedBus</th><th colSpan={2} className="difference"><Icon n="chart" /> Difference</th><th>ACTIONS</th></tr>
    <tr>{["PNR", "STATUS", "DOJ", "Fare", "Tax", "Paid by Pax", "Commission", "GST on Comm", "Offer", "Expected", "DOJ", "Fare", "Tax", "Paid by Pax", "Commission", "GST on Comm", "Op. Offer", "Take-home", "Diff", "Result", "Actions"].map((h, i) => <th key={i}>{h}</th>)}</tr></thead><tbody>
    {lines.map((x) => <tr key={x.id}>
      <td><button className="ota43-pnr" data-ota43="inspect" data-line={x.id} onClick={() => act("inspect", { line: x.id })}>{x.pnr}</button><small>{x.section}</small></td><td><Badge s={x.status} /></td>
      <td>{fmt(x.doj_gds || x.doj)}</td><td>{val(x.expected?.fare)}</td><td>{val(x.expected?.tax)}</td><td>{val(x.expected?.fare == null ? null : x.expected.fare + x.expected.tax)}</td><td>{val(x.expected?.commission)}</td><td>{val(x.expected?.commission_tax)}</td><td>{val(x.expected?.operator_offer)}</td><td>{val(x.expected?.take_home)}</td>
      <td>{fmt(x.doj)}</td><td>{val(x.fare)}</td><td>{val(x.tax)}</td><td>{val(x.fare == null || x.tax == null ? null : x.fare + x.tax)}</td><td>{val(x.commission)}</td><td>{val(x.commission_tax)}</td><td>{val(x.operator_offer)}</td><td>{val(x.take_home)}</td>
      <td className={count(x.delta) < 0 ? "red" : "green"}>{amount(x.delta, true)}</td><td><FlagChips row={x} /></td>
      <td>{x.status === "matched" ? <span className="ota43-green-icon"><Icon n="check" size={23} /></span> : <Btn op="inspect" kind="small pastel" act={act} data={{ line: x.id }}><Icon n="search" /> Resolve</Btn>}</td></tr>)}
  </tbody></table></div>;
}

function RowCards({ lines, act }: { lines: any[]; act: Act }) {
  return <div className="ota43-cards">{lines.map((x) => {
    const diff = x.delta, label = x.status === "matched" ? "MATCHED" : x.status === "unmatched_ota" ? "MISSING IN GDS" : "NEEDS REVIEW";
    return <article key={x.id} className="ota43-ticket">
      <header><div className="ota43-ticket-info"><span className="ota43-warnicon"><Icon n={x.status === "matched" ? "check" : "warning"} size={24} /></span><div><Badge s={x.status} /> <code>{x.pnr}</code><small>Journey {fmt(x.doj)} · {x.section}</small></div></div><div className="ota43-extra">{label}<strong className={count(diff) < 0 ? "red" : "green"}>{amount(diff, true)}</strong></div></header>
      <div className="ota43-ticket-values"><div><label>YOU EXPECT</label><b>{val(x.expected?.take_home)}</b></div><div><label>REDBUS PAYS</label><b>{val(x.take_home)}</b></div></div>
      <div className="ota43-why"><Icon n="info" /><div><b>WHY</b><p>{x.why || "Verified"}</p><div><FlagChips row={x} /></div></div></div>
      <footer><Btn op="accept" kind="success" act={act} data={{ line: x.id }}><Icon n="check" /> Accept RedBus</Btn><Btn op="dispute" kind="outlined" act={act} data={{ line: x.id }}>Dispute</Btn>
        {x.resolution && <span className="ota43-resolution">{x.resolution.action} by {x.resolution.by}</span>}<Btn op="inspect" act={act} data={{ line: x.id }}><Icon n="search" /> Investigate <Icon n="arrow" /></Btn></footer></article>;
  })}</div>;
}

type V = { mode: string; view: string; filter: string; issue: string; breakdown: boolean; offset: number; search: string };
const ISSUE_TABS = (t: any): [string, string, any?][] => [["all", "All differences", t.outstanding_issue_count], ["missing_in_ota", "In our data, not on invoice", t.missing_in_ota], ["status", "Status differs"], ["fare", "Fare differs"], ["offer", "Offer differs"], ["commission", "Commission differs"], ["cancellation_charge", "Cancellation charge differs"], ["payout", "Payout differs"]];

function DetailPanel({ d, v, rows, act }: { d: any; v: V; rows: any[]; act: Act }) {
  const t = d.totals || {}, amt = d.summary?.invoice_amount, visible = rows.slice(0, 15);
  return <>
    <div className="ota43-headline"><div><div className="ota43-line"><span className="ota43-ota-logo">R</span><div><small>RECONCILIATION DASHBOARD</small><h2>RedBus · {fmt(d.billing_period_start)} → {fmt(d.billing_period_end)}</h2><label>INVOICE {d.invoice_number}</label></div></div></div>
      <div><Btn op="recheck" kind="small" act={act}><Icon n="refresh" /> Recheck GDS</Btn> <Btn op="original" act={act}><Icon n="eye" /> View source PDF</Btn></div></div>
    <NoteWarn d={d} />
    <section className="ota43-hero"><div><p>RedBus paid you</p><strong>{val(amt)}</strong><small>across {int(d.statement_lines)} ticket events · {fmt(d.billing_period_start)} to {fmt(d.billing_period_end)}</small></div>
      <div className="ota43-score"><div className="ota43-ring">{t.invoice_lines ? Math.round((t.verified / t.invoice_lines) * 100) : 0}%</div><div><b>{int(t.verified)} of {int(t.invoice_lines)} verified</b><small>{int(t.outstanding_issue_count)} records require review</small></div></div></section>
    <SummaryTable d={d} />
    <section className="ota43-ticket-check">
      <header><div><Icon n="search" size={25} /><span><h3>Ticket check</h3><small>{int(t.invoice_lines)} events · {int(t.matched)} verified · {int(t.outstanding_issue_count)} need review</small></span></div><Badge s={t.outstanding_issue_count ? "needs_review" : "matched"} /></header>
      <div className="ota43-ticket-totals"><div><small>REDBUS PAYS (TICKETS)</small><strong>{val(t.ota_ticket_take_home)}</strong></div><div><small>GDS EXPECTS (COMPARABLE)</small><strong>{val(t.gds_expected)}</strong></div><div><small>COMPARISON DELTA</small><strong>{amount(t.discrepancy_total, true)}</strong></div><div><small>INVOICE AFTER SUMMARY DEDUCTIONS</small><strong>{val(amt)}</strong><span>Source PDF amount</span></div></div>
      <div className="ota43-issues">{ISSUE_TABS(t).map((x) => <button key={x[0]} data-ota43="issue" data-issue={x[0]} className={v.issue === x[0] ? "active" : ""} onClick={() => act("issue", { issue: x[0] })}>{x[1] + (x[2] !== undefined ? " " + int(x[2]) : "")}</button>)}</div>
      <div className="ota43-actions"><Btn op="ticket-csv" act={act}><Icon n="download" /> CSV</Btn></div>
      <div data-ota43-inline="">{visible.length ? <TableRows lines={visible} act={act} /> : <p className="ota43-empty">No rows in this category. Use Browse all tickets for the complete ledger.</p>}</div>
    </section>
    <div className="ota43-banner"><Icon n="warning" size={26} /><div><b>{int(t.outstanding_issue_count)} ticket events need review</b><small>Differences are computed from actual available GDS evidence; no auto-acceptance.</small></div><Icon n="arrow" /></div>
    <div className="ota43-quick">
      <button data-ota43="breakdown" onClick={() => act("breakdown")}><Icon n="receipt" size={28} /><span><strong>{v.breakdown ? "Hide" : "View"} invoice breakdown</strong><small>See how RedBus arrived at {val(amt)}</small></span><Icon n="arrow" /></button>
      <button data-ota43="browse" onClick={() => act("browse")}><Icon n="cards" size={28} /><span><strong>Browse all {int(d.statement_lines)} tickets</strong><small>Every imported PNR event · searchable and filterable</small></span><Icon n="arrow" /></button></div>
    {v.breakdown && <Pricing d={d} />}
  </>;
}

function Filters({ d, v, act, text, onText }: { d: any; v: V; act: Act; text: string; onText: (s: string) => void }) {
  const t = d.totals || {};
  const data = [
    ["all", "Total PNRs", t.invoice_lines, "dark"], ["matched", "Matched", t.matched, "green"],
    ["mismatched", "Mismatched", t.mismatched, "orange"], ["needs_review", "Needs review", t.needs_review, "orange"],
    ["unmatched_ota", "Missing in GDS", t.missing_in_gds, "red"], ["unmatched_gds", "Missing in OTA", t.missing_in_ota, "orange"], ["disputed", "Disputed", t.disputed || 0, "orange"]];
  return <div className="ota43-browser-controls">
    <div className="ota43-control-top"><Btn op="back" kind="back" act={act}><Icon n="back" /> Back</Btn>
      <div className="ota43-pillset">{data.map((x) => <button key={x[0]} data-ota43="filter" data-filter={x[0]} className={"ota43-badge " + x[3] + " " + (v.filter === x[0] ? "active" : "")} onClick={() => act("filter", { filter: x[0] })}>{x[1]} <strong>{int(x[2])}</strong></button>)}</div></div>
    <div className="ota43-control-bottom"><input type="search" data-ota43-search="" placeholder="Search PNR..." value={text} aria-label="Search PNR" onChange={(e) => onText(e.target.value)} />
      <div className="ota43-view-switch"><Btn op="cards" kind={v.view === "cards" ? "on" : ""} act={act}><Icon n="cards" /> Cards</Btn><Btn op="table" kind={v.view === "table" ? "on" : ""} act={act}><Icon n="table" /> Table</Btn></div>
      <Btn op="export" kind="download" act={act}><Icon n="download" /> Export CSV</Btn></div></div>;
}

function Ledger({ docs, act }: { docs: any[]; act: Act }) {
  return <section className="ota43-ledger">
    <header><div className="ota43-title"><span><Icon n="receipt" size={29} /></span><div><small>SETTLEMENT LEDGER</small><h2>Uploaded Invoices</h2></div></div><div><span className="ota43-badge blue">● LIVE</span> <Btn op="upload" kind="primary" act={act}><Icon n="upload" /> Upload Invoice <Icon n="arrow" /></Btn></div></header>
    <div className="ota43-scroll"><table><thead><tr><th>OTA</th><th>PERIOD</th><th>INVOICE</th><th>PNRS</th><th>STATUS</th><th>MATCHED</th><th>ISSUES</th><th>UPLOADED</th><th>ACTIONS</th></tr></thead><tbody>
      {docs.length ? docs.map((d) => <tr key={d.id}><td><span className="ota43-ota-logo small">R</span> <b>RedBus</b></td><td>{fmt(d.billing_period_start)} → {fmt(d.billing_period_end)}</td><td><code>{d.invoice_number}</code><small>{d.file_name}</small></td><td>{int(d.statement_lines)}</td><td><Badge s={d.status === "parsed" ? "needs_review" : d.status} /></td><td><b>{int(d.totals?.verified)}</b></td><td><span className="ota43-tag mismatched">{int(d.totals?.outstanding_issue_count)}</span></td><td>{fmt(d.uploaded_at)}</td>
        <td><Btn op="view" kind="primary small" act={act} data={{ id: String(d.id) }}><Icon n="eye" /> View</Btn><Btn op="delete" kind="icon" act={act} data={{ id: String(d.id) }}><Icon n="trash" /></Btn></td></tr>)
        : <tr><td colSpan={9}><div className="ota43-empty"><Icon n="receipt" size={32} /><b>No uploaded invoices yet</b><p>Upload a redBus Payment Advice PDF to reconcile it with GDS bookings.</p></div></td></tr>}
    </tbody></table></div></section>;
}

async function fetchBlob(path: string) {
  const res = await fetch("/api/admin" + path, { headers: authHeaders() });
  if (!res.ok) { let m = "Request failed"; try { m = (await res.json()).error ?? m; } catch { /* binary */ } throw new Error(m); }
  return res.blob();
}
async function download(path: string, name: string) {
  const url = URL.createObjectURL(await fetchBlob(path));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

type Dlg = { kind: "upload" } | { kind: "inspect"; row: any } | { kind: "resolve"; row: any; action: string } | null;
const INITIAL: V = { mode: "overview", view: "cards", filter: "all", issue: "all", breakdown: false, offset: 0, search: "" };

export function ReconciliationTab({ id }: { id?: string | null }) {
  const docId = id || null;
  const [v, setV] = useState<V>(INITIAL);
  const [text, setText] = useState("");
  const [docs, setDocs] = useState<any[] | null>(null);
  const [doc, setDoc] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [tick, setTick] = useState(0);
  const [dlg, setDlg] = useState<Dlg>(null);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // legacy: the accounts content section itself carries .ota43-root while the verifier is shown
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-ac10-page]");
    root?.classList.add("ota43-root");
    return () => root?.classList.remove("ota43-root");
  }, []);
  useEffect(() => { setV(INITIAL); setText(""); setDoc(null); setDocs(null); setRows([]); setRowCount(0); }, [docId]);
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    let live = true;
    (async () => {
      if (!docId) { const list = await api.admin<any>(q()); if (live) setDocs(list.imports || []); return; }
      const d = await api.admin<any>(q("/" + docId));
      const browse = v.mode === "browse";
      const filter = browse ? v.filter || "all" : v.issue === "all" ? "unresolved" : "all";
      const query = new URLSearchParams({ filter, q: v.search || "", issue: v.issue && v.issue !== "all" ? v.issue : "", offset: String(v.offset || 0), limit: "35" });
      const out = await api.admin<any>(q("/" + docId + "/lines?" + query));
      if (!live) return;
      setDoc(d); setRows(out.rows || []); setRowCount(out.count || 0);
    })().catch((e) => { if (live) toastError(e); });
    return () => { live = false; };
  }, [docId, v.mode, v.filter, v.issue, v.offset, v.search, tick]);

  const onText = (t: string) => {
    setText(t); clearTimeout(timer.current);
    timer.current = setTimeout(() => setV((p) => ({ ...p, search: t, offset: 0 })), 280);
  };

  const inspect = async (lineId: string) => {
    const pnr = String(lineId).split(":")[1] || "";
    const row = rows.find((x) => x.id === lineId) || ((await api.admin<any>(q("/" + docId + "/lines?" + new URLSearchParams({ q: pnr, limit: "100" })))).rows || []).find((x: any) => x.id === lineId);
    if (!row) return toast("Open this row from Browse all tickets", "warn");
    setDlg({ kind: "inspect", row });
  };
  const resolve = (row: any, action: string) => {
    if (row.status === "matched") return toast("This ticket is already verified", "ok");
    setDlg({ kind: "resolve", row, action });
  };

  const act: Act = (op, data = {}) => {
    void (async () => {
      if (op === "upload") return setDlg({ kind: "upload" });
      if (op === "view") { location.hash = route(data.id); return; }
      if (op === "back") { if (v.mode === "browse") setV((p) => ({ ...p, mode: "overview", offset: 0 })); else location.hash = route(); return; }
      if (op === "browse") return setV((p) => ({ ...p, mode: "browse", offset: 0 }));
      if (op === "filter") return setV((p) => ({ ...p, filter: data.filter!, offset: 0, mode: "browse" }));
      if (op === "issue") return setV((p) => ({ ...p, issue: data.issue! }));
      if (op === "breakdown") return setV((p) => ({ ...p, breakdown: !p.breakdown }));
      if (op === "cards" || op === "table") return setV((p) => ({ ...p, view: op }));
      if (op === "next" || op === "previous") return setV((p) => ({ ...p, offset: Math.max(0, p.offset + (op === "next" ? 35 : -35)) }));
      if (op === "export" || op === "ticket-csv") return download(q("/" + docId + "/export.csv?filter=all"), "reconciliation_redbus_" + (doc?.invoice_number || docId) + ".csv");
      if (op === "original") { const url = URL.createObjectURL(await fetchBlob(q("/" + docId + "/original.pdf"))); if (!window.open(url, "_blank", "noopener")) { const a = document.createElement("a"); a.href = url; a.download = "redbus-invoice.pdf"; a.click(); } setTimeout(() => URL.revokeObjectURL(url), 30000); return; }
      if (op === "inspect") return inspect(data.line!);
      if (op === "accept" || op === "dispute" || op === "investigate") { const row = rows.find((x) => x.id === data.line); return row ? resolve(row, op === "accept" ? "accept_ota" : op === "dispute" ? "dispute" : "investigating") : inspect(data.line!); }
      if (op === "recheck") { await api.admin(q("/" + docId + "/recheck"), "POST"); reload(); toast("Reconciliation refreshed", "ok"); return; }
      if (op === "delete") {
        const d = docs?.find((x) => String(x.id) === String(data.id));
        if (!d || !(await confirmDialog("Delete invoice " + d.invoice_number + " and its PDF?", { danger: true }))) return;
        await api.admin(q("/" + d.id), "DELETE", { confirm: d.invoice_number }); reload();
      }
    })().catch(toastError);
  };

  let body: ReactNode;
  if (!docId) body = docs ? <Ledger docs={docs} act={act} /> : <div className="ota43-loading">Loading invoice verifier…</div>;
  else if (!doc) body = <div className="ota43-loading">Loading invoice verifier…</div>;
  else if (v.mode === "browse") body = <>
    <Filters d={doc} v={v} act={act} text={text} onText={onText} />
    {v.view === "cards" ? <RowCards lines={rows} act={act} /> : <TableRows lines={rows} act={act} />}
    <div className="ota43-pagination"><span>Showing {int(rows.length ? v.offset + 1 : 0)}–{int(v.offset + rows.length)} of {int(rowCount)}</span>
      <Btn op="previous" act={act} disabled={v.offset <= 0}>Previous</Btn><Btn op="next" act={act} disabled={v.offset + 35 >= rowCount}>Next</Btn></div>
  </>;
  else body = <DetailPanel d={doc} v={v} rows={rows} act={act} />;

  return <>{body}{dlg && <Dialogs dlg={dlg} setDlg={setDlg} docId={docId} onDone={reload} />}</>;
}

function Dialogs({ dlg, setDlg, docId, onDone }: { dlg: NonNullable<Dlg>; setDlg: (d: Dlg) => void; docId: string | null; onDone: () => void }) {
  const close = () => setDlg(null);
  if (dlg.kind === "upload") return <UploadDialog onClose={close} />;
  if (dlg.kind === "inspect") {
    const row = dlg.row;
    const facts: Record<string, unknown> = { PNR: row.pnr, Section: row.section, "Travel date (RedBus)": row.doj, "Travel date (GDS)": row.doj_gds || "", Route: row.route_code, Seats: row.seats, "Fare (OTA)": val(row.fare), "Fare (GDS)": val(row.expected?.fare), "Commission (OTA)": val(row.commission), "Commission (GDS)": val(row.expected?.commission), "GST on commission (OTA)": val(row.commission_tax), "Operator offer (OTA)": val(row.operator_offer), "Actual statement net": val(row.net_payable), "Take home (after offers)": val(row.take_home), Difference: amount(row.delta, true), Reason: row.why, Resolution: row.resolution?.action || "Open", "Last reviewed by": row.resolution?.by || "" };
    const act: Act = (op) => {
      if (row.status === "matched") { close(); toast("This ticket is already verified", "ok"); return; }
      setDlg({ kind: "resolve", row, action: op === "accept" ? "accept_ota" : op === "dispute" ? "dispute" : "investigating" });
    };
    return <Modal title={"Investigate · " + row.pnr} size="xl" portal onClose={close}><div>
      <div className="ota43-investigate">
        <div className="ota43-investigate-head"><Badge s={row.status} /><p>{row.why || "—"}</p></div>
        <div className="ota43-ticket-values"><div><label>GDS EXPECTED</label><b>{val(row.expected?.take_home)}</b></div><div><label>REDBUS TAKE-HOME</label><b>{val(row.take_home)}</b></div></div>
        <dl>{Object.entries(facts).map(([k, x]) => <Fragment key={k}><dt>{k}</dt><dd>{String(x ?? "")}</dd></Fragment>)}</dl>
        <div><FlagChips row={row} /></div>
        <div className="ota43-modal-actions"><Btn op="accept" kind="success" act={act} data={{ line: row.id }}><Icon n="check" /> Accept RedBus</Btn><Btn op="dispute" kind="outlined" act={act} data={{ line: row.id }}>Dispute</Btn><Btn op="investigate" kind="primary" act={act} data={{ line: row.id }}>Record investigation</Btn></div>
      </div></div></Modal>;
  }
  return <ResolveDialog row={dlg.row} action={dlg.action} onClose={close} onDone={async (note) => {
    await api.admin(q("/" + docId + "/resolve"), "POST", { line_id: dlg.row.id, action: dlg.action, note });
    close(); toast("Resolution recorded with operator identity", "ok"); onDone();
  }} />;
}

function ResolveDialog({ row, action, onClose, onDone }: { row: any; action: string; onClose: () => void; onDone: (note: string) => Promise<void> }) {
  const isDispute = action === "dispute";
  const title = isDispute ? "Dispute redBus payout" : action === "accept_ota" ? "Accept redBus amount" : "Investigate ticket";
  const [note, setNote] = useState<string>(row.resolution?.note || "");
  const [busy, setBusy] = useState(false);
  const submit = () => {
    if (isDispute && !note.trim()) return toast("Reason / investigation note is required", "bad");
    setBusy(true); onDone(note).catch((e) => { setBusy(false); toastError(e); });
  };
  return <Modal title={title} portal onClose={onClose} foot={<><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={submit}>{isDispute ? "Raise dispute" : action === "accept_ota" ? "Accept" : "Save investigation"}</button></>}>
    <div className="fld"><label>Reason / investigation note{isDispute ? " *" : ""}</label><textarea name="note" value={note} onChange={(e) => setNote(e.target.value)} /></div>
  </Modal>;
}

function UploadDialog({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!file) return toast("Choose a PDF", "bad");
    if (!/\.pdf$/i.test(file.name) || file.size > 7 * 1024 * 1024) return toast("PDF required, max 7MB", "bad");
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer()); let binary = "";
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      const out = await api.admin<any>(q(), "POST", { ota_slug: "redbus", file_name: file.name, base64: btoa(binary) });
      onClose(); toast(out.duplicate ? "Invoice already uploaded" : "Invoice parsed. Review reconciliation results.", "ok");
      location.hash = route(out.id);
    } catch (e) { toastError(e); setBusy(false); }
  };
  return <Modal title="Upload OTA Invoice" size="lg" portal onClose={onClose}>
    <div className="ota43-upload-dialog">
      <div className={`ota43-drop${over ? " dragover" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); setFile(e.dataTransfer?.files?.[0] || null); }}>
        <Icon n="upload" size={32} /><b>Drop redBus Payment Advice PDF here</b><small>{file ? file.name : "Or select PDF from your computer"}</small>
        <input data-upload-pdf="" type="file" accept=".pdf,application/pdf" aria-label="Choose PDF" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </div>
      <label className="ota43-upload-label">OTA<select data-upload-ota=""><option value="redbus">RedBus</option></select></label>
      <p>The file is stored privately with the operator GDS. Matching uses only bookings actually present. Max file size: 7 MB.</p>
      <div className="ota43-modal-actions"><button className="ota43-btn" data-upload-cancel="" onClick={onClose}>Cancel</button><button className="ota43-btn primary" data-upload-submit="" disabled={busy} onClick={submit}>{busy ? "Parsing invoice…" : "Upload & Verify"}</button></div>
    </div>
  </Modal>;
}
