# JourneyOS GDS v37 — screenshot comparison and implementation audit

## Reference 1 — GDS → Accounts → Sales: All Sectors dropdown
Screenshot supplied 23 Nov 2026.

- Screenshot: Accounts, Sales active; Travel Date and Booking Date controls, By Sector/By Service/P&L grouping; Start and End date; All Sectors dropdown between pivot and All Services; All Channels below; Print button; KPI cards; date-sorted financial matrix.
- Screenshot All Sectors menu has exactly the currently present directions: All Sectors, Hyderabad → Bengaluru, Bengaluru → Hyderabad. Each row uses single-line ellipsis. The selected All Sectors row has blue-purple gradient and check SVG, while the closed trigger has pin SVG, blue outline and chevron.
- v37 implements a real directional-sector list from /api/accounts/sales-facets (unique origin ID / destination ID pairs, rather than fixed screenshot text); options will match screenshot only for the equivalent operator/route dataset.
- Selection is keyboard and mouse accessible (Enter, Space, arrows, Home/End, Escape, outside-click closure, focus). Selected state and aria expansion are exposed; dropdown is clipped visually with title tooltips on truncated routes.
- Sector selection changes the URL; service is preserved when compatible, or cleared when it belongs to the other direction. Service options are populated from actual route definitions.
- /api/accounts/analytics accepts sector and service and applies them to bookings, schedules, capacity, daily rows, source contributions and sector/service breakdowns. Channel selection keeps scope. The source data is the existing GDS booking engine; KPI values are not replaced with screenshot numbers.
- Grouping pivots remain functional: By Sector, By Service, P&L, or the date view when a selected pivot is clicked again. Print and date input actions remain native.
- Field presentation: Gross sales, Cancel charges, Offers, Net sales, Bookings, ASP, Occupancy, Fleet Util, GST Payable. Existing table source fields are preserved (the screenshot has a finer Pax/BO cancellation split not present as a separate trusted backend breakdown).
- **No screenshot figures or fabricated routes are imported.** The screenshot is visual/interaction reference only.

## Reference 2 — GDS → Vehicles → Coaches: three-column cards
Screenshot supplied 23 Nov 2026.

- Screenshot: Vehicles / Coaches selector with Coaches active; summary metrics Coaches, AC, Sleeper, Seater, Video; search by name/type; AC filter; All berths dropdown; sort A–Z; Showing N of N; list/grid toggle with GRID selected; Add Coach.
- Screenshot card layout: 3 columns on wide desktop, 2 rows of six coaches. White cards with 20 px corner radius, grey border and shadow. Coach SVG in pale violet square, bold coach name with ellipsis and alternate-name chip. Green Active toggle aligned right.
- Meta subtitle: Regular · 2+2 or Pickup Van · 2+2. Light-grey 2-column box for seat counts and feature badges (AC). Footer separated by hairline, right-aligned colored SVG actions (view, edit, duplicate, delete). Counts display Seater and Sleeper separately for mixed coaches, no invented data.
- v37 uses existing coach records and preserves all v9 filters, live status PUT, actions and modal drilldown. Visual grid is now the default; the list button still works. View choice persists locally per Vehicles or Coaches.
- Coaches with Video amenities show a Video chip. Permissions continue to hide unauthorized actions.
- Vehicles use the same 3-column card visual language while retaining GPS status, location, odometer, fuel, health, alerts, active toggle and existing view/edit/duplicate/delete actions; live GPS availability is not invented.
- Responsive adaptation: 3 columns ≥1381 px, 2 columns on tablets, 1 column on small screens.

## Source and verification
- Frontend: `public/js/accounts-sales-v37.js`, `public/js/vehicle-cards-v37.js`, amended `public/js/accounts-parity-v10.js` and `public/js/vehicles-parity-v9.js`, CSS `public/css/accounts-vehicle-cards-v37.css`.
- Backend: `server/api/accounts.js`, `server/reports.js`.
- Acceptance: `node tests/accounts-vehicle-cards-v37-api.cjs`, `node tests/accounts-vehicle-cards-v37-ui.cjs`, prior v9/v10 checks, full `npm test`.
- **Known distinction:** screenshots come from a different SaveTrip operator dataset, so actual coach count, active statuses, dates, sector count and financial figures vary. End-to-end pixel comparison in an authenticated operator browser remains an additional visual acceptance task; server-side/DOM tests alone cannot certify exact pixel parity.
