# Reports v22 — Four-page screenshot/PDF element audit

## Scope and provenance

**Repository:** `Prajwal-sajan/GDS` · **base:** `savetrip-screenshotcomplete` after Reports v21 · **target:** add four existing Reports as operator-specific read-only analytics.

**Reference materials provided:** 14 screenshots covering Frequent Travellers, Point Performance, Station Performance and Trip P&L / Occupancy; 3 PDF exports for Frequent Travellers, Station Performance and Trip P&L. **No Point Performance PDF** or selected-point detail screenshot was provided, so only visible point ranking/initial state can be checked pixel by pixel. All reference screenshots are from November Travels; the GDS branch uses Demo Travels seeded or actual operator records and never embeds screenshot customers, fares, identifiers or aggregates.

Reference snapshot caveats: the screenshots and corresponding PDFs were generated at different times and contain slightly different counts. For example, Frequent Travellers screenshots show 10,635 of 39,017 and 32,815 trips, while its PDF shows 10,636 of 39,019 and 32,817 trips. Station Performance screenshots show 1,065 seats and 864 PNRs, PDF 1,069 and 868. Trip P&L screenshots show ₹11,16,886 net sales and ₹10,44,030 expenses, PDF ₹11,20,943 and ₹10,44,653. The app computes from a single filtered GDS snapshot; it does not replicate any reference aggregate by hardcoding.

## Shared navigation and visual language

- Preserve existing top Accounts tabs: Sales, Transactions, Receivables, **Reports**, Invoices, OTA Invoice Verifier, Agent Settings, Loyalty. Use back arrow and **Reports** breadcrumb; report title at left; right-aligned pill actions, blue **Print**, light-grey/pale-blue **PDF** and **Share**, plus **Excel** for Frequent Travellers.
- Same app blue/violet-gradient calendar buttons, date inputs, gray/blue filter dropdowns, rounded segmented filter chips, muted slate-blue notes, large white KPI tile grids, 15–20 px rounded white tables, subtle borders, horizontal/vertical scroll, pinned column heading and total footer, Indian ₹ formatting, narrow text labels, scroll bars.
- Apply filters by updating report URL. PDF and Excel download include the exact selected filters and are access-controlled. Print uses browser print CSS. Share uses native Share when available and otherwise copies the filtered URL.
- All filters are read-only and query values validated on server. The four reports do not alter or scrape the Savetrip server or third-party authentication.
- All four generated PDFs are landscape A4 with centered title, operator, generated timestamp, filter context, summary metrics, blue column bands, alternating white/pale-blue rows, repeated table headers, totals, automatic page breaks. The templates use standard Helvetica/Aptos-equivalent substitute fonts and do not claim proprietary font assets.

## Frequent Travellers — screenshot 1–2 and 6-page PDF

**Controls**
- Left back link and title **Frequent Travellers**; right **Print / PDF / Excel / Share**.
- Search box with magnifier **Search name or phone**; minimum Trips numeric input (default 2), maximum Trips input (any) separated by "to".
- Ranking switch: **Most trips**, **Top spend**, **Recent**.
- Result count switch: **Top 50**, **100**, **500**, **1000**, **All**.
- Two date pickers and **Last 12 months**, **Last 6 months**, **Last 3 months**, **This year**, **Last 3 years** presets.
- Methodology under filters: confirmed or completed bookings in period, imported OTAs included, per phone number.

**KPIs** (six): Passengers **N of total**, Trips, Spend, Avg / trip, Upcoming, Cancelled.

**Table 1: FREQUENT TRAVELLERS — TOP N OF M**
- `#`, Passenger, Phone, Trips, Travelled, Upcoming, Seats, Spend, Avg / trip, Cancelled, First trip, Last trip, Channels, Email.
- Sort by trips (descending) with spend tiebreaker; alternatively by spend or most recent trip. Search by phone/name. Top 50, 100, 500, 1000 or All. All/large results render incrementally to avoid freezing the browser, while PDF/Excel use the full selected set.
- Sticky scrollable header and total footer. Footer counts **shown** passengers/trips/seats/spend/cancellations, while KPI cards summarize the entire *qualifying cohort*.
- Dates and traveller count select on travel date; cancelled after being confirmed counted once per booking including partial cancellation. Actual email only from bookings and `—` if absent. No fabricated emails.

**Table 2: ALL PASSENGERS IN THE PERIOD BY TRIP COUNT**
- Six bands: 1 trip, 2 trips, 3–5 trips, 6–10 trips, 11–20 trips, 21+ trips.
- Columns Trips, Passengers, Share, Trips taken, Share of trips, Spend; total covers all passengers with at least one valid trip, not only filtered repeaters.
- Excel is a genuine two-worksheet `.xlsx`, not a CSV renamed XLSX.

## Point Performance — screenshots 3–4 (no PDF attachment)

**Controls**
- Back link; title **Point Performance**; Print/PDF/Share **disabled** until a point is selected (as in screenshot).
- **Pickup point / Drop point** segmented selector.
- Cyan **Select pickup point** / **Select drop point** dropdown; gray **All buses** dropdown; two dates and Last 7 days / This month / Last month.
- Methodology covering all sources, point names matching ignoring case/whitespace, sold / cancelled / no-show, share, rank, trips serving and on-time rules.
- Empty prompt "**Pick a pickup point above, or click one below.**" when no point selected.

**Ranking table: ALL PICKUP POINTS / ALL DROP POINTS**
- `#`, Pickup/Drop point, PNRs, Seats, Share, Trips booked, Seats/trip, Revenue.
- Count and total footer; independently scrollable; rows are clickable and keyboard-accessible to select the point.
- Names normalized only for case and whitespace, so not silently equating unrelated stop names.

**Selected-point behavior** (designed from visible definitions, since its screenshot/PDF was not provided)
- Displays point name and KPI tiles for PNRs, Seats, Share, Trips booked, Seats/trip, Revenue, Rank, Trips serving, Cancelled, No-shows, and on-time % only where GPS stop timestamps exist.
- Breakdown by schedule, by booking source and daily. Allows PDF generation for selected point, mirroring the shared report style.
- Source-backed GPS only. Without arrival stamps, on-time rate stays blank rather than being fabricated.

## Station Performance — screenshots 5–10 and 3-page PDF

**Controls**
- Back link and title; Print/PDF/Share; **All schedules** selection; **All buses**; two date fields; Last 7 days / This month / Last month.
- Methodology "All sources, by travel date. Station = stop city. Trips serving = trips stopping at both. End-to-end = schedule start to end city."

**KPIs** in screenshot order:
1. Seats; 2. PNRs; 3. Revenue; 4. Avg fare / seat; 5. Station pairs sold; 6. Stations;
7. Trips (N schedules); 8. Seats / trip; 9. End-to-end seats (count and %);
10. Cancelled (count and %); 11. No-shows (count and %).

**Seven distinct sections and all columns**
1. **STATION PAIRS**: From, To, PNRs, Seats, Share, Avg fare, Revenue, Trips serving, Trips booked, Seats/trip, Cancelled, No-shows, Schedules.
2. **BOARDING STATIONS**: Boarding station, PNRs, Seats, Share, Avg fare, Revenue, Top destination.
3. **DROPPING STATIONS**: Dropping station, PNRs, Seats, Share, Avg fare, Revenue, Top origin.
4. **BY SCHEDULE**: Service, Route, Dep, Trips, PNRs, Seats, Seats/trip, Avg fare, Revenue, Pairs, Top pair, End-to-end.
5. **STATION PAIRS BY SCHEDULE**: Service, From, To, PNRs, Seats, Avg fare, Revenue, Trips serving, Trips booked, Seats/trip, Cancelled, No-shows.
6. **BY BOOKING SOURCE**: Source, PNRs, Seats, Share, Avg fare, Revenue.
7. **DAILY**: Date, Day, Trips, PNRs, Seats, End-to-end, Revenue, Cancelled.

**Calculations**
- Passenger seats and revenue from confirmed bookings including OTA channels, keyed by origin/destination city ID, filtered by travel date and optionally selected route or bus.
- Trips serving = active scheduled runs where both cities occur in route order, with or without bookings; trips booked = unique runs actually booked for that pair.
- End-to-end = bookings from route origin city to destination city; canceled rate = cancelled PNRs divided by confirmed + cancelled PNRs; no-show rate = no-show seats / sold seats.
- Cross-check sum by source, station pair, boarding, dropping and schedule against headline seats/revenue. No static screenshot totals.

## Trip P&L / Occupancy — screenshots 11–12 and 2-page PDF

**Controls**: Back link, title **Trip P&L / Occupancy**, Print/PDF/Share; **All drivers / staff** and **All buses** filters; two date fields; Last 7 days / This month / Last month.

**KPIs**: Trips (running), Occupancy, Net sales, Expense, Profit, Loss trips.

**TRIP-WISE P&L** table:
Date, Dep, Service, Route, Bus, Seats, Occ, Net sales, Expense, Profit.

- Running trip shows `seats/capacity` and occupancy %. Turned-off trip displays `Turned off`, seats/occupancy `—`, and configured fixed costs only.
- All scheduled rows appear, including off trips; KPI Trips counts running ones. Sticky footer includes `all scheduled rows`, summed seats/capacity, net sales, expenses and profit.
- Net sales and trip expenses come from the existing shared `Rp.tripPnl` source of truth; report profit is net sales minus expenses, as shown in reference. Cancellation charges are not added into this particular displayed profit figure. `Loss trips` counts rows with negative displayed profit, including turned-off trips with fixed costs.

## API and verification

- 4 secured JSON endpoints: `/api/accounts/reports/{key}`
- 4 binary PDF endpoints: `/api/accounts/reports/{key}.pdf`
- 4 section CSV endpoints via `?format=csv&section=…`
- Frequent Travellers also has `/api/accounts/reports/frequent-travellers.xlsx`; XLSX includes full filtered Top N + all-period distribution.
- `/api/accounts/reports/v22/options` for the schedule, bus and staff choices; point choices are data- and date-dependent and supplied in its response.
- CLI acceptance tests cover all four reports, point selection, counts, date/ranking/limit settings, P&L cross-checks, XLSX signature, PDF orientation, access-control failures and invalid queries.
- JSDOM tests inspect the controls and all tables; GitHub Actions runs existing v21 report tests and full GDS regression suite and independently extracts/renders PDFs and parses XLSX sheets with Python XML tooling.

## Remaining distinction between reference and implementation

Exact pixel parity cannot be independently certified without a live browser comparison against your Savetrip session. A Point Performance export was not attached, nor was a selected point screenshot. Point's selected-state design and PDF are implemented to the available definitions and common style, but were not copied from unseen reference material. Existing GDS source data may lack email, GPS stop timestamps or historical imported booking records; those values are intentionally blank or operator-data-dependent rather than synthetic.
