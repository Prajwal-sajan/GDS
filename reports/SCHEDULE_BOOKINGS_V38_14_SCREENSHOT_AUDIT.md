# GDS v38 — Schedule → Bookings / Pickup Chart / Ticket Details

**Source screenshots:** 14 chronological screenshots uploaded 23 November 2026, illustrating the SaveTrip Schedule → Bookings workflow and PNR drill-down. Screenshot identity, numbers, phone and PNR are examples, not real data to seed.

## Screen-by-screen evidence / interaction map

1. **Bookings overview:** Top tabs Bookings, Block, Update, Cities, Pickups, Drops, Fares, P&L, History remain in the Schedule modal. Left column remains live schedule Seat Layout with vehicle, crew, last-known position, Stations/Pickups/Drops/Booked by/Bookings buttons, From/To, upper/lower decks, fares, booked/available colors, footer utilities.
2. **Pickup Chart:** Right-hand Pickup Chart and History tabs; Available, Booked and Blocked count chips; Print Pickup Chart, Import Pickup Chart, Cancel (0), Notify (0), History; Group by Pickup/Drop/City/Source/Booked On/Fare/Trips; passenger selection by individual PNR/seat, group checkbox and Select All/Clear. Actions disabled until eligible selections; grouping and filtering preserve selection.
3. **PNR click:** Clicking passenger name, displayed short PNR or occupied seat creates a third right-hand tab `Seat N — FULL_PNR`; remains inside the Schedule modal.
4. **PNR toolbar:** Update Ticket, Print Ticket, Print Invoice, Notify dropdown, Cancel Ticket, Shift Passenger, Show History, Chat Pax, Comment — SVG icons and role/status gating.
5. **Booking Details:** Source chip, PNR and ticket reference, actual booking timestamp, Comments and Add comment, contact phone/email, chosen pickup/drop and times, all active passengers (seat/name/gender/age/fare), actual saved fare breakup, payment channel/status.
6. **Edit Booking:** Editable contact phone/email, searchable city-labelled pickup and drop option lists with times and selected checkmark; original booked point shown; editable passenger name, age, gender; subtotal/total and Notify Passenger checkbox; Back and Save Changes. Operator-verified stage IDs and input validation, persisted via existing PUT, audit appended.
7. **Pickup dropdown:** Search, grouped origin city title, pickup stop names/types, local times and selected checkmark. Only valid pickup stages in booked origin city are returned.
8. **Drop dropdown:** Search, grouped destination city title, drop names/times and checkmark. Only valid destination drop stages returned.
9. **Shift Passenger:** Current booking PNR/trip/date/route/passengers; target travel-date picker, time/service dropdown restricted to journey-compatible trips, live target-seat availability and per-passenger Before/After assignment. Confirm Shift disabled until every active passenger has a unique target seat; backend enforces occupancy, compatibility and date constraints. Notify Passenger checkbox.
10. **Shift below fold:** Same form displays date, selected time/service, Seat Assignment with selectable target seats, green notification checkbox, Back and Confirm Shift buttons; not a fake preview.
11. **PNR History popup:** Real booking creation, stored booking discount, audited edit/comment/shift/cancellation records with timestamp, actor and role/source; no fabricated status transitions. Scrollable timeline and close affordance.
12. **Comment popup/open editor:** Staff-only textarea placeholder exactly communicates note privacy; Save comment disabled until text; persisted through authorized API, audited.
13. **Partial or full cancellation:** Individual passenger seat selection, explicit cancellation reason, payer context and confirmation. Refund handled by existing policy-calculated API, never silently.
14. **Print and Chat:** Ticket print window uses actual booking data. The invoice control produces a payment statement/preview, explicitly not a legally issued statutory tax invoice without required operator billing details. Chat Pax links to the actual conversation when one exists.

## Backend, permissions and truthfulness

- `GET /api/bookings/:pnr/stops`: permission-scoped, real schedule stage overrides and allowed origin pickup/destination drop only.
- `GET /api/bookings/:pnr/history`: audit-sourced changes plus only facts supported by booking records.
- `GET /api/bookings/:pnr/shift-options?date=...`: available compatible active services for up to 120 days.
- `GET /api/bookings/:pnr/shift-seats?schedule_id=...`: real authorized and segment-compatible seat inventory.
- Existing `PUT /api/bookings/:pnr` validates contact, passenger seats/ages/gender and stage types/cities; logs audit.
- Existing `POST /api/bookings/:pnr/comments` enforces staff permission, nonempty/max length and audit.
- Existing `POST /api/bookings/:pnr/shift` verifies route direction, active date, seat uniqueness, availability, valid stops and confirmed status.
- Existing notification route records requested messages in GDS and reports `delivery_verified:false`. No external WhatsApp provider delivery is claimed.
- Existing cancellation route is used with individual seat IDs, refund quote and explicit destructive confirmation; invalid selections do not modify booking.
- Source screenshot ticket values, phone details, vehicle GPS and fare amounts are not copied into production fixtures.

## Files and verification

**Client:** `public/js/schedule-bookings-v38.js`, `public/js/booking-ticket-v38.js`, `public/css/schedule-bookings-v38.css`, integration in `public/js/schedules-screenshot-v6.js` and `public/index.html`.

**Server:** `server/api/booking-workspace-v38.js`, `server/api/ops.js`, `server/domain.js`, `server/index.js`.

**Tests:** `tests/schedule-bookings-v38-api.cjs`, `tests/schedule-bookings-v38-ui.cjs`, existing v6/v7 schedule tests and full regression. Tests use a temporary demo DB.

**Explicit limitations:** Invoice control is a print-ready payment statement preview, not a statutory invoice number/GST document. Import Pickup Chart is an intentionally non-mutating placeholder until a validated ingestion API exists. GDS notifications record outgoing actions without proof of external WhatsApp/SMS delivery; real provider credentials are needed. Browser-based pixel comparison with the authenticated SaveTrip and JourneyOS deployments remains necessary before claiming exact pixel parity.
