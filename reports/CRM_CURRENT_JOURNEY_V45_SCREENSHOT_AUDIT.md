# CRM → Passenger → Current Journey Ticket: screenshot audit (v45)

## Source
Two user-provided SaveTrip GDS screenshots (23 Nov 2026) of one open **Book Seats** passenger booking modal, captured at its top and scrolled midsection. The screenshots are visual references, not evidence that our GDS currently shares their inventory, exact fare values, or provider services.

## Complete visual inventory and implementation
| Visible requirement | v45 source | Implementation |
| --- | --- | --- |
| Black dim backdrop, wide rounded modal, circular close icon | `crm-journey-v45.css`, CRM v8 shell | Fixed viewport, scrollable content, focus restoration/Tab loop |
| Header and service number | `crm-screenshot-v8.js` | Actual service from CRM booking |
| From / To stops, date as DD Mon YYYY | `crm-screenshot-v8.js` | From booked route/stages and actual travel date |
| Two white framed LOWER / UPPER deck silhouettes | `crm-journey-v45.js` | One-to-one rendering of real coach deck arrays |
| Steering wheel on LOWER | `crm-journey-v45.js` | Inline original vector SVG, glossy blue circular wheel |
| Lower 1-column sleepers / aisle / 2-column seaters | `projection()` | Visual projection of supported mixed 2+1 layout; all original seat codes retained |
| Upper 1-column sleepers / aisle / 2-column sleepers | `projection()` | Source seat coordinates projected for supported 2+1 upper deck |
| Custom coaches, 2+2 and other layouts | `projection()` | Preserve server row, column, and span, no forced screenshot geometry |
| Glossy booked-male blue seats | CSS `.booked_male` | Real domain seat occupancy; no inferred passenger category |
| Glossy booked-female pink seats | CSS `.booked_female` | Real domain seat occupancy |
| Current passenger seat green | `seatStatus()` | Only active seats belonging to current PNR and indicated by sanitized backend |
| Held, blocked, no-show, other leg, available | CSS + `seatStatus()` | Distinct honest state colors; never marked booked if available |
| Berths: fare above code and count below | `tile()` | Genuine GDS fare and reservation count, no copied screenshot totals |
| Seaters: seat number above fare, tiny count top-right | `tile()` | Genuine GDS fare and reservation count |
| Emergency exit / red door indicator | `crm-journey-v45.js` | Inline original emergency SVG + red door marker |
| Clicking seat shows status, fare, count with no foreign PII | `crm-screenshot-v8.js` | Accessible read-only details; no cross-booking identity disclosed |
| Action bar: Update Ticket, Print Ticket, Print Invoice, Notify | CRM v8 actions + v45 styles | True permission states; ticket PDF integration; payment statement fallback |
| Action bar: Cancel Ticket, Shift Passenger, History, Chat Pax, Comment | CRM v8 actions | Routed to live GDS booking APIs; shift uses eligible-trip/free-seat APIs |
| Booking Details card title, count, PNR, Ref, source chip, date, X | `ticketCard()` | Short ticket number as PNR; long booking ID as Ref; X collapses card |
| Comments card with Add comment and empty state | CRM v8 UI | Existing permission-checked persistent staff comment API |
| Contact & Journey Details, mobile/email/pickup/drop + time chips | CRM v8 UI + v45 CSS | Server source, masked phone if not authorized |
| Passenger information, seat, gender badge, age and fare | `passengerCards()` | Current passenger data; F= pink badge, M=blue, other=purple |
| Fare and payment details below visible screenshots | CRM v8 UI | Retained source-based totals, discount, GST and payment state |
| Independent panel scrolling and narrow-screen fallback | `crm-journey-v45.css` | Desktop two-column with mobile stacked layout |

## Security / data boundary
- CRM ticket details require `crm.view` and pass `CRMAccess.requireBooking` with existing operational role/scope guards.
- The seat grid contains *only* seat code/type/layout, status, a genuine fare, an aggregate reservation count, and an `is_current` boolean. It does not include other passengers' names, PNRs, contacts, pickup/drop choices, genders as raw profile fields, or booking references.
- Phone viewing additionally requires `bookings.see_phone` and existing `viewPhone` policy. Contact phone is masked for users without it.
- The `×N` badge means active passenger reservations for that physical seat across the selected service's segments. It is not a screenshot-derived count and appears only if that count exists in the database.
- All dynamic seat codes, text, data attributes, and monetary values are escaped.

## Action semantics
- **Update Ticket:** existing booking update API; gated by `bookings.modify`.
- **Print Ticket:** uses existing `TicketPrintV41.open` for authorized ticket-PDF readers. A local print fallback remains for CRM-only readers.
- **Print Invoice:** current platform does not expose a verified per-passenger tax-invoice issuance API; the button explicitly warns and prints a labelled *booking payment statement*, not a purported statutory GST invoice.
- **Notify:** existing `POST /trips/:sid/notify` records a message in GDS. The result explicitly says external delivery has **not** been verified.
- **Cancel Ticket:** GDS refund quote, passenger/operator selection, second confirmation, actual cancellation API.
- **Shift Passenger:** chooses date, eligible active service, **real available seats**, validates unique passenger seat assignments, confirms, commits shift; optional GDS notification record.
- **Show History:** pulls real `GET /bookings/:pnr/history` records.
- **Chat Pax:** routes to GDS chat module, which requires `chats.view`.
- **Comments:** saved in the existing bookings store; permission `bookings.comments`.

## Acceptance and limitations
The screenshot is one service and 46 visible seats, but the GDS must display **every seat belonging to the actual coach** (which might have a different capacity). The v45 test uses a 46-seat screenshot-faithful fixture; source-driven seat rendering is mandatory.
Automated tests exercise lower/upper geometry and SVG, 46 unique codes, price/count placement, green current seat, gender color semantics, XSS escaping, mobile/desktop CSS, role gates and a seeded real API response with other-booking PII omitted.
Manual pixel-by-pixel browser comparison at 1735×865, multiple actual coaches and real operator UAT remain necessary before certifying visually exact production parity.
