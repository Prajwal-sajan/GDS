# v39 — Screenshot coverage: booking popup and Trips loyalty upgrade

**Visual inputs:** two SaveTrip screenshots provided 23 November 2026. These are reference layouts, not database fixtures.

## 1. Real-time GDS booking notification (screenshot 1)

- Global upper-right popup visible across GDS routes, Trips, Team & access, or any other logged-in screen
- Rectangular white/blue card with 7px blue left accent, rounded blue border, shadow and responsive fixed positioning
- Circular blue information SVG icon, top-right close (X) SVG
- Event-driven title: **In-trip booking — [vehicle registration]** when trip is live, otherwise **New booking — [registration/service]**
- Passenger name/count, Seat(s), Board, Drop, PNR from stored booking and route stage data
- Clicking ticket reference opens the existing booking details modal
- Bottom blue progress rail counts down over 12 seconds; pause when hovered/focused/document hidden; close immediately via X
- Maximum two visible cards and bounded queue, dedupe by event ID, initial server cursor avoids historical replay
- Authenticated 3-second polling against `/api/bookings/live-events-v39` (not literal push/WebSocket). Cursor avoids repeated alerts, excludes held, cancelled, released and unauthorized bookings; access scope checked per booking.
- General alerts still exist but suppress duplicate booking-specific ordinary toasts
- No test data or invented OTA events are sent. Only bookings successfully persisted in this standalone GDS (or ingested through a future authorized partner adapter) are eligible.

## 2. Loyalty offered/upgrade badge (screenshot 2)

- Exact placement next to `Seats: 21`, before Via / source / PNR
- Orange-yellow pill with white SVG sparkle, **OFFERED 21 → 17U**, warm glow and repeating pulse animation
- Distinct green **UPGRADED 21 → 17U** once verified application is completed
- Expired and declined offers show neutral, nonflashing states
- `prefers-reduced-motion` disables flashing
- Manual `Upgrade` control in Trips allows a permitted user to inspect eligible free berths / offer / record acceptance or decline
- Popup explicitly differentiates **offer** from **actual seat change** and requires passenger consent

## End-to-end booking and upgrade lifecycle

1. Booking `Domain.notify('booking.created')` or confirmed hold `payment.received` creates real event alert. GET reads new events and maps booking, vehicle and route stop fields, with permissions.
2. Loyalty upgrade feature respects the existing Settings → Loyalty Program / Enable Seat Upgrades and overall loyalty setting.
3. Automated offer scan every 60 seconds finds **paid, confirmed, eligible Silver/Gold/Platinum customers** in the 20-minute preboarding window, evaluates strictly better free seats, records an **offered** suggestion only, never changes a seat.
4. Seat choices are evaluated for the customer's actual journey segment, on the same coach. Higher-scored accommodations prioritize seater→sleeper, upper→lower, and forward rows.
5. Offers expire after 5 minutes or boarding time (whichever comes first); no repeat automatic offer for a passenger with prior offer history.
6. A permitted operator may manually create an offer, record decline, or record acceptance with explicit passenger consent, channel and reference.
7. Acceptance rechecks route, tier, status, time window, duplicate offers and seat occupancy before changing the passenger seat. Audit records original and new seat, actor and consent reference; original seat becomes available again.
8. The Trips API exports the original/target seat and state so the pill only appears when there is a genuine recorded offer/upgrade.
9. Existing PNR access restrictions and read-only account restrictions remain in effect.

## New/changed files

- Server: `server/api/booking-live-v39.js`, `server/api/loyalty-upgrades-v39.js`, `server/api/ops.js`, `server/loyalty-v34.js`, `server/index.js`
- Client: `public/js/booking-notices-v39.js`, `public/js/trips-loyalty-v39.js`, `public/css/booking-loyalty-v39.css`, `public/js/trip-parity-v13.js`, `public/js/main.js`, `public/index.html`
- Tests: `tests/booking-loyalty-v39-api.cjs`, `tests/booking-loyalty-v39-ui.cjs`, updated loyalty-v34 API test

## Honest boundaries / release criteria

- Polling is near-real-time (~3 seconds), not server push. Notifications on other operator platforms require an authorized adapter that persists their bookings into this GDS.
- The consent reference is **operator-recorded evidence**, not verified authorization from WhatsApp/OTA providers. External delivery and customer confirmation are not claimed.
- In-memory serialized mutations are safe against competing HTTP handlers in a **single Node process**. Multiple writers/replicas require a transactional DB with unique seat constraints and distributed offer scheduling before production.
- A screenshot shows **OFFERED**, not completed. This implementation deliberately retains the old seat until consent and application.
- Live pixel-by-pixel browser parity is not certified from static screenshots. Inspect actual deployed UI at target browser width.
