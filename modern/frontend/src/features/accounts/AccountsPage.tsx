import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, type Ledger, type Me, type ReceivableRow, type Sales, type SalesFacets, type Transactions, type TxRow } from "../../api";
import { confirmDialog, Modal, toast, toastError } from "../../components/ui/feedback";
import { NiceDate } from "../../components/ui/NiceDate";
import { NiceSelect } from "../../components/ui/NiceSelect";
import type { Role } from "../../navigation/nav";
import { BookingOverlay } from "../crm/BookingOverlay";

// React port of legacy Accounts (public/js/accounts-parity-v10.js + accounts-sales-v37.js sector dropdown).
// Same DOM / classes (div.ac10-root > nav.ac10-nav + section.ac10-content) so the legacy CSS applies unchanged.
const P: Record<string, string> = {
  sales: '<path d="M4 20V12m5 8V4m5 16v-8m5 8V8"/>',
  transactions: '<path d="m6 4 0 16m-3-3 3 3 3-3M18 20V4m-3 3 3-3 3 3"/>',
  receivables: '<rect x="2" y="5" width="20" height="15" rx="3"/><path d="M3 10h18M16 14h3"/>',
  reports: '<path d="M5 3h10l5 5v13H5zM15 3v5h5M8 12h8M8 16h6"/>',
  invoices: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2zM9 8h6m-6 4h6m-6 4h4"/>',
  reconciliation: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  agent: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-3a6 6 0 0 1 12 0v3M17 8h5m-2.5-2.5v5"/>',
  loyalty: '<path d="M4 11v11h16V11M2 7h20v4H2zM12 7v15M8 7C2 7 3 1 7 2c3 1 5 5 5 5s2-4 5-5c4-1 5 5-1 5"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M7 2v4m10-4v4M3 10h18"/>',
  print: '<path d="M6 9V3h12v6M6 18H3V9h18v9h-3M6 15h12v7H6z"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M5 19v3h14v-3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 10.7 6.6-4.2m-6.6 8.9 6.6 3.9"/>',
  arrow: '<path d="m5 12 14 0m-6-6 6 6-6 6"/>', back: '<path d="m14 6-6 6 6 6"/>', filter: '<path d="M4 7h16M7 12h10m-7 5h4"/>',
  edit: '<path d="m15 4 5 5M4 20l5-1L20 8a3 3 0 0 0-4-4L5 15z"/>', trash: '<path d="M4 7h16m-12 0-1 14h10L16 7m-6 4v6m4-6v6M9 7V4h6v3"/>', plus: '<path d="M12 4v16M4 12h16"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7Z"/><circle cx="12" cy="12" r="3"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3"/>',
  bus: '<rect x="3" y="3" width="18" height="16" rx="3"/><path d="M3 11h18m-13 8v2m8-2v2"/>', location: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2"/>',
  sparkle: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>', check: '<path d="m5 12 4 4L19 6"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  fleet: '<rect x="2" y="6" width="13" height="11" rx="2"/><path d="M15 9h4l3 3v5h-7M6 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/>',
  steering: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M12 14v7M10 12H3M14 12h7"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
  pins: '<path d="M9 10c0 4-5 9-5 9s-5-5-5-9a5 5 0 0 1 10 0Z" transform="translate(5 0)"/><circle cx="9" cy="10" r="1.6"/><path d="M15 21h6M18 18v3"/>',
  metro: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M9 21l-2-4M15 21l2-4"/><circle cx="9" cy="14" r=".8"/><circle cx="15" cy="14" r=".8"/>',
  van: '<path d="M3 7h11l4 4h3v6H3z"/><path d="M14 7v4h4"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h8"/>',
  userX: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-2a6 6 0 0 1 11-3M16 15l5 5M21 15l-5 5"/>', ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
  pie: '<path d="M21 12a9 9 0 1 1-9-9v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 13h2"/>',
};
export function Ic({ k, s = 17 }: { k: string; s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9"
    dangerouslySetInnerHTML={{ __html: P[k] ?? P.reports }} />;
}
const V37: Record<string, string> = { pin: '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>', down: '<path d="m6 9 6 6 6-6"/>', check: '<path d="m5 12 5 5L19 7"/>' };
const Svg37 = ({ k, s }: { k: string; s: number }) => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: V37[k] }} />;

// legacy core.js formatters
export const inr = (n: number | null | undefined, d = 0) => (n == null || isNaN(n) ? "—" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d })}`);
export const num = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("en-IN"));
export const fdate = (s: string | null | undefined) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const pct = (x: number | null | undefined) => (x == null ? "—" : `${Number(x).toFixed(1)}%`);
export const fdt = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
export type Kind = "money" | "pct" | "int" | "date" | undefined;
export const fmt = (v: unknown, t: Kind) => t === "money" ? inr(v as number) : t === "pct" ? pct(v as number) : t === "date" ? fdate(v as string) : t === "int" ? num(v as number) : v == null || v === "" ? "—" : String(v);
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const today = () => isoDay(new Date());
export const addDays = (s: string, n: number) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return isoDay(d); };

export type Col = { key: string; label: string; type?: Kind; total?: boolean; col?: string };
export function Table<T extends Record<string, unknown>>({ rows, cols, foot, cls = "", cell }: { rows: T[]; cols: Col[]; foot?: boolean; cls?: string; cell?: (r: T, c: Col) => ReactNode }) {
  const sum = (k: string) => rows.reduce((v, r) => v + (Number(r[k]) || 0), 0);
  return (
    <div className="ac10-scroll"><table className={`ac10-table ${cls}`}>
      <thead><tr>{cols.map((c) => <th key={c.key} className={c.col ?? ""}>{c.label}</th>)}</tr></thead>
      <tbody>{rows.length ? rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c.key} className={c.col ?? ""}>{cell ? cell(r, c) : fmt(r[c.key], c.type)}</td>)}</tr>)
        : <tr><td colSpan={cols.length} className="ac10-nodata">No data for selected period</td></tr>}</tbody>
      {rows.length > 0 && foot && <tfoot><tr>{cols.map((c, i) => <td key={c.key}>{i === 0 ? `Total (${rows.length})` : c.total ? (c.type === "money" ? inr(sum(c.key)) : c.type === "int" ? num(sum(c.key)) : "") : " "}</td>)}</tr></tfoot>}
    </table></div>
  );
}
export const Stat = ({ label, value, kind = "" }: { label: string; value: string; kind?: string }) => <div className={`ac10-stat ${kind}`}><span>{label}</span><strong>{value}</strong></div>;
export const Empty = ({ text = "No data for this period" }: { text?: string }) => <div className="ac10-empty"><Ic k="reports" s={28} /><span>{text}</span></div>;

const ALL: Role[] = ["owner", "admin", "ops", "accounts", "viewer"];
const ACC: Role[] = ["owner", "admin", "accounts"];
export const ACCOUNT_TABS: [string, string, string, Role[]][] = [
  ["analytics", "Sales", "sales", ALL], ["transactions", "Transactions", "transactions", ACC], ["receivables", "Receivables", "receivables", ACC],
  ["reports", "Reports", "reports", ALL], ["invoices", "Invoices", "invoices", ACC], ["reconciliation", "OTA Invoice Verifier", "reconciliation", ACC],
  ["agent-settings", "Agent Settings", "agent", ACC], ["coupons", "Loyalty", "loyalty", ["owner", "admin"]],
];

/** Accounts shell: legacy tab strip + content section. `children` renders a tab that is not ported yet (interim panel). */
export function AccountsPage({ me, tab, children }: { me: Me; tab: string; children?: ReactNode }) {
  const role = me.role as Role;
  return (
    <div className="ac10-root">
      <nav className="ac10-nav" aria-label="Accounts submenus">
        {ACCOUNT_TABS.filter((t) => t[3].includes(role)).map(([key, name, ico]) => (
          <a key={key} href={`#/accounts/${key}`} className={tab === key ? "active" : ""}><Ic k={ico} /><span>{name}</span></a>
        ))}
      </nav>
      <section className="ac10-content" data-ac10-page="">
        {tab === "analytics" ? <SalesTab /> : tab === "transactions" ? <TransactionsTab me={me} /> : tab === "receivables" ? <ReceivablesTab /> : children}
      </section>
    </div>
  );
}

export function query() { return Object.fromEntries(new URLSearchParams(location.hash.split("?")[1] ?? "")); }

function SectorDropdown({ facets, sector, onPick }: { facets: SalesFacets; sector: string; onPick: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const items = [{ value: "all", label: "All Sectors" }, ...facets.sectors];
  const chosen = items.find((x) => x.value === sector) ?? items[0];
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", off, true);
    root.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    return () => document.removeEventListener("click", off, true);
  }, [open]);
  const key = (e: React.KeyboardEvent) => {
    const opts = [...(root.current?.querySelectorAll<HTMLElement>("[data-ac37-option]") ?? [])];
    if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); root.current?.querySelector<HTMLElement>("[data-ac37-sector-trigger]")?.focus(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      const i = opts.indexOf(document.activeElement as HTMLElement), d = e.key === "ArrowDown" ? 1 : -1;
      opts[(i + d + opts.length) % opts.length]?.focus();
    } else if (open && (e.key === "Home" || e.key === "End")) { e.preventDefault(); (e.key === "Home" ? opts[0] : opts[opts.length - 1])?.focus(); }
  };
  return (
    <div ref={root} data-ac11-sector-anchor="" className={`ac37-sector${open ? " open" : ""}`} onKeyDown={key}>
      <button type="button" className="ac37-sector-trigger" data-ac37-sector-trigger="" aria-label={`Sector filter: ${chosen.label}`} aria-controls="ac37-sectors-list"
        aria-haspopup="listbox" aria-expanded={open} title={chosen.label} onClick={() => setOpen((o) => !o)}>
        <span className="ac37-sector-leading"><Svg37 k="pin" s={21} /></span><span className="ac37-sector-text">{chosen.label}</span><span className="ac37-sector-caret"><Svg37 k="down" s={18} /></span>
      </button>
      <div className="ac37-sector-menu" role="listbox" aria-label="Directional sectors" id="ac37-sectors-list" data-ac37-sector-menu="" hidden={!open}>
        {items.map((row) => (
          <button key={row.value} type="button" role="option" aria-selected={row.value === chosen.value} data-ac37-option={row.value} title={row.label}
            onClick={() => { setOpen(false); if (row.value !== sector) onPick(row.value); }}>
            <span>{row.label}</span><span className="ac37-sector-check"><Svg37 k="check" s={17} /></span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SalesTab() {
  const q = query();
  const s = { from: q.from || addDays(today(), -6), to: q.to || today(), basis: q.basis || "travel_date", source: q.source || "all", sector: q.sector || "all", service: q.service || "all" };
  const [pivot, setPivot] = useState(q.pivot || "date");
  const [data, setData] = useState<{ d: Sales; f: SalesFacets } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(s);
  useEffect(() => {
    let live = true;
    setError(null);
    Promise.all([api.sales(s), api.salesFacets()]).then(([d, f]) => { if (live) setData({ d, f }); })
      .catch((e) => { if (live) { setError(e instanceof Error ? e.message : String(e)); toastError(e); } });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = (next: Partial<typeof s>) => {
    const merged = { ...s, ...next, pivot };
    if (merged.from > merged.to) return toast("Invalid date range", "bad");
    location.hash = `#/accounts/analytics?${new URLSearchParams(merged)}`;
  };
  if (error) return <div className="ac10-empty error"><Ic k="reports" s={30} /><b>Could not load analytics</b><p>{error}</p></div>;
  if (!data) return <div className="ac10-loading">Loading Accounts…</div>;
  const { d, f } = data, t = d.totals;
  const seg = (name: string, items: [string, string][], cur: string, on: (v: string) => void, action: string) => (
    <div className="ac10-segment" data-seg={name}>{items.map(([k, v]) => <button key={k} type="button" className={`ac10-btn ${cur === k ? "selected" : ""}`} data-ac10={action} data-value={k} onClick={() => on(k)}>{v}</button>)}</div>
  );
  return (
    <>
      <div className="ac10-saleshead">
        <label className="ac10-date"><span><Ic k="calendar" s={21} /></span><NiceDate name="from" label="From date" value={s.from} onChange={(v) => update({ from: v })} /></label>
        <label className="ac10-date"><span><Ic k="calendar" s={21} /></span><NiceDate name="to" label="To date" value={s.to} onChange={(v) => update({ to: v })} /></label>
        {seg("basis", [["travel_date", "Travel Date"], ["booking_date", "Booking Date"]], s.basis, (v) => update({ basis: v }), "change-basis")}
        {seg("pivot", [["date", "By Date"], ["sector", "By Sector"], ["service", "By Service"], ["pnl", "P&L"]], pivot, (v) => setPivot((p) => (p === v ? "date" : v)), "change-pivot")}
        <SectorDropdown facets={f} sector={s.sector} onPick={(v) => update({ sector: v, service: v === "all" || f.services.some((x) => x.value === s.service && x.sector === v) ? s.service : "all" })} />
        <label className="ac10-select ui-dd-hosted">
          <NiceSelect name="service" value={s.service} onChange={(v) => update({ service: v })}
            options={[["all", "All Services"], ...f.services.filter((x) => s.sector === "all" || x.sector === s.sector).map((x) => [x.value, x.label] as [string, string])]} />
          <Ic k="chevron" s={16} />
        </label>
      </div>
      <div className="ac10-saleslower">
        <label className="ac10-select ui-dd-hosted">
          <NiceSelect name="source" value={s.source} onChange={(v) => update({ source: v })} options={[["all", "All Channels"], ...f.channels.map((x) => [x, x] as [string, string])]} />
          <Ic k="chevron" s={16} />
        </label>
        <button type="button" className="ac10-btn primary" data-ac10="print" onClick={() => window.print()}><Ic k="print" />{" Print"}</button>
      </div>
      <div className="ac10-salesstats">
        <Stat label="Gross sales" value={inr(t.sales)} /><Stat label="Offers" value={inr(t.offers)} kind="orange" /><Stat label="Net Sales" value={inr(t.netSales)} kind="blue" />
        <Stat label="Bookings" value={num(t.bookings)} /><Stat label="ASP" value={inr(t.asp)} /><Stat label="Occupancy" value={pct(t.occupancyPct)} kind="green" />
        <Stat label="Fleet Util" value={pct(t.fleetUtilPct)} kind="green" /><Stat label="Cancel charges" value={inr(t.cancelCharges)} kind="green" />
      </div>
      <Stat label="GST Payable" value={inr(t.gst)} kind="red ac10-gst" />
      <div className="ac10-section ac10-finance-table" id="ac10-salesgrid">
        <div className="ac10-table-label">{pivot === "date" ? "BY CHANNEL" : `BY ${pivot.toUpperCase()}`}</div>
        <SalesGrid d={d} pivot={pivot} basis={s.basis} />
      </div>
    </>
  );
}

function SalesGrid({ d, pivot, basis }: { d: Sales; pivot: string; basis: string }) {
  const rows = d.rows.slice().reverse();
  if (pivot === "date") {
    const cols: Col[] = [{ key: "date", label: basis === "booking_date" ? "BOOKING DATE" : "TRAVEL DATE", type: "date" },
      { key: "bookings", label: "BOOKINGS", type: "int", total: true }, { key: "seats", label: "SEATS", type: "int", total: true },
      { key: "occupancyPct", label: "OCCUPANCY", type: "pct" }, { key: "fleetUtilPct", label: "FLEET UTIL", type: "pct" }, { key: "asp", label: "ASP", type: "money" },
      { key: "sales", label: "SALES", type: "money", total: true }, { key: "offers", label: "OFFERS", type: "money", total: true, col: "ac10-orange" },
      { key: "netSales", label: "NET SALES", type: "money", total: true, col: "ac10-strongblue" }, { key: "gst", label: "GST", type: "money", total: true, col: "ac10-red" },
      ...d.channels.map((x) => ({ key: `src_${x.source}`, label: x.source.toUpperCase(), type: "money" as const, col: "ac10-purple" }))];
    return <Table rows={rows.map((r) => ({ ...r, ...Object.fromEntries(d.channels.map((x) => [`src_${x.source}`, r.byChannel[x.source] ?? null])) }))} cols={cols} foot />;
  }
  if (pivot === "pnl") {
    const label: Record<string, string> = { bookings: "Bookings", seats: "Seats", netSales: "Net Sales", cancelCharges: "Cancel Charges", expense: "Expense", profit: "Profit" };
    return <Table rows={rows} foot cols={[{ key: "date", label: "TRAVEL DATE", type: "date" },
      ...Object.entries(label).map(([k, l]) => ({ key: k, label: l, type: (k === "bookings" || k === "seats" ? "int" : "money") as Kind, total: true }))]} />;
  }
  const list = pivot === "service" ? d.serviceBreakdown : d.sectorBreakdown;
  return list.length ? <Table rows={list} foot cols={[{ key: "name", label: pivot === "service" ? "SERVICE" : "SECTOR" }, { key: "bookings", label: "BOOKINGS", type: "int", total: true },
    { key: "seats", label: "SEATS", type: "int", total: true }, { key: "netSales", label: "NET SALES", type: "money", total: true }, { key: "avgFare", label: "AVG BOOKING", type: "money" }]} />
    : <Empty text={`No ${pivot} sales for the selected filters`} />;
}

// ---------------- Transactions (legacy accounts-parity-v10.js transactions()) ----------------
const OTAS = ["redbus", "abhibus", "paytm"];
function TransactionsTab({ me }: { me: Me }) {
  const q = query();
  const s = { from: q.from || addDays(today(), -6), to: q.to || today(), basis: q.basis || "travel_date", source: q.source || "all", service: q.service || "all", q: q.q || "" };
  const [kind, setKind] = useState(q.kind || "all");
  const [search, setSearch] = useState((q.q || "").toLowerCase());
  const [d, setD] = useState<Transactions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const key = JSON.stringify(s);
  useEffect(() => {
    let live = true;
    api.transactions(s).then((x) => { if (live) setD(x); })
      .catch((e) => { if (live) { setError(e instanceof Error ? e.message : String(e)); toastError(e); } });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = (next: Partial<typeof s>) => {
    const merged = { ...s, ...next };
    if (merged.from > merged.to) return toast("Invalid date range", "bad");
    location.hash = `#/accounts/transactions?${new URLSearchParams(merged)}`;
  };
  if (error) return <div className="ac10-empty error"><Ic k="reports" s={30} /><b>Could not load transactions</b><p>{error}</p></div>;
  if (!d) return <div className="ac10-loading">Loading Accounts…</div>;
  const all = d.rows;
  const found = search ? all.filter((r) => `${r.pnr} ${r.phone} ${r.passenger} ${r.source}`.toLowerCase().includes(search)) : all;
  const shown = found.filter((r) => kind === "all" || (kind === "credits" && r.type === "booking") || (kind === "debits" && r.type === "cancellation"));
  const total = (rows: TxRow[], k: "total" | "refund") => rows.reduce((v, r) => v + (Number(r[k]) || 0), 0);
  const btn = (label: string, cur: boolean, action: string, on: () => void, value?: string) =>
    <button key={label} type="button" className={`ac10-btn ${cur ? "selected" : ""}`} data-ac10={action} data-value={value} onClick={on}>{label}</button>;
  const sel = (name: string, value: string, options: [string, string][]) => (
    <label className="ac10-select ui-dd-hosted"><NiceSelect name={name} value={value} onChange={(v) => update({ [name]: v })} options={options} /><Ic k="chevron" s={16} /></label>
  );
  return (
    <>
      <div className="ac10-saleshead">
        <label className="ac10-date"><span><Ic k="calendar" s={21} /></span><NiceDate name="from" label="From date" value={s.from} onChange={(v) => update({ from: v })} /></label>
        <label className="ac10-date"><span><Ic k="calendar" s={21} /></span><NiceDate name="to" label="To date" value={s.to} onChange={(v) => update({ to: v })} /></label>
        <div className="ac10-segment">
          {btn("Travel Date", s.basis === "travel_date", "nop", () => update({ basis: "travel_date" }))}
          {btn("Booked On", s.basis === "booked", "nop", () => update({ basis: "booked" }))}
        </div>
        {sel("source", s.source, [["all", "All Agents"], ["redbus", "RedBus"], ["abhibus", "AbhiBus"], ["paytm", "Paytm"], ["website", "Website"], ["agent", "Agent"], ["branch", "Branch"]])}
        {sel("service", s.service, [["all", "All Services"], ...d.services.map((x) => [x.value, x.label] as [string, string])])}
        <div className="ac10-segment">
          {([["all", "All"], ["credits", "Credits"], ["debits", "Debits"]] as const).map(([k, v]) => btn(v, kind === k, "transaction-kind", () => setKind(k), k))}
        </div>
      </div>
      <div className="ac10-saleslower">
        <label className="ac10-search"><Ic k="search" /><input data-live-search="" placeholder="PNR, phone, passenger or agent" defaultValue={s.q} onChange={(e) => setSearch(e.target.value.toLowerCase())} /></label>
        <button type="button" className="ac10-btn success" data-ac10="export" onClick={() => api.exportTransactions(s).catch(toastError)}><Ic k="download" />{" Download"}</button>
      </div>
      <div className="ac10-txstats">
        <Stat label="Credits" value={inr(total(all.filter((r) => r.type === "booking"), "total"))} kind="green" />
        <Stat label="Debits" value={inr(total(all.filter((r) => r.type === "cancellation"), "refund"))} kind="red" />
        <Stat label="Net" value={inr(total(all, "total"))} kind="blue" />
      </div>
      <div className="ac10-transactionmini">
        <Stat label="SAVE TRIP / OPERATOR" value={inr(total(all.filter((r) => r.source === "website"), "total"))} />
        <Stat label="BRANCHES OWN" value={inr(total(all.filter((r) => r.source === "branch"), "total"))} />
        <Stat label="OTAs → PAY" value={inr(total(all.filter((r) => OTAS.includes(r.source)), "total"))} />
      </div>
      <div className="ac10-section">
        <div className="ac10-listcount" data-ac10-count="">{shown.length} rows</div>
        <div className="ac10-scroll"><table className="ac10-table ac10-payments">
          <thead><tr>{["Agent", "PNR", "Service", "Seats", "Type", "DOJ", "Booked At", "Amount", "Paid by · Money with", "Status"].map((x) => <th key={x}>{x}</th>)}</tr></thead>
          <tbody data-ac10-tbody="">{shown.length ? shown.map((r, i) => (
            <tr key={`${r.pnr}-${r.type}-${i}`} data-pnr={r.pnr} className="ac10-rowclick" onClick={() => setOpen(r.pnr)}>
              <td>{r.source || "—"}</td>
              <td><b className="ac10-mono">{r.ticket || r.pnr}</b><small>{r.pnr}</small></td>
              <td><b className="ac10-link">{r.service}</b></td>
              <td>{r.seats}</td>
              <td><span className={`ac10-type ${r.type === "booking" ? "ok" : "warn"}`}>{r.type === "booking" ? "BOOKING" : "PAX CANCEL"}</span></td>
              <td>{fdate(r.travelDate)}</td>
              <td>{fdt(r.date)}</td>
              <td className={`ac10-txamount ${r.total < 0 ? "red" : ""}`}>{inr(Math.abs(r.total))}</td>
              <td><b>{r.method || r.payment || "—"}</b><small>{`${r.source} · ${r.bookedBy || "Operator"}`}</small></td>
              <td><span className={`ac10-status ${/confirm|complete|paid/i.test(r.status) ? "ok" : "bad"}`}>{r.status || "—"}</span></td>
            </tr>
          )) : <tr><td colSpan={10} className="ac10-nodata">No transactions found</td></tr>}</tbody>
        </table></div>
      </div>
      {open && <BookingOverlay me={me} pnr={open} onClose={() => setOpen(null)} />}
    </>
  );
}

// ---------------- Receivables (legacy accounts-parity-v10.js receivables() + ledgerDialog()) ----------------
/** Legacy dates(s,{compact:true}): two calendar inputs, period presets (fill the inputs only) and Apply (commits to the URL). */
export function DateFilters({ from, to, onApply }: { from: string; to: string; onApply: (from: string, to: string) => void }) {
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const preset = (which: string) => {
    let a = addDays(today(), -6), b = today();
    if (which === "month") a = `${today().slice(0, 7)}-01`;
    if (which === "last") { const d = new Date(`${today()}T12:00:00`); d.setDate(0); b = isoDay(d); a = `${b.slice(0, 7)}-01`; }
    setF(a); setT(b);
  };
  return (
    <form className="ac10-filterform compact" data-filters="" onSubmit={(e) => { e.preventDefault(); onApply(f, t); }}>
      <label className="ac10-date"><span><Ic k="calendar" s={21} /></span><NiceDate name="from" label="From date" value={f} onChange={setF} /></label>
      <label className="ac10-date"><span><Ic k="calendar" s={21} /></span><NiceDate name="to" label="To date" value={t} onChange={setT} /></label>
      <div className="ac10-presets">
        {([["7", "Last 7 days"], ["month", "This month"], ["last", "Last month"]] as const).map(([k, l]) =>
          <button key={k} type="button" className="ac10-btn subtle" data-ac10="preset" data-preset={k} onClick={() => preset(k)}>{l}</button>)}
      </div>
      <button type="button" className="ac10-btn primary" data-ac10="filter-apply" onClick={() => onApply(f, t)}>Apply</button>
    </form>
  );
}

const REC_KINDS: [string, string][] = [["all", "All"], ["operator", "SaveTrip"], ["ota", "OTAs"], ["agent", "Agents"], ["branch", "Staff"]];
function ReceivablesTab() {
  const q = query();
  const s = { from: q.from || addDays(today(), -6), to: q.to || today() };
  const [kind, setKind] = useState("all");
  const [rows, setRows] = useState<ReceivableRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ledger, setLedger] = useState<{ channel: string; type: "credit" | "debit" } | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    api.receivables(s).then((d) => { if (live) setRows(d.rows); })
      .catch((e) => { if (live) { setError(e instanceof Error ? e.message : String(e)); toastError(e); } });
    return () => { live = false; };
  }, [s.from, s.to, reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const apply = (from: string, to: string) => {
    if (from > to) return toast("Invalid date range", "bad");
    location.hash = `#/accounts/receivables?${new URLSearchParams({ ...q, from, to })}`;
  };
  if (error) return <div className="ac10-empty error"><Ic k="reports" s={30} /><b>Could not load receivables</b><p>{error}</p></div>;
  if (!rows) return <div className="ac10-loading">Loading Accounts…</div>;
  const sum = (k: keyof ReceivableRow) => rows.reduce((v, r) => v + (Number(r[k]) || 0), 0);
  const shown = rows.filter((r) => kind === "all" || r.channelType === kind);
  const cols: Col[] = [{ key: "displayName", label: "CHANNEL" }, { key: "channelType", label: "RATE" }, { key: "bookings", label: "PNR", type: "int", total: true },
    { key: "total", label: "FARE", type: "money", total: true }, { key: "commission", label: "OFFERS / COMMISSION", type: "money", total: true },
    { key: "gstOnCommission", label: "TAX", type: "money", total: true }, { key: "tds", label: "TDS", type: "money", total: true },
    { key: "deductions", label: "TOTAL DEDUCTIONS", type: "money", total: true }, { key: "paid", label: "PAID", type: "money", total: true },
    { key: "receivable", label: "RECEIVABLES", type: "money", total: true }, { key: "actions", label: "ACTIONS" }];
  const open = (channel: string, type: "credit" | "debit") => setLedger({ channel, type });
  return (
    <>
      <div className="ac10-row-between">
        <DateFilters from={s.from} to={s.to} onApply={apply} />
        <div className="ac10-tools">
          <button type="button" className="ac10-btn primary" data-ac10="print" onClick={() => window.print()}><Ic k="print" />{" Print"}</button>
          <button type="button" className="ac10-btn success" data-ac10="export" onClick={() => api.exportReceivables(s).catch(toastError)}><Ic k="download" />{" Download"}</button>
        </div>
      </div>
      <div className="ac10-segment">
        {REC_KINDS.map(([k, v]) => <button key={k} type="button" className={`ac10-btn ${kind === k ? "selected" : ""}`} data-ac10="receivables-kind" data-value={k} onClick={() => setKind(k)}>{v}</button>)}
      </div>
      <div className="ac10-recstats">
        <Stat label="Collected" value={inr(sum("total"))} /><Stat label="Total Deductions" value={inr(sum("deductions"))} kind="orange" />
        <Stat label="Paid" value={inr(sum("paid"))} kind="blue" /><Stat label="Receivables" value={inr(sum("receivable"))} kind="green" />
      </div>
      <div data-ac10-restable="">
        <Table rows={shown} cols={cols} foot cls="ac10-rec-table" cell={(r, c) => c.key === "actions" ? (
          <div className="ac10-ledger-actions">
            <button type="button" className="ac10-btn green" data-ac10="ledger-open" data-channel={r.channelKey} data-ledtype="credit" onClick={() => open(r.channelKey, "credit")}>Credit</button>
            <button type="button" className="ac10-btn amber" data-ac10="ledger-open" data-channel={r.channelKey} data-ledtype="debit" onClick={() => open(r.channelKey, "debit")}>Debit</button>
            <button type="button" className="ac10-btn light" data-ac10="ledger-open" data-channel={r.channelKey} data-ledtype="credit" onClick={() => open(r.channelKey, "credit")}><Ic k="reports" s={13} />{" Ledger"}</button>
          </div>
        ) : c.key === "receivable" ? <strong className="ac10-green">{inr(r.receivable)}</strong> : fmt(r[c.key as keyof ReceivableRow], c.type)} />
      </div>
      {ledger && <LedgerDialog channel={ledger.channel} type={ledger.type} onClose={() => setLedger(null)} onSaved={() => { setLedger(null); setReload((n) => n + 1); }} />}
    </>
  );
}

export function LedgerDialog({ channel, type, onClose, onSaved }: { channel: string; type: "credit" | "debit"; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<Ledger | null>(null);
  const [t, setT] = useState(type);
  const [form, setForm] = useState({ amount: "", date: today(), note: "" });
  useEffect(() => { api.ledger(channel).then(setD).catch((e) => { toastError(e); onClose(); }); }, [channel]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!(amount > 0)) return toast("Enter a valid amount", "bad");
    if (!(await confirmDialog(`Record ${t === "credit" ? "payment received" : "debit owed"} of ${inr(amount)}?`, { ok: "Record" }))) return;
    try {
      await api.addLedger({ channelKey: channel, type: t, amount, date: form.date, note: form.note });
      toast("Ledger entry recorded", "ok");
      onSaved();
    } catch (err) { toastError(err); }
  };
  const head = (label: string, v: number, cls = "") => <div className={`ac10-headstat ${cls}`}><div>{label}</div><b>{inr(v)}</b></div>;
  const kindLabel = (x: Ledger["entries"][number]) => x.kind === "manual" ? "Manual entry" : x.kind === "ticket" ? `Booking ${x.ref}` : `Cancellation ${x.ref}`;
  return (
    <Modal size="lg" portal className="ac10-overlay ac10-small-modal" onClose={onClose}
      title={<><span className="ac10-modalicon"><Ic k="receivables" s={23} /></span><div className="ac10-modalheading"><b>{channel.replace(/^\w+:/, "")}</b><small>{`Settlement ledger · ${channel}`}</small></div></>}>
      <div className="ac10-ledstat">{head("ACCRUED", d.totalDebits)}{head("RECEIVED", d.totalCredits)}{head("BALANCE", d.balance, "ac10-strongblue")}</div>
      <div className="ac10-segment fill">
        <button type="button" className={`ac10-btn ${t === "credit" ? "selected" : ""}`} data-ac10="ledger-type" data-value="credit" onClick={() => setT("credit")}>Payment received</button>
        <button type="button" className={`ac10-btn ${t === "debit" ? "selected" : ""}`} data-ac10="ledger-type" data-value="debit" onClick={() => setT("debit")}>Debit (owed)</button>
      </div>
      <form data-ledger-form="" onSubmit={submit}>
        <div className="ac10-grid-2">
          <label className="ac10-field"><span>₹ Amount</span><input name="amount" type="number" value={form.amount} required min="0.01" step="0.01" onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
          <label className="ac10-field"><span>Date</span><input name="date" type="date" value={form.date} required onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
        </div>
        <label className="ac10-field"><span>Note (e.g. UTR / reference) — optional</span><input name="note" type="text" value={form.note} maxLength={250} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
        <button className="ac10-btn primary full" type="submit">{t === "credit" ? "Record payment" : "Record debit"}</button>
      </form>
      <h3>HISTORY</h3>
      <div className="ac10-led-history">
        {d.entries.length ? d.entries.slice().reverse().map((x, i) => (
          <div key={i} className="ac10-led-line">
            <div><b>{kindLabel(x)}</b><small>{`${fdate(x.date)} · ${x.note}`}</small></div>
            <strong className={x.debit > 0 ? "ac10-red" : "ac10-green"}>{x.debit > 0 ? `+ ${inr(x.debit)}` : `- ${inr(x.credit)}`}</strong>
          </div>
        )) : <Empty text="No manual entries yet" />}
      </div>
    </Modal>
  );
}
