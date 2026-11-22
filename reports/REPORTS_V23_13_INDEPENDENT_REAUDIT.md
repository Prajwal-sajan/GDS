# GDS Reports v23 — independent second-pass audit across all 13 report types

**Based on:** 38 mounted Savetrip screenshots and 10 original PDF attachments (48 reference pages); the merged GDS v20, v21 and v22 source; the eight-report and four-report audit inventories. This is a source-to-implementation audit, **not a claim of pixel-perfect parity against an inaccessible live Savetrip DOM**.

Reference PDFs present: Fleet Operations (4 pp), Boarding & Dropping Points / point usage (13), Cancellations (4), Driver Behaviour (3), Expenses (3), Metro Bookings in Metro pickup mode (9), No-shows (1), Frequent Travellers (6), Station Performance (3), Trip P&L / Occupancy (2). **No original PDF was supplied/available for Staff Duty Statement, Pickup Van Bookings, or Point Performance**. Their screenshots and shared formatting rules are still included in the audit.

## Global design / workflow matrix

Each of the 13 screens must preserve the existing Accounts navigation tabs (Sales, Transactions, Receivables, Reports, Invoices, OTA Invoice Verifier, Agent Settings, Loyalty), back-to-Reports breadcrumb, report title, blue primary Print action, pale PDF and Share actions, rounded gray/cyan selectors, two white date inputs with violet calendar blocks, period switch, muted explanatory note, white bordered KPI grid, blue-gray uppercase subheadings, independently scrollable tables, sticky column headers and sticky footers. Report-specific disabled actions and the Frequent Travellers Excel action are exceptions.

Date filters are on travel date. Report URLs and secured export routes must preserve every filter, including selected driver, bus, schedule, mode, point and customer cohort where relevant. The PDFs preserve landscape/portrait reference orientation, operator title, generated timestamp, blue repeated headers and summary totals. Export values must be computed from the same filtered source as the screen and **not** from static reference numbers.

| # | Report | Original PDF | Required filters and actions | KPI/section completeness | Second-pass status / verified gaps |
|---|---|---|---|---|---|
| 1 | Fleet Operations | 4 pages | Driver/staff, bus, dates, 3 presets; Print/PDF/Share | 12 KPIs; by bus, by driver, driver × bus, daily, trip-wise | v20 structure implemented; v23 forces diesel source to reconcile with Trip P&L and Expenses |
| 2 | Staff Duty Statement | Not available | Required staff, bus, dates, presets, disabled actions until staff selected | Empty selection state; trip details with scheduled/actual pickup/drop, km/L, bus benchmark and daily halt/worked | v21 structure; v23 derives lateness from actual/scheduled timestamps when delay field absent, with correct timezone and paired-km/fuel guards |
| 3 | Boarding & Dropping Points | 13 pages | Bus, dates, presets, exports | 5 KPIs; boarding, dropping, boarding→dropping pairs, totals | v21 includes all pair rows (no 50-pair cut-off), own-source restriction, exact stage labels; no forced reference totals |
| 4 | Cancellations | 4 pages | Bus, dates, presets, exports | 8 KPIs; 13 visible columns from Date through Recovered; total | v21 event-based cancellations, seat-level resale must have later same-seat booking evidence; no invented recoveries |
| 5 | Driver Behaviour | 3 pages | Staff, bus, dates, presets, exports | 5 KPIs; worst-score-first drivers and trip-wise tables, Shared, hard brake, harsh accel, duration, speed, freerun | **v23 fixes** duration as h/m, speed in km/h, no fake minutes from event count, scoring only with sufficient penalty inputs or supplied score, ignores still-running trips |
| 6 | Expenses | 3 pages | Bus, dates, presets, exports | 8 KPIs; by category, by bus with top expense categories+Other, trip-wise rows | **v23 fixes** completed-trip telemetry diesel / explicit override source precedence and reconciliation with Fleet and P&L |
| 7 | Metro Bookings | 9 pages | Pickup+Drop / Metro pickup / Metro drop, bus, dates, presets, exports | 9 KPIs; metro pickup, metro drop, daily, 12-column PNR table | **v23 fixes** explicit imported feeder labels, no charge on unsent link URL alone, actual billed leg count, ticket-based fare/pax, charged-after-cancellation rows, combined mode dedup |
| 8 | No-shows | 1 page | Bus, dates, presets, exports | 4 KPIs; 12-column no-show table | v21 no-show marks and timestamp-backed same-seat resale/recovery, no assumed proceeds |
| 9 | Pickup Van Bookings | Not available | Pickup+Drop / Van pickup / Van drop, bus, dates, presets; empty state | 7 KPIs; 11 PNR columns, empty state, assigned feeder vans | v21 structure; **v23 recognizes explicit Pickup Van stage labels** where feeder metadata is unavailable, never invents vans |
| 10 | Frequent Travellers | 6 pages | Name/phone search, min/max trips, Most trips/Top spend/Recent, 50/100/500/1000/All, five date presets; Print/PDF/Excel/Share | Six KPIs; 14-column ranked passengers and 6-band all-passenger trip-count table | v22 full implementation, true XLSX, dynamic entire qualifying set and truthful data; reference PDF differs slightly from screenshot due snapshot timing |
| 11 | Point Performance | Not available | Pickup/Drop point, selected point, bus, dates, presets; Print/PDF/Share disabled without point | Ranking 8 columns; selected point KPI and schedule/source/daily | v22 initial and selected implementations; **v23 corrects offset-aware GPS on-time**. Pixel-level selected-state PDF is unverified without source |
| 12 | Station Performance | 3 pages | Schedule, bus, dates, presets, exports | 11 KPIs; **seven** tables: station pairs, boarding, dropping, by schedule, pairs by schedule, booking source, daily | v22 contains all seven, 13-column station pairs, seat-share and by-source reconciliation, source-based cancel/no-show |
| 13 | Trip P&L / Occupancy | 2 pages | Staff, bus, dates, presets, exports | 6 KPIs; date/departure/service/route/bus/seats/occ/net/expense/profit | v22 active and turned-off rows, fixed-only off-trip expense; **v23 shares diesel source with Expenses and Fleet** |

## Calculation / data lineage requirements

- **Ownership and filter boundaries:** point usage is own-channel only; Station, Metro, Point Performance and customer ranking include OTA source data; each scope is implemented separately. Never aggregate PNRs from different trips as a single booking. Canonical seats = surviving booking passengers; keep original cancel/no-show events separately.
- **Revenue:** do not substitute screenshots' rupee figures. Use underlying booking and P&L records. Trip P&L + Expenses + Fleet diesel must resolve from the same trip expense breakdown; the per-trip P&L's explicit override wins over completed-trip telematics, which wins over the route default.
- **Driver alerts:** raw over-speed and idling events are not minutes. A score without a provider score requires all formula inputs to be measured. Render durations in hours/minutes and top speed in km/h; two assigned drivers each get full trip credit as in the screenshots.
- **Metro billable leg:** point metadata, explicit 'Free Metro Pickup' or 'Pickup Van' label, or actual ticket billing must justify feeder classification. A mere stored link URL does not establish that the link was sent. Billed leg count increments for each charged pickup/drop leg; fare and metro pax require actual billing evidence. A PNR cancelled after the link remains in billing. Combined Pickup+Drop mode counts the booking once.
- **Stop timings:** compare actual offset-aware GPS timestamps in the Indian operator local clock, including overnight stops. An arrival more than 8 minutes late is late. Without GPS/Intangles arrival stamps the on-time percentage is unknown, not presumed zero.

## Acceptance gates

The new semantic audit test covers 13 catalog keys, source-backed summaries, attendance and boarding-time edge cases, supplied-vs-computed driving scores, duration units, telemetry diesel and overrides, Metro billing and cancelled-after-link, ticket fares, empty Van state, station breakdown reconciliation, cancellation/no-show totals and frequent-traveller distribution.

CI additionally executes the existing v20/v21/v22 tests, full GDS regression, report PDFs through Poppler extraction/preview, and XLSX XML/ZIP checks. Samples are produced from seeded GDS data and must not be confused with the supplied reference operator's actual numbers.

## Material limitations

- **10, not 13, original PDFs are available.** No Staff Duty, Point Performance, or Pickup Van original PDF can be reverse-matched page-by-page.
- Source screenshots and PDFs were taken at different times and contain different totals. This is a real snapshot difference, not an arithmetic bug to "fix" using hardcoded numbers.
- Live end-to-end certification additionally requires a real operator database, imported OTA history, actual stop/GPS/Intangles records and Metro billing/van assignments. Automated seeded-data and static DOM tests cannot certify actual third-party integrations or pixel-identical typography.
