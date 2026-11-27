import { useRef, useState } from "react";
import { api, authHeaders, type ScheduleDetail } from "../../api";
import { Modal, toast, toastError } from "../../components/ui/feedback";

// React port of legacy public/js/pickup-chart-v40.js openImport()/importMarkup()/previewMarkup() (pc40-* classes).
// POST /api/admin/schedules/{id}/pickup-chart/preview (raw PDF/CSV body) → review → POST …/commit {previewId, confirm:true}.
// The imported tripsheet is a reference manifest only: it never creates bookings, assigns seats or changes fares.
const CHOICES = ["Bitla TicketSimply", "EzeeInfo", "Infinity ITS", "Detect automatically"];
const MAX = 15 * 1024 * 1024;
const LAYOUT: Record<string, string> = { grouped_pickup: "Pickup chart (grouped)", rto_seat_order: "RTO chart (seat-sorted)", other_text_pdf: "Other PDF", csv: "CSV" };
type PreviewRow = { seat: string; mobile: string; pnr: string; name: string; pickup: string; drop: string; source: string };
type Preview = { preview_id: number; file_name: string; detected_gds: string; source_gds: string; input_layout: string; passenger_count: number; warnings: string[]; blocking_issues: string[]; rows: PreviewRow[] };
type Saved = { passenger_count: number; source_gds: string };
export type ImportedRow = PreviewRow & { gender: string; fare: number | null; pickup_time: string; pickup_day: number; drop_time: string; from_city: string; to_city: string };
export type ImportedChart = { id: number; source_gds: string; file_name: string; at: string; by: string; warnings: string[]; rows: ImportedRow[] };

const t12 = (s?: string | null) => s && /^\d\d:\d\d/.test(s) ? `${Number(s.slice(0, 2)) % 12 || 12}:${s.slice(3, 5)} ${Number(s.slice(0, 2)) >= 12 ? "PM" : "AM"}` : "";
const readable = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

export function ImportPickupChart({ detail, onClose, onImported }: { detail: ScheduleDetail; onClose: () => void; onImported: () => void }) {
  const [source, setSource] = useState("");
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview>();
  const [saved, setSaved] = useState<Saved>();
  const file = useRef<HTMLInputElement>(null);

  const upload = async (f?: File) => {
    if (!f) return;
    if (!source) return setError("Choose the source GDS before uploading.");
    if (!/\.(pdf|csv)$/i.test(f.name) || f.size > MAX || f.size <= 0) return setError("Choose a non-empty PDF/CSV file up to 15 MB.");
    setError(""); setPreview(undefined); setSaved(undefined); setBusy(true);
    try {
      const r = await fetch(`/api/admin/schedules/${detail.id}/pickup-chart/preview`, {
        method: "POST", body: f,
        headers: { ...authHeaders(), "Content-Type": /\.pdf$/i.test(f.name) ? "application/pdf" : "text/csv", "X-Pickup-Chart-Filename": encodeURIComponent(f.name), "X-Pickup-Chart-GDS": source },
      });
      const o = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(o.message || "Unable to preview the file");
      setPreview(o);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); if (file.current) file.current.value = ""; }
  };
  const confirm = async () => {
    if (!preview || preview.blocking_issues.length) return;
    setBusy(true);
    try {
      const r = await api.admin<Saved>(`/schedules/${detail.id}/pickup-chart/commit`, "POST", { previewId: preview.preview_id, confirm: true });
      setSaved(r); setPreview(undefined); setError(""); onImported();
    } catch (e) { setError((e as Error).message); toastError(e); } finally { setBusy(false); }
  };

  return (
    <div className="pc40-overlay pc40-import" role="presentation" onKeyDown={(e) => { if (e.key === "Escape") { if (open) setOpen(false); else onClose(); } }}>
      <div className="pc40-import-dialog" role="dialog" aria-modal="true" aria-label="Import pickup chart">
        <div className="pc40-import-banner"><div className="pc40-import-title">
          <div className="pc40-file-icon">📄</div><h2>Import pickup chart</h2><span className="pc40-auto">✦ AUTO</span><span className="pc40-title-divider"></span>
          <span className="pc40-header-pill">{detail.serviceNumber || "Service"}</span>
          <span className="pc40-header-pill">{detail.origin} → {detail.destination}</span>
          <span className="pc40-header-pill">{readable(detail.travelDate)}</span>
          <span className="pc40-header-pill red">{t12(detail.departureTime)}</span>
          <button className="pc40-import-x" type="button" data-pc40-close="" aria-label="Close import popup" onClick={onClose}>✕</button></div></div>
        <div className="pc40-import-scroll">
          <section className="pc40-import-select"><h3>✦ Which GDS is this tripsheet from?</h3>
            <button type="button" className={`pc40-source-selector ${open ? "expanded" : ""}`} data-pc40="toggle-gds" aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen((o) => !o)}>
              <span className="pc40-source-icon">🗄</span><span className={source ? "selected" : "placeholder"}>{source || "Select your GDS"}</span><span className="pc40-spacer"></span>{open ? "▴" : "▾"}</button>
            {open && <div className="pc40-source-list" role="listbox" aria-label="Which GDS?">{CHOICES.map((g) =>
              <button key={g} type="button" role="option" aria-selected={source === g} data-pc40="select-gds" data-gds={g} onClick={() => { setSource(g); setOpen(false); setPreview(undefined); setSaved(undefined); }}>🗄 {g}</button>)}</div>}
            <p className="pc40-import-help">ⓘ We use this to pick the right parser for your PDF. Make sure it matches the system that printed the tripsheet.</p></section>
          <section className={`pc40-upload-zone${drag ? " dragging" : ""}${source ? " enabled" : ""}`} data-pc40-dropzone="" tabIndex={source ? 0 : -1} aria-label="Drag a tripsheet PDF or browse"
            onDragOver={(e) => { e.preventDefault(); if (source) setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); void upload(e.dataTransfer.files?.[0]); }}>
            <span className="pc40-upload-symbol">☁</span>
            <div className="pc40-upload-copy"><strong>Drag a tripsheet PDF or browse</strong>
              <p>{source ? "Choose a file to preview; your current GDS bookings will not be overwritten." : "Pick your booking system above first."}</p>
              <span className="pc40-upload-type">PDF / CSV · up to 15 MB</span></div>
            <button type="button" className="pc40-button pc40-browse" data-pc40="browse" disabled={!source || busy} onClick={() => file.current?.click()}>⇪ Browse</button>
          </section>
          <input ref={file} type="file" accept=".pdf,.csv,application/pdf,text/csv" data-pc40-file="" hidden onChange={(e) => void upload(e.target.files?.[0])} />
          {busy && <div className="pc40-progress">☁ Validating and extracting passenger rows…</div>}
          {error && <div className="pc40-import-error" role="alert">⚠ {error}</div>}
          {preview && <section className="pc40-import-preview"><header><h3>Review extracted chart</h3><span>{preview.passenger_count.toLocaleString("en-IN")} passenger row(s)</span></header>
            <div className="pc40-detect">Selected: <strong>{preview.source_gds}</strong> · Detected: <strong>{preview.detected_gds || "Unknown"}</strong> · {preview.file_name} · Format: <strong>{LAYOUT[preview.input_layout] ?? "Unverified"}</strong></div>
            {preview.blocking_issues.map((x) => <p key={x} className="pc40-error-line">⚠ {x}</p>)}
            {preview.warnings.slice(0, 6).map((x) => <p key={x} className="pc40-warning-line">ⓘ {x}</p>)}
            <div className="pc40-import-tablewrap"><table><thead><tr>{["Seat", "Mobile", "PNR", "Name", "Pickup", "Drop", "Source"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>{preview.rows.map((r, i) => <tr key={i}>{(["seat", "mobile", "pnr", "name", "pickup", "drop", "source"] as const).map((k) => <td key={k}>{r[k] || "—"}</td>)}</tr>)}</tbody></table></div>
            <div className="pc40-import-actions"><p>External reference only: import does not create bookings, assign inventory or change fares.</p>
              <button type="button" className="pc40-button primary" data-pc40="confirm-import" disabled={busy || preview.blocking_issues.length > 0} onClick={() => void confirm()}>✓ Confirm import</button></div></section>}
          {saved && <div className="pc40-import-success" role="status">✓ Imported reference chart saved: {saved.passenger_count.toLocaleString("en-IN")} passengers. Live GDS bookings and seat inventory remain unchanged.</div>}
        </div>
      </div>
    </div>
  );
}

/** Imported chart view (legacy openPrint(…,'imported') chart body, pickup-grouped). */
export function ImportedChartModal({ chart, detail, onClose }: { chart: ImportedChart; detail: ScheduleDetail; onClose: () => void }) {
  const groups = new Map<string, ImportedRow[]>();
  for (const r of chart.rows) { const k = r.pickup || "Pickup not assigned"; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(r); }
  let n = 0;
  return (
    <Modal title={`Pickup Chart — ${detail.serviceNumber} (Imported · ${chart.source_gds})`} size="lg" onClose={onClose}
      foot={<button type="button" className="btn" onClick={() => { window.print(); toast("Use the browser print dialog to print the imported chart"); }}>Print</button>}>
      <div className="pc40-chart-paper">
        <div className="pc40-print-meta"><div><p><b>Service:</b> {detail.serviceNumber}</p><p><b>Date:</b> {detail.travelDate}</p></div>
          <div><p><b>Route:</b> {detail.origin} → {detail.destination}</p><p><b>File:</b> {chart.file_name} · imported {new Date(chart.at).toLocaleString("en-IN")} by {chart.by}</p></div></div>
        <div className="pc40-print-stats"><b>Imported passengers:</b> {chart.rows.length} · reference only (live bookings unchanged)</div>
        {[...groups].map(([k, rows]) => <section key={k} className="pc40-pickup-block"><h3>{k}{rows[0].pickup_time ? ` Day ${rows[0].pickup_day || 1} - ${t12(rows[0].pickup_time)}` : ""} ({rows.length} seat{rows.length === 1 ? "" : "s"})</h3>
          <div className="pc40-table-scroll"><table className="pc40-chart-table"><thead><tr>{["#", "Seat", "Mobile", "PNR", "Name", "G", "Drop", "Fare", "Source"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((r) => <tr key={r.pnr + r.seat}><td>{++n}</td><td className="bold">{r.seat}</td><td>{r.mobile || "—"}</td><td>{r.pnr}</td><td>{r.name}</td><td>{r.gender || "—"}</td><td>{r.drop || "—"}</td><td>{r.fare != null ? `Rs.${r.fare.toLocaleString("en-IN")}` : "—"}</td><td>{r.source || "—"}</td></tr>)}</tbody></table></div></section>)}
      </div>
    </Modal>
  );
}
