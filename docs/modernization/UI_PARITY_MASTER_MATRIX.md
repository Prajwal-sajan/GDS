# Chief Product Architect — React migration parity register

**Target:** modernization/react-dotnet-postgres  
**Original UI reference:** savetrip-screenshotcomplete  
**Delivery branches:** feature/modern-ui-schedules-seatmap-parity-v1 (v1), feature/modern-gds-parity-v2-routes-shell (v2), feature/modern-gds-parity-v3-pnl-share (v3), feature/modern-gds-parity-v4-bookings-dailyops (v4)

This register deliberately separates **implemented** from **tested**, **full behavioral parity**, and **pixel-level visual parity**. New user-interface work is a migration increment, not a complete GDS replacement.

## Module status

| Module | Legacy implementation | React/.NET status | Remaining gate |
| --- | --- | --- | --- |
| Routes | routes-screenshot-v5.js, route-parity.js | **Core migrated in v2**: create/edit, cities, stages, fares, coach selection, cancellation controls, generate/clone | Legacy visual/dialog parity, route calendars, refund slab editor, restrictions, all old options |
| Schedules listing | schedules-screenshot-v6.js | Added real date/service list and Manage modal | Screenshot visual acceptance and list actions parity |
| Schedule Manage Bookings | schedule-manage-v48.js, schedule-bookings-v38.js | Added typed React seat map, PNR booking chart, segment selection, blocks | Detailed popup/booking actions, historical timeline |
| 2+1 coach diagram | coach-2plus1-v46.js | Ported 46-seat geometry and legacy-coordinate projection | Physical browser screenshot comparison |
| 2+2 coach diagram | coach-2plus2-v47.js | Generic native geometry support | Dedicated fixture and snapshot parity test |
| Seat image Copy | seat-layout-copy-v49.js | New native typed SVG→PNG clipboard | WhatsApp paste and browser permission UAT |
| Share booking URL | schedule-booking-share-v50.js | **v3:** authenticated route/date link and clipboard copy with Day-2 boarding dates, explicit per-tenant HTTPS site and city-ID mappings | Modern Settings Website configuration UI still pending; real passenger website and WhatsApp paste UAT required; no exact service deep link guaranteed |
| Schedule Manage Update | schedule-update-v51.js | Basic vehicle/staff editor using real .NET assignment API | Provider settings, route sync, cab policies, complete form/details parity |
| Cities, Pickups and Drops | schedules-screenshot-v6.js | Read-only source-backed tabs | Real edit/cutoff/booking impact workflows |
| Fares | schedule-parity.js | Read-only in Manage, existing Fares editor retained | Full fare variants and visual parity |
| P&L and History | schedule-pnl-v18.js, schedule-manage-v48.js | **v3 P&L:** server-backed income/actual/estimated expenses/indicative profit, audited trip expense entry, CSV export/print; **v2 History** uses actual audit timestamps | Legacy trip override/version workflow, editable source allocation, full historical booking events, pixels and accounting reconciliation remain outstanding |
| Bookings/Ticketing | booking-ticket-v38.js | **v4:** Native React PNR desk, authorized private passenger/payment details, boarding changes, quote/cancel, whole-PNR shift; server transaction reused | Full original ticket dialog/print layout; counter-booking creation parity; search/filters; provider status & balance adjustments; all legacy dialogs; no real browser screenshots |
| Vehicles and Coach Editor | vehicles-parity-v9.js, vehicle-detail-v19.js | Partial Fleet | Full coach editor and vehicle screens |
| Staff | staff-parity-v11.js | Partial Staff | Payroll/docs/assignment editor parity |
| CRM/Communications | crm-screenshot-v8.js, communications-access-parity.js | **v4:** Core modern CRM/Chats plus dedicated top-level Calls UI (real logged records, filters, PNR drill-through, manual logging); no fake telephony connection | Full original CRM, Chats & Calls popups/statuses, official provider integration and screenshot parity remain outstanding |
| Accounts/Invoices | accounts-parity-v10.js, invoices-v24.js | Partial Ledger/Reconciliation | Original financial report/invoice UI and filters |
| Daily Ops | dailyops-parity-v12.js | **v4:** Native React date-based dispatch, sales, compliance, no-shows, ratings; operator-only PII reports; PNR deep navigation | Exact legacy console/screenshots, boarding and dispatch controls, exports, operational actions not yet migrated |
| Reports | report-suite-v21.js and v22.js | Partial modern Reports | All legacy filters/exports/visuals |
| Settings/Team Access | settings-complete.js, configuration-v30.js | Partial IAM | Configuration, branding, roles matrix |
| Sarathi | sarathi-parity-v12.js | Partial | Original workflows and visual parity |
| RedBus OTA | Official provider sample | Implemented structure, not provider certified | Contract ambiguities, sandbox UAT, reliability fixes |

| Main GDS navigation | public/js/main.js TOP/SUB, public/css/app.css | **Native React source-inspired shell in v2** | Pixel and responsive parity, original user menu/settings/control room dropdowns still missing |

## Actual delivered scope

- New authenticated .NET segment-specific seat-layout read endpoint, based on InventoryService.SeatStatesAsync and current PostgreSQL allocations.
- New PNR booking chart endpoint that excludes passenger phone, email and payment references.
- Native React lower/upper physical coach layout with steering, emergency exit, seat types, status legend and aisle positioning.
- Legacy 2+1 geometry projection without modifying seat codes or booking records.
- Re-fetched image snapshot and PNG clipboard/download fallback.
- Schedules listing and Manage modal for Bookings/Block, Update, Cities, Pickups, Drops and Fares.
- Block action carries selected segment boundaries to existing server business logic. Release action warns that the existing unblock API releases all operator blocks for that seat across the trip.
- Assignment changes require a reason and use the existing backend service.
- Data-dependent controls for which modern .NET parity does not exist remain explicitly unavailable, not simulated.
- New TypeScript/Playwright source tests; real PostgreSQL-backed .NET endpoint tests.
- CI synthetic fixture generation isolated from any operator data.
- **v2:** Native React Routes authoring with 0-based city sequences, days/timings, pickup/drop stages, route fare matrix, publication status, booking/cancellation guards, coach selection and protected schedule generation.
- **v2:** PostgreSQL transactional route validation, audited creation/editing, cross-tenant coach/city guards, route structure locks once trips exist; new modern route IDs generate sequential trip IDs without breaking legacy route IDs. Existing services remain unchanged.
- **v2:** Source-inspired React pill navigation preserving the major GDS menu order, without iframe or old HTML injection.
- **v2:** Audit-backed Schedule Manage History shows only timestamps backed by persisted trip events; missing historical records are not fabricated.
- **v2:** Visual comparison tool `modern/frontend/visual/capture-compare.mjs` can produce real legacy-vs-React screenshots, pixel diff and mismatch report when authenticated URLs and identical test data are supplied. **No pixel fidelity score has been verified yet.**
- **v3:** Passenger-facing booking link Share is now backed by an authenticated ASP.NET Core service with no default website, validated HTTPS hostname, explicit operator-specific city-ID mapping, selected route segment, boarding-date rollover and clipboard manual fallback. The link is a **route/date search**, not an exact bus deep link.
- **v3:** Schedule Manage P&L is now rendered from the existing PostgreSQL-backed ReportsService.TripPnlAsync, with actual/estimated expense provenance, audited actual expense entry, browser print and CSV export with formula injection protection. OTA commission is deliberately excluded without verified settlement evidence.
- **v3:** Added PostgreSQL/API tests covering cross-tenant Share, canonical reference message, external site validation and financial expense/P&L consistency, and Playwright tests covering Share permission fallback and P&L action wiring.
- **v4:** Added native Tickets and Daily Ops React pages linked in the GDS navigation. Ticket desk uses existing PostgreSQL-backed booking/boarding/shift contracts; operator-originated cancellation adds a non-mutating quote and a server-revalidated transaction that records an audit event and refund obligation but **not** gateway payout. Real provider-owned OTA tickets cannot be cancelled through this UI. Daily Ops uses the existing database reporting endpoint with role-restricted passenger/crew access, searchable fleet, operational dates, compliance flags, sales channels and PNR drill-through. New Playwright wiring tests and PostgreSQL/API booking-safety tests are included in modern-ci.
- **v4 global navigation follow-up:** Restored Calls as the original fourth top-level pill, with its original SVG path and a dedicated source-backed React call history/manual logging console; messaging/telephony provider connection is explicitly absent. `modern/frontend/e2e/calls-parity.spec.ts` verifies navigation, filtering, manual logging and booking drill-through.
- **v4 acceptance remains pending:** this release is **partial**; current UI screens are not pixel-validated against user-provided screenshots, provider/settlement accounting and role UAT remain independent release gates.
- **v3 security hardening:** Booking PNR details now require the dedicated booking-detail permission (owner/admin/ops/accounts), excluding general viewers. Ops sees payment amounts/status but not gateway references or OTA commission evidence; accounts roles retain finance visibility. Responses are marked private/no-store. HTTP tests cover role and tenant isolation.
- **v2:** Explicit fail-closed `modern/release-readiness.json` and `modern/scripts/check-release-readiness.mjs`. It intentionally prevents a production cutover while required evidence is missing.

## Non-negotiable gates before retirement of original GDS

1. All legacy UI menus, screens, controls, popups and status variants inventoried and mapped to React components.
2. Full operator workflow parity for Routes, Schedules, Coach Editor, Bookings, Accounts, Daily Ops, Vehicles, Staff, CRM, Settings, Reports and Sarathi.
3. Exact pixel-level comparison against user-supplied reference screenshots and original browser UI.
4. Multi-tenant/branch-specific access and data isolation, complete financial and transactional invariants.
5. Real PostgreSQL and Redis integration/regression acceptance plus production-cutover rehearsal.
6. RedBus authorized sandbox contract acceptance. Mocked callback tests are not certification.
7. Public booking-link Share only after a verified HTTPS URL and mapped city IDs are configured.
8. Remaining P1 business defects from the independent prior review are still release blockers.

**Do not merge or deploy the modernization as a replacement GDS based on this increment alone.**

## Local review

Use a clean local checkout, fetch the **v4** feature branch, then in modern/frontend run npm ci, npm run build, node --test tests/seat-layout-model.test.cjs, and npx playwright test e2e/schedules-parity.spec.ts e2e/routes-parity.spec.ts e2e/bookings-dailyops.spec.ts. In modern/backend run dotnet build -c Release and dotnet test -c Release with a disposable synthetic fixture. Never overwrite a real data/db.json with a test seed.
