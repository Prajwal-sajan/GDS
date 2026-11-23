# GDS v35 — Coaches All Berths and Trip PNR Communication History

**Reference uploads:** `vehicle -all births dropdown.png` and `Screenshot 2026-11-22 204610.png` (SaveTrip reference UI). No external SaveTrip data was imported.

## Screenshot 1 · Vehicles → Coaches · All berths

- Existing two-tier navigation is retained (GDS → Vehicles → Coaches).
- A custom dropdown with a purple bed SVG replaces the native `data-coach="berths"` selector. It has its own chevron (rotating when open), border, shadow, rounded white menu, selected light-blue row, selected checkmark, orange Seater icon and purple Sleeper icon.
- Exactly three visible choices: **All berths**, **Seater**, **Sleeper**. Their displayed facet counts are calculated from real `coaches[].layout.decks[].seats` and recomputed when AC/search filters change.
- A mixed seater/sleeper coach appears in both corresponding categories: **Seater means at least one seater** and **Sleeper means at least one sleeper**. Thus counts may overlap, exactly like the reference 6 total / 3 seater / 4 sleeper. The screenshot values are a *reference*, not hardcoded inventory.
- Selection updates the result table, “Showing X of Y,” current choice, checkmark and list/grid views without modifying coach data.
- Arrow-key, Enter/Space, Escape and outside-click behavior implemented. Menu is positioned above table and never clipped by the toolbar.

## Screenshot 2 · Trips → passenger PNR → Communication History

- PNR link now opens a dedicated read-only history modal; the previous booking detail action remains reachable through its separate adjacent file icon.
- 4 tabs: **All**, **Calls**, **WhatsApp**, **SMS**, each with channel SVGs and *actual* counts from the same filtered source. Initial tab is All with light-cyan background and blue underline. Exact counts in screenshot are illustrative; never fabricate 20 WhatsApp messages.
- Screenshot-style white modal with black dimmed backdrop; title, name, PNR and masked phone in the header; right-side clickable SVG X to close. Header/tab/table fixed and table body scrolls.
- 8 columns: **TYPE**, **DIRECTION**, **TIMESTAMP**, **MESSAGE TYPE / FROM**, **CONTACT / TO**, **STATUS**, **DURATION**, **ADDITIONAL INFO**. Direction icon/color, channel colors, status chips for Sent/Read/Delivered/etc, shaded alternating rows, `DD-MM-YY HH:mm:ss` local India display.
- Specific channel empty states, retry, keyboard tab navigation, Escape and close behavior. The API pages after 100 records and modal offers **Load more records**, so lengthy histories do not silently truncate.
- **Actual data:** `GET /api/trips/:sid/passengers/:pnr/communications` ties the PNR and schedule to an authorized booking. It collects all passenger seat conversation IDs (not just the first), message records and PNR-linked call logs, normalizes them once, sorts latest first, and filters per channel. App/email messages are retained under All even though the reference has no separate tabs.
- **Data integrity:** chat `read` is an internal staff/inbox flag. **Read, Sent, Delivered** labels are shown only when an explicit provider delivery status exists. Locally recorded outgoing messages show **Recorded**; this screen cannot imply actual WhatsApp/SMS delivery or telephony integration.
- **Privacy:** requires `trips.view` and booking scope, reveals only channels for which the actor has `chats.view` or `calls.view`; masks the passenger phone and redacts contact numbers unless phone access is authorized. Does not mark chats read or mutate communications.
- The existing screenshot trip page, call/chat buttons and booking view remain operational.

## Source files

- `public/js/vehicles-parity-v9.js`
- `public/js/trip-parity-v13.js`
- `public/js/communication-history-v35.js`
- `public/css/vehicle-communication-v35.css`
- `public/index.html`
- `server/api/communication-history-v35.js`
- `server/index.js`
- `tests/vehicle-communication-v35-api.cjs`
- `tests/vehicle-communication-v35-ui.cjs`

## Verification

`node tests/vehicle-communication-v35-api.cjs`
`node tests/vehicle-communication-v35-ui.cjs`
`node tests/check-vehicles-v9.mjs`
`node tests/check-trips-v13.mjs`
`node tests/check-communications-v14.mjs`
`npm test`

Production caveat: integrated provider event collection and delivery receipts require an authorized provider connection. Existing local logs are read-only. A pixel-diff comparison against the screenshots and physical operator/browser UAT remain necessary before certifying visual identity.
