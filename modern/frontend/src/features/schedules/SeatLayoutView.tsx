import { useMemo } from "react";
import { groupDecks, visualStatus, type ScheduleSeatLayout, type SeatCell } from "./seatLayoutModel";

/** Physical seat diagram shared by Schedules; the old Dispatch auto-fill grid is not used. */
export function SeatLayoutView({
  layout, selected = [], onSeat, busy = false
}: {
  layout: ScheduleSeatLayout;
  selected?: string[];
  onSeat?: (seat: SeatCell) => void;
  busy?: boolean;
}) {
  const decks = useMemo(() => groupDecks(layout), [layout]);
  const available = layout.seats.filter((s) => s.state === "available").length;
  return <div className="sm-seat-layout" data-testid="modern-seat-layout">
    <div className="sm-seat-heading">
      <strong>Coach seat layout</strong>
      <span>{layout.coachName} · {available}/{layout.seats.length} free on selected segment</span>
    </div>
    <div className="sm-seat-decks">
      {decks.map((deck) => <section key={deck.name} className="sm-deck" aria-label={deck.name + " deck"}>
        <header className="sm-deck-heading">
          <b>{deck.name}</b>
          {deck.name === "LOWER" && <svg aria-label="Steering wheel" role="img" className="sm-wheel" viewBox="0 0 60 60">
            <circle cx="30" cy="30" r="28" fill="#06409b" stroke="#b9cdf0" strokeWidth="3"/>
            <circle cx="30" cy="30" r="23" fill="none" stroke="#fff" strokeWidth="3"/>
            <path d="M30 12v18l-17 11m17-11 17 11" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round"/>
            <circle cx="30" cy="30" r="7" fill="#8ebefb" stroke="#205cc6" strokeWidth="2"/>
          </svg>}
        </header>
        <div className="sm-deck-divider"/>
        <div className="sm-seat-grid" style={{
          gridTemplateColumns: "repeat(" + deck.cols + ", minmax(45px, 1fr))",
          gridTemplateRows: "repeat(" + deck.rows + ", 44px)",
        }}>
          {deck.seats.map((seat) => {
            const visual = visualStatus(seat);
            const interactive = !busy && Boolean(onSeat) && (seat.state === "available" || seat.state === "blocked");
            const chosen = selected.includes(seat.seatCode);
            const title = seat.seatCode + " — " +
              (seat.state === "booked" ? (visual === "male" ? "booked male" : visual === "female" ? "booked female" : "booked") :
                seat.state) + (seat.fare != null ? " · ₹" + seat.fare : "");
            return <button
              key={seat.seatCode}
              type="button"
              data-seat={seat.seatCode}
              aria-label={title}
              title={title}
              aria-pressed={interactive ? chosen : undefined}
              disabled={!interactive}
              onClick={() => onSeat?.(seat)}
              className={"sm-seat sm-" + visual + (seat.seatType === "sleeper" ? " sm-sleeper" : " sm-seater") +
                (chosen ? " sm-selected" : "") + (seat.state === "blocked" ? " sm-blocked" : "")}
              style={{
                gridColumn: (seat.col + 1) + " / span " + seat.width,
                gridRow: (seat.row + 1) + " / span " + seat.length
              }}>
              <span className="sm-seat-number">{seat.seatCode}</span>
              <span className="sm-seat-cushion" aria-hidden="true"/>
            </button>;
          })}
        </div>
        {deck.name === "LOWER" && <div className="sm-deck-exit">
          <svg role="img" aria-label="Emergency exit" width="44" height="47" viewBox="0 0 44 47"
            fill="none" stroke="#e8243c" strokeWidth="3" strokeLinecap="round">
            <circle cx="12" cy="7" r="3" fill="#e8243c" stroke="none"/>
            <path d="m12 12-5 12 10 6 5 14M8 25l-7 9m15-16 8-7m-4 8 6 2"/>
            <rect x="27" y="7" width="14" height="37" rx="2"/>
          </svg>
          <span className="sm-exit-door" aria-hidden="true"/>
        </div>}
      </section>)}
    </div>
    <div className="sm-seat-legend" aria-label="Seat status legend">
      <span><i className="sm-legend-swatch sm-available"/>Available</span>
      <span><i className="sm-legend-swatch sm-male"/>Male</span>
      <span><i className="sm-legend-swatch sm-female"/>Female</span>
      <span><i className="sm-legend-swatch sm-unavailable"/>Not available</span>
    </div>
    <p className="sm-seat-footnote">Blue and pink show booked passenger gender. Held, blocked and unknown-gender booked seats are not available. Seat availability is specific to the selected route segment.</p>
  </div>;
}