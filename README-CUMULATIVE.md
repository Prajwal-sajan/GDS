# JourneyOS GDS — cumulative Trips + Accounts + Schedules + Route Master UI patch

Target repository: https://github.com/Prajwal-sajan/GDS

This is a **snapshot-based, client-side cumulative enhancement** of the existing Node/Express SPA, not an independently proven functional clone of SaveTrip and not a production-certified backend replacement. The existing `server/*` modules are unchanged. No GitHub changes were pushed. The Route Master addition does not claim complete server-side parity.

## Contents

- `public/js/trip-parity.js`, `public/css/trip-parity.css` — Trips: Pickup, Drop, Timings, Docs, crew/passenger details, communication logs.
- `public/js/accounts-parity.js`, `public/css/accounts-parity.css` — Accounts: Sales, Transactions, Receivables, ledger (manual credit/debit with confirmation), report catalogue, basic Agent Settings read-only view; native existing Invoices, OTA reconciliation and Coupons are retained.
- `public/js/schedule-parity.js`, `public/css/schedule-parity.css` — Schedules: service cards, Manage workspace with 9 tabs (Bookings, Block, Update, Cities, Pickups, Drops, Fares, P&L, History), dual-deck seat layout from the server, trip pickup chart grouped by pickup/drop/source/date, selection, booking-history search and detail, booking and seat-block actions, route stops and fare updates, crew/vehicle assignment.
- `public/js/route-parity.js`, `public/css/route-parity.css` — additive Route Master workspace with service and recurrence settings, via-city timeline, basic alternating vehicle selection, route-stop summaries, fare guardrails, seat/boarding rule configuration and explicitly simulated GPS halt analysis. Native route editor remains accessible. These are not a substitute for booking-engine rule enforcement.
- `public/index.html` — load overlays after their base modules, before `main.js`.
- `tests/check-static.mjs` — static link/order/API checks.

## Safe application in Windows PowerShell

1. Clone the current repository, or use an **isolated clean feature branch**. This ZIP **replaces `public/index.html`**, so review other uncommitted changes before extracting.

```powershell
cd C:\JourneyOS\GDS-Fresh
git status --short
git switch -c feature/trips-accounts-schedule-parity
Expand-Archive "$env:USERPROFILE\Downloads\GDS_Trips_Accounts_Schedules_Routes_Cumulative_Patch.zip" -DestinationPath . -Force
node --check .\public\js\trip-parity.js
node --check .\public\js\accounts-parity.js
node --check .\public\js\schedule-parity.js
node --check .\public\js\route-parity.js
node .\tests\check-static.mjs
npm install
npm test
npm start
```

2. Open `http://localhost:3000`, log in with your test environment credentials and visit Trips, Accounts and GDS > Schedules > Manage.
3. Complete manual acceptance: pickup/drop grouping and seat counts; multi-leg seat-map states; PNR opens; booking form; blocked/available seat transition; schedule-specific override and route-sync semantics; cancellation/refund role checks; receipts; manual ledger credit/debit; report totals and data exports; role-based navigation; browser/mobile layout; concurrent two-desk updates. Verify against an isolated database; not production.
4. Compare the current branch's `public/index.html` and any changed files before merging, particularly when applying over a prior patch.

## Deliberate backend limitations / differences

- The screenshots show a sophisticated UI, not documented API contracts. This implementation uses existing APIs only. **Do not claim feature-for-feature backend parity**.
- Live GPS/map actions require authorized GPS provider integration; no fabricated coordinates or map tiles are included.
- The /trips/:sid/notify endpoint currently writes internal WhatsApp message records, and is **not** provider-confirmed delivery. UI labels it accordingly. Bulk cancellations, exports, OTA re-push and passenger message delivery require additional backend validation.
- Route-stop editing is supported in the existing route editor but no trip-specific stop editing API exists; Schedule Cities/Pickups/Drops are read-only with a route-editor link.
- Existing schedule PUT supports only `vehicle_id`, `crew`, `departure_time`, `sync_with_route`. Driver-mobile-GPS, call masking/routing, feeder ride flags, and OTA re-push are not written or misrepresented as active settings. Crew changes should be tested with the actual roster schema before merging.
- `G.renderSeats` and existing booking/payment/hold flows were retained; the Booking tab's seat map links to existing booking details or the separate booking console. The system lacks verified end-to-end integration with public OTAs.
- Metro fare in the backend is an estimate rather than feeder-billed fare; metro-drop support may be incomplete. Fleet telemetry and statement amounts require evidence and reconciled financial data.
- Account Agent Settings is **read-only** pending full server rules for independent OTA and agent configurations; current reconciliation configuration and user/Staff modules remain authoritative. Coupon and invoice workflows are the native existing ones, not cloned from the screenshots.
- App-wide integration tests, database migration checks, authenticated browser UAT, and real provider connectivity tests **were not run** here. Syntax and static checks are not equivalent to operational QA.

## Files altered

Only `public/index.html` is replaced. All `.js` and `.css` overlay modules and `tests/check-static.mjs` are new. Existing server code, data files, migrations, and original UI modules are not edited.

## Route Master implementation caveats

- The route workspace is additive to the existing editor and stores many attributes through the existing `PUT /routes/:id` contract. It does not change route creation, full sub-route fare generation, coach layout, passenger eligibility enforcement or cancellation logic.
- Alternate vehicles use the server's existing calendar-day offset selection. On routes that run only certain weekdays, true alternate-*running-trip* sequencing is not implemented; verify this before operational use.
- `business_rules` values (including the same-booking couple exception, OTP and seating adjacency) are configuration **only** until the booking/boarding engines explicitly enforce them. The exception is not automatically available to agents yet.
- The existing `/routes/:id/halts` endpoint uses pseudo-random values rather than authenticated historical GPS. The route enhancement makes that simulation conspicuous, provides **no** bulk GPS pin/time action, and never asserts real telemetry. Stop timing and driving-performance observations need authorized source events to be operationally meaningful.
- The existing `auto_pricing.enabled` flag is stored but no machine-learning model validity or live publication is certified; keep pricing in shadow mode.
- On the GDS Routes detail page, click **Open workspace** to show the additional configuration panels. Use the original route editor for stop import, crew and full fare matrix.

## 21 Nov 2026 addendum — Chats, Calls, Team & Access screenshots

Added `public/js/communications-access-parity.js` and its CSS to the cumulative package and loaded them **after the base engagement and settings scripts, before the app router**.

### Screenshot findings and implementation status

- **Chats:** reference shows a unified conversation queue with service, passenger name, PNR short code, seat, origin/destination, last message, unread count, status (Issue, Working, Resolved), open-thread modal, WhatsApp/SMS/email/calls filters and templates/quick replies. **Implemented in this patch:** responsive filtered chat inbox with active/unread/resolved/blocked filters, search, unread badges, service/seat/details and existing authenticated conversation pane, templates and WhatsApp/SMS send hooks. **Not implemented/verified:** new-conversation workflow, provider-backed email, multi-channel delivery receipts, status transitions, file attachments and WhatsApp voice notes. Current API may not return a resolved status, in which case the filter will be empty; no fake values are introduced.
- **Calls:** screenshot shows incoming/outgoing/missed, call legs (PSTN/APP), ring times, agent routing/escalation, status, playback and exports. **Implemented:** responsive call list, authenticated API-backed stats, search, status filters, PNR navigation, callback/dial actions through the existing call interface. **Not implemented/verified:** provider-backed call origination, sequential routing attempts, recordings, playback, recording downloads or automatic masking. The existing call logging backend does not prove calls were connected.
- **Team & Access:** screenshots distinguish office staff, bus staff, agents, branches and Access permissions. The roles screen shows Viewer, Bus crew, Agent, Service Associate, Booking Executive, Pickup Manager, Service Agent, Accountant, Branch Admin and Manager with operation-level scopes Off/Own/Branch/Company, including trip sheets, boarding/no-show, GPS, calling, booking/cancellation, shifts, notifications, comments and agent booking. **Implemented:** consistent Team & Access navigation for the existing authenticated settings/users, branches and roles editors; existing IAM endpoints and permission checks are preserved. **Not implemented/verified:** screenshot-specific roles and per-action scope model, advanced access testing, company-wide versus branch enforcement in API queries, agent permissions and branch accounting isolation. These require server-side schema and policy changes, not UI toggles.

### Security and operational requirements before production

- Enforce tenant and branch scoping in SQL/API, not only in navigation. Use deny-by-default authorization for booking mutation, refund, seats and IAM actions, and audit changes to roles, membership and permissions.
- Never expose passenger or employee phone numbers, recordings, Aadhaar, PAN or bank details to an unauthorized user. Apply masking, retention controls and access logging.
- Provider integrations need contracted APIs and test credentials. Do not invent successful WhatsApp delivery, connected PSTN legs or recorded audio.
- The screenshot is not a full network/API specification; visual parity cannot establish backend behavior.

### Local validation performed

`node --check` on the new JS file, `node tests/check-static.mjs` and `node tests/check-communications-access.mjs`. No browser integration, database or telephony-provider tests were performed in this environment.
