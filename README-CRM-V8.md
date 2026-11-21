# GDS CRM: screenshot reimplementation v8 — 21 November 2026

## Installation

This patch is based on the cumulative v7 Routes/Schedules package (Node/Express repository **Prajwal-sajan/GDS**, not the unrelated `.NET` E-Yatra repo). From your **local checkout of GDS**, with a clean working tree or committed checkpoint, extract `SaveTrip_GDS_CRM_v8_INCREMENTAL_PATCH.zip` into the repository root with `Expand-Archive -Force` (Windows), then execute:

```powershell
node --check .\public\js\crm-screenshot-v8.js
node --check .\server\api\misc.js
node .\tests\check-crm-v8.mjs
npm install
npm test
npm start
```

Use Ctrl+Shift+R in the browser to load `?build=8` assets. To confirm the new overlay, run `window.__CRM_SCREENSHOT_V8__` in Chrome DevTools; it should read `2026-11-21-crm-v8`. If the app still shows a customer directory before searching, inspect the Network tab for `/js/crm-screenshot-v8.js?build=8` and verify the **correct GDS checkout** was modified.

## Screenshots studied, one by one

**SS-062, Screenshot 2026-11-20 144613.png (CRM search)** — GDS nav CRM selected; Passenger Search icon, subtitle; Phone / Email / PNR segmented tabs; search box with search glyph, clear X and blue Search; initial state no customer; status filter chips All / Confirmed / Cancelled / Expired and counts; matched PNR heading; customer initials square, Silver tier crown, contact phone/email, last pickup/drop and travel date; Call / Chat buttons; four summary tiles (trip count, spend, cancellation rate, miles); booking table with icons/columns STATUS, NAME, TICKET NO, ROUTE, SEAT NUMBERS, TICKET FARE, JOURNEY DATE, ISSUED ON and a view action; green confirmed pill and left green rule; PNR link showing a reference number. Implemented in `G.screens.crm` override and query-only API.

**SS-063, Screenshot 2026-11-20 145047.png (seat/ticket popup)** — Dimmed overlay, top left title `Book Seats - [service]`, stop pair and journey date, round X close; two-column body; LOWER and UPPER deck outlines with steering wheel and exit, seats showing fare/status, blue booked-male / pink booked-female / green current seat, white available and variable seat sizes; action toolbar Update Ticket, Print Ticket, Print Invoice, Notify dropdown, Cancel Ticket, Shift Passenger, Show History, Chat Pax and Comment; blue booking-detail panel; comment panel, contact/journey panel. Implemented by `openBooking` using **real** seat-map and booking records; no hardcoded passenger, fare, PNR or locations.

**SS-064, Screenshot 2026-11-20 145119.png (Notify open)** — Four vertically stacked dropdown choices with descriptions: Ticket Confirmation, Bus Details, Bus Delay / Early, Bus Cancellation. Implemented in ticket popup; sends only the selected PNR through existing trip notify endpoint when authorized. Bus cancellation choice sends a notice only: **does not cancel the trip or promise a refund**.

**SS-065, Screenshot 2026-11-20 145148.png (scrolled ticket)** — Four contact grid cells with phone/email/pickup time/drop time, blue icon tiles; passenger card with seat code, name, gender/age, fare. Implemented as a separate scrollable right panel.

**SS-066, Screenshot 2026-11-20 145224.png (bottom)** — Base fare, discount, net, GST(5%), total payable, amount paid, payment status/method/source and Close; orange seat-rule notice under chart. Implemented using persisted booking fare fields. Amount paid is not fabricated for unpaid or settlement-later bookings.

## Tests and guarantees

- `node tests/check-crm-v8.mjs` — source/asset wiring, icon/control coverage, API search gate, privacy assertions.
- `python tests/crm-v8-browser-smoke.py` — Chromium fixture tests: initial empty state/no API call, Phone/Email/PNR searches, status counts and filters, customer cards, PNR opens modal, seat maps, actions, Notify dropdown, scrolling and Close. Four screenshot previews in `reports/`.
- API routes are permissioned by `crm.view`. Other passengers' booking names/PNRs are removed from the CRM seat-map response.
- Current fixture data is **synthetic and used only in tests**. Real customer information is loaded only after explicit search via the backend.

## Not yet exact / not implemented on the backend

- The original SaveTrip app's complete seat artwork, icon assets, typography and proportions are approximated with custom SVG and CSS: **not independently certified pixel-for-pixel**.
- No real WhatsApp gateway, email transport, voice provider, redBus integration or printer integration is included. The existing notification API records messages locally. Calling uses the pre-existing manual call logger.
- `Print Invoice` deliberately prints a **payment statement**, not a compliant tax invoice, until operator tax metadata and invoice numbering are available.
- The booking-history card uses available persisted edit history, not a comprehensive payment/OTA event log.
- Only the **five CRM screenshots provided** establish the detailed CRM view; other unpictured SaveTrip dialogs cannot be claimed exact.
- `npm test` was **not runnable** in the sandbox because `express` is not installed and the runtime has no package-download access. Run it in your local Node environment after `npm install`.

## File changes

- `public/js/crm-screenshot-v8.js` **new** frontend CRM and booking popup
- `public/css/crm-screenshot-v8.css` **new** scoped visual styles
- `public/index.html` **modified** versioned asset references
- `server/api/misc.js` **modified** query-only CRM API and private seat map
- `tests/crm-v8-browser-smoke.py` **new** browser fixture test
- `tests/check-crm-v8.mjs` **new** static integration test
- `reports/CRM_V8_*` **new** screenshot previews / audit matrix
