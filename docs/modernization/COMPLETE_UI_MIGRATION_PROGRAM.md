# JourneyOS GDS — Complete native React UI migration program

**Working branch:** feature/react-complete-ui-migration-program  
**Base:** feature/modern-gds-parity-v3-pnl-share (draft PR #27, stacked on #26/#25)  
**Legacy reference:** savetrip-screenshotcomplete; public/js, public/css and reports  
**Target:** modern/frontend React+TypeScript; modern/backend .NET+PostgreSQL+Redis

## The goal is the entire GDS, not a collection of small PRs

Each original menu, submenu, page, modal, SVG, contextual control, tab, state, validation and API workflow must be represented in native React. Original Node/UI remains reference-only. No iframe or embedding legacy markup is a completed migration.

The working branch deliberately remains a **continuous, incomplete migration program**. Do not declare any module production-ready merely because it compiles or passes mocked browser tests. Full UI parity requires original-vs-React browser comparisons against identical data.

## Native React source migrations implemented this branch

| Source | React component | Backend | Acceptance |
| --- | --- | --- | --- |
| Coach v46/v47, vehicles v9 | features/coaches/CoachesPanel.tsx, coachModel.ts | CoachManagementService, CoachManagementEndpoints, additive aliases/fixtures EF migration | Core 46-seat 2+1, 44+4 2+2, fixture/alias changes and assigned geometry tested; screenshot pixel and all variants **unverified** |
| Ticket v38/v41, Schedule Bookings v48 | features/bookings/BookingsPanel.tsx | BookingWorkspaceEndpoints, existing InventoryService | PNR, print, boarding, stages, shift, cancellation quote, comments/history connected; statutory invoice/PDF and all exceptional booking dialogs still missing |
| OTA invoice verifier v43 | features/accounts/OtaInvoiceVerifier.tsx | Existing reconciliation/import/audit/CSV endpoints | Upload, discrepancies, payout, cards/table, resolutions and CSV wired; source invoice a–w nuances and visual comparison pending |
| Daily Ops v12 | features/dailyops/DailyOpsPanel.tsx | ReportsService.DailyOpsAsync, ratings APIs | Fleet/earnings/no-shows/compliance and OTA ratings follow-up wired; all legacy context panels, provider metrics and visual parity pending |

Tests: CoachManagementTests, BookingWorkspaceTests, 6 coach model cases; Playwright e2e/coaches-parity, bookings-parity, invoice-verifier-parity and daily-ops-parity. CI also retains v1–v3 Route, Schedule, P&L, Share, history, revenue and security suites.

## Previously migrated core UI

- RoutesPanel: route editor/cities/stages/fares and schedules generation; original popup/calendar parity outstanding.
- SchedulesPanel: segment seat layout, booking chart, staff assignment, P&L, History and Share; rich Manage Update v51 options pending.
- SeatLayoutView: native physical coach geometry and status legends; screenshot pixel parity unverified.
- ModernShell: original TOP/SUB-inspired navigation; remaining dropdowns and full menu parity outstanding.
- Partially implemented original modules: Vehicles, Staff, CRM, Communications, Reports, Settings/IAM, Sarathi, Ledger and RedBus integration.

## Outstanding entire-module migration

1. Vehicles: registration/compliance/maintenance, detailed tabs/documents, health/location states, floating dialogs.
2. Staff: Staff, Attendance, Advances, Reimbursements, Payouts; editor Personal/Payables/Bank/Ledger/Documents.
3. Bookings: original ticket PDF, notification dialogs, all agent bookings, cancellations and refund payout/settlement lifecycle.
4. Accounts: all financial submenus/reports/invoices, original verifier a–w categories and financial export rules.
5. Routes and Schedules: exact popups, call routing/GPS/cabs, schedule override, OTA forced re-push and controls.
6. CRM/Communications: all passenger workflows/call and chat popups, delivery confirmation/permissions.
7. Reports/Daily Ops: all report variants, filter/export states and original control-room detail screens.
8. Settings/IAM: all configuration, operator website settings and fine-grained branch/role rights.
9. Sarathi: full context UI with actual backend-supported intents.
10. RedBus: real authorized sandbox/callback/reconciliation acceptance.
11. Visual evidence: original screenshot and React render comparison at identical data/viewport for all UI states.
12. Production readiness: real data reconciliation, payments, AWS operations/backup/rollback, provider and operator signoff.

## Acceptance controls

A module may be marked VERIFIED_COMPLETE only after: (1) full original feature inventory, (2) native React pages and every interactive state, (3) correct .NET/PostgreSQL business logic, (4) transaction/security tests, (5) full Playwright journeys, (6) original-vs-React screenshot review including dialogs/responsive views, and (7) independent operator UAT. Mocked-API UI tests prove interaction wiring, **not screenshot or production parity**.

Production release authorization stays **false** in modern/release-readiness.json. The release gate must block while screenshot data, missing modules or provider certification remain incomplete. No deployed production switch or legacy retirement is authorized.

## Local verification

On a clean checkout of feature/react-complete-ui-migration-program run from modern/frontend: npm ci, npm run build, node --test tests/seat-layout-model.test.cjs, node --test tests/coach-model.test.cjs, npx playwright test. From modern/backend: dotnet build -c Release and dotnet test -c Release against a disposable synthetic fixture. Preserve any uncommitted work in D:\GDS before branch switches.
