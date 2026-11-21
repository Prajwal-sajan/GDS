# SaveTrip GDS — Schedules screenshot-first UI reconstruction (v6)

This patch **replaces the Schedules screen UI** inside the existing vanilla JavaScript/Express GDS. It is a follow-on to the Routes v5 overlay. It is not a replacement for the unrelated JourneyOS .NET/React repository.

## Source coverage

33 user-provided Schedule screenshots from 20 November 2026 (IDs SS-008 through SS-040) were reviewed as **separate states**. Each source image has a line in `reports/SCHEDULES_V6_SCREENSHOT_MATRIX.csv`: unique visible features, implementation mapping, API/read-vs-preview behavior and remaining differences. This is an element-traceability check, **not** a claim that SaveTrip source code was obtained or that pixel-by-pixel equivalence was proved.

## Visual build

- Date-week strip with navigation, date/calendar, search, yellow schedule table, summary fare/occupancy badges, status switch, row actions.
- Large blue-header Schedule modal with minimize/close, scrollbar, nine tabs (**Bookings, Block, Update, Cities, Pickups, Drops, Fares, P&L, History**), sticky close/save footer.
- Bookings panel: real itinerary selector; two-deck drawn seat chart; statuses (available/selected, male/female booked, hold, blocked); fare chips; left-side utility buttons; right-side grouped pickup chart with multi-PNR selection, search, filters and history.
- Inner dialogs: multi-station, pickups, drops, booked-by, booking history, timings, location, notification template choice, seat/stop editor, cancellation review.
- Block: seat selection, reason/gender, block/unblock controls with actual permission and confirmation checks.
- Update: editable crew, vehicle, extra crew rows; call routing, escalation, phone masking, driver GPS, route sync and pickup vans.
- Cities: origin/destination, delay/advance controls, via-city list, enabled origin/destination flags, city-pair/slot rate table.
- Pickups/Drops: city filter chips; primary/metro badges; index/time/day, phone, GPS coordinates, stop editing popup.
- Fares: auto pricing presentation, guardrails, demand curve/targets, city-pair selector, currency/percent, +/- buttons, weekday chips, seat class/fare group grid and coach diagram, seat premium/discount/city rules preview.
- P&L: expense columns, inline amounts, add/remove affordances, income by channel, profit, net/gross, GST and commissions.
- History: searchable ticket records, status counts and per-PNR link.

## Operations and safety contract

**API-backed reads:** schedule list/detail, trip manifest, seat inventory per route pair, booking history, fare base values, vehicle/staff lists, GPS coordinates when supplied, trip P&L.

**Existing API writes, after permission + confirmation:** seat block/unblock; vehicle/crew assignment; schedule sync; explicit schedule fare override; explicit newly added trip expense. Opening a booked ticket delegates to the original booking workflow. Booking a seat delegates to the original booking console, which rechecks availability.

**UI previews only:** fare-rule premiums/discounts, dynamic price targets and weekday seat-specific fare matrices; GPS stop corrections; auto cab or pickup van dispatch; OTA sync; cloud calling/number-masking integration; shift all via-city times; bulk edit/delete of existing P&L expenses. Preview values persist only in browser storage scoped to a schedule. No auto-promotion or auto-fare publication.

`Save trip fares` is an actual backend operation, but **only for the currently chosen city-pair**. It does not publish or activate the simulated seat rules. Check pricing changes in a sandbox before trying the button in a real environment.

## Install: Schedules v6 on Routes v5

1. Commit or back up all uncommitted changes in `C:\JourneyOS\GDS-Fresh`.
2. Apply the Routes v5 patch first if this folder does not already have it.
3. Extract `SaveTrip_GDS_Schedules_Screenshot_Replica_v6_PATCH.zip` into the project root. This intentionally updates `public/index.html` and adds the v6 CSS/JS and audit/tests.
4. Confirm `public/index.html` loads `/js/schedules-screenshot-v6.js` **after** `/js/routes-screenshot-v5.js` and **before** `/js/main.js`.
5. Run:

```powershell
cd C:\JourneyOS\GDS-Fresh
node --check .\public\js\schedules-screenshot-v6.js
node .\tests\check-schedules-v6.mjs
npm test
npm start
```

Open **GDS → Schedules**, hard-refresh and navigate all nine modal tabs.

For a clean checkout without v4/v5, use the **cumulative v6 package** instead of the Schedules-only patch. Never extract this over the unrelated `C:\JourneyOS\GDS-Dev` repository (its remote is `SupriyaPejavara/E-Yatra`, not `Prajwal-sajan/GDS`).

## Test scope

- Static JavaScript syntax and `tests/check-schedules-v6.mjs` screenshot/tab/icon/action coverage checks pass.
- `tests/schedules-v6-browser-smoke.py` fixture-only Chromium test validates week/list, all tabs, seat chart, summary popups, crew form, dialog close; no JavaScript page errors in fixture.
- Previous Routes v5/v4 static tests were rerun successfully.
- Full authenticated production flow, npm suite with unavailable dependencies, OTA/telephony/GPS integration, and automated pixel diff against an authenticated SaveTrip page **were not tested**. The preview images are browser fixture renders, not authenticated data nor evidence of exact 100% design parity.

## Files

- `public/js/schedules-screenshot-v6.js` — new Schedule presentation & UI wiring
- `public/css/schedules-screenshot-v6.css` — scoped layout and icon styles
- `public/index.html` — asset registration, retaining all previous modules
- `tests/check-schedules-v6.mjs` — 33-screenshot traceability static gate
- `tests/schedules-v6-browser-smoke.py` — fixture-only browser smoke
- `reports/SCHEDULES_V6_SCREENSHOT_MATRIX.csv` — individual image audit
- `reports/SCHEDULES_V6_REAUDIT_NOTES.md` — verification details
