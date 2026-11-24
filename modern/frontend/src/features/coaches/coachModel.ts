import type { CoachDraft, CoachSeatDraft, CoachFixtureDraft } from "../../api";

export type Deck = "LOWER" | "UPPER";
export type ElementKind = "seat" | "fixture";
export interface SelectedElement { kind: ElementKind; index: number }
export const availableAmenities = ["ac", "charging", "wifi", "blanket", "water", "reading_light", "curtain", "cctv", "usb", "tv", "pillow", "toilet"];
export const fixtureKinds: CoachFixtureDraft["kind"][] =
  ["emergency_exit", "roof_exit", "toilet", "stairs", "driver", "door", "luggage", "other"];
export const MAX_ROWS = 30, MAX_COLS = 8;
export const columnsForPattern = (pattern: CoachDraft["pattern"]): number[] =>
  pattern === "2+1" ? [0, 1, 3] : [0, 1, 3, 4];

/** Generate a predictable editable geometry, without claiming a precise real-vehicle specification. */
export function generateRows(draft: CoachDraft, deck: Deck, rows: number,
  seatType: CoachSeatDraft["seatType"]): CoachDraft {
  if (!Number.isInteger(rows) || rows < 1 || rows > (seatType === "sleeper" ? 14 : 29))
    throw new Error("Choose 1–29 seater rows, or 1–14 sleeper rows.");
  const otherDeck = draft.seats.filter(s => s.deck !== deck);
  const occupiedCodes = new Set(otherDeck.map(s => s.code.toUpperCase()));
  const spots = columnsForPattern(draft.pattern);
  let codeIndex = 1;
  const suffix = deck === "UPPER" ? "U" : seatType === "sleeper" ? "L" : "";
  const seats: CoachSeatDraft[] = [];
  for (let index = 0; index < rows; index++) for (const col of spots) {
    let code: string;
    do { code = String(codeIndex++) + suffix; }
    while (occupiedCodes.has(code.toUpperCase()));
    occupiedCodes.add(code.toUpperCase());
    seats.push({
      code, deck, row: 1 + index * (seatType === "sleeper" ? 2 : 1),
      col, width: 1, length: seatType === "sleeper" ? 2 : 1, seatType,
      isWindow: col === spots[0] || col === spots[spots.length - 1]
    });
  }
  return { ...draft, seats: [...otherDeck, ...seats],
    fixtures: draft.fixtures.filter(f => f.deck !== deck) };
}

export function emptyCoach(): CoachDraft {
  return generateRows({name:"New Coach",busType:"A/C Seater",pattern:"2+1",isAc:true,
    amenities:["ac"],seats:[],fixtures:[]}, "LOWER", 4, "seater");
}

export function coachErrors(d: CoachDraft): string[] {
  const errors: string[] = [];
  if (d.name.trim().length < 2 || d.name.length > 100) errors.push("Coach name must have 2–100 characters.");
  if (d.busType.trim().length < 2 || d.busType.length > 80) errors.push("Bus type must have 2–80 characters.");
  if (!["2+1", "2+2"].includes(d.pattern)) errors.push("Select a supported row pattern.");
  if (d.seats.length < 1 || d.seats.length > 80) errors.push("A coach requires 1–80 bookable seats.");
  if (d.fixtures.length > 40) errors.push("A coach may have at most 40 cabin fixtures.");
  if (new Set(d.amenities).size !== d.amenities.length ||
      d.amenities.some(x => !availableAmenities.includes(x))) errors.push("Choose distinct supported amenities.");
  const names = new Set<string>(), cells = new Set<string>();
  const occupy = (deck: string, row: number, col: number, width: number, length: number, name: string) => {
    if (!["LOWER", "UPPER"].includes(deck) || !Number.isInteger(row) || !Number.isInteger(col) ||
        !Number.isInteger(width) || !Number.isInteger(length) ||
        row < 0 || col < 0 || width < 1 || width > 3 || length < 1 || length > 3 ||
        row + length > MAX_ROWS || col + width > MAX_COLS) {
      errors.push(name + ": coordinates outside the 30×8 coach grid."); return;
    }
    for (let r = row; r < row + length; r++) for (let c = col; c < col + width; c++) {
      const k = deck + ":" + r + ":" + c;
      if (cells.has(k)) errors.push("Overlapping geometry at " + deck + " row " + (r + 1) + ", column " + (c + 1) + ".");
      cells.add(k);
    }
  };
  for (const s of d.seats) {
    const code = s.code.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{0,11}$/.test(code)) errors.push("Seat code must be 1–12 letters/digits/_/-.");
    if (names.has(code)) errors.push("Duplicate seat code " + code + ".");
    names.add(code);
    if (!["seater", "sleeper"].includes(s.seatType)) errors.push("Unknown seat type for " + code + ".");
    occupy(s.deck,s.row,s.col,s.width,s.length,code);
  }
  for (const f of d.fixtures) {
    if (!fixtureKinds.includes(f.kind) || f.label.trim().length < 1 || f.label.length > 60)
      errors.push("Invalid cabin fixture type or label.");
    occupy(f.deck,f.row,f.col,f.width,f.length,f.label);
  }
  return [...new Set(errors)];
}

export function nextSeatCode(draft: CoachDraft, deck: Deck, kind: CoachSeatDraft["seatType"]): string {
  const names = new Set(draft.seats.map(s => s.code.toUpperCase()));
  const suffix = deck === "UPPER" ? "U" : kind === "sleeper" ? "L" : "";
  for (let n = 1; n <= 999; n++) {
    const code = String(n) + suffix;
    if (!names.has(code.toUpperCase())) return code;
  }
  throw new Error("No unused seat code available");
}

export function layoutMetrics(d: CoachDraft) {
  const lower = d.seats.filter(s => s.deck === "LOWER");
  const upper = d.seats.filter(s => s.deck === "UPPER");
  return {seatCount:d.seats.length,seaters:d.seats.filter(s => s.seatType === "seater").length,
    sleepers:d.seats.filter(s => s.seatType === "sleeper").length,lower:lower.length,upper:upper.length,
    nonBookable:d.fixtures.length};
}

export function cellAt(draft: CoachDraft, deck: Deck, row: number, col: number): SelectedElement | undefined {
  const seatsIndex = draft.seats.findIndex(s => s.deck === deck && row >= s.row && row < s.row + s.length &&
    col >= s.col && col < s.col + s.width);
  if (seatsIndex >= 0) return {kind:"seat",index:seatsIndex};
  const fixtureIndex = draft.fixtures.findIndex(f => f.deck === deck && row >= f.row && row < f.row + f.length &&
    col >= f.col && col < f.col + f.width);
  return fixtureIndex >= 0 ? {kind:"fixture",index:fixtureIndex} : undefined;
}
