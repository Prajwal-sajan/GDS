// Formatting helpers ported 1:1 from the legacy GDS (public/js/core.js) so React renders the same strings.
export const inr = (n: number | null | undefined, d = 0) =>
  n == null || Number.isNaN(n) ? "—" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d })}`;
export const t12 = (hhmm: string | null | undefined) => {
  if (!hhmm) return "—";
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const today = () => iso(new Date());
export const addDays = (s: string, n: number) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return iso(d); };
/** "Tue, 24 Nov" — legacy safeDate. */
export const shortDate = (s: string) => {
  const d = new Date(`${s}T12:00:00`);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
};
