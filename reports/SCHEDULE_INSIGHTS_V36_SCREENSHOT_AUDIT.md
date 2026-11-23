# v36 screenshot audit — Schedule Search, Bus Halts and Occupancy Calendar

Reference screenshots:
1. **GDS → Schedules → Search** (Search services popup).
2. **GDS → Routes → Bus halts** (multi-route halt evidence modal).
3. **GDS → Schedules → Calendar** (daily occupancy ring calendar and monthly holiday list).

## 1. Search services
* Overlay, center panel, heading/search SVG, SVG close button.
* Origin green pin/send icon, Destination pink pin icon; both with `All` dropdown defaults and real `/cities` options. Search within both dropdown lists.
* Origin/destination swap, selected city marking, independent optional city filters; reject identical origin and destination.
* Calendar date card displays day/month/year and Today/Tomorrow; native date picker enables other dates.
* **Show all services** resets city/text search and applies date. **Search** applies origin, destination and date to `/schedules` API. Existing seven-day strip, sorting, price, occupancy and booking actions remain.
* The API supports origin-only or destination-only filters, both cities, and directional route ordering when both set.
* No example city names, counts, bookings or fares are hardcoded into production UI.

## 2. Bus halts
* Title, subtitle, SVG close, 7 / 15 / 30-day lookback.
* A summarized sentence, seven-column route table: ROUTE, TRIPS, PINS TO MOVE, TIMES TO CHANGE, FINE, WAITING, Open route.
* Each route is directional. Links open `#/gds/routes/:id?rvtab=pickups&rvmode=view`.
* Error/retry and empty states, sticky header, scrollable table, footer explaining evidence threshold.
* Read-only API `GET /api/routes/halts-overview?days=15`; route drill-down `GET /api/routes/:id/halt-evidence?days=15`.
* **Provider verification gate:** only explicit `gps_provider` records in `gps_halt_observations` with `provider_verified:true`, `kind:halt`, acceptable accuracy (≤100 m), dwell ≥45 seconds, matched trip/route/stage, and completed trip status count. Synthetic route-halt data, simulated GPS coordinates and manual arrivals/departures are excluded.
* At least **three distinct agreeing trips** are needed before suggesting a correction. Geospatial distance uses haversine, time is compared in Asia/Kolkata; medians guard against outliers. Warnings: >50 m pin, >10 min time.
* No external GPS provider event ingestion is connected. **Absent verified data, summary displays “Awaiting verified GPS,” not invented numbers**. This is important: the reference’s figures (44 pins, 66 time warnings) cannot be asserted about our fleet without evidence.

## 3. Schedule calendar
* Right-aligned floating light-blue/lavender panel, month header, SVG previous/next buttons.
* SUN–SAT labels, correct 28/29/30/31-day monthly grids, per-day circular percentage indicators.
* **Real occupancy**: booked/eligible passenger seats divided by scheduled capacity over all active services on each date; never copied from screenshot. Data with no capacity shows a grey ring and em dash instead of false zero.
* Threshold styles: green ≥70%, amber 40–69%, red <40%. Currently selected day is purple, today outlined, date-specific holidays have amber backgrounds.
* Daily tooltip contains booked seats, total capacity, service count and holidays.
* `GET /api/schedules/month-insights?month=YYYY-MM` aggregates authorized schedule data.
* Bottom date list with types: Central government **gazetted**, **restricted**, and **observance**. Holiday entries are clickable to jump to day and include source URL.
* The holiday catalog is explicitly limited to verified **2026** entries; other years show *verified holiday data unavailable*, rather than implying comprehensive dates.
* **Correction from screenshot:** 2026 government restricted holiday lists show **Govardhan Puja on November 9**, not November 10. Diwali is November 8; Guru Nanak Jayanti November 24. Andhra Pradesh Formation Day and Children's Day are marked observances, not automatically public holidays.
* Government sources used for holiday metadata:
  - Central Government Delhi 2026: https://cgca.gov.in/ccadl/list-of-holiday
  - Govt restricted holiday 2026: https://cdaguwahati.gov.in/pages/restrictedholidays2026.aspx
  - Andhra Pradesh holiday context: https://www.cgca.gov.in/ccaap/list-of-holiday
  - Rashtrapati Bhavan Children's Day commemoration: https://dpl.rashtrapatibhavan.gov.in/public/

## Integration and QA
Source: `public/js/schedule-insights-v36.js`, `public/css/schedule-insights-v36.css`, schedule and route screenshot v6/v5 components, server API/ops, index wiring.

Automated tests: `node tests/schedule-insights-v36-api.cjs` and `node tests/schedule-insights-v36-ui.cjs`, existing screenshot checkers, `npm test`.

**Limitations to validate with an operator:** real GPS provider adapter is not configured, so the Bus halts screen does not yet have confirmed observed halts. The 2026 holiday catalog is date-bounded; additional years, state-local holidays and auto-updating holiday sources require a maintained provider/catalog. A browser pixel comparison at the reference resolution and operator UAT remain necessary for exact visual acceptance.
