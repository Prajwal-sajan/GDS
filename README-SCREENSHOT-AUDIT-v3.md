# SaveTrip UI screenshot-by-screenshot audit — 21 Nov 2026

## Materials examined and evidence level

**181 individual PNG captures** have been visually reviewed, including distinct scroll positions and copy variants. The inventory is `reports/SaveTrip_Screenshot_By_Screenshot_Audit.xlsx` (also `reports/INDIVIDUAL_SCREENSHOT_AUDIT.csv`). An additional **469 element-level cases** are in `reports/VISIBLE_ELEMENT_CHECKLIST.csv` and workbook tab `469 Element Checks`. A separate `145 Prior Feature Checks` worksheet preserves the previous feature-level reconciliation instead of silently substituting one for the other. No personal phone numbers, booking references or banking details were copied into sample data.

The image files were provided in the conversation and are *not repackaged* here. A screenshot proves that a visible UI element existed, not that its source vendor exposed a corresponding API. UI interaction, state transitions and persistence require browser and server testing. All rows are classified **PARTIAL** until checked against the actual running version.

## Modules with screenshot evidence

- **Trips (8 captures)**: Pickup/Drop/Timings/Docs; stop cards and passenger charts, communication history, RTG, map position, call/chat, check-in, delay/early times.
- **Schedules (33)**: schedule list, P&L popup and expenses, pickup/drop cards, trip-level seat and PNR workflows, fare editing and demand curve, blocking, history, OTA channel tables, crew and update dialogs.
- **Routes (21)**: list/status/cards/timeline; complete editor tabs General, Cities & Schedule, Update, Pickups, Drops, Breaks, Fares, Block, Cancellation, Expenses, History; via-city subroutes, seasonal recurrence, route policies, two-vehicle alternation, halt evidence and seat-rule pricing.
- **CRM (5)**: phone/email/PNR search, Customer 360 summary, booking ticket popup, colored two-deck seating, cancellation/update/shift/notify/print, age and GST/payment breakdown.
- **Vehicles (24)**: fleet KPIs, filtering, live location/alerts/engine health/ECU, fleet map, coach list, Coach Type/Amenities/Seat Layout, editable seat-position grid including non-seat fixtures.
- **Accounts (58)**: Sales, Transactions, Receivables, Reports (multiple operational subreports), Invoices, OTA Invoice Verifier, OTA Configurations, Agent Settings and Loyalty; modal/scroll continuation details in inventory.
- **Staff (7)**: Staff/Attendance/Advances/Reimbursements/Payouts; Personal Info/Payables/Bank Details/Ledger/Documents, overtime, bonus, deductions and document upload.
- **Daily Ops (12)**: report KPI/time and per-service table, OTA ratings, search-rank history and 1–2-star issue follow-up.
- **Sarathi (1)**: assistant onboarding, suggestions, prior conversation and input area.
- **Chats (2)**: conversation list, unresolved/resolved statuses, WhatsApp/SMS/Email/Calls popup and quick replies.
- **Calls (3)**: routing legs, recordings, missed/dialer, filters and Settings menu.
- **Team & Access (7)**: office/bus staff, agents, branch management, role templates and scoped Off/Own/Branch/Company permissions.

## Current verified implementation delta in v3

- Route cards load and render in the `savetrip-visual` workspace, with status filtering and service timeline.
- **Add Route** now calls the existing `/cities`, `/coaches`, and `POST /routes` path after a real create form.
- **Duplicate Route** now uses the native `POST /routes/{id}/duplicate` endpoint.
- **Delete Route** now requires confirmation, step-up and the native DELETE route API, rather than a no-op toast.
- Pickup/Drop/Fares row shortcuts now open the correct route editor subtab with a stable hash parameter, not a fragile delayed DOM click.
- Fixed the Node static-check crash caused by an unguarded `window` reference in the previous visual overlay build stamp.

**Important limitations:** the screenshot-first editor still has *many UI-preview controls* (including coach regeneration, staff financial details, advanced route policies, and access scopes) that do not save to the server. The previously supplied 145-feature reconciliation reports 54 `NOT_IMPLEMENTED`, 20 `NOT_VERIFIED`, 44 `OVERLAY_STATIC_CHECKED`, 27 `BASE_PRESENT_UNVERIFIED`. A validated end-to-end match across 181 screenshots is **not** claimed. For provider-only live GPS, ECU, calls, OTA ranking and payments, do not render synthetic figures as live.

## Apply source safely

Use the **`Prajwal-sajan/GDS` Node/Express** repository, *not* the separate `SupriyaPejavara/E-Yatra` .NET project. The ZIP includes the cumulative source and reports. To replace an existing local clone, back up your changes; compare `public/index.html` and the `public/js/savetrip-visual.js` before copying. For a clean checkout, extract the source into an empty directory and run:

```powershell
npm ci
node tests/check-screenshot-audit-v3.mjs
node tests/check-savetrip-visual.mjs
node tests/check-final-reconciliation.mjs
npm test
npm start
```

Open the running app, hard-refresh, and check `window.__SAVETRIP_VISUAL_BUILD__` for `2026-11-21-screenshot-audit-v3`.

## Executed verification (this deliverable)

- `node --check` for the new visual script: PASS.
- Existing `check-savetrip-visual`, `check-static`, `check-communications-access`, `check-final-reconciliation`: PASS.
- `npm test`: **NOT RUN to completion**; Node cannot load Express (`Cannot find module 'express'`) because dependencies are absent in this runtime.
- Browser screenshot regression / authenticated UAT: **NOT EXECUTED**.

## Remaining quality gate

Treat every row in the 181-image inventory as a test case: tab opened, dropdown revealed, action triggered, data persisted (where applicable), reload reflected update, permission scope checked and error/empty/loading state evaluated. A static component or locally stored draft is not sufficient. Do not merge as production-ready until these are signed off.
