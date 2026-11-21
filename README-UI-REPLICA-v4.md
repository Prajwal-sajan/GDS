# GDS screenshot-first UI preview v4 — cumulative

**Target:** `Prajwal-sajan/GDS` (Express + vanilla JS). Do not apply to `SupriyaPejavara/E-Yatra`.

## Scope and evidence

The user supplied screenshot evidence from Trips, Routes, Schedules, Vehicles/Coaches, CRM, Accounts, Staff, Daily Ops, Sarathi, Chats, Calls and Team & Access. This package retains the original 181-row per-screenshot evidence inventory, 469 element-level audit checks and 145 feature reconciliations. It is *not* an independently verified pixel-exact replica: the real UI is behind a login and there is no authenticated end-to-end browser comparison in this environment. Screenshots do not reveal hidden dropdown options or unvisited states.

This package contains all prior v3 cumulative source files plus v4 improvements. The existing screenshot-first workspace is preserved, and preview-only controls use local browser storage for non-sensitive state. Do not enter personal banking/identity information into preview fields. Do not mistake preview data for backend writes.

## v4 implemented frontend interactions

- Route General/Cities/Fares/Stop UI retained.
- Add via city: prompt; adds a local route draft. CSV import: local CSV preview to draft.
- Add route tag: name/value prompt and preview chip.
- Add pickup/drop/break: prompt and rendered card; edit draft stop.
- Premium/discount/city/seat-group fare rules: popup with name, adjustment direction, ₹/%, city selection, weekday toggle, individual seat selection and save-to-preview with summary.
- Seat block/release: acts on selection and persists to UI preview only.
- Staff bonuses/deductions: prompts for name/reason and amount; stores UI draft.
- Coach Generate Layout: creates editable seater grid locally based on Coach Type seat count; never rewrites booked inventory.
- Vehicle Health popup: hierarchical health sections and measurement cards instead of raw JSON, with accurate unavailable/empty labels.
- Responsive CSS for rule seat selector, health cards and extended modal.

## Known gaps

The package does not certify 100% visual parity. Several original screens still rely on native implementation or generic screenshot-inspired components; exact spacing, dynamic live state, content of unsupplied submenus and some nested dialogs remain to be compared against a running authorized SaveTrip session. The earlier audit counts 54 NOT_IMPLEMENTED and 20 NOT_VERIFIED features at the time of v3, and v4 does **not** clear all those cases. Most edits are preview-only; live GPS/ECU, rank, calls and OTA delivery data require their respective providers.

## Installation (PowerShell)

```powershell
# A clean cloned Prajwal-sajan/GDS repository, not E-Yatra
cd C:\JourneyOS\GDS-Fresh

git status --short
# Save any uncommitted changes before copying files from ZIP
# Extract contents of this ZIP into this repository directory.

npm ci
node --check .\public\js\savetrip-visual.js
node .\tests\check-ui-replica-v4.mjs
node .\tests\check-static.mjs
node .\tests\check-savetrip-visual.mjs
node .\tests\check-final-reconciliation.mjs
npm test
npm start
```

Open the local application and hard refresh. `window.__SAVETRIP_VISUAL_BUILD__` should equal `2026-11-21-ui-replica-v4`.

## Verification actually performed

PASS: JavaScript parse and local static checks (`check-ui-replica-v4`, `check-static`, `check-savetrip-visual`, `check-final-reconciliation`). Full Express runtime regression, authenticated browser click-through, visual pixel comparison, server persistence, permission enforcement and device/provider interactions **not executed**.
