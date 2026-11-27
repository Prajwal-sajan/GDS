import { useEffect, useMemo, useState } from "react";
import { api, type ScheduleDetail, type TripSheet, type TripSheetPassenger } from "../../api";
import { toast, toastError } from "../../components/ui/feedback";
import type { ImportedChart } from "./PickupChartImport";

// React port of legacy public/js/pickup-chart-v40.js openPrint()/printMarkup()/optionsPanel()/chartBody() (pc40-* classes)
// and server/pickup-chart-pdf-v40.js (vector landscape PDF). Rows come from the live trip sheet (or the committed
// imported reference chart); the PDF is generated in the browser so Print, Download and Share use one engine.

type Key = "seat" | "mobile" | "pnr" | "name" | "gender" | "age" | "contact_name" | "trips" | "from_city" | "to_city" | "pickup" | "drop" | "fare" | "source" | "booked_on";
const COLS: [Key, string, number][] = [
  ["seat", "Seat", .50], ["mobile", "Mobile", 1.05], ["pnr", "PNR", .80], ["name", "Name", 2.08], ["gender", "G", .29], ["age", "Age", .37],
  ["contact_name", "Contact Name", 1.32], ["trips", "Trips", .43], ["from_city", "From City", 1.12], ["to_city", "To City", 1.12],
  ["pickup", "Pickup", 1.79], ["drop", "Drop", 1.60], ["fare", "Fare", .72], ["source", "Source", .74], ["booked_on", "Booked On", 1.17],
];
const LABEL = Object.fromEntries(COLS.map(([k, l]) => [k, k === "gender" ? "Gender" : l])) as Record<Key, string>;
const ALL = COLS.map((c) => c[0]);
const PRESETS: Record<"pickup" | "rto", Key[]> = {
  pickup: ["seat", "mobile", "pnr", "name", "gender", "trips", "drop", "fare", "source", "booked_on"],
  rto: ["seat", "mobile", "pnr", "name", "gender", "pickup", "drop"],
};

export type ChartRow = {
  seat: string; mobile: string; pnr: string; name: string; gender: string; age: string; contact_name: string; trips: number | string;
  from_city: string; to_city: string; pickup: string; drop: string; fare: number | null; source: string; booked_on: string;
  boarding_id: string; dropping_id: string; pickup_time: string; pickup_day: number; drop_time: string; drop_day: number;
  exchange_point: string; exchange_time: string; boarding_order: number; dropping_order: number;
};
type Stage = { type: "pickup" | "drop"; name: string };
type Report = { service: string; date: string; origin: string; destination: string; operator: string; vehicle: string; driver: string; driver_phone: string; capacity: number; stages: Stage[]; rows: ChartRow[] };

const clock = (v?: string | null) => { const s = String(v || ""); if (!/^\d{1,2}:\d\d/.test(s)) return s; const [h, m] = s.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
const natural = (a: unknown, b: unknown) => String(a ?? "").localeCompare(String(b ?? ""), "en", { numeric: true, sensitivity: "base" });
const number = (n: number) => Number(n || 0).toLocaleString("en-IN");
const booked = (v?: string | null) => {
  if (!v) return ""; const d = new Date(v); if (!Number.isFinite(+d)) return v;
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: true }).format(d).replace(",", "").replace(/\s+/g, " ").toLowerCase();
};
const printed = (d = new Date()) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).format(d);

/** Live chart rows (legacy pickup-chart-v40.js current()): confirmed, non-cancelled passengers with both stages. */
function currentRows(sheet: TripSheet): ChartRow[] {
  const order = new Map(sheet.stops.map((s, i) => [String(s.id), i]));
  return sheet.passengers.filter((p) => !["cancelled", "released", "expired"].includes(p.status) && p.boarding && p.dropping).map((p: TripSheetPassenger) => ({
    seat: p.seat, mobile: p.phone || "", pnr: p.pnr, name: p.name, gender: p.gender || "", age: "", contact_name: "", trips: p.trips ?? "",
    from_city: p.from || "", to_city: p.to || "", pickup: p.boarding!.name, drop: p.dropping!.name, fare: p.fare ?? null, source: p.source || "", booked_on: booked(p.bookedAt),
    boarding_id: String(p.boarding!.id), dropping_id: String(p.dropping!.id), pickup_time: p.boarding!.time, pickup_day: p.boarding!.day || 1,
    drop_time: p.dropping!.time, drop_day: p.dropping!.day || 1, exchange_point: p.boarding!.exchangePoint || "", exchange_time: p.boarding!.exchangeTime || "",
    boarding_order: order.get(String(p.boarding!.id)) ?? 9999, dropping_order: order.get(String(p.dropping!.id)) ?? 9999,
  }));
}
function importedRows(chart: ImportedChart): ChartRow[] {
  return chart.rows.map((r) => ({
    seat: r.seat, mobile: r.mobile, pnr: r.pnr, name: r.name, gender: r.gender || "", age: "", contact_name: "", trips: "", from_city: r.from_city || "", to_city: r.to_city || "",
    pickup: r.pickup, drop: r.drop, fare: r.fare, source: r.source, booked_on: "", boarding_id: "", dropping_id: "", pickup_time: r.pickup_time || "", pickup_day: r.pickup_day || 1,
    drop_time: r.drop_time || "", drop_day: 1, exchange_point: "", exchange_time: "", boarding_order: 9999, dropping_order: 9999,
  }));
}
function cityOptions(rows: ChartRow[]) {
  const m = new Map<string, { id: string; kind: "boarding" | "dropping"; city: string; count: number }>();
  for (const r of rows) for (const [kind, city] of [["boarding", r.from_city], ["dropping", r.to_city]] as const) {
    if (!city) continue; const id = `${kind}:${city}`;
    if (!m.has(id)) m.set(id, { id, kind, city, count: 0 }); m.get(id)!.count++;
  }
  return [...m.values()].sort((a, b) => a.kind.localeCompare(b.kind) || natural(a.city, b.city));
}
function groups(rows: ChartRow[], kind: "pickup" | "drop") {
  const m = new Map<string, ChartRow[]>();
  for (const r of rows) { const k = (kind === "pickup" ? r.boarding_id : r.dropping_id) + "|" + (kind === "pickup" ? r.pickup : r.drop); if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); }
  return [...m.values()].sort((a, b) => kind === "pickup"
    ? a[0].boarding_order - b[0].boarding_order || natural(a[0].pickup_time, b[0].pickup_time)
    : a[0].dropping_order - b[0].dropping_order || natural(a[0].drop_time, b[0].drop_time));
}
const groupTitle = (p: ChartRow, n: number) => `${p.pickup} Day ${p.pickup_day || 1} - ${clock(p.pickup_time)} (${n} seat${n === 1 ? "" : "s"})` +
  (p.exchange_point ? ` | Bus Pickup: ${p.exchange_point}${p.exchange_time ? " " + clock(p.exchange_time) : ""}` : "");
function stopSummary(rows: ChartRow[], kind: "pickup" | "drop") {
  let prev = "";
  return groups(rows, kind).map((g) => {
    const p = g[0], city = (kind === "pickup" ? p.from_city : p.to_city) || "";
    const shown = city === prev ? "" : city; prev = city;
    const extra = kind === "pickup" && p.exchange_point ? ` (Bus Pickup: ${p.exchange_point}${p.exchange_time ? " " + clock(p.exchange_time) : ""})` : "";
    return { station: shown, point: `${kind === "pickup" ? p.pickup : p.drop} - ${clock(kind === "pickup" ? p.pickup_time : p.drop_time)}${extra}`, count: g.length, names: g.map((x) => x.seat).sort(natural).join(", ") };
  });
}
const cell = (r: ChartRow, k: Key) => { const v = r[k]; if (k === "fare") return v == null ? "—" : `Rs.${number(v as number)}`; return v === null || v === undefined || v === "" ? "—" : String(v); };

type Opts = { chart: "pickup" | "rto"; city: string; pickupDrop: "trip" | "passenger"; columns: Key[] };
function visible(report: Report, o: Opts) {
  let rows = o.city === "all" ? report.rows : report.rows.filter((r) => { const [k, c] = o.city.split(/:(.*)/); return (k === "boarding" ? r.from_city : r.to_city) === c; });
  rows = rows.map((r) => ({ ...r }));
  if (o.chart === "rto" && o.pickupDrop === "trip") {
    const b = report.stages.find((s) => s.type === "pickup"), d = report.stages.filter((s) => s.type === "drop").slice(-1)[0];
    rows.forEach((r) => { r.pickup = b?.name || report.origin; r.drop = d?.name || report.destination; });
  }
  return rows;
}

/* ---------- PDF engine (port of report-suite-pdf-v21 Paper/Pdf + pickup-chart-pdf-v40 generate) ---------- */
type RGB = [number, number, number];
const PAGE = { W: 841.89, H: 595.28 }, M = 14, R = 827.89, MAX_Y = PAGE.H - 13;
const BLUE: RGB = [.090, .354, .980], TXT: RGB = [.12, .16, .23], GRAY: RGB = [.40, .43, .50], GRID: RGB = [.82, .84, .88], WHITE: RGB = [1, 1, 1], STRIPE: RGB = [.977, .980, .988];
const san = (s: unknown) => String(s ?? "").replace(/₹/g, "Rs.").replace(/→/g, "->").replace(/[—–]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7e\xA0-\xFF]/g, "?").replace(/[\r\n\t]/g, " ");
const esc = (s: string) => san(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const tw = (s: string, z: number) => [...san(s)].reduce((n, c) => n + z * ("il!.,;:|() ".includes(c) ? .29 : "MW@%".includes(c) ? .86 : /[0-9]/.test(c) ? .55 : /[A-Z]/.test(c) ? .60 : .50), 0);
const rgb = (c: RGB) => c.map((n) => n.toFixed(3)).join(" ");
class Paper {
  ops: string[] = [];
  rect(x: number, y: number, w: number, h: number, c: RGB) { this.ops.push(`${rgb(c)} rg ${x.toFixed(2)} ${(PAGE.H - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`); }
  rule(x: number, y: number, x2: number, y2: number, c: RGB = GRID, w = .4) { this.ops.push(`${rgb(c)} RG ${w} w ${x.toFixed(2)} ${(PAGE.H - y).toFixed(2)} m ${x2.toFixed(2)} ${(PAGE.H - y2).toFixed(2)} l S`); }
  text(x: number, y: number, v: string, { size = 8, bold = false, color = TXT, align = "left" }: { size?: number; bold?: boolean; color?: RGB; align?: "left" | "center" | "right" } = {}) {
    const w = tw(v, size), at = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
    this.ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${rgb(color)} rg 1 0 0 1 ${at.toFixed(2)} ${(PAGE.H - y - size).toFixed(2)} Tm (${esc(v)}) Tj ET`);
  }
}
class Pdf {
  pages = [new Paper()]; y = 20;
  get page() { return this.pages[this.pages.length - 1]; }
  newPage() { this.pages.push(new Paper()); this.y = 19; }
  file(): Blob {
    const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"];
    const kids: string[] = [];
    for (const p of this.pages) {
      const s = p.ops.join("\n") + "\n"; objs.push(`<< /Length ${s.length} >>\nstream\n${s}endstream`);
      const cid = objs.length; objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.W} ${PAGE.H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${cid} 0 R >>`);
      kids.push(`${objs.length} 0 R`);
    }
    objs[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${this.pages.length} >>`;
    let str = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"; const off: number[] = [];
    objs.forEach((o, i) => { off.push(str.length); str += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const start = str.length;
    str += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
    str += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
    const bytes = new Uint8Array(str.length); for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xff; // latin1
    return new Blob([bytes], { type: "application/pdf" });
  }
}
const bodyFont = (n: number) => n >= 13 ? 6.4 : n >= 11 ? 6.8 : n >= 9 ? 7.15 : 7.6;
function wrap(s: string, max: number, font: number) {
  s = san(s).trim(); if (!s) return [""];
  const out: string[] = []; let line = "";
  for (let t of s.split(/\s+/)) {
    while (tw(t, font) > max) { if (line) { out.push(line); line = ""; } let n = 1; while (n < t.length && tw(t.slice(0, n + 1), font) <= max) n++; out.push(t.slice(0, n)); t = t.slice(n); }
    if (!t) continue; const test = line ? `${line} ${t}` : t;
    if (line && tw(test, font) > max) { out.push(line); line = t; } else line = test;
  }
  if (line) out.push(line); return out.length ? out : [""];
}
type Col = { key: string; label: string; weight: number };
function pdfCells(pdf: Pdf, cols: Col[], rows: Record<string, unknown>[], compact = false) {
  const w = PAGE.W - M * 2, unit = w / cols.reduce((s, c) => s + c.weight, 0), width = cols.map((c) => unit * c.weight);
  const fs = bodyFont(cols.length), lh = fs + 2, th = compact ? 18 : 19;
  const head = () => {
    if (pdf.y + th + 17 > MAX_Y) pdf.newPage();
    pdf.page.rect(M, pdf.y, w, th, BLUE); let x = M;
    cols.forEach((c, i) => { pdf.page.text(x + 2, pdf.y + 3, c.label, { size: fs + .1, bold: true, color: WHITE }); x += width[i]; });
    pdf.y += th;
  };
  head();
  rows.forEach((row, idx) => {
    const wr = cols.map((c, i) => wrap(String(row[c.key] ?? ""), width[i] - 5, fs));
    const h = Math.max(17, Math.min(50, Math.max(...wr.map((x) => x.length)) * lh + 4));
    if (pdf.y + h > MAX_Y) { pdf.newPage(); head(); }
    if (idx % 2 === 0) pdf.page.rect(M, pdf.y, w, h, STRIPE);
    let x = M;
    cols.forEach((c, i) => {
      wr[i].slice(0, Math.max(1, Math.floor((h - 4) / lh))).forEach((l, k) => pdf.page.text(x + 2, pdf.y + 2 + k * lh, l, { size: fs, color: GRAY, bold: c.key === "seat" }));
      pdf.page.rule(x, pdf.y, x, pdf.y + h, GRID, .24); x += width[i];
    });
    pdf.page.rule(M + w, pdf.y, M + w, pdf.y + h, GRID, .24); pdf.page.rule(M, pdf.y + h, M + w, pdf.y + h, GRID, .31);
    pdf.y += h;
  });
}
const pdfValue = (r: ChartRow, k: Key) => {
  const v = r[k];
  if (k === "fare") return v == null || v === "" ? "" : `Rs.${Math.round(Number(v) || 0)}`;
  if (k === "gender") { const g = String(v || "").toUpperCase(); return g.startsWith("F") ? "F" : g.startsWith("M") ? "M" : String(v || ""); }
  return String(v ?? "");
};
export function chartPdf(report: Report, o: Opts): Blob {
  const pdf = new Pdf(), p = pdf.page, rows = visible(report, o);
  p.text(PAGE.W / 2, 10, `Pickup Chart - ${report.service}`, { size: 14, bold: true, align: "center" });
  p.text(M, 31, report.operator, { size: 10, bold: true });
  const start = report.stages.find((s) => s.type === "pickup")?.name || report.origin, end = report.stages.filter((s) => s.type === "drop").slice(-1)[0]?.name || report.destination;
  const left: [string, string][] = [["Service:", report.service], ["Route:", `${report.origin} -> ${report.destination}`], ["Date:", report.date], ...(o.chart === "rto" ? [["Pickup:", start] as [string, string]] : [])];
  const right: [string, string][] = [...(o.chart === "rto" ? [["Drop:", end] as [string, string]] : []), ["Vehicle:", report.vehicle || "Not assigned"],
    ["Driver:", [report.driver, report.driver_phone].filter(Boolean).join(" - ") || "Not assigned"], ...(o.chart === "rto" ? [["Printed:", printed()] as [string, string]] : [])];
  left.forEach(([l, v], i) => { p.text(M, 47 + i * 13, l, { size: 8.4, bold: true }); p.text(M + 42, 47 + i * 13, v, { size: 8.4, color: GRAY }); });
  right.forEach(([l, v], i) => { p.text(600, 47 + i * 13, l, { size: 8.3, bold: true }); p.text(646, 47 + i * 13, v, { size: 8.3, color: GRAY }); });
  pdf.y = o.chart === "rto" ? 122 : 115; p.rule(M, pdf.y, R, pdf.y, BLUE, 1.5); pdf.y += 8;
  const cols: Col[] = [{ key: "#", label: "#", weight: .24 }, ...o.columns.map((k) => { const c = COLS.find((x) => x[0] === k)!; return { key: k, label: c[1], weight: c[2] }; })];
  const asRow = (r: ChartRow, n: number) => Object.fromEntries([["#", String(n)], ...o.columns.map((k) => [k, pdfValue(r, k)])]);
  if (o.chart === "rto") pdfCells(pdf, cols, [...rows].sort((a, b) => natural(a.seat, b.seat) || natural(a.pnr, b.pnr)).map((r, i) => asRow(r, i + 1)));
  else {
    let n = 0;
    for (const g of groups(rows, "pickup")) {
      if (pdf.y + 48 > MAX_Y) pdf.newPage();
      pdf.page.rule(M, pdf.y, R, pdf.y, BLUE, 1.15); pdf.page.text(M, pdf.y + 4, groupTitle(g[0], g.length), { size: 9.5, bold: true }); pdf.y += 20;
      pdfCells(pdf, cols, g.map((r) => asRow(r, ++n))); pdf.y += 4;
    }
    for (const kind of ["pickup", "drop"] as const) {
      if (pdf.y + 65 > MAX_Y) pdf.newPage();
      pdf.page.text(M, pdf.y, kind === "pickup" ? "Boarding Details" : "Dropping Details", { size: 10, bold: true }); pdf.y += 15;
      pdfCells(pdf, [{ key: "station", label: "Station", weight: .62 }, { key: "point", label: "Station Point", weight: 4.7 }, { key: "count", label: kind === "pickup" ? "Seats" : "Seat Count", weight: .55 }, { key: "names", label: "Seat Name", weight: 1.9 }],
        stopSummary(rows, kind), true);
      pdf.y += 7;
    }
  }
  return pdf.file();
}

/* ---------- Icons (legacy PATH subset) ---------- */
const PATH: Record<string, string> = {
  print: "M6 8V3h12v5M6 18H3V9h18v9h-3M6 15h12v7H6z", download: "M12 2v13m-5-5 5 5 5-5M4 18v4h16v-4",
  sliders: "M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-8 0v6", close: "m18 6-12 12M6 6l12 12",
};
const Ic = ({ n, s = 20 }: { n: string; s?: number }) => <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  {n === "share" ? <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m9 11 6-5m-6 8 6 4" /></> : <path d={PATH[n]} />}</svg>;
const Btn = ({ label, n, action, cls = "", onClick }: { label: string; n: string; action: string; cls?: string; onClick: () => void }) =>
  <button type="button" className={`pc40-button ${cls}`} data-pc40={action} onClick={onClick}><Ic n={n} s={18} /> {label}</button>;

function findOperator(o: unknown): string | undefined {
  if (!o || typeof o !== "object") return;
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if ((k === "operator_name" || k === "app_name") && typeof v === "string" && v.trim()) return v;
    const d = findOperator(v); if (d) return d;
  }
}

export function PrintPickupChart({ detail, sheet, imported, initialSource = "current", onClose }: { detail: ScheduleDetail; sheet?: TripSheet; imported: ImportedChart | null; initialSource?: "current" | "imported"; onClose: () => void }) {
  const [source, setSource] = useState<"current" | "imported">(imported ? initialSource : "current");
  const [showOptions, setShowOptions] = useState(false);
  const [chart, setChart] = useState<"pickup" | "rto">("pickup");
  const [city, setCity] = useState("all");
  const [pickupDrop, setPickupDrop] = useState<"trip" | "passenger">("trip");
  const [fields, setFields] = useState<Record<"pickup" | "rto", Key[]>>({ pickup: [...PRESETS.pickup], rto: [...PRESETS.rto] });
  const [operator, setOperator] = useState("Operator");
  const [capacity, setCapacity] = useState(0);

  useEffect(() => {
    api.admin<unknown>("/settings/config-v30").then((c) => { const n = findOperator(c); if (n) setOperator(n); }).catch(() => undefined);
    api.admin<{ state: string }[]>(`/trips/${detail.id}/seats`).then((s) => setCapacity(s.length)).catch(() => undefined);
  }, [detail.id]);
  useEffect(() => {
    const before = document.body.style.overflow; document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc, true);
    return () => { document.body.style.overflow = before; document.removeEventListener("keydown", esc, true); };
  }, [onClose]);

  const report: Report | undefined = useMemo(() => {
    if (!sheet && source === "current") return undefined;
    const driver = sheet?.crew.find((c) => /driver/i.test(c.role));
    const stages: Stage[] = (sheet?.stops ?? []).filter((s) => s.type === "pickup" || s.type === "drop").map((s) => ({ type: s.type as "pickup" | "drop", name: s.name }));
    return { service: detail.serviceNumber, date: detail.travelDate, origin: detail.origin, destination: detail.destination, operator, vehicle: sheet?.vehicle?.registration || "",
      driver: driver?.name || "", driver_phone: driver?.phone || "", capacity, stages, rows: source === "imported" && imported ? importedRows(imported) : sheet ? currentRows(sheet) : [] };
  }, [sheet, source, imported, detail, operator, capacity]);
  const opts: Opts = { chart, city, pickupDrop, columns: fields[chart] };
  const rows = report ? visible(report, opts) : [];
  const fname = `pickup-chart-${detail.serviceNumber}-${detail.travelDate}${chart === "rto" ? "-RTO" : ""}${source === "imported" ? "-imported" : ""}.pdf`.replace(/[^a-zA-Z0-9_.-]/g, "_");

  const make = () => { if (!report) throw new Error("Chart is still loading"); if (!opts.columns.length) throw new Error("Select at least one chart column"); return chartPdf(report, opts); };
  const download = (blob: Blob) => { const href = URL.createObjectURL(blob), a = document.createElement("a"); a.href = href; a.download = fname; a.style.display = "none"; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(href), 60000); };
  const doPdf = async (action: "print" | "download" | "share") => {
    try {
      const blob = make();
      if (action === "download") return download(blob);
      if (action === "print") {
        const href = URL.createObjectURL(blob), frame = document.createElement("iframe");
        frame.title = "Pickup Chart PDF for printing"; frame.className = "pc40-print-frame"; frame.src = href;
        frame.onload = () => { try { frame.contentWindow?.focus(); frame.contentWindow?.print(); } catch { window.open(href, "_blank", "noopener"); } };
        document.body.append(frame); setTimeout(() => { frame.remove(); URL.revokeObjectURL(href); }, 120000); return;
      }
      const file = new File([blob], fname, { type: "application/pdf" });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        try { await navigator.share({ title: `Pickup Chart — ${detail.serviceNumber}`, text: "Pickup chart PDF", files: [file] }); }
        catch (e) { if ((e as Error).name !== "AbortError") toast(`Could not open the system share sheet: ${(e as Error).message}`, "warn"); }
      } else { download(blob); toast("Your browser does not support file sharing. PDF downloaded — share it using your operating system.", "warn"); }
    } catch (e) { toastError(e); }
  };
  const toggleField = (k: Key, on: boolean) => {
    const arr = fields[chart];
    if (!on && arr.length === 1) return toast("Keep at least one chart column selected", "warn");
    const next = on ? [...arr, k] : arr.filter((x) => x !== k);
    setFields({ ...fields, [chart]: ALL.filter((x) => next.includes(x)) });
  };
  const cities = report ? cityOptions(report.rows) : [];
  const bookedN = report?.rows.length ?? 0, cap = capacity || bookedN;
  const table = (list: ChartRow[], start = 0) => <div className="pc40-table-scroll"><table className="pc40-chart-table"><thead><tr><th>#</th>{opts.columns.map((k) => <th key={k}>{k === "gender" ? "G" : LABEL[k]}</th>)}</tr></thead>
    <tbody>{list.map((r, i) => <tr key={r.pnr + r.seat + i}><td>{start + i + 1}</td>{opts.columns.map((k) => <td key={k} className={k === "seat" ? "bold" : ""}>{cell(r, k)}</td>)}</tr>)}</tbody></table></div>;
  let offset = 0;

  return (
    <div className="pc40-overlay pc40-print" role="presentation">
      <div className="pc40-print-dialog" role="dialog" aria-modal="true" aria-label={`Pickup Chart — ${detail.serviceNumber}`}>
        <header className="pc40-print-head"><span className="pc40-green-icon"><Ic n="print" s={27} /></span>
          <div className="pc40-print-title"><h2>Pickup Chart — {detail.serviceNumber || "Service"}</h2><p>{operator}</p></div>
          <div className="pc40-print-actions">
            <Btn label="Options" n="sliders" action="options" cls={showOptions ? "open" : ""} onClick={() => setShowOptions((s) => !s)} />
            <Btn label="Print" n="print" action="print-pdf" cls="print-button" onClick={() => void doPdf("print")} />
            <Btn label="Download" n="download" action="download-pdf" onClick={() => void doPdf("download")} />
            <Btn label="Share" n="share" action="share-pdf" onClick={() => void doPdf("share")} />
            <button type="button" data-pc40-close="" className="pc40-close" aria-label="Close Pickup Chart" autoFocus onClick={onClose}><Ic n="close" /></button></div></header>
        {showOptions && report && <section className="pc40-chart-settings" aria-label="Chart options">
          <div className="pc40-settings-row"><span>Chart:</span><div className="pc40-segment">{([["pickup", "Pickup chart"], ["rto", "RTO chart"]] as const).map(([k, l]) =>
            <button key={k} type="button" data-pc40="chart" data-chart={k} className={chart === k ? "active" : ""} aria-pressed={chart === k} onClick={() => { setChart(k); setCity("all"); }}>{l}</button>)}</div></div>
          <div className="pc40-settings-row"><label htmlFor="pc40-city">City:</label><select id="pc40-city" data-pc40-city="" value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="all">All passengers</option>
            {(["boarding", "dropping"] as const).map((kind) => <optgroup key={kind} label={kind === "boarding" ? "Boarding at" : "Dropping at"}>
              {cities.filter((c) => c.kind === kind).map((c) => <option key={c.id} value={c.id}>{c.city} ({c.count})</option>)}</optgroup>)}</select></div>
          <div className="pc40-field-list">{ALL.map((k) => <label key={k}><input type="checkbox" data-pc40-field={k} checked={fields[chart].includes(k)} onChange={(e) => toggleField(k, e.target.checked)} /> {LABEL[k]}</label>)}</div>
          {chart === "rto" && <div className="pc40-rto-radio"><b>Pickup / Drop:</b>
            <label><input type="radio" name="pc40-place" value="trip" checked={pickupDrop === "trip"} onChange={() => setPickupDrop("trip")} /> Trip start / end</label>
            <label><input type="radio" name="pc40-place" value="passenger" checked={pickupDrop === "passenger"} onChange={() => setPickupDrop("passenger")} /> Passenger's own stop</label></div>}
          {imported && <div className="pc40-settings-row"><label htmlFor="pc40-source">Chart data:</label>
            <select id="pc40-source" data-pc40-source="" value={source} onChange={(e) => { setSource(e.target.value as "current" | "imported"); setCity("all"); }}>
              <option value="current">Current GDS bookings</option><option value="imported">Imported · {imported.source_gds}</option></select></div>}
        </section>}
        <main className="pc40-print-scroll">{!report ? <div className="pc40-loading">Loading real passenger chart…</div> :
          <div className="pc40-chart-paper">
            <div className="pc40-print-meta"><div><p><b>Service:</b> {report.service}</p><p><b>Date:</b> {report.date}</p>
              {chart === "rto" && <p><b>Drop:</b> {report.destination}</p>}<p><b>Driver:</b> {report.driver || "Not assigned"} {report.driver_phone}</p></div>
              <div><p><b>Route:</b> {report.origin} → {report.destination}</p>
                {chart === "rto" && <p><b>Pickup:</b> {report.stages.find((s) => s.type === "pickup")?.name || report.origin}</p>}
                <p><b>Vehicle:</b> {report.vehicle || "Not assigned"}</p>{chart === "rto" && <p><b>Printed:</b> {new Date().toLocaleString("en-IN")}</p>}</div></div>
            <div className="pc40-print-stats"><b>Total:</b> {number(cap)} &nbsp; <b>Booked:</b> {bookedN} &nbsp; <b>Available:</b> {capacity ? Math.max(0, capacity - bookedN) : 0}
              {city !== "all" && <> &nbsp; <b>Showing:</b> {rows.length} passengers</>}</div>
            {chart === "rto" ? table([...rows].sort((a, b) => natural(a.seat, b.seat))) : <>
              {groups(rows, "pickup").map((g) => { const s = offset; offset += g.length; return <section key={g[0].boarding_id + g[0].pickup} className="pc40-pickup-block"><h3>{groupTitle(g[0], g.length)}</h3>{table(g, s)}</section>; })}
              {(["pickup", "drop"] as const).map((kind) => <section key={kind} className="pc40-summary"><h3>{kind === "pickup" ? "Boarding Details" : "Dropping Details"}</h3>
                <table><thead><tr><th>Station</th><th>Station Point</th><th>{kind === "pickup" ? "Seats" : "Seat Count"}</th><th>Seat Name</th></tr></thead>
                  <tbody>{stopSummary(rows, kind).map((r, i) => <tr key={i}><td>{r.station}</td><td>{r.point}</td><td>{r.count}</td><td>{r.names}</td></tr>)}</tbody></table></section>)}
            </>}
          </div>}
        </main>
      </div>
    </div>
  );
}
