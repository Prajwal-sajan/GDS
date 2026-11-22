# Reports v21 — Detailed screenshot and PDF reconciliation

Source basis: user screenshots captured 20 November 2026 and six attached PDF exports. The screenshot values belong to the operator shown in those files, whereas the GDS branch uses operator-specific data supplied by its own API. No reference values, passenger names or telematics evidence are hardcoded into the application.

## Global reference design (all eight reports)

1. Accounts menu remains Sales · Transactions · Receivables · **Reports** · Invoices · OTA Invoice Verifier · Agent Settings · Loyalty.
2. Top bar: blue left-arrow Reports link, dark page title, Print blue pill, PDF pale-blue pill, Share pale-blue pill. If Staff Duty has no staff selection, all three buttons are disabled as in the screenshot.
3. Filter row: grey bus dropdown, optional staff dropdown, two white date inputs with violet gradient square calendar icons, subtle preset segmented buttons (Last 7 days / This month / Last month). Selected staff input uses light cyan rather than grey.
4. Optional feeder-mode segmented control appears before the filters, with three selectable modes: Pickup + Drop, Metro/Van pickup, Metro/Van drop.
5. Methodology/caveat paragraph below controls in muted slate blue. KPIs in white rounded bordered grid, pale vertical separators, dark large values, Indian number grouping and ₹.
6. Section headings uppercase muted slate text, small count after dot. White rounded independently scrollable tables, sticky column headers, sticky total rows, subtle row dividers, horizontal scroll for wide tables and vertical scroll for long rows.
7. Print uses print CSS with hidden menu/actions/filters; PDF uses a real authenticated binary download; Share attempts native share and otherwise copies a URL that retains all selected filters and mode.
8. All reports are read-only. Access requires `accounts.reports`. Staff, bus and date filters are validated server-side and preserved on PDF/CSV downloads.
9. Reference PDFs use centered title and operator header, generated timestamp, summary on the left/right, blue header table bands with white text, alternating very-light-blue/white rows, grey totals and repeating headers after pagination. The new PDFs use the same structural language and the same filtered numbers as the screen.

## 1. Staff Duty Statement

Screenshot captured at state **no staff selected**:
- Title Staff Duty Statement; staff selector "Select driver / staff" highlighted cyan; all buses; two calendar dates and three presets; Print/PDF/Share disabled; large rounded white empty-state "Select a driver or staff member to see their statement".
- Note: assigned trips, Daily Ops per trip, halt definition, pickup/drop scheduled and actual, late at 8+ min, paired trip km and fuel, bus-average comparison.
- Selected state implemented: worker profile; KPIs Trips, Working days, Halt days, Km, Fuel, Mileage, Late pickups, Trips turned off; trip detail and daily summary, status Worked/Halt, pickup and drop scheduled/actual, bus average and deviation.
- Actual stop times are presented only when `stop_events` contain records; no fake Intangles readings. Halt day only when no worked trip assigned that day.
- **No Staff Duty PDF was attached**. The PDF follows the common landscape theme, but exact page-by-page parity is not verifiable from the screenshot alone.

## 2. Boarding & Dropping Points

Reference: `point-usage_2026-11-14_2026-11-20.pdf`, **13 A4 portrait pages**.
- In screenshot, example reference summary: Bookings 863, Seats 1,064, Amount ₹11,71,575, Boarding points 101, Dropping points 43.
- In PDF, generated a few minutes later, the values are Bookings 867, Seats 1,068, Amount Rs. 11,75,257, Boarding points 101, Dropping points 43. The screenshot/PDF are therefore different snapshots. **Do not force the GDS to match either snapshot**.
- Three sections: **Boarding Points**: Boarding point, Bookings, Seats, Share, Days used, Amount; **Dropping Points** same columns; **Boarding → Dropping**: Boarding, Dropping, Bookings, Seats, Amount.
- Crucial fix: old GDS discarded all but 50 point pairs. v21 retains all pairs (reference screenshot has 454); no imposed display/data truncation.
- Preserve exact imported stage labels, including spelling variations; aggregation uses same stage name. The report is restricted to eligible direct/own booking channels, not OTA imported records, and uses travel dates.

## 3. Cancellations

Reference: `cancellations_2026-11-14_2026-11-20.pdf`, **4 A4 landscape pages**.
- Reference summary: Cancellations 70, Seats 81, Amount Rs. 95,614, Charges kept Rs. 28,160, By operator 35, Bookings resold 39 (55.7%), Seats resold 46, Recovered Rs. 57,661.
- Columns: Date, Service, PNR, Passenger, Phone, Boarding, Source, By, Seats, Amount, Charge, Resold, Recovered. Separate horizontal/vertical scrolling with a sticky total.
- Cancellation values from saved cancellation events, including partial seat cancellations. Resold is verified only if the *same seat on the same trip* is sold *after cancellation*, and recovered is the price of the new seat sale. The absence of evidence is not fabricated into revenue.
- The screenshot/PDF use historical reseller records not included in seeded demo data; therefore live GDS totals will differ.

## 4. Driver Behaviour

Reference: `driver-behavior_2026-11-14_2026-11-20.pdf`, **3 A4 landscape pages**.
- Summary: Trips recorded 26/31, Drivers 14, Avg driver score 95, Below 65 0, Trips without driver 0.
- "DRIVERS (WORST SCORE FIRST)" columns Driver, Phone, Trips, Shared, Km, Score, Hard brake, Harsh accel, Over-speed, Top speed, Idling, Freerun, Buses. Total footer.
- "TRIP-WISE" columns Date, Dep, Service, Route, Bus, Drivers (phones and Shared), Km, Score, Hard brake, Harsh accel, Over-speed, Top speed, Idling, Freerun. Total footer.
- Shared-trip driver receives full score/alert allocation, not divided by number of drivers. Driver records sorted by ascending score.
- Critical source limitation: the GDS seed has `over_speed` and `idling` numeric fields without explicit time units, so the UI must **not** display these as minutes. Where minute fields are available, show minutes; otherwise `—`, even when raw alert counts exist. Recorded scores are used when available; otherwise the stated score formula requires valid source values.

## 5. Expenses

Reference: `expenses_2026-11-14_2026-11-20.pdf`, **3 A4 landscape pages**.
- Reference PDF's total Rs. 10,44,653, Fixed Rs. 1,89,602, Running Rs. 8,55,051, Channel commission Rs. 1,65,956, per trip Rs. 33,698; 31 running trips, 11 off.
- Screenshot total differs from PDF (screenshot Rs. 10,44,030), due to generated snapshot differences. The report must use **GDS P&L data**, not either reference total.
- Three tables: **By Category** with Category, Type, Amount, Share, Trips, Avg / trip; **By Bus** with Bus, Trips (including `+ off`), dynamically largest categories (Diesel, Channel commission, EMI / Loan, Driver Bata, Tolls, AITP Permit, Office Salary, Helper Bata), Other and Total; **Trip-wise** with Date, Dep, Service, Route, Bus, same categories, Other and Total.
- Turned-off trip includes configured fixed expenses only; active trip uses the same P&L expense breakdown and channel commission. Dynamic category selection preserves different operators' expense definitions. Totals reconcile by category, bus and trip-wise.

## 6. Metro Bookings

Reference: `metro-bookings_Metro-pickup_2026-11-14_2026-11-20.pdf`, **9 A4 landscape pages**.
- Filter presets plus **Pickup + Drop / Metro pickup / Metro drop** segmented control.
- In PDF Metro pickup mode: Metro PNRs 124, Seats 172, Revenue Rs. 1,78,293, Billed metro legs 124, Metro pax 172, Metro fare Rs. 8,833, With metro pickup 124, Both legs 0. The screenshot has slightly different numbers.
- **Metro pickup points** (Boarding point, PNRs, Seats, Revenue); **Metro drop points** (Dropping point, PNRs, Seats, Revenue) when relevant; **Daily** (Date, PNRs, Seats, Revenue); **PNRs** (Date, Service, Bus, PNR, Source, Metro, Boarding, Dropping, Seats, Metro pax, Metro fare, Revenue).
- PNRs with either leg are de-duplicated in combined mode. Real metro ticket/billing records are required for true fare and billed count. Original GDS previously used a synthetic ₹20/seat estimate; v21 does not invent a fare or treat a link sent as a ticket issued.

## 7. No-shows

Reference: `no-shows_2026-11-14_2026-11-20.pdf`, **1 A4 landscape page**.
- Screenshot and PDF summary: No-shows 3, Fare Rs. 3,201, Seats resold 0 (0%), Recovered Rs. 0.
- Columns: Date, Service, Bus, PNR, Passenger, Phone, Boarding, Source, Seat, Fare, Resold, Recovered. Footer has counts, total fare, resale count and recovery.
- Only seats whose passenger is marked `no_show` count. To prove resold/recovered, the source must provide an actual no-show timestamp and a later booking of the same seat/trip. When such a timestamp is missing in the existing GDS, the resale field is rendered as unavailable, not guessed.

## 8. Pickup Van Bookings

Screenshot includes mode tabs, bus filter, dates, presets and explanatory paragraph. Reference screenshot has no booking records: Van PNRs 0, Seats 0, Revenue ₹0, With van pickup 0, Both legs 0, Vans used 0, PNRs without van 0.
- **PNRs** columns Date, Service, Bus, Van, PNR, Source, Van leg, Boarding, Dropping, Seats, Revenue. Empty state "No data for this period".
- Pick-up/drop/both controls filter actual feeder stage flags. Pickup Van assignment is displayed only where recorded, else "Not assigned".
- **No Pickup Van PDF was attached**. A matching landscape PDF is generated, but exact proprietary document layout is not verifiable without a sample.

## Verification and caveats

- Data is sourced from live operator-specific GDS records; no November Travels sample data copied into demo.
- `GET /api/accounts/reports/v21/options` returns permitted staff and bus choices. Each report supports a secured JSON, CSV and `*.pdf` endpoint with identical filters. The existing Fleet Operations v20 remains untouched.
- `node tests/check-reports-suite-v21.cjs` covers all eight aggregation engines, staff selection, role permissions, filters, sanity checks, CSV, orientation and PDF validity.
- `node tests/reports-suite-v21-ui.cjs` verifies section counts, controls, metric labels, nested report layout, filter URL retention and disabled state.
- `.github/workflows/reports-suite-v21.yml` runs both test suites and the original repository regression suite, then independently reads and renders sample PDFs with Poppler, posting preview artifacts.
- Exact pixel-level equivalence of proprietary fonts/source JavaScript is not asserted. Source telemetry, timestamps, invoices and Metro ticket records not in the GDS cannot be represented as actual measurements.
