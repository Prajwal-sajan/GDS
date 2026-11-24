/**
 * Seat geometry and clipboard poster. A native, typed React-era implementation
 * of the verified legacy 2+1 / 2+2 geometry; no DOM screenshot or legacy JS.
 * Never copy passenger names/PNRs/phones or invent a public booking domain.
 */
export type SeatState = "available" | "booked" | "held" | "blocked" | "unavailable";
export interface SeatCell {
  seatCode: string;
  deck: string;
  row: number;
  col: number;
  width: number;
  length: number;
  seatType: string;
  state: SeatState;
  gender: string | null;
  ladiesOnly: boolean;
  malesOnly: boolean;
  fare: number | null;
}
export interface RouteStop {
  sequence: number;
  cityId: number;
  name: string;
  day: number;
  time: string;
}
export interface RouteStage {
  id: number;
  kind: string;
  name: string;
  stopSequence: number;
  day: number;
  time: string;
}
export interface ScheduleSeatLayout {
  tripId: number;
  travelDate: string;
  status: string;
  bookable: boolean;
  serviceNumber: string;
  routeName: string;
  coachName: string;
  fromSequence: number;
  toSequence: number;
  stops: RouteStop[];
  stages: RouteStage[];
  seats: SeatCell[];
}
export type GenderVisual = "available" | "male" | "female" | "unavailable";
export const esc = (x: unknown): string => String(x ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c] as string));

/** Match legacy Coach21V46.isLegacy + projectedSeat, preserving immutable seat codes. */
export function physicalGeometry(seats: SeatCell[]): SeatCell[] {
  const one = seats.find((s) => s.deck === "LOWER" && s.seatCode === "1L");
  const chair = seats.find((s) => s.deck === "LOWER" && s.seatCode === "1");
  const first = seats.find((s) => s.deck === "UPPER" && s.seatCode === "1U");
  const third = seats.find((s) => s.deck === "UPPER" && s.seatCode === "3U");
  const isLegacy = Boolean(one && chair && first && third &&
    one.col === 3 && chair.col === 0 && first.col === 0 && third.col === 3);
  return seats.map((s) => {
    if (!isLegacy) return { ...s };
    if (s.deck === "LOWER") {
      if (s.seatType === "sleeper" && /^\d+L$/.test(s.seatCode)) return { ...s, col: 0 };
      if (s.seatType === "seater" && (s.col === 0 || s.col === 1)) return { ...s, col: s.col + 2 };
    }
    if (s.deck === "UPPER" && /^\d+U$/.test(s.seatCode))
      return { ...s, col: s.col === 3 ? 0 : s.col === 1 ? 2 : s.col === 0 ? 3 : s.col };
    return { ...s };
  });
}
export function visualStatus(s: SeatCell): GenderVisual {
  if (s.state === "available") return "available";
  if (s.state !== "booked") return "unavailable";
  const g = (s.gender ?? "").trim().toUpperCase();
  return g === "M" || g === "MALE" ? "male" : g === "F" || g === "FEMALE" ? "female" : "unavailable";
}
export function validateLayout(layout: ScheduleSeatLayout): void {
  if (!layout || !Array.isArray(layout.seats) || !layout.seats.length ||
    !Array.isArray(layout.stops) || layout.stops.length < 2) throw Error("No valid seat layout available");
  const ids = new Set<string>();
  for (const s of layout.seats) {
    if (!s.seatCode || ids.has(s.seatCode) || !Number.isInteger(s.row) || !Number.isInteger(s.col) ||
      !Number.isInteger(s.width) || !Number.isInteger(s.length) ||
      s.row < 0 || s.col < 0 || s.width < 1 || s.width > 3 || s.length < 1 || s.length > 3 ||
      s.row + s.length > 30 || s.col + s.width > 8) throw Error("Invalid seat geometry: " + s.seatCode);
    ids.add(s.seatCode);
  }
}
export function groupDecks(layout: ScheduleSeatLayout): { name: string; seats: SeatCell[]; rows: number; cols: number }[] {
  validateLayout(layout);
  const seats = physicalGeometry(layout.seats);
  const deckNames = Array.from(new Set(seats.map((s) => s.deck))).sort((a, b) =>
    (a === "LOWER" ? -1 : a === "UPPER" ? 1 : 0) - (b === "LOWER" ? -1 : b === "UPPER" ? 1 : 0));
  return deckNames.map((name) => {
    const current = seats.filter((s) => s.deck === name);
    return { name, seats: current,
      rows: Math.max(...current.map((s) => s.row + s.length)),
      cols: Math.max(...current.map((s) => s.col + s.width)) };
  });
}
export function formatDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return String(date || "");
  const d = new Date(date + "T12:00:00Z");
  if (Number.isNaN(+d) || d.toISOString().slice(0, 10) !== date) return date;
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return weekdays[d.getUTCDay()] + ", " + String(d.getUTCDate()).padStart(2, "0") +
    " " + months[d.getUTCMonth()] + ", " + d.getUTCFullYear();
}
export function titleFor(layout: ScheduleSeatLayout): string {
  const from = layout.stops.find((s) => s.sequence === layout.fromSequence);
  const to = layout.stops.find((s) => s.sequence === layout.toSequence);
  return (from?.name ?? "Origin") + " → " + (to?.name ?? "Destination");
}
type Rect = (x: number, y: number, w: number, h: number, rx: number, fill: string, extra?: string) => string;
const rect: Rect = (x, y, w, h, rx, fill, extra = "") =>
  '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
  '" rx="' + rx + '" fill="' + fill + '" ' + extra + '/>';
const label = (x: number, y: number, value: unknown, fontSize: number, color: string, weight = 700, more = "") =>
  '<text x="' + x + '" y="' + y + '" font-size="' + fontSize + '" fill="' + color +
  '" font-weight="' + weight + '" font-family="Arial,Helvetica,sans-serif" ' + more + '>' + esc(value) + "</text>";
const palette: Record<GenderVisual, string> = {
  available: "#ffffff", male: "#4787ea", female: "#e949a0", unavailable: "#253045"
};
/** Browser-independent reference poster; 900px vector, rasterized at 2x. */
export function seatPosterSvg(layout: ScheduleSeatLayout): string {
  const decks = groupDecks(layout), w = 900;
  const deckWidth = decks.length > 1 ? 380 : 430;
  const gap = 24, tileRow = 67, tileGap = 7;
  const rows = Math.max(...decks.map((d) => d.rows));
  const panelH = 157 + rows * (tileRow + tileGap) + 24;
  const top = 148, h = top + panelH + 136;
  const header = titleFor(layout);
  const color = (s: SeatCell): string => ({ available: "white", male: "blue", female: "pink", unavailable: "dark" }[visualStatus(s)]);
  const defs = '<defs>' +
    '<linearGradient id="background" x2="0" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="#f5f7fb"/></linearGradient>' +
    '<linearGradient id="deck" x2="0" y2="1"><stop stop-color="#fafbff"/><stop offset="1" stop-color="#edf2fb"/></linearGradient>' +
    '<linearGradient id="blue" x2="0" y2="1"><stop stop-color="#75b8ff"/><stop offset="1" stop-color="#4384ee"/></linearGradient>' +
    '<linearGradient id="pink" x2="0" y2="1"><stop stop-color="#f787c5"/><stop offset="1" stop-color="#e64a9b"/></linearGradient>' +
    '<linearGradient id="white" x2="0" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="#edf0f7"/></linearGradient>' +
    '<linearGradient id="dark" x2="0" y2="1"><stop stop-color="#556176"/><stop offset="1" stop-color="#233147"/></linearGradient>' +
    '<radialGradient id="wheel"><stop stop-color="#529fff"/><stop offset="1" stop-color="#082567"/></radialGradient>' +
    '<filter id="shadow"><feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#3668b1" flood-opacity=".28"/></filter></defs>';
  let body = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h +
    '" width="' + w + '" height="' + h + '" role="img">' + defs +
    rect(0, 0, w, h, 0, "url(#background)") +
    label(32, 48, header, header.length > 31 ? 27 : 33, "#142038", 800) +
    label(32, 92, formatDate(layout.travelDate) + " · " + layout.serviceNumber, 23, "#5a6778", 700) +
    rect(32, 120, 836, panelH + 50, 19, "#fcfdff", 'stroke="#d0d5dc" stroke-width="3"');
  const startX = (w - (deckWidth * decks.length + gap * (decks.length - 1))) / 2;
  for (let di = 0; di < decks.length; di++) {
    const d = decks[di], x = startX + di * (deckWidth + gap);
    const cellW = (deckWidth - 44 - 7 * (d.cols - 1)) / d.cols;
    body += '<g data-deck="' + esc(d.name) + '">' +
      rect(x, top, deckWidth, panelH, 42, "url(#deck)", 'stroke="#98a7bc" stroke-width="3.2"') +
      label(x + 30, top + 80, d.name, 21, "#526175", 800) +
      '<path d="M' + (x + 22) + ' ' + (top + 137) + 'H' + (x + deckWidth - 22) +
      '" stroke="#c3cbd6" stroke-dasharray="6 5" stroke-width="2"/>';
    if (d.name === "LOWER" || di === 0 && decks.length === 1) {
      const cx = x + deckWidth - 75, cy = top + 68;
      body += '<circle cx="' + cx + '" cy="' + cy + '" r="31" fill="url(#wheel)" stroke="#c2d2ed" stroke-width="4"/>' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="25" fill="none" stroke="#fff" stroke-width="2.5"/>' +
        '<path d="M' + cx + ' ' + (cy-20) + 'v20 l-17 11 M' + cx + ' ' + cy + 'l17 11" stroke="#fff" stroke-width="4" fill="none"/>' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="6" fill="#5da8fa"/>';
    }
    const gridY = top + 166, gridX = x + 22;
    for (const s of d.seats) {
      const sx = gridX + s.col * (cellW + 7), sy = gridY + s.row * (tileRow + tileGap);
      const sw = cellW * s.width + (s.width - 1) * 7;
      const sh = tileRow * s.length + (s.length - 1) * tileGap - 8;
      const v = visualStatus(s);
      body += '<g data-seat="' + esc(s.seatCode) + '" data-status="' + v + '">' +
        rect(sx, sy, sw, sh, 8, "url(#" + color(s) + ")",
          'stroke="' + (v === "available" ? "#aebed1" : "#4788ed") +
          '" stroke-width="2" filter="url(#shadow)"') +
        rect(sx + 5, sy + 5, sw - 10, sh - 10, 5, "none",
          'stroke="' + (v === "available" ? "#c0c8d7" : "#ffffff88") + '"') +
        rect(sx + 9, sy + sh - 19, sw - 18, 11, 5, "#ffffff55", 'stroke="#ffffff9f"') +
        label(sx + sw/2, sy + sh/2 + 8, s.seatCode, Math.max(13, Math.min(24, sw*0.35)),
          v === "available" ? "#152c4b" : "#ffffff", 800, 'text-anchor="middle"') + "</g>";
    }
    if (d.name === "LOWER") {
      body += '<g stroke="#e82035" fill="none" stroke-width="3.5" stroke-linecap="round">' +
        '<circle cx="' + (x + 145) + '" cy="' + (top+panelH-54) + '" r="3" fill="#e82035"/>' +
        '<path d="M' + (x+145) + ' ' + (top+panelH-48) + 'l-8 12 12 5 7 13 m-19-11-8 10 m15-20 12-5"/>' +
        rect(x + 172, top + panelH - 56, 16, 38, 1, "none", 'stroke="#e82035"') + "</g>" +
        rect(x + 120, top + panelH - 11, 65, 11, 4, "#e82035");
    }
    body += "</g>";
  }
  const ly = top + panelH + 77;
  const legends: [string, GenderVisual, number][] = [
    ["Available", "available", 32], ["Male", "male", 196],
    ["Female", "female", 331], ["Not available", "unavailable", 489]
  ];
  for (const [name, kind, x] of legends) {
    body += rect(x, ly - 19, 24, 24, 0, palette[kind],
      kind === "available" ? 'stroke="#142038" stroke-width="2.4"' : "") +
      label(x+36, ly+2, name, 20, "#435166", 650);
  }
  body += label(32, ly + 52, "Seat availability at the time of copy", 19, "#2860c4", 650) + "</svg>";
  return body;
}

async function svgToPng(svg: string): Promise<Blob> {
  const match = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  if (!match) throw Error("Invalid image dimensions");
  const raw = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(raw);
  const img = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(Error("Unable to render the seat image"));
      img.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
  const canvas = document.createElement("canvas");
  canvas.width = Number(match[1])*2; canvas.height = Number(match[2])*2;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("Canvas rendering unavailable");
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0,0,canvas.width/2,canvas.height/2);
  ctx.drawImage(img,0,0,canvas.width/2,canvas.height/2);
  return await new Promise<Blob>((resolve,reject) =>
    canvas.toBlob((blob)=>blob ? resolve(blob) : reject(Error("PNG conversion failed")),"image/png"));
}
function downloadImage(png: Blob, layout: ScheduleSeatLayout) {
  const url=URL.createObjectURL(png), link=document.createElement("a");
  link.href=url;
  link.download="seat-layout-"+layout.serviceNumber.replace(/[^a-z0-9_-]/gi,"-")+"-"+layout.travelDate+".png";
  link.style.display="none";document.body.appendChild(link);
  try { link.click(); } finally { link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),60000); }
}
/** Must be called directly from the button handler (before awaiting refresh). */
export async function copySeatPoster(
  refresh: ()=>Promise<ScheduleSeatLayout>
):Promise<"copied"|"downloaded"> {
  const pngPromise=refresh().then((layout)=>svgToPng(seatPosterSvg(layout)));
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    let item:ClipboardItem|undefined;
    try { item=new ClipboardItem({ "image/png": pngPromise }); } catch { /* unsupported promise-backed clipboard */ }
    if (item) {
      try { await navigator.clipboard.write([item]); return "copied"; }
      catch {
        const layout=await refresh(); // never download an unvalidated stale snapshot
        downloadImage(await svgToPng(seatPosterSvg(layout)),layout);
        return "downloaded";
      }
    }
  }
  const layout=await refresh();
  downloadImage(await svgToPng(seatPosterSvg(layout)),layout);
  return "downloaded";
}
